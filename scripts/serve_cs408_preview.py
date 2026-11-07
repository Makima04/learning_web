#!/usr/bin/env python3
"""启动 408 题库前端静态预览（支持 SPA 深链 + 禁用缓存，保证看到的是最新构建）。

用法：
  .venv/bin/python3 scripts/gen_cs408_frontend.py
  .venv/bin/python3 scripts/gen_cs408_big_guide.py
  (cd frontend && npm run build)
  .venv/bin/python3 scripts/serve_cs408_preview.py --port 8788
  # 浏览器打开 http://127.0.0.1:8788/kg/exams/overview

为什么不用 `python -m http.server`：它不回退 SPA 路由，直接访问
/kg/exams/overview、/kg/exams/2026 会 404；本脚本对无扩展名路径回退到 index.html。
生产构建产物在 frontend/dist，预览只依赖静态文件，不需要后端 / Postgres。
"""
from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def _no_cache(self) -> None:
        # 预览必须同步呈现修复后的最终状态，任何一层旧缓存都会造成误判
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    def end_headers(self) -> None:
        self._no_cache()
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0].startswith("/api/"):
            # 预览是纯静态：给一个无害的空响应，避免前端把 404 当异常处理
            body = json.dumps({}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def send_head(self):  # noqa: N802
        # GET 与 HEAD 都要回退 SPA 路由，否则预览面板探测 URL 时会拿到 404
        path = self.path.split("?", 1)[0]
        target = DIST / path.lstrip("/")
        if path != "/" and not target.exists() and "." not in Path(path).name:
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, fmt: str, *args) -> None:
        # 只保留错误信息，预览请求不打屏
        if "404" in (fmt % args) or "500" in (fmt % args):
            super().log_message(fmt, *args)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    if not (DIST / "index.html").exists():
        print(f"缺少构建产物 {DIST}/index.html，请先在 frontend 目录执行 npm run build", flush=True)
        return 1
    srv = ThreadingHTTPServer((args.host, args.port), PreviewHandler)
    print(f"408 预览已启动： http://{args.host}:{args.port}/kg/exams/overview", flush=True)
    print(f"静态目录：{DIST}（SPA 回退已开启，缓存已禁用）", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
