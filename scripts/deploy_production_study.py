#!/usr/bin/env python3
"""在 Orange Pi 部署学习事务迁移；先恢复演练，再切换应用，失败回到旧镜像。

数据库凭据仅在服务器内读取，保存在权限 600 的运行文件中，不打印。
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

APP = "english_web"
DB = "learning_web-db-1"
DEPLOY = Path("/home/orangepi/learning_web")
TABLES = ("users", "cards", "study_events", "meta", "sessions", "user_settings",
          "word_lists", "journal_entries", "journal_logs", "journal_categories",
          "journal_weeklies", "user_kg", "user_politics", "user_journal", "progress_reset", "journal_reset")
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def run(args, *, data=None, capture=True):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None, check=True)
    return result.stdout.decode() if capture else ""


def inspect(name):
    return json.loads(run(["docker", "inspect", name]))[0]


def sql(database, statement):
    return run(["docker", "exec", "-i", "-e", "PGDATABASE=" + database, DB, "sh", "-c",
                'exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$PGDATABASE"'],
               data=statement.encode()).strip()


def fingerprint(database):
    result = {}
    for table in TABLES:
        row = "to_jsonb(t)"
        if table == "cards":
            row = "CASE WHEN state='review' OR (state='learn' AND quiz>=2) THEN to_jsonb(t)-'due' ELSE to_jsonb(t) END"
        result[table] = json.loads(sql(database, f"""
            SELECT json_build_object('count',count(*),'digest',md5(COALESCE(string_agg(row::text,'' ORDER BY row::text),'')))
            FROM (SELECT {row} AS row FROM {table} t) rows;
        """))
    return result


def migrations(database):
    return json.loads(sql(database, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json) FROM _sqlx_migrations WHERE success;"))


def write_private(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    path.chmod(0o600)


def request(url, payload=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    with HTTP.open(urllib.request.Request(url, data=data, headers=headers), timeout=12) as response:
        return response.read().decode()


def ready(base, release):
    for _ in range(60):
        try:
            protocol = json.loads(request(base + "/api/study/protocol"))
            if protocol.get("version") == 2 and release in request(base + "/"):
                return protocol
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(1)
    raise RuntimeError("新版应用未通过启动与版本检查")


def probe(database, base):
    name = "migration_probe_" + secrets.token_hex(6)
    token = secrets.token_hex(32)
    user_id = int(sql(database, f"INSERT INTO users(username,pw_hash,salt) VALUES('{name}','probe','probe') RETURNING id;" ).splitlines()[0])
    sql(database, f"INSERT INTO sessions(token,user_id,expires_at) VALUES('{token}',{user_id},NOW()+INTERVAL '1 hour');")
    now = dt.datetime.now(dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(hours=8)))
    stamp = int(now.timestamp() * 1000)
    due = int((now.replace(hour=0, minute=0, second=0, microsecond=0) + dt.timedelta(days=1)).timestamp() * 1000)
    day = now.strftime("%Y-%m-%d")
    card = dict(learned=True, state="review", due=due, ivl=1, ease=2.5, reps=1, lapses=0, quiz=0, updated_at=stamp)
    command = dict(operation_id="probe-completion", word_idx=1, card=card,
                   event_type="new", day_key=day, client_at=stamp)
    first = json.loads(request(base + "/api/study/completions/bulk", {"completions": [command]}, token))
    second = json.loads(request(base + "/api/study/completions/bulk", {"completions": [command]}, token))
    assert first.get("applied") == 1 and second.get("ignored") == 1, "学习命令幂等检查失败"
    minute_card = dict(card, learned=False, state="learn", quiz=1, due=stamp+600000)
    snapshot = dict(operation_id="probe-import", client_at=stamp,
                    cards={"2": card, "3": minute_card},
                    events=[dict(word_idx=2, event_type="new", quality="good", day_key=day, client_at=stamp)],
                    meta=dict(day_key=day, new_today=2, review_today=0, learn_today=0, done_today=2, client_at=stamp))
    assert json.loads(request(base+"/api/study/import", snapshot, token)).get("ok"), "旧数据导入失败"
    assert json.loads(request(base+"/api/study/import", snapshot, token)).get("duplicate"), "导入重试去重失败"
    cards = json.loads(request(base+"/api/cards", token=token))["cards"]
    assert len(cards) == 3 and cards["3"]["due"] == minute_card["due"], "卡片或分钟学习步骤检查失败"
    assert int(sql(database, f"SELECT count(*) FROM study_events WHERE user_id={user_id};")) == 2, "学习事件出现重复"
    print("恢复演练通过：数据完整、命令幂等、旧队列导入及分钟步骤均正确。", flush=True)


def compose_args(config, project):
    return ["docker", "compose", "--project-directory", str(DEPLOY), "-p", project, "-f", str(config)]


def rollback(state):
    database = state["database"]
    subprocess.run(["docker", "stop", APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    added = set(migrations(database)) - set(state["baseline_migrations"])
    if not added.issubset({2, 3}):
        raise RuntimeError("出现未知数据库迁移，已停止应用，需要人工核对后回滚")
    if added:
        sql(database, "DELETE FROM _sqlx_migrations WHERE version IN (" + ",".join(map(str, sorted(added))) + ");")
    run(compose_args(state["rollback_config"], state["project"]) + ["up", "-d", "--no-deps", "--no-build", state["service"]], capture=False)
    print("已恢复旧镜像；保留现有学习数据及新增表，不恢复覆盖生产数据库。", flush=True)


def deploy(args):
    source = Path(__file__).resolve().parent.parent
    manifest = json.loads((source / "release.json").read_text())
    digest = hashlib.sha256()
    for name in manifest["paths"]:
        path = (source/name).resolve()
        if not path.is_relative_to(source) or not path.is_file():
            raise RuntimeError("发布包包含不合法文件路径")
        digest.update(name.encode()+b"\0")
        with path.open("rb") as stream:
            for block in iter(lambda:stream.read(1024*1024),b""):
                digest.update(block)
    if digest.hexdigest() != manifest["source_sha256"]:
        raise RuntimeError("发布源码校验失败")
    release = manifest["release"]
    if not release.startswith("study-v2-") or not all(c.isalnum() or c == "-" for c in release):
        raise RuntimeError("发布标识不合法")
    backup = Path(args.backup).resolve()
    if not backup.is_relative_to(DEPLOY / "backups"):
        raise RuntimeError("备份路径不在项目备份目录")
    subprocess.run(["sha256sum", "--check", "SHA256SUMS"], cwd=backup, check=True)
    app, db = inspect(APP), inspect(DB)
    if app["Image"] != (backup / "app-image-id.txt").read_text().strip():
        raise RuntimeError("应用已改变，请先为当前版本重新执行备份")
    labels = app["Config"]["Labels"]
    if labels["com.docker.compose.project.working_dir"] != str(DEPLOY):
        raise RuntimeError("部署目录与预期不一致")
    for mount in app.get("Mounts", []):
        destination = mount["Destination"].rstrip("/")
        if destination in ("/app", "/app/frontend", "/app/english_web_server") or destination.startswith("/app/frontend/dist"):
            raise RuntimeError("现有挂载覆盖应用文件，需先核对："+destination)
    service, project = labels["com.docker.compose.service"], labels["com.docker.compose.project"]
    env = dict(item.split("=", 1) for item in app["Config"]["Env"] if "=" in item)
    db_env = dict(item.split("=", 1) for item in db["Config"]["Env"] if "=" in item)
    database = db_env["POSTGRES_DB"]
    uri = urllib.parse.urlsplit(env["EW_DATABASE_URL"])
    if urllib.parse.unquote(uri.path.lstrip("/")) != database:
        raise RuntimeError("应用与备份数据库不一致")
    baseline_checksum = sql(database, "SELECT encode(checksum,'hex') FROM _sqlx_migrations WHERE version=1 AND success;")
    if baseline_checksum != hashlib.sha384((source/"backend/migrations/001_init.sql").read_bytes()).hexdigest():
        raise RuntimeError("迁移 001 校验和不一致")
    if set(migrations(database)) - {1, 2, 3}:
        raise RuntimeError("数据库存在本发布包不认识的较新迁移")
    run(["docker", "compose", "version"])
    image = "english-web:" + release
    print("构建服务器本机架构镜像：" + image, flush=True)
    run(["docker", "build", "--build-arg", "EW_VERSION="+release, "--tag", image, str(source)], capture=False)
    test_db = "ew_study_check_" + secrets.token_hex(6)
    test_container = "ew-study-check-" + secrets.token_hex(6)
    work = DEPLOY / "releases" / release
    work.mkdir(parents=True, exist_ok=True)
    work.chmod(0o700)
    test_env = work / "test.env"
    created = False
    try:
        run(["docker", "exec", DB, "sh", "-c", 'exec createdb -U "$POSTGRES_USER" "$1"', "sh", test_db])
        created = True
        with (backup/"database.dump").open("rb") as dump:
            subprocess.run(["docker", "exec", "-i", DB, "sh", "-c",
                            'exec pg_restore -U "$POSTGRES_USER" --dbname="$1" --exit-on-error --no-owner --no-privileges', "sh", test_db], stdin=dump, check=True)
        before = fingerprint(test_db)
        env.update(EW_DATABASE_URL=urllib.parse.urlunsplit(uri._replace(path="/"+test_db)),
                   EW_PORT="8000", EW_HOST="0.0.0.0", EW_ALLOW_FIRST_ADMIN="0", EW_MAIL_DEV="0")
        if any("\n" in value for value in env.values()):
            raise RuntimeError("运行环境含有多行变量，需要人工核对")
        test_env.write_text("".join(key+"="+value+"\n" for key,value in env.items()))
        test_env.chmod(0o600)
        networks = sorted(set(app["NetworkSettings"]["Networks"]) & set(db["NetworkSettings"]["Networks"]))
        if not networks:
            raise RuntimeError("应用和数据库没有共同网络")
        network = networks[0]
        run(["docker", "run", "-d", "--name", test_container, "--network", network,
             "--env-file", str(test_env), image])
        test_ip = inspect(test_container)["NetworkSettings"]["Networks"][network]["IPAddress"]
        test_base = "http://"+test_ip+":8000"
        ready(test_base, release)
        if before != fingerprint(test_db):
            raise RuntimeError("恢复演练发现原有数据变化，未切换生产服务")
        assert migrations(test_db) == [1, 2, 3], "候选镜像缺少迁移记录"
        assert int(sql(test_db,"SELECT count(*) FROM cards WHERE due>0 AND (state='review' OR (state='learn' AND quiz>=2)) AND (due%86400000+28800000)%86400000<>0;")) == 0
        probe(test_db,test_base)
    except BaseException:
        with (work/"verification-container.log").open("wb") as log:
            subprocess.run(["docker","logs",test_container],stdout=log,stderr=subprocess.STDOUT)
        print("恢复演练未通过，日志保存在："+str(work/"verification-container.log"),flush=True)
        raise
    finally:
        subprocess.run(["docker", "rm", "-f", test_container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if created:
            run(["docker", "exec", DB, "sh", "-c", 'exec dropdb -U "$POSTGRES_USER" --force --if-exists "$1"', "sh", test_db])
        test_env.unlink(missing_ok=True)
    if not args.apply:
        print("VERIFY_STATUS=OK；尚未切换生产应用。", flush=True)
        return
    fresh_output = run(["bash", str(source/"scripts/backup-production-study.sh")])
    print(fresh_output, flush=True)
    fresh = next(line.split("=",1)[1] for line in fresh_output.splitlines() if line.startswith("BACKUP_DIR="))
    fresh = Path(fresh)
    config_args = ["docker", "compose", "--project-directory", str(DEPLOY), "-p", project]
    for config in labels["com.docker.compose.project.config_files"].split(","):
        config_args.extend(["-f",config])
    current = json.loads(run(config_args+["config","--format","json"]))
    previous = json.loads(json.dumps(current))
    if args.enable_web_updater:
        spec = importlib.util.spec_from_file_location("web_updater_install", source/"scripts/web_updater/install.py")
        installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(installer)
        group_id = installer.install(source, DEPLOY, APP, DB)
        installer.configure_service(current["services"][service], group_id)
    for document,tag in [(current,image),(previous,(fresh/"rollback-image.txt").read_text().strip())]:
        document["services"][service]["image"] = tag
        document["services"][service]["pull_policy"] = "never"
        document["services"][service].pop("build",None)
    active_config, old_config = work/"compose.active.json", fresh/"compose.rollback.json"
    write_private(active_config,current)
    write_private(old_config,previous)
    run(compose_args(active_config,project)+["config","--quiet"])
    run(compose_args(old_config,project)+["config","--quiet"])
    state = dict(database=database,project=project,service=service,baseline_migrations=migrations(database),
                 rollback_config=str(old_config),active_config=str(active_config),release=release,backup=str(fresh))
    state_file = fresh/"deployment-state.json"
    write_private(state_file,state)
    try:
        run(["docker","stop",APP],capture=False)
        before = fingerprint(database)
        write_private(fresh/"before-cutover.json",before)
        run(compose_args(active_config,project)+["up","-d","--no-deps","--no-build",service],capture=False)
        protocol = ready("http://127.0.0.1:8800",release)
        after = fingerprint(database)
        write_private(fresh/"after-cutover.json",after)
        if any(after[name]["count"] < value["count"] for name,value in before.items()):
            raise RuntimeError("生产迁移发现数据行数减少")
        if before != after:
            print("切换期间有数据更新，已保留新增记录；前后摘要已存入备份目录。",flush=True)
        print("DEPLOY_STATUS=OK",flush=True)
        print("RELEASE="+release,flush=True)
        print("BACKUP_DIR="+str(fresh),flush=True)
        print("ACTIVE_COMPOSE="+str(active_config),flush=True)
        print("ROLLBACK_STATE="+str(state_file),flush=True)
        print("PROTOCOL="+json.dumps(protocol),flush=True)
        print("COUNTS="+json.dumps({name:value["count"] for name,value in before.items()}),flush=True)
    except BaseException:
        with (fresh/"failed-container.log").open("wb") as log:
            subprocess.run(["docker","logs",APP],stdout=log,stderr=subprocess.STDOUT)
        rollback(state)
        raise


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--enable-web-updater",action="store_true",help="切换时一并安装管理员网页更新服务")
    parser.add_argument("--rollback",type=Path)
    args=parser.parse_args()
    if args.rollback:
        rollback(json.loads(args.rollback.read_text()))
    else:
        if not args.backup:
            parser.error("需要 --backup 指定已校验的数据库备份目录")
        deploy(args)


if __name__ == "__main__":
    main()
