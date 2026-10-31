#!/usr/bin/env python3
"""一次性安装主机更新服务，并返回 Web 容器需要的 Compose 配置。由迁移脚本调用。"""
import grp
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time

GROUP = "english-web-update"
HOME = Path("/opt/english-web-updater")
STATE = Path("/var/lib/english-web-updater")
# 持久化维护标志，断电重启后也必须先恢复，再开放学习写入。
SHARED = STATE / "shared"
CONTAINER_SHARED = "/run/english-web-updater"


def install(source, deploy_dir, app="english_web", db="learning_web-db-1"):
    if os.geteuid() != 0:
        raise RuntimeError("需要 root 安装更新服务")
    subprocess.run(["systemctl", "--version"], check=True, stdout=subprocess.DEVNULL)
    try:
        group = grp.getgrnam(GROUP)
    except KeyError:
        subprocess.run(["groupadd", "--system", GROUP], check=True)
        group = grp.getgrnam(GROUP)
    HOME.mkdir(mode=0o700, exist_ok=True)
    STATE.mkdir(mode=0o700, exist_ok=True)
    SHARED.mkdir(mode=0o750, exist_ok=True)
    os.chown(SHARED, 0, group.gr_gid)
    SHARED.chmod(0o750)
    # 此目录只通过初始化受信任源码更新，不让容器任意替换 root 执行的程序。
    targets = {source / "scripts/web_updater/agent.py": HOME / "agent.py",
               source / "scripts/deploy_production_study.py": HOME / "deployment.py",
               source / "scripts/backup-production-study.sh": HOME / "backup.sh"}
    config = dict(app=app, db=db, deploy_dir=str(deploy_dir), state_dir=str(STATE),
                  runtime_dir=str(SHARED), backup_script=str(HOME / "backup.sh"),
                  repository="ghcr.io/makima04/learning_web", channel="latest", base_url="http://127.0.0.1:8800")
    if (STATE / "transaction.json").exists():
        raise RuntimeError("存在未完成更新，请先恢复后再安装")
    subprocess.run(["systemctl", "stop", "english-web-updater.service"], check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for old, new in targets.items():
        shutil.copyfile(old, new)
        new.chmod(0o600)
    config_file = HOME / "config.json"
    # 不覆盖后续由 root 指定的镜像通道等配置。
    if not config_file.exists():
        config_file.write_text(json.dumps(config, indent=2) + "\n")
        config_file.chmod(0o600)
    else:
        existing = json.loads(config_file.read_text())
        if any(existing[key] != config[key] for key in ("app", "db", "deploy_dir", "runtime_dir")):
            raise RuntimeError("现有更新服务的部署目标不一致")
    unit = """[Unit]
Description=English Web administrator update service
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
Group=english-web-update
UMask=0027
ExecStart=/usr/bin/python3 /opt/english-web-updater/agent.py
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
"""
    Path("/etc/systemd/system/english-web-updater.service").write_text(unit)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", "--now", "english-web-updater.service"], check=True)
    subprocess.run(["systemctl", "is-active", "--quiet", "english-web-updater.service"], check=True)
    for _ in range(30):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(2)
                connection.connect(str(SHARED / "updater.sock"))
                connection.sendall(b"GET /status HTTP/1.0\r\n\r\n")
                if connection.recv(1024).startswith(b"HTTP/1.0 200"):
                    return group.gr_gid
        except OSError:
            pass
        time.sleep(0.5)
    raise RuntimeError("更新服务没有就绪，请检查 journalctl -u english-web-updater.service")


def configure_service(service, group_id):
    environment = service.setdefault("environment", {})
    environment.update(EW_UPDATE_SOCKET=CONTAINER_SHARED + "/updater.sock",
                       EW_UPDATE_MAINTENANCE_FILE=CONTAINER_SHARED + "/maintenance.json")
    mounts = service.setdefault("volumes", [])
    mounts[:] = [mount for mount in mounts if not isinstance(mount, dict) or mount.get("target") != CONTAINER_SHARED]
    mounts.append(dict(type="bind", source=str(SHARED), target=CONTAINER_SHARED, read_only=True,
                       bind={"create_host_path": False}))
    groups = service.setdefault("group_add", [])
    if str(group_id) not in [str(group) for group in groups]:
        groups.append(str(group_id))
