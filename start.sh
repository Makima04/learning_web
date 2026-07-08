#!/usr/bin/env bash
# 启动 english_web 后端 + 前端(同源)。浏览器访问 http://localhost:8000
# 前端先 npm run build 到 frontend/dist，FastAPI 同源挂载。
set -e
cd "$(dirname "$0")"
.venv/bin/python3 scripts/gen_version.py     # 生成 web/version.js（git 短 hash）
.venv/bin/python3 -m server.seed_sentences   # 灌唯一例句(幂等)
( cd frontend && npm run build )             # 构建前端到 frontend/dist
exec .venv/bin/uvicorn server.app:app --port 8000
