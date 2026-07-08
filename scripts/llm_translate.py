#!/usr/bin/env python3
"""llm_translate.py — CLI mirror of web/llm.js for testing LLM translation.

Usage:
  # list models
  python3 scripts/llm_translate.py models --url https://api.openai.com/v1 --key sk-xxx

  # translate a sentence (and any args after the first form the text)
  python3 scripts/llm_translate.py translate --url ... --key ... --model gpt-4o-mini "The homeless make up a growing percentage of America's population."

Credentials are read from (highest priority first):
  1. --url / --key / --model flags
  2. env vars: EW_LLM_URL, EW_LLM_KEY, EW_LLM_MODEL
  3. ew_llm.json in project root   {"url":..., "key":..., "model":...}

model 解析额外读 config 表 active_llm_model（与 server/llm.py 一致）：
  优先级 --model flag > active_llm_model > (env / ew_llm.json)。
  即用户没显式传 --model 时，active_llm_model 覆盖 json/env 的 model。
"""
import argparse
import json
import os
import sqlite3
import sys

# 把项目根加入 sys.path，便于 `from server.llm_common import ...`
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server.llm_common import (
    SYS_PROMPT,
    join_url,
    http_json,
    load_conf as _common_load_conf,
    active_model_from,
)

# 与 server/db.py 的 DB_PATH 同位置：项目根 english_web.db
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "english_web.db")


def _db_get(key):
    """读 config 表某 key 的值；DB 缺失/异常/未设置 → None。"""
    try:
        if not os.path.exists(DB_PATH):
            return None
        conn = sqlite3.connect(DB_PATH)
        try:
            row = conn.execute(
                "SELECT value FROM config WHERE key=?", (key,)
            ).fetchone()
            return (row[0] if row else None) or None
        finally:
            conn.close()
    except Exception:
        return None


def load_conf(args):
    """读 LLM 配置，返回 {url,key,model}（trim）。

    最高优先级是 args（--url/--key/--model）；其次环境变量；再 ew_llm.json
    （由 server.llm_common.load_conf 处理后两者）。
    """
    c = _common_load_conf()
    if args.url:
        c["url"] = args.url.strip()
    if args.key:
        c["key"] = args.key.strip()
    if args.model:
        c["model"] = args.model.strip()
    return c


def cmd_models(args):
    c = load_conf(args)
    if not c["url"] or not c["key"]:
        sys.exit("error: need --url and --key (or env / ew_llm.json)")
    url = join_url(c["url"], "/models")
    _, data = http_json(url, {"Authorization": "Bearer " + c["key"]})
    lst = []
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        lst = [m.get("id") or m.get("name") for m in data["data"] if isinstance(m, dict)]
    lst = [x for x in lst if x]
    if not lst:
        sys.exit("error: endpoint returned no models")
    for m in sorted(set(lst)):
        print(m)
    print(f"\n{len(set(lst))} models", file=sys.stderr)


def cmd_translate(args):
    c = load_conf(args)
    if not (c["url"] and c["key"]):
        sys.exit("error: need --url --key --model (or env / ew_llm.json)")
    # model 优先级：--model flag > active_llm_model(config 表) > (env / ew_llm.json)
    # 与 server/llm.py 一致：用户没显式传 --model 时，active_llm_model 覆盖 json/env model。
    model = c["model"]
    if not model:
        model = active_model_from(_db_get, "")
    if not model:
        sys.exit("error: need --model (or env / ew_llm.json, 或 config 表 active_llm_model)")
    text = " ".join(args.text).strip()
    if not text:
        sys.exit("error: provide the English text to translate")
    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model, "temperature": 0,
        "messages": [{"role": "system", "content": SYS_PROMPT}, {"role": "user", "content": text}],
    }
    t0 = __import__("time").time()
    _, data = http_json(url, {"Authorization": "Bearer " + c["key"]}, payload, "POST")
    dt = __import__("time").time() - t0
    try:
        out = data["choices"][0]["message"]["content"].strip()
    except Exception:
        out = ""
    if not out:
        sys.exit("error: model returned no content")
    print(out)
    print(f"\n[ok] model={model}  {dt:.2f}s", file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description="Test OpenAI-compatible LLM translate/models.")
    p.add_argument("command", choices=["models", "translate"])
    p.add_argument("--url")
    p.add_argument("--key")
    p.add_argument("--model")
    p.add_argument("text", nargs="*", help="English text to translate (after 'translate')")
    a = p.parse_args()
    if a.command == "models":
        cmd_models(a)
    else:
        cmd_translate(a)


if __name__ == "__main__":
    main()
