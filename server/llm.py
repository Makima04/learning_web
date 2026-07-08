"""llm.py — OpenAI 兼容网关调用（stdlib urllib only，与 scripts/llm_translate.py 一致）。

读项目根 ew_llm.json 得 {url,key,model}。translate_text 用的 model 取 config 表
active_llm_model（若已写）覆盖 ew_llm.json 的 model。
"""
import json
import urllib.request
import urllib.error

from .db import get_db, get_config_value
from .llm_common import (
    SYS_PROMPT,
    PARSE_SYS_PROMPT,
    PARSE_PARA_SYS_PROMPT,
    join_url,
    http_json,
    load_conf,
    active_model_from,
)


class LlmNotConfigured(Exception):
    """ew_llm.json 没配 url+key（或没选 model）。"""


def _active_model(conf_model):
    """config 表 active_llm_model 覆盖 ew_llm.json model；空则用 conf_model。"""
    try:
        conn = get_db()
        try:
            return active_model_from(lambda k: get_config_value(conn, k), conf_model)
        finally:
            conn.close()
    except Exception:
        return conf_model or ""


def active_model():
    """当前生效的 LLM model：config.active_llm_model 优先，否则 fallback ew_llm.json 的 model。

    公开别名包装私有 _active_model，供 app.py 的 GET /api/llm/config 等处复用，
    保证 UI 展示的 model 与 translate_text 实际使用的 model 一致。
    """
    c = load_conf()
    return _active_model(c.get("model", ""))


# 并发默认值与上下限。批量翻译用 ThreadPoolExecutor 时 max_workers 取此值。
# MAX 抬到 100：默认 16 在 LLM 网关延迟下吞吐偏低，单次批量翻译（~2000 句）
# 耗时太久；网关在内网，百并发实测可承受，故放开到 100。
LLM_CONCURRENCY_DEFAULT = 4
LLM_CONCURRENCY_MIN = 1
LLM_CONCURRENCY_MAX = 100


def _active_concurrency():
    """config 表 llm_concurrency 覆盖默认；空/坏/越界 → 默认值。"""
    try:
        conn = get_db()
        try:
            v = get_config_value(conn, "llm_concurrency")
            if v is None:
                return LLM_CONCURRENCY_DEFAULT
            n = int(v)
            if n < LLM_CONCURRENCY_MIN:
                return LLM_CONCURRENCY_MIN
            if n > LLM_CONCURRENCY_MAX:
                return LLM_CONCURRENCY_MAX
            return n
        finally:
            conn.close()
    except Exception:
        return LLM_CONCURRENCY_DEFAULT


def active_concurrency():
    """当前生效的 LLM 并发数（config.llm_concurrency 或默认 4，限 1..100）。

    供 app.py 的 GET /api/llm/config 与 translate_batch 复用，
    保证 UI 展示的并发数与批量翻译实际使用的并发数一致。
    """
    return _active_concurrency()


def fetch_models():
    """GET /models → 返回 [model_id,...]。未配 url+key 抛 ValueError。失败抛 RuntimeError。"""
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise ValueError("LLM 未配置：缺少 url 或 key")
    url = join_url(c["url"], "/models")
    _, data = http_json(url, {"Authorization": "Bearer " + c["key"]})
    out = []
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        out = [m.get("id") or m.get("name") for m in data["data"] if isinstance(m, dict)]
    out = [x for x in out if x]
    return sorted(set(out))


def translate_text(text):
    """POST /chat/completions → 译文 str。未配置抛 LlmNotConfigured；调用失败抛 RuntimeError。

    model 取 config.active_llm_model 或 ew_llm.json.model。
    """
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = _active_model(c["model"])
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选择 model")

    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    _, data = http_json(
        url, {"Authorization": "Bearer " + c["key"]}, payload, "POST"
    )
    try:
        out = data["choices"][0]["message"]["content"].strip()
    except Exception:
        out = ""
    if not out:
        raise RuntimeError("模型未返回译文")
    return out


def is_configured():
    """ew_llm.json 有 url+key 即视为已配置（model 可后端选）。"""
    c = load_conf()
    return bool(c["url"] and c["key"])


def parse_sentence_stream(text):
    """流式调 LLM 做长难句解析。生成器：yield 每个 delta 文本片段，结尾 yield {"_done":..., "content":...}。

    与 translate_text 共用 load_conf/join_url/_active_model；不同点：
    - 用 PARSE_SYS_PROMPT（10 层母语式走查）
    - stream=True，逐 chunk 吐
    - timeout=180（解析输出远长于翻译，50–170s 实测）
    未配置抛 LlmNotConfigured；调用失败抛 RuntimeError。
    """
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = _active_model(c["model"])
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选择 model")

    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model,
        "temperature": 0,
        "stream": True,
        "messages": [
            {"role": "system", "content": PARSE_SYS_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + c["key"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    # 流式下 urlopen 的 timeout 是每读一次的超时，180s 足够长输出
    try:
        r = urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"LLM gateway returned HTTP {e.code}")
    except urllib.error.URLError:
        raise RuntimeError("LLM request failed: network error")

    full = []
    try:
        with r:
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                if not line or not line.startswith("data:"):
                    continue
                payload_str = line[5:].lstrip()
                if payload_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload_str)
                except Exception:
                    continue
                try:
                    delta = chunk["choices"][0]["delta"].get("content") or ""
                except Exception:
                    delta = ""
                if delta:
                    full.append(delta)
                    yield delta
    finally:
        r.close()
    yield {"_done": True, "content": "".join(full)}


def get_cached_parse(conn, sentence_id):
    """读 parses 表某 sentence_id 的缓存。返 dict {content,status,model} 或 None。"""
    row = conn.execute(
        "SELECT content, status, model FROM parses WHERE sentence_id=?",
        (sentence_id,),
    ).fetchone()
    if row is None:
        return None
    return {"content": row["content"], "status": row["status"], "model": row["model"]}


def save_parse(conn, sentence_id, content, model):
    """落库解析结果（INSERT OR REPLACE）。status 恒 'ok'——解析失败不落库，由端点返 error 事件。"""
    from .db import now_iso
    now = now_iso()
    conn.execute(
        "INSERT INTO parses(sentence_id, content, status, model, parsed_at, updated_at) "
        "VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(sentence_id) DO UPDATE SET content=excluded.content, "
        "status=excluded.status, model=excluded.model, parsed_at=excluded.parsed_at, "
        "updated_at=excluded.updated_at",
        (sentence_id, content, "ok", model, now, now),
    )
    conn.commit()


def parse_paragraph_stream(text, context):
    """流式调 LLM 做段落级解析（Reading Part A 双栏 reader 右栏）。

    与 parse_sentence_stream 共用 load_conf/join_url/_active_model；不同点：
    - 用 PARSE_PARA_SYS_PROMPT（6 段主干驱动型）
    - user message 带整篇正文 + 全部题干作为 context（解指代、判考点），目标段落单独标出
    - stream=True，逐 chunk 吐；timeout=180（段落输出比单句长）
    未配置抛 LlmNotConfigured；调用失败抛 RuntimeError。
    """
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = _active_model(c["model"])
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选择 model")

    url = join_url(c["url"], "/chat/completions")
    # 组装 context：整篇正文 + 题干（紧凑），让模型在解指代/判断考点时有全文
    full_body = (context or {}).get("full_body") or ""
    items = (context or {}).get("items") or []
    year = (context or {}).get("year")
    label = (context or {}).get("label")
    q_lines = []
    for it in items:
        stem = (it or {}).get("stem") or ""
        opts = (it or {}).get("options") or {}
        opts_str = " ".join(f"{k}.{v}" for k, v in sorted(opts.items()))
        q_lines.append(f"Q{it.get('n','')}: {stem} {opts_str}".strip())
    header = f"[Passage: {year or '?'} {label or ''}]"
    user_msg = (
        f"{header}\n[Full passage for context]\n{full_body}\n\n"
        f"[Questions]\n" + "\n".join(q_lines) +
        f"\n\n[Analyze ONLY this paragraph — output the 6 sections]\n{text}"
    )
    payload = {
        "model": model,
        "temperature": 0,
        "stream": True,
        "messages": [
            {"role": "system", "content": PARSE_PARA_SYS_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + c["key"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        r = urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"LLM gateway returned HTTP {e.code}")
    except urllib.error.URLError:
        raise RuntimeError("LLM request failed: network error")

    full = []
    try:
        with r:
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                if not line or not line.startswith("data:"):
                    continue
                payload_str = line[5:].lstrip()
                if payload_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload_str)
                except Exception:
                    continue
                try:
                    delta = chunk["choices"][0]["delta"].get("content") or ""
                except Exception:
                    delta = ""
                if delta:
                    full.append(delta)
                    yield delta
    finally:
        r.close()
    yield {"_done": True, "content": "".join(full)}


def get_cached_para_analysis(conn, cache_key):
    """读 paragraph_analyses 表某 cache_key 的缓存。返 dict {content,status,model} 或 None。"""
    row = conn.execute(
        "SELECT content, status, model FROM paragraph_analyses WHERE cache_key=?",
        (cache_key,),
    ).fetchone()
    if row is None:
        return None
    return {"content": row["content"], "status": row["status"], "model": row["model"]}


def save_para_analysis(conn, cache_key, content, model):
    """落库段落解析结果（INSERT OR REPLACE）。status 恒 'ok'——失败不落库。"""
    from .db import now_iso
    now = now_iso()
    conn.execute(
        "INSERT INTO paragraph_analyses(cache_key, content, status, model, analyzed_at, updated_at) "
        "VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(cache_key) DO UPDATE SET content=excluded.content, "
        "status=excluded.status, model=excluded.model, analyzed_at=excluded.analyzed_at, "
        "updated_at=excluded.updated_at",
        (cache_key, content, "ok", model, now, now),
    )
    conn.commit()
