#!/usr/bin/env python3
"""migrate_sqlite_to_pg.py — 把 english_web.db (SQLite) 迁到 PostgreSQL。

用法:
  export EW_DATABASE_URL=postgres://makima@localhost/english_web
  .venv/bin/python3 scripts/migrate_sqlite_to_pg.py
  .venv/bin/python3 scripts/migrate_sqlite_to_pg.py --wipe   # 先清空 PG 业务表

保留原表主键 id；迁完后重置 sequences。密码哈希原样拷贝（PBKDF2 兼容）。
依赖: pip install psycopg[binary]  （或 psycopg2-binary）
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE = ROOT / "english_web.db"


def connect_pg(url: str):
    try:
        import psycopg
        from psycopg.types.json import Jsonb

        conn = psycopg.connect(url)
        return conn, Jsonb, "psycopg"
    except ImportError:
        pass
    try:
        import psycopg2
        import psycopg2.extras

        conn = psycopg2.connect(url)
        return conn, psycopg2.extras.Json, "psycopg2"
    except ImportError as e:
        raise SystemExit(
            "需要 psycopg 或 psycopg2：\n"
            "  .venv/bin/pip install 'psycopg[binary]'\n"
            f"原始错误: {e}"
        ) from e


def q_all(sqlite_conn: sqlite3.Connection, sql: str):
    sqlite_conn.row_factory = sqlite3.Row
    return sqlite_conn.execute(sql).fetchall()


def wipe(pg, cur):
    # 按依赖逆序
    tables = [
        "study_events",
        "translations",
        "parses",
        "cards",
        "meta",
        "user_settings",
        "sessions",
        "paragraph_analyses",
        "paper_answers",
        "sentences",
        "config",
        "users",
    ]
    cur.execute("TRUNCATE " + ", ".join(tables) + " RESTART IDENTITY CASCADE")
    pg.commit()
    print("wiped PG tables")


def ensure_schema(pg, cur, driver: str):
    """若表不存在，跑 backend/migrations/001_init.sql。"""
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='users'"
    )
    if cur.fetchone():
        return
    sql_path = ROOT / "backend" / "migrations" / "001_init.sql"
    sql = sql_path.read_text(encoding="utf-8")
    cur.execute(sql)
    pg.commit()
    print(f"applied schema from {sql_path}")


def reset_seq(cur, table: str, col: str = "id"):
    cur.execute(
        f"""
        SELECT setval(
          pg_get_serial_sequence('{table}', '{col}'),
          COALESCE((SELECT MAX({col}) FROM {table}), 1),
          (SELECT MAX({col}) IS NOT NULL FROM {table})
        )
        """
    )


def parse_json_maybe(s):
    if s is None:
        return {}
    if isinstance(s, (dict, list)):
        return s
    try:
        return json.loads(s)
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--sqlite",
        default=os.environ.get("EW_DB_PATH", str(DEFAULT_SQLITE)),
        help="SQLite 路径",
    )
    ap.add_argument(
        "--pg",
        default=os.environ.get("EW_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or "postgres://makima@localhost/english_web",
        help="PostgreSQL URL",
    )
    ap.add_argument(
        "--wipe",
        action="store_true",
        help="迁移前清空 PG 业务表（推荐干净迁）",
    )
    args = ap.parse_args()

    sqlite_path = Path(args.sqlite)
    if not sqlite_path.is_file():
        raise SystemExit(f"SQLite 不存在: {sqlite_path}")

    print(f"sqlite: {sqlite_path}")
    print(f"pg:     {args.pg}")

    sq = sqlite3.connect(str(sqlite_path))
    pg, JsonWrap, driver = connect_pg(args.pg)
    print(f"driver: {driver}")
    cur = pg.cursor()

    ensure_schema(pg, cur, driver)
    if args.wipe:
        wipe(pg, cur)

    # ---- users ----
    users = q_all(sq, "SELECT id, username, pw_hash, salt, is_admin, created_at FROM users")
    for r in users:
        cur.execute(
            """
            INSERT INTO users (id, username, pw_hash, salt, is_admin, created_at)
            VALUES (%s, %s, %s, %s, %s, COALESCE(%s::timestamptz, NOW()))
            ON CONFLICT (id) DO UPDATE SET
              username = EXCLUDED.username,
              pw_hash = EXCLUDED.pw_hash,
              salt = EXCLUDED.salt,
              is_admin = EXCLUDED.is_admin
            """,
            (
                r["id"],
                r["username"],
                r["pw_hash"],
                r["salt"],
                bool(r["is_admin"]),
                r["created_at"],
            ),
        )
    print(f"users: {len(users)}")

    # ---- sessions ----
    sessions = q_all(
        sq, "SELECT token, user_id, created_at, expires_at FROM sessions"
    )
    n_sess = 0
    for r in sessions:
        try:
            cur.execute(
                """
                INSERT INTO sessions (token, user_id, created_at, expires_at)
                VALUES (%s, %s, COALESCE(%s::timestamptz, NOW()), %s::timestamptz)
                ON CONFLICT (token) DO NOTHING
                """,
                (r["token"], r["user_id"], r["created_at"], r["expires_at"]),
            )
            n_sess += 1
        except Exception as e:
            print(f"  skip session: {e}")
            pg.rollback()
            # re-open transaction after rollback in psycopg2
            cur = pg.cursor()
    print(f"sessions: {n_sess}/{len(sessions)}")

    # ---- sentences ----
    sents = q_all(sq, "SELECT id, text, year, label, created_at FROM sentences")
    for r in sents:
        cur.execute(
            """
            INSERT INTO sentences (id, text, year, label, created_at)
            VALUES (%s, %s, %s, %s, COALESCE(%s::timestamptz, NOW()))
            ON CONFLICT (id) DO UPDATE SET
              text = EXCLUDED.text,
              year = EXCLUDED.year,
              label = EXCLUDED.label
            """,
            (r["id"], r["text"], r["year"], r["label"], r["created_at"]),
        )
    # also handle text unique conflicts when id differs — rare
    print(f"sentences: {len(sents)}")

    # ---- translations ----
    rows = q_all(
        sq,
        "SELECT sentence_id, zh, status, model, translated_by, translated_at, updated_at FROM translations",
    )
    n = 0
    for r in rows:
        try:
            cur.execute(
                """
                INSERT INTO translations
                  (sentence_id, zh, status, model, translated_by, translated_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s::timestamptz,%s::timestamptz)
                ON CONFLICT (sentence_id) DO UPDATE SET
                  zh = EXCLUDED.zh, status = EXCLUDED.status, model = EXCLUDED.model,
                  translated_by = EXCLUDED.translated_by,
                  translated_at = EXCLUDED.translated_at, updated_at = EXCLUDED.updated_at
                """,
                (
                    r["sentence_id"],
                    r["zh"],
                    r["status"],
                    r["model"],
                    r["translated_by"],
                    r["translated_at"],
                    r["updated_at"],
                ),
            )
            n += 1
        except Exception as e:
            print(f"  skip translation {r['sentence_id']}: {e}")
            pg.rollback()
            cur = pg.cursor()
    print(f"translations: {n}/{len(rows)}")

    # ---- parses ----
    rows = q_all(
        sq,
        "SELECT sentence_id, content, status, model, parsed_at, updated_at FROM parses",
    )
    n = 0
    for r in rows:
        try:
            cur.execute(
                """
                INSERT INTO parses (sentence_id, content, status, model, parsed_at, updated_at)
                VALUES (%s,%s,%s,%s,%s::timestamptz,%s::timestamptz)
                ON CONFLICT (sentence_id) DO UPDATE SET
                  content = EXCLUDED.content, status = EXCLUDED.status, model = EXCLUDED.model,
                  parsed_at = EXCLUDED.parsed_at, updated_at = EXCLUDED.updated_at
                """,
                (
                    r["sentence_id"],
                    r["content"],
                    r["status"],
                    r["model"],
                    r["parsed_at"],
                    r["updated_at"],
                ),
            )
            n += 1
        except Exception as e:
            print(f"  skip parse {r['sentence_id']}: {e}")
            pg.rollback()
            cur = pg.cursor()
    print(f"parses: {n}/{len(rows)}")

    # ---- paragraph_analyses ----
    rows = q_all(
        sq,
        "SELECT cache_key, content, status, model, analyzed_at, updated_at FROM paragraph_analyses",
    )
    for r in rows:
        cur.execute(
            """
            INSERT INTO paragraph_analyses
              (cache_key, content, status, model, analyzed_at, updated_at)
            VALUES (%s,%s,%s,%s,%s::timestamptz,%s::timestamptz)
            ON CONFLICT (cache_key) DO UPDATE SET
              content = EXCLUDED.content, status = EXCLUDED.status, model = EXCLUDED.model,
              analyzed_at = EXCLUDED.analyzed_at, updated_at = EXCLUDED.updated_at
            """,
            (
                r["cache_key"],
                r["content"],
                r["status"],
                r["model"],
                r["analyzed_at"],
                r["updated_at"],
            ),
        )
    print(f"paragraph_analyses: {len(rows)}")

    # ---- paper_answers ----
    rows = q_all(
        sq,
        "SELECT cache_key, answers, source, model, created_at, updated_at FROM paper_answers",
    )
    for r in rows:
        answers = parse_json_maybe(r["answers"])
        cur.execute(
            """
            INSERT INTO paper_answers
              (cache_key, answers, source, model, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s::timestamptz, %s::timestamptz)
            ON CONFLICT (cache_key) DO UPDATE SET
              answers = EXCLUDED.answers, source = EXCLUDED.source, model = EXCLUDED.model,
              updated_at = EXCLUDED.updated_at
            """,
            (
                r["cache_key"],
                JsonWrap(answers),
                r["source"],
                r["model"],
                r["created_at"],
                r["updated_at"],
            ),
        )
    print(f"paper_answers: {len(rows)}")

    # ---- cards ----
    rows = q_all(
        sq,
        "SELECT user_id, word_idx, state, due, ivl, ease, reps, lapses, step, updated_at FROM cards",
    )
    n = 0
    for r in rows:
        try:
            cur.execute(
                """
                INSERT INTO cards
                  (user_id, word_idx, state, due, ivl, ease, reps, lapses, step, quiz, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s::timestamptz)
                ON CONFLICT (user_id, word_idx) DO UPDATE SET
                  state = EXCLUDED.state, due = EXCLUDED.due, ivl = EXCLUDED.ivl,
                  ease = EXCLUDED.ease, reps = EXCLUDED.reps, lapses = EXCLUDED.lapses,
                  step = EXCLUDED.step, updated_at = EXCLUDED.updated_at
                """,
                (
                    r["user_id"],
                    r["word_idx"],
                    r["state"],
                    r["due"],
                    r["ivl"],
                    r["ease"],
                    r["reps"],
                    r["lapses"],
                    r["step"],
                    r["updated_at"],
                ),
            )
            n += 1
        except Exception as e:
            print(f"  skip card {r['user_id']}/{r['word_idx']}: {e}")
            pg.rollback()
            cur = pg.cursor()
    print(f"cards: {n}/{len(rows)}")

    # ---- meta ----
    rows = q_all(
        sq,
        "SELECT user_id, day_key, new_today, review_today, learn_today, done_today, data_version, updated_at FROM meta",
    )
    for r in rows:
        try:
            cur.execute(
                """
                INSERT INTO meta
                  (user_id, day_key, new_today, review_today, learn_today, done_today, data_version, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s::timestamptz)
                ON CONFLICT (user_id, day_key) DO UPDATE SET
                  new_today = EXCLUDED.new_today, review_today = EXCLUDED.review_today,
                  learn_today = EXCLUDED.learn_today, done_today = EXCLUDED.done_today,
                  data_version = EXCLUDED.data_version, updated_at = EXCLUDED.updated_at
                """,
                (
                    r["user_id"],
                    r["day_key"],
                    r["new_today"],
                    r["review_today"],
                    r["learn_today"],
                    r["done_today"],
                    r["data_version"],
                    r["updated_at"],
                ),
            )
        except Exception as e:
            print(f"  skip meta: {e}")
            pg.rollback()
            cur = pg.cursor()
    print(f"meta: {len(rows)}")

    # ---- config ----
    rows = q_all(sq, "SELECT key, value FROM config")
    for r in rows:
        cur.execute(
            """
            INSERT INTO config (key, value) VALUES (%s, %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """,
            (r["key"], r["value"]),
        )
    print(f"config: {len(rows)}")

    # ---- user_settings ----
    rows = q_all(sq, "SELECT user_id, payload, updated_at FROM user_settings")
    for r in rows:
        payload = parse_json_maybe(r["payload"])
        try:
            cur.execute(
                """
                INSERT INTO user_settings (user_id, payload, updated_at)
                VALUES (%s, %s, %s::timestamptz)
                ON CONFLICT (user_id) DO UPDATE SET
                  payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                """,
                (r["user_id"], JsonWrap(payload), r["updated_at"]),
            )
        except Exception as e:
            print(f"  skip user_settings {r['user_id']}: {e}")
            pg.rollback()
            cur = pg.cursor()
    print(f"user_settings: {len(rows)}")

    # sequences
    for table in ("users", "sentences", "study_events"):
        try:
            reset_seq(cur, table)
        except Exception as e:
            print(f"  seq {table}: {e}")

    pg.commit()
    sq.close()
    pg.close()
    print("done.")


if __name__ == "__main__":
    main()
