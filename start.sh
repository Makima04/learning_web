#!/usr/bin/env bash
# 启动 english_web 后端 + 前端(同源)。浏览器访问 http://localhost:8000
# 若存在 frontend/，优先 npm run build 产出 dist，由 server 挂载 React；否则用 web/。
set -e
cd "$(dirname "$0")"
.venv/bin/python3 scripts/gen_version.py     # 生成 web/version.js（git 短 hash）
.venv/bin/python3 -m server.seed_sentences   # 灌唯一例句(幂等)
if [ -d frontend ] && [ -f frontend/package.json ]; then
  # 确保 data.js / papers.js 在 public（Vite 复制进 dist）
  mkdir -p frontend/public
  [ -f web/data.js ] && cp -f web/data.js frontend/public/data.js
  [ -f web/papers.js ] && cp -f web/papers.js frontend/public/papers.js
  (cd frontend && npm run build)
fi
exec .venv/bin/uvicorn server.app:app --port 8000
