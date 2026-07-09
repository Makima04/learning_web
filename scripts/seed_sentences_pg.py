#!/usr/bin/env python3
"""seed_sentences_pg.py — 从 web/papers.js 灌例句到 PostgreSQL（幂等）。

  export EW_DATABASE_URL=postgres://makima@localhost/english_web
  .venv/bin/python3 scripts/seed_sentences_pg.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAPERS_JS = ROOT / "web" / "papers.js"
PAPERS_JS_FALLBACK = ROOT / "frontend" / "public" / "papers.js"


def connect_pg(url: str):
    try:
        import psycopg

        return psycopg.connect(url)
    except ImportError:
        pass
    try:
        import psycopg2

        return psycopg2.connect(url)
    except ImportError as e:
        raise SystemExit(
            "需要 psycopg：.venv/bin/pip install 'psycopg[binary]'\n" + str(e)
        ) from e


def parse_papers_js(path: Path):
    raw = path.read_text(encoding="utf-8")
    eq = raw.find("=")
    if eq < 0:
        raise RuntimeError("papers.js: 找不到 '='")
    return json.JSONDecoder().raw_decode(raw[eq + 1 :])[0]


def collect_sentences(papers):
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
    url = (
        os.environ.get("EW_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or "postgres://makima@localhost/english_web"
    )
    papers_js = PAPERS_JS if PAPERS_JS.exists() else PAPERS_JS_FALLBACK
    if not papers_js.exists():
        raise SystemExit(f"papers.js 不存在: {PAPERS_JS}")

    papers = parse_papers_js(papers_js)
    items = collect_sentences(papers)
    print(f"parsed {len(items)} unique sentences from {papers_js}")

    conn = connect_pg(url)
    cur = conn.cursor()
    # ensure table
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='sentences'"
    )
    if not cur.fetchone():
        sql = (ROOT / "backend" / "migrations" / "001_init.sql").read_text(
            encoding="utf-8"
        )
        cur.execute(sql)
        conn.commit()

    new_count = 0
    existed = 0
    for text, year, label in items:
        cur.execute(
            """
            INSERT INTO sentences (text, year, label)
            VALUES (%s, %s, %s)
            ON CONFLICT (text) DO NOTHING
            """,
            (text, year, label),
        )
        if cur.rowcount and cur.rowcount > 0:
            new_count += 1
        else:
            existed += 1
    conn.commit()
    cur.close()
    conn.close()
    print(f"seeded {len(items)} sentences ({new_count} new, {existed} existed)")


if __name__ == "__main__":
    main()
