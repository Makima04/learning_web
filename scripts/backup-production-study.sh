#!/usr/bin/env bash
# 在 Orange Pi 本机执行：保存数据库、Compose 配置和旧镜像，供学习同步迁移前回滚使用。
# 默认值来自生产容器的实际部署信息；不停止服务、不执行数据库迁移。
set -euo pipefail
umask 077

app_container="${EW_BACKUP_APP_CONTAINER:-english_web}"
db_container="${EW_BACKUP_DB_CONTAINER:-learning_web-db-1}"
deploy_dir="${EW_BACKUP_DEPLOY_DIR:-/home/orangepi/learning_web}"

command -v docker >/dev/null
[[ -d "$deploy_dir" ]] || { echo "部署目录不存在：$deploy_dir" >&2; exit 1; }
actual_dir="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$app_container")"
[[ "$actual_dir" == "$deploy_dir" ]] || {
  echo "容器部署目录与预期不一致，未执行备份：$actual_dir" >&2
  exit 1
}
[[ "$(docker inspect --format '{{.State.Running}}' "$db_container")" == true ]] || {
  echo "数据库容器未运行：$db_container" >&2
  exit 1
}

mkdir -p "$deploy_dir/backups"
backup_dir="$(mktemp -d "$deploy_dir/backups/study-$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)-XXXXXX")"
chmod 700 "$backup_dir"
echo "备份目录：$backup_dir"

# inspect 与配置可能包含凭据，只保存在服务器的私有备份目录，不打印内容。
docker inspect "$app_container" > "$backup_dir/app-container.json"
docker inspect "$db_container" > "$backup_dir/db-container.json"
python3 - "$backup_dir/app-container.json" "$backup_dir/db-container.json" <<'PY'
import json
import sys
from urllib.parse import unquote, urlsplit

with open(sys.argv[1]) as source:
    app = json.load(source)[0]
with open(sys.argv[2]) as source:
    db = json.load(source)[0]

def environment(container):
    return dict(value.split('=', 1) for value in container['Config'].get('Env', []) if '=' in value)

app_env, db_env = environment(app), environment(db)
url = urlsplit(app_env.get('EW_DATABASE_URL') or app_env.get('DATABASE_URL') or '')
aliases = {db['Name'].lstrip('/')}
for network in db.get('NetworkSettings', {}).get('Networks', {}).values():
    aliases.update(network.get('Aliases') or [])
    aliases.add(network.get('IPAddress'))
if url.scheme not in ('postgres', 'postgresql') or url.hostname not in aliases:
    sys.exit('应用数据库地址与指定数据库容器不匹配，备份中止。')
if unquote(url.path.lstrip('/')) != db_env.get('POSTGRES_DB'):
    sys.exit('应用数据库名与 POSTGRES_DB 不匹配，备份中止。')
print('已确认应用数据库与备份目标一致。')
PY
docker inspect --format '{{.Image}}' "$app_container" > "$backup_dir/app-image-id.txt"
rollback_image="english-web:rollback-${backup_dir##*/}"
docker image tag "$(cat "$backup_dir/app-image-id.txt")" "$rollback_image"
printf '%s\n' "$rollback_image" > "$backup_dir/rollback-image.txt"

mkdir "$backup_dir/config"
compose_files="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$app_container")"
IFS=',' read -r -a config_files <<< "$compose_files"
for source_file in "${config_files[@]}" "$deploy_dir/.env"; do
  if [[ -f "$source_file" ]]; then
    cp --parents -- "$source_file" "$backup_dir/config/"
  fi
done

docker exec "$db_container" sh -c '
  : "${POSTGRES_USER:?数据库容器缺少 POSTGRES_USER}" "${POSTGRES_DB:?数据库容器缺少 POSTGRES_DB}"
  exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom
' > "$backup_dir/database.dump"
test -s "$backup_dir/database.dump"
docker exec -i "$db_container" pg_restore --list < "$backup_dir/database.dump" > "$backup_dir/database-contents.txt"
(cd "$backup_dir" && sha256sum database.dump > SHA256SUMS && sha256sum --check SHA256SUMS)

docker exec -i "$db_container" sh -c '
  exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' <<'SQL' | tee "$backup_dir/database-summary.txt"
SELECT current_database() AS database;
SELECT 'users' AS table_name, COUNT(*) FROM users
UNION ALL SELECT 'cards', COUNT(*) FROM cards
UNION ALL SELECT 'study_events', COUNT(*) FROM study_events
UNION ALL SELECT 'meta', COUNT(*) FROM meta;
SELECT to_regclass('public._sqlx_migrations') IS NOT NULL AS has_migrations \gset
\if :has_migrations
SELECT version, description, success, encode(checksum, 'hex') AS checksum
FROM _sqlx_migrations ORDER BY version;
\else
\echo 当前数据库没有 SQLx 迁移记录，需要先核对基线结构。
\endif
SQL

echo "备份文件格式与校验和检查通过；尚未执行恢复演练。"
printf 'BACKUP_DIR=%s\nROLLBACK_IMAGE=%s\n' "$backup_dir" "$rollback_image"
