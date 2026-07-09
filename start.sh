#!/usr/bin/env bash
# 启动 english_web：构建 React 前端 + FastAPI。浏览器访问 http://localhost:8000
set -e
cd "$(dirname "$0")"
.venv/bin/python3 scripts/gen_version.py     # frontend/public/version.js + cache bust
.venv/bin/python3 -m server.seed_sentences   # 灌唯一例句(幂等)
mkdir -p frontend/public
[ -f web/data.js ] && cp -f web/data.js frontend/public/data.js
[ -f web/papers.js ] && cp -f web/papers.js frontend/public/papers.js
(cd frontend && npm run build)
exec .venv/bin/uvicorn server.app:app --port 8000
