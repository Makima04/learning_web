#!/usr/bin/env python3
"""gen_version.py — 给前端数据脚本添加 content-hash 缓存破坏。

版本号由 Vite 在开发和构建时直接注入 window.EW_VERSION。

用法：python3 scripts/gen_version.py
start.sh 启动前调用。
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "frontend" / "index.html"
DATA_JS = ROOT / "web" / "data.js"
PAPERS_JS = ROOT / "web" / "papers.js"


def sha256_of_file(path: Path) -> str:
    if not path.exists():
        return "dev"
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()[:16]


def patch_index_html(words_hash: str, papers_hash: str):
    if not INDEX.exists():
        return
    html = INDEX.read_text(encoding="utf-8")
    html = re.sub(
        r'(src="/data\.js)(?:\?v=[^"]*)?(")',
        r"\g<1>?v=" + words_hash + r"\g<2>",
        html,
    )
    html = re.sub(
        r'(src="/papers\.js)(?:\?v=[^"]*)?(")',
        r"\g<1>?v=" + papers_hash + r"\g<2>",
        html,
    )
    INDEX.write_text(html, encoding="utf-8")


def main():
    words_hash = sha256_of_file(DATA_JS)
    papers_hash = sha256_of_file(PAPERS_JS)
    patch_index_html(words_hash, papers_hash)
    print(f"patched index.html data.js?v={words_hash} papers.js?v={papers_hash}")


if __name__ == "__main__":
    main()
