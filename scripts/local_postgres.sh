#!/usr/bin/env bash
# 管理项目自用的 PostgreSQL，仅通过项目内的 Unix socket 连接。
set -euo pipefail

root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
state="$root/.local"
data="$state/postgres"
socket_dir="$state/run"
port=55432

if [ ! -f "$data/PG_VERSION" ]; then
  echo "项目内 PostgreSQL 尚未初始化：$data" >&2
  exit 1
fi

case "${1:-}" in
  start)
    umask 077
    mkdir -p "$socket_dir" "$state/logs"
    if ! pg_ctl -D "$data" status >/dev/null; then
      printf -v options '%q ' -h '' -k "$socket_dir" -p "$port"
      pg_ctl -D "$data" -l "$state/logs/postgres.log" -o "$options" -w start
    fi
    # 重新生成绝对路径，方便项目移动后再次启动。
    python3 - "$state" "$socket_dir" "$port" "$(id -un)" <<'PY'
from pathlib import Path
import sys
import tempfile
from urllib.parse import quote, urlencode

state, socket_dir, port, username = sys.argv[1:]
user = quote(username, safe="")
query = urlencode({"host": socket_dir, "port": port, "sslmode": "disable"})
with tempfile.NamedTemporaryFile(mode="w", dir=state, delete=False) as out:
    out.write(f"postgresql://{user}@localhost/english_web?{query}\n")
Path(out.name).replace(Path(state) / "database-url")
PY
    ;;
  stop)
    pg_ctl -D "$data" -m fast -w stop
    ;;
  status)
    pg_ctl -D "$data" status
    ;;
  *)
    echo "用法：scripts/local_postgres.sh {start|stop|status}" >&2
    exit 2
    ;;
esac
