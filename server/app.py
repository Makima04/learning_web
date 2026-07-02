"""app.py — FastAPI 后端，所有 /api 路由集中在此文件。

静态挂 web/ 在根路径（同源，无 CORS）。启动时 init_db()。
SPA fallback：未命中的路径返 index.html，支持客户端路由深链（如 /papers/2006）。
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import gen_salt, gen_token, get_user, hash_password, verify_password
from .db import get_db, init_db, now_iso, set_config_value
from .llm import (
    LlmNotConfigured,
    active_concurrency,
    active_model,
    fetch_models,
    is_configured,
    translate_text,
)

# 静态根：当前可运行前端是 vanilla 版 web/（frontend/ 的 React 重写尚未完成、无 dist）。
# start.sh 的 npm run build 若产出 frontend/dist，可改回 "frontend"/"dist"。
WEB = Path(__file__).resolve().parent.parent / "web"
INDEX = WEB / "index.html"

app = FastAPI(title="english_web")


# ---------- 启动时建库 ----------
@app.on_event("startup")
def _startup():
    init_db()


# ---------- Pydantic 请求体 ----------
class AuthBody(BaseModel):
    username: str
    password: str


class TranslateBody(BaseModel):
    text: str


class TranslateBatchBody(BaseModel):
    ids: list[int]


class LlmConfigBody(BaseModel):
    model: Optional[str] = None
    # 并发请求数（仅影响批量翻译），null 表示不改。范围 1..16。
    concurrency: Optional[int] = None


class CardState(BaseModel):
    state: Optional[str] = None
    due: Optional[int] = None
    ivl: Optional[int] = None
    ease: Optional[float] = None
    reps: Optional[int] = None
    lapses: Optional[int] = None
    step: Optional[int] = None


class CardPutBody(BaseModel):
    card: CardState


class CardBulkBody(BaseModel):
    cards: dict[str, CardState]


class MetaBody(BaseModel):
    meta: dict  # {day_key,new_today,review_today,learn_today,done_today}


# ---------- 辅助 ----------
def _row_sentence(r):
    """把 LEFT JOIN sentences/translations 的行拍平成 API 输出 dict。"""
    return {
        "id": r["id"],
        "text": r["text"],
        "zh": r["zh"] if "zh" in r.keys() else None,
        "status": r["status"] if "status" in r.keys() else None,
        "year": r["year"],
        "label": r["label"],
    }


def _do_translate_sentence(conn, sentence_id, user_id, force=False):
    """对某 sentence_id 翻译：命中且 status=ok 且非 force 直返；否则调 LLM 存返。

    返回 (zh, status, error?)。LLM 未配置 → (None, 'unconfigured', None)。
    """
    row = conn.execute(
        "SELECT zh, status FROM translations WHERE sentence_id=?", (sentence_id,)
    ).fetchone()
    if not force and row and row["status"] == "ok" and row["zh"]:
        return row["zh"], "ok", None

    # 取原文
    s = conn.execute("SELECT text FROM sentences WHERE id=?", (sentence_id,)).fetchone()
    if s is None:
        return None, "error", "sentence not found"
    text = s["text"]

    try:
        zh = translate_text(text)
        status_ = "ok"
        err = None
    except LlmNotConfigured:
        # 未配置：不存（保持原状或空），返回 unconfigured
        return "", "unconfigured", None
    except Exception as e:
        zh = str(e)
        status_ = "error"
        err = str(e)

    now = now_iso()
    if row is None:
        conn.execute(
            "INSERT INTO translations(sentence_id, zh, status, model, "
            "translated_by, translated_at, updated_at) VALUES(?,?,?,?,?,?,?)",
            (sentence_id, zh, status_, None, user_id, now, now),
        )
    else:
        conn.execute(
            "UPDATE translations SET zh=?, status=?, translated_by=?, "
            "translated_at=?, updated_at=? WHERE sentence_id=?",
            (zh, status_, user_id, now, now, sentence_id),
        )
    conn.commit()
    return zh, status_, err


# ====================================================================
# 鉴权
# ====================================================================
@app.post("/api/auth/register")
def register(body: AuthBody):
    u = body.username.strip()
    pw = body.password
    if not (1 <= len(u) <= 32):
        raise HTTPException(400, "username must be 1-32 chars")
    if len(pw) < 4:
        raise HTTPException(400, "password must be >=4 chars")

    conn = get_db()
    try:
        # 用户名已存在 → 409
        exist = conn.execute(
            "SELECT id FROM users WHERE username=?", (u,)
        ).fetchone()
        if exist:
            raise HTTPException(409, "username already exists")
        salt = gen_salt()
        pw_hash = hash_password(pw, salt)
        now = now_iso()
        cur = conn.execute(
            "INSERT INTO users(username, pw_hash, salt, created_at) VALUES(?,?,?,?)",
            (u, pw_hash, salt, now),
        )
        uid = cur.lastrowid
        token = gen_token()
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at) VALUES(?,?,?)",
            (token, uid, now),
        )
        conn.commit()
        return {"token": token, "user": {"id": uid, "username": u}}
    finally:
        conn.close()


@app.post("/api/auth/login")
def login(body: AuthBody):
    u = body.username.strip()
    pw = body.password
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, username, pw_hash, salt FROM users WHERE username=?", (u,)
        ).fetchone()
        if not row or not verify_password(pw, row["salt"], row["pw_hash"]):
            raise HTTPException(401, "invalid credentials")
        token = gen_token()
        now = now_iso()
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at) VALUES(?,?,?)",
            (token, row["id"], now),
        )
        conn.commit()
        return {"token": token, "user": {"id": row["id"], "username": row["username"]}}
    finally:
        conn.close()


@app.post("/api/auth/logout")
def logout(request: Request, user: dict = Depends(get_user)):
    """删当前 token 的 session 行。"""
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else ""
    conn = get_db()
    try:
        conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict = Depends(get_user)):
    return {"user": {"id": user["id"], "username": user["username"]}}


# ====================================================================
# 例句 / 译文
# ====================================================================
@app.get("/api/sentences/stats")
def sentences_stats():
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM sentences").fetchone()["c"]
        translated = conn.execute(
            "SELECT COUNT(*) c FROM translations WHERE status != 'error'"
        ).fetchone()["c"]
        return {
            "total": total,
            "translated": translated,
            "untranslated": max(total - translated, 0),
        }
    finally:
        conn.close()


@app.get("/api/sentences")
def sentences_list(
    status: str = Query("all"),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    # 计算过滤条件
    where = []
    params = []
    if status == "translated":
        where.append("t.status IS NOT NULL AND t.status != 'error'")
    elif status == "untranslated":
        where.append("(t.status IS NULL OR t.status = 'error')")
    if q:
        where.append("s.text LIKE ?")
        params.append(f"%{q}%")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    conn = get_db()
    try:
        total = conn.execute(
            f"SELECT COUNT(*) c FROM sentences s LEFT JOIN translations t "
            f"ON t.sentence_id=s.id {where_sql}",
            params,
        ).fetchone()["c"]
        translated = conn.execute(
            "SELECT COUNT(*) c FROM translations WHERE status != 'error'"
        ).fetchone()["c"]
        all_total = conn.execute("SELECT COUNT(*) c FROM sentences").fetchone()["c"]
        rows = conn.execute(
            f"SELECT s.id, s.text, s.year, s.label, t.zh, t.status "
            f"FROM sentences s LEFT JOIN translations t ON t.sentence_id=s.id "
            f"{where_sql} ORDER BY s.id LIMIT ? OFFSET ?",
            params + [size, (page - 1) * size],
        ).fetchall()
        items = [_row_sentence(r) for r in rows]
        return {
            "items": items,
            "total": total,
            "translated": translated,
            "untranslated": max(all_total - translated, 0),
        }
    finally:
        conn.close()


@app.get("/api/sentences/{sid}")
def sentence_detail(sid: int):
    conn = get_db()
    try:
        r = conn.execute(
            "SELECT s.id, s.text, s.year, s.label, t.zh, t.status "
            "FROM sentences s LEFT JOIN translations t ON t.sentence_id=s.id "
            "WHERE s.id=?",
            (sid,),
        ).fetchone()
        if r is None:
            raise HTTPException(404, "sentence not found")
        return _row_sentence(r)
    finally:
        conn.close()


# ====================================================================
# 翻译
# ====================================================================
@app.post("/api/translate")
def translate_text_endpoint(body: TranslateBody):
    """on-card 用，无需 token，全局共享只读 + 补翻。

    命中 status=ok 直返；否则调 LLM 存/覆盖；未配置 → {zh:'', status:'unconfigured'}。
    """
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "text required")

    conn = get_db()
    try:
        s = conn.execute("SELECT id FROM sentences WHERE text=?", (text,)).fetchone()
        if s is None:
            now = now_iso()
            cur = conn.execute(
                "INSERT INTO sentences(text, year, label, created_at) VALUES(?,?,?,?)",
                (text, None, None, now),
            )
            sid = cur.lastrowid
            conn.commit()
        else:
            sid = s["id"]

        zh, st, _ = _do_translate_sentence(conn, sid, None, force=False)
        return {"zh": zh or "", "status": st}
    finally:
        conn.close()


# 注意：/batch 必须在 /{sid} 之前注册，否则 "batch" 会被当成 sid 匹配
@app.post("/api/translate/batch")
def translate_batch(body: TranslateBatchBody, user: dict = Depends(get_user)):
    ids = body.ids or []
    if len(ids) > 200:
        raise HTTPException(400, "ids exceeds 200")

    # 先用一次性连接过滤掉不存在的 id（DB 读串行，很快），并取出待翻译的 sid 列表。
    # 命中 status=ok 的缓存会在 _do_translate_sentence 里直返，不触发 LLM。
    conn = get_db()
    todo = []  # [(sid,)] 实际存在的
    results = []
    translated = 0
    failed = 0
    try:
        for sid in ids:
            s = conn.execute(
                "SELECT id FROM sentences WHERE id=?", (sid,)
            ).fetchone()
            if s is None:
                results.append(
                    {"id": sid, "zh": "", "status": "error", "error": "not found"}
                )
                failed += 1
            else:
                todo.append(sid)
    finally:
        conn.close()

    # 网络并发：LLM 调用并发执行；每个任务内部各自开 DB 连接写 translations（sqlite3
    # 写串行，但 LLM 网络等待时间被并发摊掉）。单任务失败不影响其他。
    workers = max(1, active_concurrency())

    def _one(sid):
        c = get_db()
        try:
            return sid, _do_translate_sentence(c, sid, user["id"], force=False)
        finally:
            c.close()

    if workers == 1 or len(todo) <= 1:
        for sid in todo:
            _, (zh, st, err) = _one(sid)
            if st == "ok":
                translated += 1
            else:
                failed += 1
            item = {"id": sid, "zh": zh or "", "status": st}
            if err:
                item["error"] = err
            results.append(item)
    else:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(_one, sid): sid for sid in todo}
            # 按 ids 原顺序输出
            res_by_sid = {}
            for fut in as_completed(futs):
                sid = futs[fut]
                try:
                    res_by_sid[sid] = fut.result()
                except Exception as e:
                    res_by_sid[sid] = (sid, ("", "error", str(e)))
        for sid in todo:
            _, (zh, st, err) = res_by_sid.get(sid, (sid, ("", "error", "missing")))
            if st == "ok":
                translated += 1
            else:
                failed += 1
            item = {"id": sid, "zh": zh or "", "status": st}
            if err:
                item["error"] = err
            results.append(item)

    return {"translated": translated, "failed": failed, "results": results}


@app.post("/api/translate/{sid}")
def translate_by_id(sid: int, user: dict = Depends(get_user)):
    conn = get_db()
    try:
        s = conn.execute("SELECT id FROM sentences WHERE id=?", (sid,)).fetchone()
        if s is None:
            raise HTTPException(404, "sentence not found")
        zh, st, _ = _do_translate_sentence(conn, sid, user["id"], force=False)
        return {"zh": zh or "", "status": st}
    finally:
        conn.close()


@app.post("/api/translate/{sid}/retranslate")
def retranslate_by_id(sid: int, user: dict = Depends(get_user)):
    conn = get_db()
    try:
        s = conn.execute("SELECT id FROM sentences WHERE id=?", (sid,)).fetchone()
        if s is None:
            raise HTTPException(404, "sentence not found")
        zh, st, _ = _do_translate_sentence(conn, sid, user["id"], force=True)
        return {"zh": zh or "", "status": st}
    finally:
        conn.close()


# ====================================================================
# LLM 配置
# ====================================================================
@app.get("/api/llm/config")
def llm_config(user: dict = Depends(get_user)):
    # model 取 active_model()：config.active_llm_model 优先，否则 fallback json model。
    # 与 translate_text 实际使用的 model 一致，避免 UI 显示旧 json model。
    return {
        "configured": is_configured(),
        "model": active_model(),
        "concurrency": active_concurrency(),
    }


@app.get("/api/llm/models")
def llm_models(user: dict = Depends(get_user)):
    try:
        return fetch_models()
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/llm/config")
def llm_config_set(body: LlmConfigBody, user: dict = Depends(get_user)):
    conn = get_db()
    try:
        if body.model is not None:
            set_config_value(conn, "active_llm_model", body.model)
        if body.concurrency is not None:
            # 钳制到 1..100，与 llm.active_concurrency 的上下限一致
            n = max(1, min(100, int(body.concurrency)))
            set_config_value(conn, "llm_concurrency", str(n))
    finally:
        conn.close()
    return {"ok": True, "model": active_model(), "concurrency": active_concurrency()}


# ====================================================================
# 进度同步
# ====================================================================
@app.get("/api/cards")
def cards_get(user: dict = Depends(get_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT word_idx, state, due, ivl, ease, reps, lapses, step "
            "FROM cards WHERE user_id=?",
            (user["id"],),
        ).fetchall()
        out = {}
        for r in rows:
            out[str(r["word_idx"])] = {
                "state": r["state"],
                "due": r["due"],
                "ivl": r["ivl"],
                "ease": r["ease"],
                "reps": r["reps"],
                "lapses": r["lapses"],
                "step": r["step"],
            }
        return {"cards": out}
    finally:
        conn.close()


def _upsert_card(conn, user_id, idx, c: CardState):
    now = now_iso()
    conn.execute(
        "INSERT INTO cards(user_id, word_idx, state, due, ivl, ease, reps, "
        "lapses, step, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(user_id, word_idx) DO UPDATE SET "
        "state=excluded.state, due=excluded.due, ivl=excluded.ivl, "
        "ease=excluded.ease, reps=excluded.reps, lapses=excluded.lapses, "
        "step=excluded.step, updated_at=excluded.updated_at",
        (
            user_id, idx, c.state, c.due, c.ivl, c.ease, c.reps,
            c.lapses, c.step, now,
        ),
    )


@app.put("/api/cards/{idx}")
def card_put(idx: int, body: CardPutBody, user: dict = Depends(get_user)):
    conn = get_db()
    try:
        _upsert_card(conn, user["id"], idx, body.card)
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.post("/api/cards/bulk")
def cards_bulk(body: CardBulkBody, user: dict = Depends(get_user)):
    conn = get_db()
    try:
        count = 0
        for k, c in body.cards.items():
            try:
                idx = int(k)
            except (TypeError, ValueError):
                continue
            _upsert_card(conn, user["id"], idx, c)
            count += 1
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "count": count}


@app.get("/api/meta")
def meta_get(user: dict = Depends(get_user), day: Optional[str] = Query(None)):
    # 取当天行；无则返 {}。
    # day 由客户端传（本地时区 YYYY-MM-DD），未传则 fallback 服务器本地 today——
    # 避免跨时区时客户端当日写到的 day_key 行被服务端用自己的 today 查不到。
    from datetime import datetime as _dt
    today = day or _dt.now().strftime("%Y-%m-%d")
    conn = get_db()
    try:
        r = conn.execute(
            "SELECT day_key, new_today, review_today, learn_today, done_today "
            "FROM meta WHERE user_id=? AND day_key=?",
            (user["id"], today),
        ).fetchone()
        if r is None:
            return {"meta": {}}
        return {
            "meta": {
                "day_key": r["day_key"],
                "new_today": r["new_today"],
                "review_today": r["review_today"],
                "learn_today": r["learn_today"],
                "done_today": r["done_today"],
            }
        }
    finally:
        conn.close()


@app.put("/api/meta")
def meta_put(body: MetaBody, user: dict = Depends(get_user)):
    m = body.meta or {}
    day_key = m.get("day_key")
    if not day_key:
        raise HTTPException(400, "day_key required")
    conn = get_db()
    try:
        now = now_iso()
        conn.execute(
            "INSERT INTO meta(user_id, day_key, new_today, review_today, "
            "learn_today, done_today, updated_at) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(user_id, day_key) DO UPDATE SET "
            "new_today=excluded.new_today, review_today=excluded.review_today, "
            "learn_today=excluded.learn_today, done_today=excluded.done_today, "
            "updated_at=excluded.updated_at",
            (
                user["id"], day_key,
                m.get("new_today"), m.get("review_today"),
                m.get("learn_today"), m.get("done_today"), now,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


# ====================================================================
# 静态文件 + SPA fallback（最后挂，避免吞 /api）
# catch-all：未命中真实文件 → 返 index.html，支持客户端路由深链。
# Vite 构建产物在 frontend/dist；dev 模式下由 Vite :5173 直 serve，本路由用不到。
# ====================================================================
@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    p = WEB / full_path
    if p.is_file():
        return FileResponse(p)
    return FileResponse(INDEX)
