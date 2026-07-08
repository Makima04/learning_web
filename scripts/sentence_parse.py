#!/usr/bin/env python3
"""sentence_parse.py — 长难句解析（母语式走查）。复用 server.llm_common 的网络层。

与 llm_translate.py 对称：读 ew_llm.json / config 表 active_llm_model，
走 OpenAI 兼容 /chat/completions。区别在 system prompt——这里不是翻译，
而是 10 层母语式阅读走查（动词锚定 → kernel 拆解 → 修饰剥离 → 逐层加回 →
合成训练 → 标点路标 → 复述 → 译文）。

用法:
  .venv/bin/python3 scripts/sentence_parse.py                      # 默认例句
  .venv/bin/python3 scripts/sentence_parse.py "Your sentence here" # 自定义
  PARSE_MODEL=deepseek-v4-pro .venv/bin/python3 scripts/sentence_parse.py "..."

model 优先级（与 server/llm.py 一致）: PARSE_MODEL 环境变量 > active_llm_model > ew_llm.json.model
"""
import os
import sqlite3
import sys
import time

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

DEFAULT_SENTENCE = ('Noting the "medical/psychological" nature of problem gambling behavior, '
            'the letter said that before being readmitted to the casino he would have to '
            'present medical/psychological information demonstrating that patronizing the '
            'casino would pose no threat to his safety or well-being.')

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


def _load_conf(args):
    """读 LLM 配置：env / ew_llm.json 由 server.llm_common.load_conf 处理，
    args（这里来自 PARSE_MODEL 环境变量）的 model 作为最高优先级覆盖。
    """
    c = _common_load_conf()
    if args.url:
        c["url"] = args.url.strip()
    if args.key:
        c["key"] = args.key.strip()
    if args.model:
        c["model"] = args.model.strip()
    return c


class Args:
    url = None
    key = None
    model = os.environ.get("PARSE_MODEL") or None


def main():
    sentence = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else DEFAULT_SENTENCE
    c = _load_conf(Args())
    if not (c["url"] and c["key"]):
        sys.exit("error: ew_llm.json 缺 url/key")
    model = c["model"] or active_model_from(_db_get, "")
    if not model:
        sys.exit("error: 无 model")
    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model, "temperature": 0,
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": sentence},
        ],
    }
    t0 = time.time()
    _, data = http_json(url, {"Authorization": "Bearer " + c["key"]}, payload, "POST", timeout=180)
    dt = time.time() - t0
    try:
        out = data["choices"][0]["message"]["content"].strip()
    except Exception:
        out = ""
    if not out:
        sys.exit("error: 模型无输出")
    print(out)
    print(f"\n[ok] model={model}  {dt:.2f}s", file=sys.stderr)

if __name__ == "__main__":
    main()
