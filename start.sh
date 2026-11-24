#!/usr/bin/env bash
# 启动 english_web：构建 React 前端 + Rust/Axum + PostgreSQL
# 浏览器访问 http://localhost:8000
set -e
cd "$(dirname "$0")"

if [ -z "${EW_DATABASE_URL:-${DATABASE_URL:-}}" ] && [ -f .local/postgres/PG_VERSION ]; then
  scripts/local_postgres.sh start
  IFS= read -r EW_DATABASE_URL < .local/database-url
  export EW_DATABASE_URL
fi

if [ -x .venv/bin/python3 ]; then
  .venv/bin/python3 scripts/gen_version.py 2>/dev/null || true
fi

(cd frontend && npm run build)

(cd backend && cargo build --release)

# 幂等灌例句（需 psycopg）
if [ -x .venv/bin/python3 ] && [ -f web/papers.js ]; then
  .venv/bin/python3 scripts/seed_sentences_pg.py || echo "warn: seed_sentences_pg skipped"
fi

exec backend/target/release/english_web_server
