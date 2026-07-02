"""seed_sentences.py — 把 frontend/public/papers.js 里 window.PAPERS 的真题例句灌入 sentences 表。

papers.js 形如 `/* 注释 */\\nwindow.PAPERS=<json>;`。本脚本直接抠出 JSON 段 json.loads，
遍历每个 paper.year → sections[].passages[] → words[].sentences[]，按 text 去重，
INSERT OR IGNORE（首条 year/label 留下）。打印 `seeded N sentences (M new, K existed)`。

paper.sections 的 passage 字段在 papers/*.json 里是 str，但在 papers.js（经
match_vocab.py 处理后）里是统一的 passages[] 列表、每个 passage 含 words[]——
本脚本以 papers.js 为准。
"""
import json
import sqlite3
from pathlib import Path

from .db import DB_PATH, init_db, now_iso

# 优先 frontend/public/papers.js（本地开发），回退 web/papers.js（Docker 镜像内只 COPY 了 web/）
_ROOT = Path(__file__).resolve().parent.parent
PAPERS_JS = _ROOT / "frontend" / "public" / "papers.js"
PAPERS_JS_FALLBACK = _ROOT / "web" / "papers.js"


def parse_papers_js(path: Path):
    """读 papers.js，把 `window.PAPERS=<json>;` 的 JSON 段抠出来解析。"""
    raw = path.read_text(encoding="utf-8")
    # 去掉首行注释（如果有）——直接找第一个 '='
    eq = raw.find("=")
    if eq < 0:
        raise RuntimeError("papers.js: 找不到 '='")
    # 末尾分号（去 trailing 空白后）
    stripped = raw.rstrip()
    if not stripped.endswith(";"):
        # 容错：可能没分号
        end = len(stripped)
    else:
        end = stripped.rfind(";")
    js = raw[eq + 1:end].strip()
    return json.loads(js)


def collect_sentences(papers):
    """遍历 papers，返回 [(text, year, label), ...]（按 text 去重，首条胜出）。"""
    seen = {}
    for p in papers:
        year = p.get("year")
        for s in p.get("sections", []):
            for pa in s.get("passages", []):
                label = pa.get("label")
                for w in pa.get("words", []):
                    for sent in w.get("sentences", []):
                        t = sent and sent.strip()
                        if not t:
                            continue
                        if t not in seen:
                            seen[t] = (t, year, label)
    return list(seen.values())


def main():
    init_db()
    papers_js = PAPERS_JS if PAPERS_JS.exists() else PAPERS_JS_FALLBACK
    if not papers_js.exists():
        raise SystemExit(f"papers.js 不存在: {PAPERS_JS} 或 {PAPERS_JS_FALLBACK}")

    papers = parse_papers_js(papers_js)
    items = collect_sentences(papers)
    total = len(items)

    conn = sqlite3.connect(DB_PATH)
    new_count = 0
    existed = 0
    try:
        now = now_iso()
        for text, year, label in items:
            cur = conn.execute(
                "INSERT OR IGNORE INTO sentences(text, year, label, created_at) "
                "VALUES(?,?,?,?)",
                (text, year, label, now),
            )
            if cur.rowcount > 0:
                new_count += 1
            else:
                existed += 1
        conn.commit()
    finally:
        conn.close()

    print(f"seeded {total} sentences ({new_count} new, {existed} existed)")


if __name__ == "__main__":
    main()
