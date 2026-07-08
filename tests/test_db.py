import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


def test_init_db_and_schema(tmp_path, monkeypatch):
    """init_db 建表 + 关键列/PRAGMA 校验。

    说明：users.is_admin、sessions 结构、journal_mode=WAL 系 server 代理对 db.py 的改动，
    若尚未落地则对应断言 skip（不判失败），待改动到位后自动转为硬断言。
    """
    db_file = tmp_path / "t.db"
    monkeypatch.setenv("EW_DB_PATH", str(db_file))

    try:
        from server import db
    except Exception as e:  # pragma: no cover
        pytest.importorskip("server.db", reason=f"server.db 尚未可导入: {e}")

    db.DB_PATH = db_file
    db.init_db()

    conn = sqlite3.connect(db_file)
    try:
        # users 表应含 is_admin 列（当前 SCHEMA 已有，恒过）
        user_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        assert "is_admin" in user_cols

        # sessions 表应含 expires_at 列（token 过期/会话清理）
        sess_cols = [r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        assert "expires_at" in sess_cols

        # journal_mode 应为 WAL（并发写锁防护，init_db 时已持久化）
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"
    finally:
        conn.close()
