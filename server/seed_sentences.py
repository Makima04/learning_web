"""seed_sentences.py — 把 web/papers.js 里 window.PAPERS 的真题例句灌入 sentences 表。

papers.js 形如 `/* 注释 */\\nwindow.PAPERS=<json>;`。本脚本抠出 JSON 段 json.loads，
遍历每个 paper.year → sections[].passages[] → words[].sentences[]，按 text 去重，
INSERT OR IGNORE（首条 year/label 留下）。打印 `seeded N sentences (M new, K existed)`。
"""
import json
import sqlite3
from pathlib import Path

from .db import DB_PATH, init_db, now_iso

_ROOT = Path(__file__).resolve().parent.parent
# 数据源：web/papers.js（管线产物）。Docker 镜像内也会 COPY web/。
PAPERS_JS = _ROOT / "web" / "papers.js"
# 开发时若只在 public 有一份，兼容一下
PAPERS_JS_FALLBACK = _ROOT / "frontend" / "public" / "papers.js"


def parse_papers_js(path: Path):
    """读 papers.js，把 `window.PAPERS=<json>;` 的 JSON 段抠出来解析。

    用 raw_decode 只解析首个 JSON 值，容忍尾部多余语句（如
    match_vocab.py 追加的 `window.PAPERS_META={...};`）。
    """
    raw = path.read_text(encoding="utf-8")
    eq = raw.find("=")
    if eq < 0:
        raise RuntimeError("papers.js: 找不到 '='")
    js = raw[eq + 1 :]
    return json.JSONDecoder().raw_decode(js)[0]


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
