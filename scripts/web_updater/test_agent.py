"""不依赖 Docker 的事务故障注入测试，覆盖维护屏障、切换、回滚和中断恢复。"""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import types
import unittest
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
        self.updater.inspect_image = Mock(side_effect=lambda reference: {"Id": "new-id", "Config": {"Labels": {agent.REVISION: "v1"}}})
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


if __name__ == "__main__":
    unittest.main()
