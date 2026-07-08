"""auth.py — 密码哈希与 token / 会话依赖（stdlib only）。

- pbkdf2_hmac('sha256', 100000) + 每用户 salt
- token = secrets.token_urlsafe(32)
- FastAPI 依赖 get_user：从 Authorization: Bearer 解析 token → 查 sessions → 返回 user row（含 is_admin）
- get_admin：在 get_user 基础上要求 is_admin，否则 403
"""
import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status

from .db import get_db

PBKDF2_ITERS = 100_000


def hash_password(pw: str, salt: str) -> str:
    """pbkdf2_hmac sha256 → 十六进制字符串。"""
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERS)
    return dk.hex()


def verify_password(pw: str, salt: str, pw_hash: str) -> bool:
    """恒定时间比较，避免计时侧信道。"""
    import hmac
    return hmac.compare_digest(hash_password(pw, salt), pw_hash)


def gen_salt() -> str:
    return secrets.token_hex(16)


def gen_token() -> str:
    return secrets.token_urlsafe(32)


def _now():
    return datetime.now(timezone.utc).isoformat()


def get_user(request: Request) -> dict:
    """FastAPI 依赖：解析 Bearer token，返回 users 表行（dict，含 is_admin 布尔）。

    失败（缺 header / 格式错 / token 不在 sessions / user 不存在）→ 401。
    """
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "empty token")

    conn = get_db()
    try:
        s = conn.execute(
            "SELECT user_id FROM sessions WHERE token=?", (token,)
        ).fetchone()
        if s is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
        u = conn.execute(
            "SELECT id, username, is_admin FROM users WHERE id=?", (s["user_id"],)
        ).fetchone()
        if u is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
        return {"id": u["id"], "username": u["username"], "is_admin": bool(u["is_admin"])}
    finally:
        conn.close()


def get_admin(user: dict = Depends(get_user)) -> dict:
    """FastAPI 依赖：要求当前用户是管理员，否则 403。"""
    if not user.get("is_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user
