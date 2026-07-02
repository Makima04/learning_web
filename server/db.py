"""db.py — SQLite 数据层（stdlib sqlite3）。

定位项目根 english_web.db（server/ 上一级）。每请求开一个连接，row_factory=Row，
PRAGMA foreign_keys=ON。init_db() 建表（IF NOT EXISTS）并按需 seed active_llm_model。
"""
import sqlite3
import json
import os
from datetime import datetime, timezone
from pathlib import Path

# 项目根 english_web.db：server/ 的父目录（可用 EW_DB_PATH 覆盖，便于 Docker 挂卷持久化）
DB_PATH = Path(os.environ.get("EW_DB_PATH") or (Path(__file__).resolve().parent.parent / "english_web.db"))
# ew_llm.json 也在项目根
CONF_PATH = Path(__file__).resolve().parent.parent / "ew_llm.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pw_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sentences(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT UNIQUE NOT NULL,
    year INTEGER,
    label TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS translations(
    sentence_id INTEGER PRIMARY KEY REFERENCES sentences(id),
    zh TEXT,
    status TEXT,
    model TEXT,
    translated_by INTEGER REFERENCES users(id),
    translated_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS cards(
    user_id INTEGER NOT NULL REFERENCES users(id),
    word_idx INTEGER NOT NULL,
    state TEXT,
    due INTEGER,
    ivl INTEGER,
    ease REAL,
    reps INTEGER,
    lapses INTEGER,
    step INTEGER,
    updated_at TEXT,
    PRIMARY KEY(user_id, word_idx)
);
CREATE TABLE IF NOT EXISTS meta(
    user_id INTEGER NOT NULL REFERENCES users(id),
    day_key TEXT NOT NULL,
    new_today INTEGER,
    review_today INTEGER,
    learn_today INTEGER,
    done_today INTEGER,
    updated_at TEXT,
    PRIMARY KEY(user_id, day_key)
);
CREATE TABLE IF NOT EXISTS config(
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def get_db():
    """每请求开一个连接。FastAPI 同步端点里用没问题（不要跨线程复用）。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    """建表（IF NOT EXISTS）+ 自动 seed active_llm_model。幂等。"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        # seed active_llm_model：若 config 里没有，且 ew_llm.json 有 model，则写入
        row = conn.execute(
            "SELECT value FROM config WHERE key=?", ("active_llm_model",)
        ).fetchone()
        if row is None:
            model = ""
            try:
                if CONF_PATH.exists():
                    c = json.load(open(CONF_PATH))
                    model = (c.get("model") or "").strip()
            except Exception:
                model = ""
            if model:
                conn.execute(
                    "INSERT INTO config(key,value) VALUES(?,?)",
                    ("active_llm_model", model),
                )
                conn.commit()
    finally:
        conn.close()


def get_config_value(conn, key):
    row = conn.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
    return row["value"] if row else None


def set_config_value(conn, key, value):
    conn.execute(
        "INSERT INTO config(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    conn.commit()


if __name__ == "__main__":
    init_db()
    print(f"init_db ok -> {DB_PATH}")
