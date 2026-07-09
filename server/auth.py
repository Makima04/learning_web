"""auth.py — 密码哈希与 token / 会话依赖（stdlib only）。

- pbkdf2_hmac('sha256', 600000) + 每用户 salt；校验兼容旧 100000 次迭代
- token = secrets.token_urlsafe(32)
- FastAPI 依赖 get_user：从 Authorization: Bearer 解析 token → 查 sessions → 返回 user row（含 is_admin）
- get_admin：在 get_user 基础上要求 is_admin，否则 403
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status

from .db import get_db

PBKDF2_ITERS = 600_000
# 旧版哈希迭代次数（账号创建于 600k 之前）；校验时兼容，登录成功后会升级
PBKDF2_ITERS_LEGACY = 100_000

SESSION_TTL_DAYS = int(os.environ.get("EW_SESSION_TTL_DAYS", "30"))


def _session_expired(expires_at):
    """expires_at 为 None → 永不过期；否则与当前 UTC 比较。"""
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(expires_at)
    except Exception:
        return False
    return datetime.now(timezone.utc) >= exp


def _hash_with(pw: str, salt: str, iters: int) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), iters)
    return dk.hex()


def hash_password(pw: str, salt: str) -> str:
    """pbkdf2_hmac sha256 → 十六进制字符串（当前迭代次数）。"""
    return _hash_with(pw, salt, PBKDF2_ITERS)


def verify_password(pw: str, salt: str, pw_hash: str) -> bool:
    """恒定时间比较。先试当前迭代，再试 legacy，避免升级后旧账号全挂。"""
    if hmac.compare_digest(_hash_with(pw, salt, PBKDF2_ITERS), pw_hash):
        return True
    if hmac.compare_digest(_hash_with(pw, salt, PBKDF2_ITERS_LEGACY), pw_hash):
        return True
    return False


def needs_rehash(pw: str, salt: str, pw_hash: str) -> bool:
    """True = 密码正确但用的是 legacy 迭代，登录后应写回新哈希。"""
    if hmac.compare_digest(_hash_with(pw, salt, PBKDF2_ITERS), pw_hash):
        return False
    return hmac.compare_digest(_hash_with(pw, salt, PBKDF2_ITERS_LEGACY), pw_hash)


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
            "SELECT user_id, expires_at FROM sessions WHERE token=?", (token,)
        ).fetchone()
        if s is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
        if _session_expired(s["expires_at"]):
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
            conn.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session expired")
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
