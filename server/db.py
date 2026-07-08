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
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT
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
CREATE TABLE IF NOT EXISTS parses(
    sentence_id INTEGER PRIMARY KEY REFERENCES sentences(id),
    content TEXT,
    status TEXT,
    model TEXT,
    parsed_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS paragraph_analyses(
    -- 段落级解析缓存（Reading Part A 双栏 reader 右栏）。cache_key 形如 "{year}|{label}|{para_idx}"，
    -- 段落文本跨篇章可能撞 sentences.text UNIQUE，故独立表、按复合键定位。
    cache_key TEXT PRIMARY KEY,
    content TEXT,
    status TEXT,
    model TEXT,
    analyzed_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS paper_answers(
    -- 真题选择题答案缓存。cache_key = "{year}|{variant}|{section_type}|{label}"，
    -- answers 是 JSON {"21":"A",...}（字符串键，按题号）。source: pdf（PDF 抽取）/ llm（LLM 做题）。
    cache_key TEXT PRIMARY KEY,
    answers TEXT,
    source TEXT,
    model TEXT,
    created_at TEXT,
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
    data_version TEXT,
    updated_at TEXT,
    PRIMARY KEY(user_id, day_key)
);
CREATE TABLE IF NOT EXISTS config(
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS user_settings(
    -- 账号级设置（普通用户可改，登录后镜像落库）。整包存 JSON（不含 llm——LLM 仅管理员经 /api/llm/* 配置）。
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    payload TEXT NOT NULL,
    updated_at TEXT
);
"""


def get_db():
    """每请求开一个连接。FastAPI 同步端点里用没问题（不要跨线程复用）。"""
    # check_same_thread=False 必须在 connect 时传入（Python 3.12+ 不允许事后设置该属性），
    # 以支持流式端点在另一线程使用连接。
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    """建表（IF NOT EXISTS）+ 自动 seed active_llm_model。幂等。"""
    conn = sqlite3.connect(DB_PATH)
    try:
        # 持久化 WAL + busy_timeout，避免批量翻译并发写锁（database is locked）。
        # 仅设一次即可落到库文件，后续 get_db 连接也会复用 WAL。
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.executescript(SCHEMA)
        conn.commit()
        # 老库迁移：SCHEMA 用 CREATE TABLE IF NOT EXISTS，不会给已存在的 users 表补
        # is_admin 列。用 PRAGMA table_info 探测，缺列才 ALTER（幂等）。
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "is_admin" not in cols:
            conn.execute(
                "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"
            )
            conn.commit()
        # 老库迁移：sessions 表可能缺 expires_at 列。用 PRAGMA table_info 探测，缺列才 ALTER（幂等）。
        scols = [r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        if "expires_at" not in scols:
            conn.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT")
            conn.commit()
        # 老库迁移：meta 表可能缺 data_version 列（配合前端词库版本守卫）。
        # 用 PRAGMA table_info 探测，缺列才 ALTER（幂等）。
        mcols = [r[1] for r in conn.execute("PRAGMA table_info(meta)").fetchall()]
        if "data_version" not in mcols:
            conn.execute("ALTER TABLE meta ADD COLUMN data_version TEXT")
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
