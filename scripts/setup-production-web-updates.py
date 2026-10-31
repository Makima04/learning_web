#!/usr/bin/env python3
"""在 Mac 终端执行一次：上传当前源码包，在 Orange Pi 迁移并启用网页更新。"""
import argparse
from pathlib import Path
import shlex
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="root@192.168.1.161")
    parser.add_argument("--backup", default="/home/orangepi/learning_web/backups/study-20261031-195513-GKDSOr")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = subprocess.check_output(["python3", str(root / "scripts/package-study-release.py")], text=True)
    print(output, flush=True)
    values = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
    archive = values["ARCHIVE"]
    subprocess.run(["scp", "--", archive, archive + ".sha256", args.host + ":/root/"], check=True)
    remote = r'''set -euo pipefail
release="$1"
backup="$2"
cd /root
sha256sum --check "$release.tar.gz.sha256"
mkdir -p /home/orangepi/learning_web/releases
tar -xzf "$release.tar.gz" -C /home/orangepi/learning_web/releases
python3 "/home/orangepi/learning_web/releases/$release/scripts/deploy_production_study.py" \
  --backup "$backup" --apply --enable-web-updater
'''
    command = shlex.join(["bash", "-s", "--", values["RELEASE"], args.backup])
    subprocess.run(["ssh", args.host, command], input=remote, text=True, check=True)


if __name__ == "__main__":
    main()
