"""不依赖 Docker 的事务故障注入测试，覆盖维护屏障、切换、回滚和中断恢复。"""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
import urllib.error
import urllib.parse
from unittest.mock import Mock, patch

import agent
import install


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = dict(state_dir=str(self.root / "state"), runtime_dir=str(self.root / "shared"),
                           deploy_dir="/production", app="app", db="db", repository="ghcr.io/example/app",
                           channel="latest", base_url="http://127.0.0.1:8800", backup_script="/backup.sh")
        self.helper = types.SimpleNamespace(inspect=Mock(return_value={"Image": "old-id"}),
                    fingerprint=Mock(return_value={"cards": {"count": 3, "digest": "unchanged"}}),
                    compose_args=lambda path, project: ["docker", "compose", "-f", str(path)])
        self.updater = agent.Updater(self.config, self.helper)
        self.candidate = dict(version="v2", digest="sha256:" + "a"*64, image="ghcr.io/example/app@sha256:"+"a"*64,
                              image_id="new-id", update_available=True)
        self.updater.state = dict(available=copy.deepcopy(self.candidate), job=dict(id="job", action="install", status="running"))
        self.updater.context = Mock(return_value=dict(app={"Image": "old-id"}, database="english_web",
             project="english", service="app", labels={"com.docker.compose.project.config_files": "/compose.yaml"}))
        self.updater.inspect_image = Mock(side_effect=lambda reference: {"Id": "new-id", "Config": {"Labels": {agent.REVISION: "v1" if reference == "old-id" else "v2"}}})
        self.updater.preflight = Mock()
        self.updater.fingerprint = Mock(return_value={"cards": {"count": 3, "digest": "same", "columns": ["id"]}})
        self.updater.ready = Mock()
        self.updater.restore = Mock()
        self.events = []
        self.backups = [self.root / "preflight-backup", self.root / "cutover-backup"]
        for backup in self.backups:
            backup.mkdir()
        def backup():
            index = sum(event == "backup" for event in self.events)
            if index == 1:
                self.assertTrue(self.updater.flag.exists(), "停服备份必须处于维护状态")
                self.assertIn("stop", self.events)
            self.events.append("backup")
            return self.backups[index]
        self.updater.backup = Mock(side_effect=backup)
        def compose(path, project, service):
            self.assertTrue(self.updater.flag.exists(), "切换/回滚期间不能放行写入")
            self.events.append("old" if "previous" in str(path) else "new")
        self.updater.compose = Mock(side_effect=compose)
        def run(args, **_kwargs):
            if "stop" in args:
                self.assertTrue(self.updater.flag.exists())
                self.events.append("stop")
            if "--format" in args:
                return json.dumps({"services": {"app": {"image": "old:tag", "build": ".", "environment": {"KEEP": "yes"}},
                                                "unrelated": {"image": "other"}}})
            return ""
        self.run = patch.object(agent, "run", side_effect=run)
        self.run.start()
        self.addCleanup(self.run.stop)
        self.subprocess = patch.object(agent.subprocess, "run", return_value=Mock())
        self.subprocess.start()
        self.addCleanup(self.subprocess.stop)

    def test_success_uses_second_backup_and_preserves_other_services(self):
        self.updater.execute("install", self.candidate)
        self.assertEqual(self.updater.state["job"]["status"], "succeeded")
        self.assertEqual(self.events, ["backup", "stop", "backup", "new"])
        self.assertFalse(self.updater.journal.exists())
        self.assertFalse(self.updater.flag.exists())
        self.updater.restore.assert_not_called()
        self.assertFalse(self.updater.state["available"]["update_available"])
        active = json.loads(next((self.root / "state").glob("update-*/compose.active.json")).read_text())
        self.assertEqual(active["services"]["app"]["image"], self.candidate["image"])
        self.assertNotIn("build", active["services"]["app"])
        self.assertEqual(active["services"]["app"]["environment"], {"KEEP": "yes"})
        self.assertEqual(active["services"]["unrelated"], {"image": "other"})

    def test_preflight_failure_leaves_production_running(self):
        self.updater.preflight.side_effect = RuntimeError("candidate invalid")
        with self.assertLogs(agent.LOG, "ERROR"):
            self.updater.execute("install", self.candidate)
        self.assertEqual(self.updater.state["job"]["status"], "failed")
        self.assertEqual(self.events, ["backup"])
        self.assertFalse(self.updater.flag.exists())
        self.assertFalse(self.updater.journal.exists())

    def test_check_only_reads_cloud_metadata_and_compares_image_id(self):
        self.updater.inspect_image = Mock(return_value={"Id": "old-id", "Architecture": "arm64"})
        remote = {key: self.candidate[key] for key in ("version", "digest", "image_id")}
        with patch.object(agent.Registry, "image", return_value=remote) as metadata, patch.object(agent, "run") as run:
            self.updater.check()
        run.assert_not_called()
        metadata.assert_called_once_with("latest", {"Id": "old-id", "Architecture": "arm64"})
        self.assertTrue(self.updater.state["available"]["update_available"])
        self.assertEqual(self.updater.state["available"]["image"], self.candidate["image"])
        remote["image_id"] = "old-id"
        with patch.object(agent.Registry, "image", return_value=remote):
            self.updater.check()
        self.assertFalse(self.updater.state["available"]["update_available"])

    def test_failed_check_clears_previous_candidate(self):
        self.updater.inspect_image = Mock(return_value={"Id": "old-id", "Architecture": "arm64"})
        with patch.object(agent.Registry, "image", side_effect=urllib.error.URLError("offline")):
            with self.assertRaises(agent.UpdateRejected):
                self.updater.check()
        self.assertIsNone(self.updater.state["available"])

    def test_install_downloads_pinned_digest_before_backup(self):
        with patch.object(agent, "run", side_effect=RuntimeError("stop after download")) as run:
            with self.assertRaises(RuntimeError):
                self.updater.install(self.candidate)
        run.assert_called_once_with(["docker", "pull", "--quiet", self.candidate["image"]], timeout=1800)
        self.updater.backup.assert_not_called()
        self.assertFalse(self.updater.flag.exists())

    def test_download_failure_leaves_production_running(self):
        with patch.object(agent, "run", side_effect=agent.subprocess.CalledProcessError(1, "docker")):
            with self.assertRaises(agent.UpdateRejected):
                self.updater.install(self.candidate)
        self.updater.backup.assert_not_called()
        self.assertFalse(self.updater.flag.exists())
        self.assertFalse(self.updater.journal.exists())

    def test_downloaded_image_must_match_checked_id_and_revision(self):
        for image_id, revision in [("wrong-id", "v2"), ("new-id", "wrong-version")]:
            self.updater.inspect_image = Mock(return_value={"Id": image_id, "Config": {"Labels": {agent.REVISION: revision}}})
            with self.assertRaises(RuntimeError):
                self.updater.install(self.candidate)
            self.updater.backup.assert_not_called()
            self.assertFalse(self.updater.flag.exists())

    def test_preflight_disables_paid_background_jobs_in_restored_database(self):
        work = self.root / "background-check"
        work.mkdir()
        captured = {}
        def run(args, **_kwargs):
            if args[:2] == ["docker", "run"]:
                captured.update(line.split("=", 1) for line in (work / "test.env").read_text().splitlines())
            return "container"
        self.helper.inspect.return_value = {"NetworkSettings": {"Networks": {"net": {"IPAddress": "127.0.0.1"}}}}
        self.helper.probe = Mock()
        self.helper.request = Mock(side_effect=urllib.error.HTTPError("http://test", 503, "maintenance", None, None))
        self.updater.cleanup_preflight = Mock()
        ctx = dict(env={"EW_BACKGROUND_TASKS": "1"}, uri=urllib.parse.urlsplit("postgres://test@db/english_web"), network="net")
        with patch.object(agent, "run", side_effect=run):
            agent.Updater.preflight(self.updater, ctx, self.candidate, self.backups[0], work)
        self.assertEqual(captured["EW_BACKGROUND_TASKS"], "0")
        self.assertFalse((work / "test.env").exists())

    def test_start_failure_restores_fresh_data_before_old_image(self):
        def ready(_base, version):
            if version == "v2":
                raise RuntimeError("candidate failed to start")
            self.assertTrue(self.updater.flag.exists())
            self.updater.restore.assert_called_once_with(self.backups[1], "english_web", create=True)
        self.updater.ready.side_effect = ready
        with self.assertLogs(agent.LOG, "ERROR"):
            self.updater.execute("install", self.candidate)
        self.assertEqual(self.updater.state["job"]["status"], "rolled_back")
        self.assertEqual(self.events[-2:], ["new", "old"])
        self.assertFalse(self.updater.flag.exists())
        self.assertFalse(self.updater.journal.exists())

    def test_restore_failure_keeps_maintenance_and_recovery_record(self):
        self.updater.ready.side_effect = RuntimeError("start failed")
        self.updater.restore.side_effect = RuntimeError("disk unavailable")
        with self.assertLogs(agent.LOG, "ERROR"):
            self.updater.execute("install", self.candidate)
        self.assertEqual(self.updater.state["job"]["status"], "needs_attention")
        self.assertTrue(self.updater.flag.exists())
        self.assertTrue(self.updater.journal.exists())
        with self.assertRaises(ValueError):
            self.updater.submit("check", {})

    def transaction(self, verified=False, backup=None):
        return dict(verified=verified, backup=backup, database="english_web", project="english", service="app",
                    previous_config="compose.previous.json", active_config="compose.active.json", old_image="old-id", version="v2")

    def test_crash_before_candidate_only_restarts_previous_image(self):
        agent.atomic_json(self.updater.journal, self.transaction())
        self.updater.startup()
        self.assertEqual(self.events, ["old"])
        self.updater.restore.assert_not_called()
        self.assertEqual(self.updater.state["job"]["status"], "rolled_back")
        self.assertFalse(self.updater.flag.exists())

    def test_crash_after_commit_does_not_restore_over_new_learning(self):
        agent.atomic_json(self.updater.journal, self.transaction(verified=True, backup=str(self.backups[1])))
        agent.atomic_json(self.updater.flag, {"updating": True})
        self.updater.startup()
        self.updater.restore.assert_not_called()
        self.assertEqual(self.updater.state["job"]["status"], "succeeded")
        self.assertEqual(self.events, ["new"])
        self.assertFalse(self.updater.flag.exists())

    def test_unknown_digest_cannot_install_an_arbitrary_image(self):
        for digest in ["ghcr.io/attacker/app", "sha256:"+"b"*64, None]:
            with self.assertRaises(ValueError):
                self.updater.submit("install", {"digest": digest})
        self.assertFalse(self.updater.busy)

    def test_concurrent_job_and_orphan_flag_block_updates(self):
        self.updater.busy = True
        with self.assertRaises(ValueError):
            self.updater.submit("check", {})
        self.updater.busy = False
        agent.atomic_json(self.updater.flag, {})
        self.updater.startup()
        self.assertEqual(self.updater.state["job"]["status"], "needs_attention")
        with self.assertRaises(ValueError):
            self.updater.submit("install", {"digest": self.candidate["digest"]})

    def test_first_start_without_job_is_valid(self):
        self.updater.state["job"] = None
        self.updater.startup()
        self.assertIsNone(self.updater.state["job"])

    def test_preflight_cleanup_cannot_target_production_database(self):
        marker = self.root / "preflight.json"
        agent.atomic_json(marker, dict(database="english_web", container="app"))
        with self.assertRaises(RuntimeError):
            self.updater.cleanup_preflight(marker)
        self.assertTrue(marker.exists())

    def test_restart_cleans_interrupted_preflight_resources(self):
        work = self.root / "state" / "update-test"
        work.mkdir()
        marker = work / "preflight.json"
        agent.atomic_json(marker, dict(database="ew_update_check_012345abcdef", container="ew-update-check-012345abcdef"))
        self.updater.startup()
        self.assertFalse(marker.exists())
        self.assertEqual(self.updater.state["job"]["status"], "failed")

    def test_corrupt_backup_is_rejected(self):
        backup = self.backups[0]
        (backup / "database.dump").write_bytes(b"valid dump")
        (backup / "SHA256SUMS").write_text(hashlib.sha256(b"valid dump").hexdigest()+"  database.dump\n")
        self.updater.verify_dump(backup)
        (backup / "database.dump").write_bytes(b"corrupted")
        with self.assertRaises(RuntimeError):
            self.updater.verify_dump(backup)

    def test_compose_grants_socket_group_without_docker_socket(self):
        service = {"environment": {"EXISTING": "1"}, "volumes": [], "group_add": ["88"]}
        install.configure_service(service, 99)
        install.configure_service(service, 99)
        self.assertEqual(service["environment"]["EXISTING"], "1")
        self.assertEqual(service["group_add"], ["88", "99"])
        self.assertEqual(len(service["volumes"]), 1)
        self.assertTrue(service["volumes"][0]["read_only"])
        self.assertNotIn("docker.sock", json.dumps(service))

    def test_probe_mount_stays_traversable_under_service_umask(self):
        # 服务以 UMask=0027 运行；候选容器以 nobody 运行且没有附加组，
        # 目录若是 0750 就会 EACCES，维护中间件随即把所有业务接口打成 503。
        previous = os.umask(0o027)
        self.addCleanup(os.umask, previous)
        mount = agent.probe_mount(self.root / "work" / "maintenance-probe")
        self.assertEqual(stat.S_IMODE(mount.stat().st_mode), 0o755)


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = agent.Registry("ghcr.io/example/app")
        self.current = {"Architecture": "arm64"}
        self.config = {"os": "linux", "architecture": "arm64", "config": {"Labels": {agent.REVISION: "v2"}}}
        self.config_raw, self.config_digest = self.encoded(self.config)
        self.manifest = {"schemaVersion": 2, "config": {"digest": self.config_digest},
                         "layers": [{"digest": "sha256:" + "f" * 64}]}
        self.manifest_raw, self.manifest_digest = self.encoded(self.manifest)

    @staticmethod
    def encoded(value):
        raw = json.dumps(value).encode()
        return raw, "sha256:" + hashlib.sha256(raw).hexdigest()

    def test_single_platform_reads_config_but_no_layers(self):
        with patch.object(agent.urllib.request, "urlopen", side_effect=[io.BytesIO(self.manifest_raw), io.BytesIO(self.config_raw)]) as request:
            result = self.registry.image("latest", self.current)
        self.assertEqual(result, dict(version="v2", digest=self.manifest_digest, image_id=self.config_digest))
        urls = [call.args[0].full_url for call in request.call_args_list]
        self.assertEqual(urls, [self.registry.base + "/manifests/latest", self.registry.base + "/blobs/" + self.config_digest])

    def index(self, descriptors):
        return self.encoded({"schemaVersion": 2, "manifests": descriptors})[0]

    def descriptor(self, architecture="arm64", variant="v8"):
        return {"digest": self.manifest_digest, "platform": {"os": "linux", "architecture": architecture, "variant": variant}}

    def test_multiarch_pins_matching_platform_manifest(self):
        raw = self.index([self.descriptor("amd64", ""), self.descriptor()])
        with patch.object(agent.urllib.request, "urlopen", side_effect=[io.BytesIO(raw), io.BytesIO(self.manifest_raw), io.BytesIO(self.config_raw)]) as request:
            result = self.registry.image("latest", self.current)
        self.assertEqual(result["digest"], self.manifest_digest)
        self.assertEqual(request.call_args_list[1].args[0].full_url, self.registry.base + "/manifests/" + self.manifest_digest)

    def test_missing_or_ambiguous_platform_is_rejected(self):
        for descriptors in [[self.descriptor("amd64", "")], [self.descriptor(), self.descriptor()]]:
            with patch.object(agent.urllib.request, "urlopen", return_value=io.BytesIO(self.index(descriptors))):
                with self.assertRaises(agent.UpdateRejected):
                    self.registry.image("latest", self.current)

    def test_corrupt_manifest_or_config_is_rejected(self):
        cases = [
            [io.BytesIO(self.index([self.descriptor()])), io.BytesIO(b'{}')],
            [io.BytesIO(self.manifest_raw), io.BytesIO(b'{}')],
        ]
        for responses in cases:
            with patch.object(agent.urllib.request, "urlopen", side_effect=responses):
                with self.assertRaisesRegex(RuntimeError, "摘要不匹配"):
                    self.registry.image("latest", self.current)

    def test_config_architecture_is_verified(self):
        with patch.object(agent.urllib.request, "urlopen", side_effect=[io.BytesIO(self.manifest_raw), io.BytesIO(self.config_raw)]):
            with self.assertRaisesRegex(RuntimeError, "架构不匹配"):
                self.registry.image("latest", {"Architecture": "amd64"})

    def test_public_registry_bearer_challenge(self):
        challenge = urllib.error.HTTPError(self.registry.base, 401, "Unauthorized", {
            "WWW-Authenticate": 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:example/app:pull"',
        }, None)
        with patch.object(agent.urllib.request, "urlopen", side_effect=[challenge, io.BytesIO(b'{"token":"anonymous-token"}'), io.BytesIO(self.manifest_raw)]) as request:
            self.registry.get("/manifests/latest")
        self.assertEqual(request.call_args_list[1].args[0], "https://ghcr.io/token?service=ghcr.io&scope=repository%3Aexample%2Fapp%3Apull")
        self.assertEqual(request.call_args_list[2].args[0].get_header("Authorization"), "Bearer anonymous-token")

    def test_metadata_size_is_bounded(self):
        with patch.object(agent.urllib.request, "urlopen", return_value=io.BytesIO(b" " * (4 * 1024 * 1024 + 1))):
            with self.assertRaisesRegex(RuntimeError, "元数据过大"):
                self.registry.get("/manifests/latest")


if __name__ == "__main__":
    unittest.main()
