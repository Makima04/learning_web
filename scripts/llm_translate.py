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
import argparse, json, os, sys, urllib.request, urllib.error

# project root (one level up from this script's scripts/ dir)
CONF_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ew_llm.json")
# 与 server/db.py 的 DB_PATH 同位置：项目根 english_web.db
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "english_web.db")


def _active_llm_model():
    """读 config 表 active_llm_model；DB 缺失/异常/未设置 → 返回 ''（fallback json/env model）。

    与 server/llm.py._active_model 行为对齐，保证 CLI 是服务端翻译的真正 mirror。
    """
    try:
        import sqlite3
        if not os.path.exists(DB_PATH):
            return ""
        conn = sqlite3.connect(DB_PATH)
        try:
            row = conn.execute(
                "SELECT value FROM config WHERE key=?", ("active_llm_model",)
            ).fetchone()
            return (row[0] if row else "") or ""
        finally:
            conn.close()
    except Exception:
        return ""


def load_conf(args):
    env = os.environ
    conf = {}
    if os.path.exists(CONF_PATH):
        try:
            with open(CONF_PATH) as f:
                conf = json.load(f)
        except Exception as e:
            print(f"warn: bad {CONF_PATH}: {e}", file=sys.stderr)
    def pick(flag, env_key, key):
        v = flag
        if not v:
            v = env.get(env_key)
        if not v:
            v = conf.get(key)
        return (v or "").strip()
    return {
        "url": pick(args.url, "EW_LLM_URL", "url"),
        "key": pick(args.key, "EW_LLM_KEY", "key"),
        "model": pick(args.model, "EW_LLM_MODEL", "model"),
    }


def join_url(base, path):
    b = (base or "").rstrip("/")
    if "/v" not in b.rsplit("/", 1)[-1]:  # crude: append /v1 if no version segment at end
        # match llm.js: append /v1 unless base already ends with /vN
        import re
        if not re.search(r"/v\d+$", b):
            b += "/v1"
    return b + path


def http_json(url, headers, payload=None, method="GET"):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers = dict(headers); headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            j = json.loads(body)
            msg = (j.get("error", {}).get("message") if isinstance(j.get("error"), dict) else j.get("error")) or body
        except Exception:
            msg = body
        raise RuntimeError(f"HTTP {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")


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
        active = _active_llm_model()
        if active:
            model = active
    if not model:
        sys.exit("error: need --model (or env / ew_llm.json, 或 config 表 active_llm_model)")
    text = " ".join(args.text).strip()
    if not text:
        sys.exit("error: provide the English text to translate")
    url = join_url(c["url"], "/chat/completions")
    sys_msg = ("你是翻译引擎。把用户给的英文考研真题句子翻译成简体中文。"
               "只输出译文，不要原文、不要引号、不要解释、不要多余空白。")
    payload = {
        "model": model, "temperature": 0,
        "messages": [{"role": "system", "content": sys_msg}, {"role": "user", "content": text}],
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
