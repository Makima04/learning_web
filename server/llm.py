"""llm.py — OpenAI 兼容网关调用（stdlib urllib only，与 scripts/llm_translate.py 一致）。

读项目根 ew_llm.json 得 {url,key,model}。translate_text 用的 model 取 config 表
active_llm_model（若已写）覆盖 ew_llm.json 的 model。
"""
import json
import os
import re
import urllib.request
import urllib.error
from pathlib import Path

from .db import CONF_PATH, get_db, get_config_value

# 与 web/llm.js / scripts/llm_translate.py 一致的系统 prompt
SYS_PROMPT = (
    "你是翻译引擎。把用户给的英文考研真题句子翻译成简体中文。"
    "只输出译文，不要原文、不要引号、不要解释、不要多余空白。"
)


class LlmNotConfigured(Exception):
    """ew_llm.json 没配 url+key（或没选 model）。"""


def load_conf():
    """读 LLM 配置，返回 {url,key,model}（trim）。

    优先级：环境变量 EW_LLM_URL/EW_LLM_KEY/EW_LLM_MODEL > ew_llm.json。
    两者都缺 → 全空串（翻译功能不可用，背词照常）。
    """
    c = {"url": "", "key": "", "model": ""}
    # 1) 环境变量（Docker 场景）
    for k, env in (("url", "EW_LLM_URL"), ("key", "EW_LLM_KEY"), ("model", "EW_LLM_MODEL")):
        v = os.environ.get(env)
        if v and v.strip():
            c[k] = v.strip()
    # 2) ew_llm.json 补齐未设字段（本地开发场景）
    try:
        if CONF_PATH.exists():
            raw = json.load(open(CONF_PATH))
            for k in ("url", "key", "model"):
                if not c[k]:
                    c[k] = (raw.get(k) or "").strip()
    except Exception:
        pass
    return c


def join_url(base, path):
    """与 llm.js / llm_translate.py 一致：容忍尾斜杠，无 /vN 时补 /v1。"""
    b = (base or "").rstrip("/")
    if not re.search(r"/v\d+$", b):
        b += "/v1"
    return b + path


def http_json(url, headers, payload=None, method="GET"):
    """urllib 版 fetch JSON。成功返 (status, data)，失败抛 RuntimeError 带 message。"""
    data = None
    hdrs = dict(headers)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        msg = body
        try:
            j = json.loads(body)
            err = j.get("error")
            if isinstance(err, dict):
                msg = err.get("message") or body
            elif err is not None:
                msg = str(err)
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code}: {str(msg)[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")


def _active_model(conf_model):
    """config 表 active_llm_model 覆盖 ew_llm.json model；空则用 conf_model。"""
    try:
        conn = get_db()
        try:
            v = get_config_value(conn, "active_llm_model")
            return v if v else (conf_model or "")
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
