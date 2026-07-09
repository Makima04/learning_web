#!/usr/bin/env bash
# 启动 english_web：构建 React 前端 + Rust/Axum + PostgreSQL
# 浏览器访问 http://localhost:8000
set -e
cd "$(dirname "$0")"

export EW_DATABASE_URL="${EW_DATABASE_URL:-postgres://makima@localhost/english_web}"

if [ -x .venv/bin/python3 ]; then
  .venv/bin/python3 scripts/gen_version.py 2>/dev/null || true
fi

mkdir -p frontend/public
[ -f web/data.js ] && cp -f web/data.js frontend/public/data.js
[ -f web/papers.js ] && cp -f web/papers.js frontend/public/papers.js
(cd frontend && npm run build)

(cd backend && cargo build --release)

# 幂等灌例句（需 psycopg）
if [ -x .venv/bin/python3 ] && [ -f web/papers.js ]; then
  .venv/bin/python3 scripts/seed_sentences_pg.py || echo "warn: seed_sentences_pg skipped"
fi

exec backend/target/release/english_web_server
