#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 LLM 为词库生成「词根词缀 + 同义 / 反义 / 形近 / 同族词」→ scripts/wordinfo.json。

供 gen_data.py 写 web/wordinfo.js（window.WORD_INFO，前端按需懒加载）。
- LLM 配置读项目根 ew_llm.json（OpenAI 兼容：url / key / model）。
- 可断点续跑：已生成的词跳过；每批写盘。
- 禁止谐音：提示词约束 + 结果过滤。
- 词根拆分校验：各片段去掉连字符后拼接必须等于原词，否则重试；多轮仍不合格则只丢弃拆分。

用法：
  .venv/bin/python3 scripts/gen_wordinfo.py              # 生成 / 续跑
  .venv/bin/python3 scripts/gen_wordinfo.py --limit 50   # 只跑前 50 个未生成的词（试跑）
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "words.json")
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wordinfo.json")
LLM_CONF = os.path.join(ROOT, "ew_llm.json")

BATCH = 20
WORKERS = 8
MAX_PASSES = 3

SYSTEM = """你是考研英语词汇专家，精通英语构词法与词源。为给定的每个单词输出 JSON，用于背单词卡片。

对每个词输出：
- "p": 词根词缀拆分，数组，每项 [片段, 中文含义]。
  * 前缀写成 "re-"，后缀写成 "-tion"，词根不带连字符，如 "vers"。
  * 所有片段去掉连字符后按顺序拼接，必须与原词拼写（忽略大小写、空格、连字符）完全一致；连接字母单独成段，含义写 "连接字母"。
  * 只用真实、公认的词源构词（拉丁 / 希腊 / 古英语词根、标准前后缀、复合词拆成组成词）。
  * 无法按构词法拆分的词（单语素基础词、外来整词等）输出 []，不要硬拆。
- "n": 一句中文记忆串讲（≤40 字），用片段含义推出词义，如 "转(vers)回去(re-) → 颠倒，相反"。
  * p 为 [] 时，可写简短的真实词源（如 "源自古法语 xxx，原义…"）；没有可靠信息则输出 ""。
  * 严禁谐音、拟音、中文读音联想，严禁编造词源。
- "syn": 同义词 / 近义词，0-4 个，优先考研常见词。
- "ant": 反义词，0-3 个，只有确有反义时才给。
- "sim": 形近易混词（拼写相似、容易看错的词，如 adapt / adopt / adept），0-3 个，不要放同义词。
- "rel": 同族 / 语义相关词：同一词根派生或同一概念领域的常用词，0-4 个。
  如 psychology → psychologist、psychological、psychiatry；不要与 syn 重复。
syn / ant / sim / rel 每项为 [英文, 简短中文释义(≤8 字)]。

只输出一个 JSON 对象，键为原词（与输入完全一致），
值为 {"p":[], "n":"", "syn":[], "ant":[], "sim":[], "rel":[]}。"""

# 谐音联想的典型措辞；命中就清掉 n
HOMOPHONE_RE = re.compile(r"谐音|音似|读音像|读作|发音像|听起来像|念起来")

_lock = threading.Lock()
FATAL = threading.Event()


def load_conf() -> dict:
    with open(LLM_CONF, encoding="utf-8") as f:
        c = json.load(f)
    url = os.environ.get("EW_LLM_URL") or c.get("url")
    key = os.environ.get("EW_LLM_KEY") or c.get("key")
    model = os.environ.get("EW_LLM_MODEL") or c.get("model")
    if not (url and key and model):
        raise SystemExit("ew_llm.json 缺 url / key / model")
    url = url.rstrip("/")
    if not re.search(r"/v\d+$", url):
        url += "/v1"
    return {"url": url + "/chat/completions", "key": key, "model": model}


def call_llm(conf: dict, words: list[str]) -> dict:
    body = json.dumps(
        {
            "model": conf["model"],
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": json.dumps(words, ensure_ascii=False)},
            ],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        conf["url"],
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {conf['key']}"},
    )
    last: Exception | None = None
    for attempt in range(4):
        if FATAL.is_set():
            raise RuntimeError("已中止")
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
            return json.loads(content)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:200]
            last = RuntimeError(f"HTTP {e.code}: {detail}")
            # 余额不足 / key 无效：重试无意义，整体中止
            if e.code in (401, 402, 403):
                FATAL.set()
                raise last from e
            time.sleep(5 * (attempt + 1))
        except Exception as e:  # noqa: BLE001 — 网络 / JSON 错误统一重试
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"LLM 调用失败：{last}")


def norm_key(s: str) -> str:
    return re.sub(r"[\s\-'’]", "", s).lower()


def word_list(v, limit: int, seen: set[str]) -> list[list[str]]:
    """[[英文, 中文], ...]；也容忍只给英文字符串。seen 跨列表去重。"""
    if not isinstance(v, list):
        return []
    out: list[list[str]] = []
    for x in v:
        if isinstance(x, str):
            en, cn = x, ""
        elif isinstance(x, list) and x and isinstance(x[0], str):
            en = x[0]
            cn = x[1] if len(x) > 1 and isinstance(x[1], str) else ""
        else:
            continue
        en, cn = en.strip(), cn.strip()[:16]
        if not en or en.lower() in seen or len(en) > 40:
            continue
        seen.add(en.lower())
        out.append([en, cn])
        if len(out) >= limit:
            break
    return out


def clean_item(word: str, raw) -> tuple[dict | None, bool]:
    """返回 (规范化条目, 拆分是否合格)。拆分为空也算合格。"""
    if not isinstance(raw, dict):
        return None, False
    parts: list[list[str]] = []
    for seg in raw.get("p") or []:
        if (
            isinstance(seg, list)
            and len(seg) == 2
            and isinstance(seg[0], str)
            and isinstance(seg[1], str)
            and seg[0].strip()
        ):
            parts.append([seg[0].strip(), seg[1].strip()])
    ok = True
    if parts:
        joined = norm_key("".join(p[0] for p in parts))
        ok = joined == norm_key(word) and len(parts) >= 2
    note = raw.get("n") if isinstance(raw.get("n"), str) else ""
    note = note.strip()
    if HOMOPHONE_RE.search(note):
        note = ""
    for p in parts:
        if HOMOPHONE_RE.search(p[1]):
            ok = False
    seen = {word.lower()}
    item = {
        "p": parts,
        "n": note,
        "syn": word_list(raw.get("syn"), 4, seen),
        "ant": word_list(raw.get("ant"), 3, seen),
        "sim": word_list(raw.get("sim"), 3, seen),
        "rel": word_list(raw.get("rel"), 4, seen),
    }
    return item, ok


def save(out: dict) -> None:
    tmp = DST + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")
    os.replace(tmp, DST)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 个未生成的词")
    ap.add_argument("--workers", type=int, default=WORKERS)
    args = ap.parse_args()

    conf = load_conf()
    with open(SRC, encoding="utf-8") as f:
        words = list(dict.fromkeys(w["english"] for w in json.load(f)))
    out: dict = {}
    if os.path.exists(DST):
        with open(DST, encoding="utf-8") as f:
            out = json.load(f)

    todo = [w for w in words if w not in out]
    if args.limit:
        todo = todo[: args.limit]
    print(f"词库 {len(words)}，已有 {len(out)}，待生成 {len(todo)}（model={conf['model']}）")

    # 拆分不合格的词留到下一轮重试；最后一轮仍不合格只丢拆分
    last_bad: dict[str, dict] = {}
    for pass_no in range(1, MAX_PASSES + 1):
        if not todo:
            break
        batches = [todo[i : i + BATCH] for i in range(0, len(todo), BATCH)]
        retry: list[str] = []
        done = 0

        def run(batch: list[str]):
            return batch, call_llm(conf, batch)

        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = [ex.submit(run, b) for b in batches]
            for fut in as_completed(futs):
                try:
                    batch, res = fut.result()
                except Exception as e:  # noqa: BLE001
                    print(f"  批次失败：{e}", file=sys.stderr)
                    continue
                lower = {k.lower(): v for k, v in res.items()} if isinstance(res, dict) else {}
                with _lock:
                    for w in batch:
                        item, ok = clean_item(w, res.get(w) if isinstance(res, dict) else None)
                        if item is None:
                            item, ok = clean_item(w, lower.get(w.lower()))
                        if item is None:
                            retry.append(w)
                        elif ok:
                            out[w] = item
                        else:
                            last_bad[w] = item
                            retry.append(w)
                    save(out)
                    done += 1
                    if done % 10 == 0 or done == len(batches):
                        print(f"  第 {pass_no} 轮 {done}/{len(batches)} 批，累计 {len(out)} 词", flush=True)
        todo = retry
        print(f"第 {pass_no} 轮结束：待重试 {len(todo)}")
        if FATAL.is_set():
            raise SystemExit(f"LLM 不可用（余额不足 / key 无效），已保存 {len(out)} 词，处理后重跑即可续传")

    for w in todo:
        if w in last_bad:
            item = last_bad[w]
            item["p"] = []
            out[w] = item
    save(out)
    missing = [w for w in words if w not in out]
    print(f"=> wrote {DST}: {len(out)} / {len(words)}，缺 {len(missing)}")
    if missing:
        print("missing:", ", ".join(missing[:100]), file=sys.stderr)


if __name__ == "__main__":
    main()
