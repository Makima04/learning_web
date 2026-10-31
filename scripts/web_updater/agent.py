#!/usr/bin/env python3
"""root 主机服务：固定镜像仓库、Unix socket、串行更新任务，Web 容器无 Docker 权限。"""
import argparse
import copy
import datetime as dt
import hashlib
import http.server
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import secrets
import socketserver
import subprocess
import threading
import time
import urllib.parse
import urllib.error

LOG = logging.getLogger("english-web-updater")
REVISION = "org.opencontainers.image.revision"


class UpdateRejected(RuntimeError):
    """可直接向管理员展示的固定文案，不包含子进程输出或凭据。"""


def atomic_json(path, value, mode=0o600):
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w") as stream:
        os.chmod(temporary, mode)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def run(args, *, data=None, timeout=600):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, timeout=timeout).stdout.decode()


def environment(container):
    return dict(item.split("=", 1) for item in container["Config"].get("Env", []) if "=" in item)


class Updater:
    def __init__(self, config, helper):
        self.config, self.helper = config, helper
        self.home = Path(config["state_dir"])
        self.runtime = Path(config["runtime_dir"])
        self.home.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.runtime.mkdir(parents=True, exist_ok=True, mode=0o750)
        self.flag = self.runtime / "maintenance.json"
        self.journal = self.home / "transaction.json"
        self.state_file = self.home / "status.json"
        self.state = read_json(self.state_file, {"available": None, "job": None})
        self.lock = threading.Lock()
        self.busy = False
        helper.APP, helper.DB, helper.DEPLOY = config["app"], config["db"], Path(config["deploy_dir"])
        # 仓库只允许 root 配置；请求不能传 image、URL、路径或命令。
        if not re.fullmatch(r"[a-z0-9][a-z0-9./_-]+", config["repository"]):
            raise ValueError("更新仓库配置不合法")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", config["channel"]):
            raise ValueError("更新通道配置不合法")

    def status(self):
        with self.lock:
            return copy.deepcopy(self.state)

    def save(self):
        atomic_json(self.state_file, self.state)

    def phase(self, phase, message):
        with self.lock:
            self.state["job"].update(phase=phase, message=message)
            self.save()
        LOG.info("%s: %s", phase, message)

    def submit(self, action, payload):
        with self.lock:
            if self.busy or self.journal.exists() or self.flag.exists():
                raise ValueError("已有更新任务正在运行，或上次更新等待恢复")
            if action == "install":
                available = self.state.get("available")
                if not available or not available.get("update_available") or payload.get("digest") != available["digest"]:
                    raise ValueError("待安装版本已改变，请重新检查更新")
                candidate = copy.deepcopy(available)
            else:
                candidate = None
            self.busy = True
            self.state["job"] = dict(id=secrets.token_hex(12), action=action, status="running",
                                     phase="queued", message="任务已开始", started_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                                     requested_by=str(payload.get("requested_by", ""))[:100])
            self.save()
            thread = threading.Thread(target=self.execute, args=(action, candidate), daemon=False)
            thread.start()
            return copy.deepcopy(self.state)

    def execute(self, action, candidate):
        outcome, message = "succeeded", "检查完成" if action == "check" else "更新完成，可以刷新网页"
        try:
            if action == "check":
                self.check()
            else:
                self.install(candidate)
        except Exception as error:
            # 原始错误仅存 root journal，不能经 API 返回数据库 URL 或运行环境。
            LOG.exception("update job failed")
            outcome, message = "failed", str(error) if isinstance(error, UpdateRejected) else "任务失败，请查看服务器更新服务日志"
            if self.journal.exists():
                try:
                    self.phase("rollback", "新版验证失败，正在恢复更新前的数据库和应用")
                    verified = self.recover()
                    outcome, message = ("succeeded", "更新已完成，可以刷新网页") if verified else ("rolled_back", "更新失败，已恢复更新前的版本和数据")
                except Exception:
                    LOG.exception("rollback failed")
                    outcome, message = "needs_attention", "恢复未完成，系统保持维护状态，请管理员检查服务器"
        finally:
            with self.lock:
                self.state["job"].update(status=outcome, message=message,
                                         finished_at=dt.datetime.now(dt.timezone.utc).isoformat())
                self.busy = False
                self.save()

    def context(self):
        h, c = self.helper, self.config
        app, db = h.inspect(c["app"]), h.inspect(c["db"])
        labels = app["Config"]["Labels"]
        if labels.get("com.docker.compose.project.working_dir") != c["deploy_dir"]:
            raise RuntimeError("部署目录不匹配")
        env, db_env = environment(app), environment(db)
        uri = urllib.parse.urlsplit(env.get("EW_DATABASE_URL") or env.get("DATABASE_URL", ""))
        database = db_env["POSTGRES_DB"]
        if database in ("postgres", "template0", "template1") or not re.fullmatch(r"[A-Za-z0-9_]+", database):
            raise RuntimeError("需要使用独立应用数据库")
        aliases = {c["db"], db["Name"].lstrip("/")}
        for net in db["NetworkSettings"]["Networks"].values():
            aliases.update(net.get("Aliases") or [])
            aliases.add(net.get("IPAddress"))
        if uri.hostname not in aliases or urllib.parse.unquote(uri.path.lstrip("/")) != database:
            raise RuntimeError("应用数据库与备份目标不一致")
        networks = sorted(set(app["NetworkSettings"]["Networks"]) & set(db["NetworkSettings"]["Networks"]))
        if not networks:
            raise RuntimeError("应用和数据库没有共同网络")
        for mount in app.get("Mounts", []):
            dest = mount["Destination"].rstrip("/")
            if dest in ("/app", "/app/frontend", "/app/english_web_server") or dest.startswith("/app/frontend/dist"):
                raise RuntimeError("运行目录被挂载覆盖")
        return dict(app=app, env=env, database=database, uri=uri, network=networks[0],
                    project=labels["com.docker.compose.project"], service=labels["com.docker.compose.service"], labels=labels)

    def inspect_image(self, reference):
        return json.loads(run(["docker", "image", "inspect", reference]))[0]

    def check(self):
        self.phase("download", "正在检查并下载已发布镜像，首次检查可能需要几分钟")
        c = self.config
        reference = c["repository"] + ":" + c["channel"]
        try:
            run(["docker", "pull", "--quiet", reference], timeout=1800)
        except (subprocess.SubprocessError, OSError) as error:
            raise UpdateRejected("无法拉取发布镜像，请检查服务器网络与镜像仓库登录状态") from error
        image = self.inspect_image(reference)
        current = self.inspect_image(self.context()["app"]["Image"])
        version = image["Config"].get("Labels", {}).get(REVISION, "")
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", version) or version == "dev":
            raise UpdateRejected("已发布镜像尚未支持网页更新，请先发布包含更新功能的新镜像")
        if image["Architecture"] != current["Architecture"] or image["Os"] != "linux":
            raise RuntimeError("候选镜像架构不匹配")
        prefix = c["repository"] + "@sha256:"
        pinned = next((ref for ref in image.get("RepoDigests", []) if ref.startswith(prefix)), None)
        if not pinned or not re.fullmatch(r"sha256:[0-9a-f]{64}", pinned.split("@", 1)[1]):
            raise RuntimeError("无法固定候选镜像摘要")
        available = dict(version=version, digest=pinned.split("@", 1)[1], image=pinned,
                         image_id=image["Id"], update_available=image["Id"] != current["Id"],
                         checked_at=dt.datetime.now(dt.timezone.utc).isoformat())
        with self.lock:
            self.state["available"] = available
            self.save()

    def backup(self):
        c = self.config
        env = dict(os.environ, EW_BACKUP_APP_CONTAINER=c["app"], EW_BACKUP_DB_CONTAINER=c["db"],
                   EW_BACKUP_DEPLOY_DIR=c["deploy_dir"])
        output = subprocess.run(["bash", c["backup_script"]], env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=600, check=True).stdout.decode()
        backup = Path(next(line.split("=", 1)[1] for line in output.splitlines() if line.startswith("BACKUP_DIR="))).resolve()
        if not backup.is_relative_to(Path(c["deploy_dir"]) / "backups"):
            raise RuntimeError("备份路径不合法")
        self.verify_dump(backup)
        return backup

    @staticmethod
    def verify_dump(backup):
        expected = (backup / "SHA256SUMS").read_text().split()[0]
        digest = hashlib.sha256()
        with (backup / "database.dump").open("rb") as stream:
            for block in iter(lambda: stream.read(1024*1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected:
            raise RuntimeError("备份校验和不匹配")

    def restore(self, backup, database, create=False):
        self.verify_dump(backup)
        if not re.fullmatch(r"[A-Za-z0-9_]+", database):
            raise RuntimeError("数据库名不合法")
        if create:
            # 仅恢复本次停服备份的原数据库；DROP 会中断残留连接。
            original = read_json(backup / "db-container.json")[0]
            if environment(original).get("POSTGRES_DB") != database:
                raise RuntimeError("备份数据库与恢复目标不一致")
            run(["docker", "exec", self.config["db"], "sh", "-c",
                 'exec dropdb -U "$POSTGRES_USER" --force --if-exists "$1"', "sh", database])
        else:
            run(["docker", "exec", self.config["db"], "sh", "-c",
                 'exec createdb -U "$POSTGRES_USER" "$1"', "sh", database])
        with (backup / "database.dump").open("rb") as dump:
            # -C 从归档恢复原数据库属性、owner 和权限；隔离预检库则仅恢复对象和数据。
            command = ('exec pg_restore -U "$POSTGRES_USER" --dbname=postgres --create --exit-on-error' if create else
                       'exec pg_restore -U "$POSTGRES_USER" --dbname="$1" --exit-on-error --no-owner --no-privileges')
            subprocess.run(["docker", "exec", "-i", self.config["db"], "sh", "-c",
                            command,
                            "sh", database], stdin=dump, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600, check=True)

    def ready(self, base, version):
        for _ in range(90):
            try:
                if json.loads(self.helper.request(base + "/api/system/version"))["version"] == version:
                    protocol = json.loads(self.helper.request(base + "/api/study/protocol"))
                    if protocol.get("version") == 2 and version in self.helper.request(base + "/"):
                        return
            except (OSError, ValueError, KeyError):
                pass
            time.sleep(1)
        raise RuntimeError("启动或版本检查未通过")

    def fingerprint(self, database, baseline=None):
        # 检查所有原有表（含幂等凭据），允许新版增加表/列，但不能静默改变已有值。
        # 迁移账本本身随版本增加，不属于业务数据。
        if baseline is None:
            columns = json.loads(self.helper.sql(database, """
                SELECT COALESCE(json_object_agg(table_name, columns),'{}'::json) FROM (
                  SELECT c.table_name, json_agg(c.column_name ORDER BY c.ordinal_position) AS columns
                  FROM information_schema.columns c JOIN information_schema.tables t
                    ON t.table_schema=c.table_schema AND t.table_name=c.table_name
                  WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.table_name<>'_sqlx_migrations'
                  GROUP BY c.table_name
                ) tables;
            """))
        else:
            columns = {table: value["columns"] for table, value in baseline.items()}
        quote = lambda identifier: '"' + identifier.replace('"', '""') + '"'
        result = {}
        for table, names in columns.items():
            row = self.helper.sql(database, f"""
                SELECT json_build_object('count',count(*),'digest',md5(COALESCE(string_agg(row::text,'' ORDER BY row::text),'')))
                FROM (SELECT to_jsonb(t) AS row FROM (SELECT {','.join(map(quote, names))} FROM public.{quote(table)}) t) rows;
            """)
            result[table] = dict(json.loads(row), columns=names)
        return result

    def preflight(self, ctx, candidate, backup, work):
        h, c = self.helper, self.config
        database, container = "ew_update_check_" + secrets.token_hex(6), "ew-update-check-" + secrets.token_hex(6)
        env_file = work / "test.env"
        maintenance = work / "maintenance-probe"
        maintenance.mkdir(mode=0o755)
        resources = work / "preflight.json"
        atomic_json(resources, dict(database=database, container=container))
        try:
            self.restore(backup, database)
            before = self.fingerprint(database)
            env = dict(ctx["env"], EW_DATABASE_URL=urllib.parse.urlunsplit(ctx["uri"]._replace(path="/"+database)),
                       EW_HOST="0.0.0.0", EW_PORT="8000", EW_ALLOW_FIRST_ADMIN="0", EW_MAIL_DEV="0",
                       EW_UPDATE_SOCKET="", EW_UPDATE_MAINTENANCE_FILE="/run/ew-update-probe/maintenance.json")
            if any("\n" in v or "\r" in v for v in env.values()):
                raise RuntimeError("不支持多行运行变量")
            env_file.write_text("".join(k+"="+v+"\n" for k, v in env.items()))
            env_file.chmod(0o600)
            run(["docker", "run", "-d", "--name", container, "--network", ctx["network"],
                 "--mount", "type=bind,source="+str(maintenance)+",target=/run/ew-update-probe,readonly",
                 "--env-file", str(env_file), candidate["image"]])
            ip = h.inspect(container)["NetworkSettings"]["Networks"][ctx["network"]]["IPAddress"]
            base = "http://" + ip + ":8000"
            self.ready(base, candidate["version"])
            if before != self.fingerprint(database, before):
                raise RuntimeError("候选版本改变了现有业务数据，需要人工迁移")
            h.probe(database, base)
            atomic_json(maintenance / "maintenance.json", {"updating": True}, 0o644)
            for path, payload in (("/api/cards", None), ("/api/study/import", {})):
                try:
                    h.request(base + path, payload)
                except urllib.error.HTTPError as error:
                    if error.code == 503:
                        continue
                raise RuntimeError("候选版本不支持维护写入屏障，不能自动回滚")
        finally:
            env_file.unlink(missing_ok=True)
            self.cleanup_preflight(resources)

    def cleanup_preflight(self, resource_file):
        resources = read_json(resource_file)
        database, container = resources["database"], resources["container"]
        if not re.fullmatch(r"ew_update_check_[a-f0-9]{12}", database) or not re.fullmatch(r"ew-update-check-[a-f0-9]{12}", container):
            raise RuntimeError("隔离资源名称不合法，未执行清理")
        removed = subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        if removed.returncode != 0 and run(["docker", "container", "ls", "--all", "--quiet", "--filter", "name=^/" + container + "$"]).strip():
            raise RuntimeError("隔离候选容器无法清理")
        run(["docker", "exec", self.config["db"], "sh", "-c",
             'exec dropdb -U "$POSTGRES_USER" --force --if-exists "$1"', "sh", database])
        resource_file.unlink()

    def compose(self, config, project, service):
        run(self.helper.compose_args(config, project) + ["up", "-d", "--no-deps", "--no-build", service])

    def install(self, candidate):
        h, c = self.helper, self.config
        image = self.inspect_image(candidate["image"])
        if image["Id"] != candidate["image_id"]:
            raise RuntimeError("镜像摘要检查失败")
        ctx = self.context()
        if ctx["app"]["Image"] == image["Id"]:
            raise RuntimeError("当前已运行该版本，请重新检查更新")
        work = self.home / ("update-" + secrets.token_hex(8))
        work.mkdir(mode=0o700)
        self.phase("backup", "正在备份当前数据库和应用配置")
        backup = self.backup()
        self.phase("verify", "正在隔离数据库中验证新版启动、数据和学习同步")
        self.preflight(ctx, candidate, backup, work)
        if h.inspect(c["app"])["Image"] != ctx["app"]["Image"]:
            raise RuntimeError("预检期间应用已由其他方式更新")
        args = ["docker", "compose", "--project-directory", c["deploy_dir"], "-p", ctx["project"]]
        for path in ctx["labels"]["com.docker.compose.project.config_files"].split(","):
            args.extend(["-f", path])
        previous = json.loads(run(args + ["config", "--format", "json"]))
        active = copy.deepcopy(previous)
        for document, tag in ((previous, ctx["app"]["Image"]), (active, candidate["image"])):
            app = document["services"][ctx["service"]]
            app.update(image=tag, pull_policy="never")
            app.pop("build", None)
        old, new = work / "compose.previous.json", work / "compose.active.json"
        atomic_json(old, previous)
        atomic_json(new, active)
        run(h.compose_args(new, ctx["project"]) + ["config", "--quiet"])
        # journal 必须先落盘，任何停止/迁移操作中断后都可恢复。
        transaction = dict(database=ctx["database"], project=ctx["project"], service=ctx["service"],
                           previous_config=str(old), active_config=str(new), backup=None,
                           old_image=ctx["app"]["Image"], version=candidate["version"], verified=False)
        atomic_json(self.journal, transaction)
        atomic_json(self.flag, {"updating": True}, 0o640)
        self.phase("switch", "正在切换版本，服务会短暂中断")
        run(["docker", "stop", c["app"]])
        # 停服后重新备份，包含预检期间所有已确认的学习写入。
        backup = self.backup()
        transaction["backup"] = str(backup)
        atomic_json(self.journal, transaction)
        before = self.fingerprint(ctx["database"])
        self.compose(new, ctx["project"], ctx["service"])
        self.ready(c["base_url"], candidate["version"])
        if before != self.fingerprint(ctx["database"], before):
            raise RuntimeError("正式切换数据检查未通过")
        # 确认成功后先持久化再放行写入；崩溃恢复不能覆盖放行后的新数据。
        transaction["verified"] = True
        atomic_json(self.journal, transaction)
        self.flag.unlink(missing_ok=True)
        self.journal.unlink()
        with self.lock:
            self.state["available"]["update_available"] = False
            self.save()

    def recover(self):
        tx = read_json(self.journal)
        if not tx:
            return
        if tx["verified"]:
            self.compose(Path(tx["active_config"]), tx["project"], tx["service"])
            self.ready(self.config["base_url"], tx["version"])
            self.flag.unlink(missing_ok=True)
            self.journal.unlink()
            return True
        atomic_json(self.flag, {"updating": True}, 0o640)
        stopped = subprocess.run(["docker", "stop", self.config["app"]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if stopped.returncode != 0:
            remaining = run(["docker", "container", "ls", "--all", "--quiet", "--filter", "name=^/" + self.config["app"] + "$"])
            if remaining.strip():
                raise RuntimeError("无法停止候选应用，保持维护状态")
        if tx["backup"]:
            self.restore(Path(tx["backup"]), tx["database"], create=True)
        self.compose(Path(tx["previous_config"]), tx["project"], tx["service"])
        # 旧镜像必须为初始化后支持版本接口的版本。
        old_version = self.inspect_image(tx["old_image"])["Config"]["Labels"][REVISION]
        self.ready(self.config["base_url"], old_version)
        self.flag.unlink(missing_ok=True)
        self.journal.unlink()
        return False

    def startup(self):
        for resource_file in self.home.glob("update-*/preflight.json"):
            self.cleanup_preflight(resource_file)
        if self.journal.exists():
            verified = self.recover()
            job = self.state.get("job")
            if job:
                job.update(status="succeeded" if verified else "rolled_back", message="更新服务重启，已完成中断任务恢复")
                self.save()
        elif (self.state.get("job") or {}).get("status") == "running":
            self.state["job"].update(status="failed", message="更新服务重启，上次任务已中止，可以重新检查")
            self.save()
        if self.flag.exists() and not self.journal.exists():
            self.state["job"] = dict(id="recovery", action="install", status="needs_attention", phase="recovery",
                                     message="维护标志存在但恢复记录缺失，请管理员检查服务器", started_at="", requested_by="")
            self.save()
        # flag 无 journal 表示恢复元数据丢失，不擅自解除维护。


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


class Handler(http.server.BaseHTTPRequestHandler):
    def address_string(self):
        return "local"

    def log_message(self, *_args):
        pass

    def respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/status":
            return self.respond(404, {"detail": "not found"})
        self.respond(200, self.server.updater.status())

    def do_POST(self):
        if self.path not in ("/check", "/install"):
            return self.respond(404, {"detail": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 2048:
                raise ValueError("请求大小不合法")
            payload = json.loads(self.rfile.read(length))
            allowed = {"requested_by", "digest"} if self.path == "/install" else {"requested_by"}
            if not isinstance(payload, dict) or set(payload) - allowed:
                raise ValueError("请求参数不合法")
            state = self.server.updater.submit(self.path[1:], payload)
        except (ValueError, TypeError) as error:
            return self.respond(409, {"detail": str(error)})
        self.respond(202, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/opt/english-web-updater/config.json")
    args = parser.parse_args()
    os.umask(0o027)
    logging.basicConfig(level=logging.INFO)
    config = json.loads(Path(args.config).read_text())
    spec = importlib.util.spec_from_file_location("deployment", Path(__file__).with_name("deployment.py"))
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    updater = Updater(config, helper)
    updater.startup()
    socket = Path(config["runtime_dir"]) / "updater.sock"
    socket.unlink(missing_ok=True)
    with Server(str(socket), Handler) as server:
        os.chmod(socket, 0o660)
        server.updater = updater
        server.serve_forever()


if __name__ == "__main__":
    main()
