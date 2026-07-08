#!/usr/bin/env python3
"""llm_answers.py — 对 PDF 无答案页的年份，用 LLM 做选择题，回写 papers/<year>.json
+ 落 paper_answers 缓存表（避免重复做题）。

题型：完形（1-20）+ 阅读 A（21-40）+ 新题型 B（41-45）。每篇 passage 单独喂 LLM，
输出 JSON {"n":"A",...}，合并进 paper.json 顶层 answers，source 标 "llm"。

LLM 调用复用 server.llm 的 load_conf/join_url/http_json/active_model，保证 model
选择与翻译端一致（config.active_llm_model 优先）。

CLI:
  python3 scripts/llm_answers.py            # 跑所有缺答案年份
  python3 scripts/llm_answers.py 2023       # 单年
  python3 scripts/llm_answers.py en2 2023   # 英二 2023
"""
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server.llm import (  # noqa: E402
    LlmNotConfigured,
    active_model,
    is_configured,
    load_conf,
    join_url,
)
from server.db import get_db, now_iso  # noqa: E402


def _http_json_long(url, headers, payload, timeout=180):
    """urllib 版 fetch JSON，超时拉长到 180s（做题 prompt 大、输出长，60s 不够）。"""
    data = json.dumps(payload).encode("utf-8")
    hdrs = dict(headers)
    hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {body[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")


def _strip_code_fence(s):
    """LLM 可能输出 ```json ... ``` 包裹，剥掉。"""
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def call_llm_json(prompt):
    """让 LLM 输出 JSON 对象。返 dict 或 {} 失败。"""
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = active_model() or c.get("model", "")
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选 model")
    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "你是考研英语做题引擎。只输出 JSON，不要解释、不要多余文字。"},
            {"role": "user", "content": prompt},
        ],
    }
    _, data = _http_json_long(url, {"Authorization": "Bearer " + c["key"]}, payload, timeout=180)
    try:
        out = data["choices"][0]["message"]["content"].strip()
    except Exception:
        out = ""
    if not out:
        return {}
    out = _strip_code_fence(out)
    # 找第一个 { ... } 块
    m = re.search(r"\{[\s\S]*\}", out)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


def build_cloze_prompt(sec):
    """完形：passage + 全部 20 题选项。"""
    body = sec.get("passage", "")
    items = sec.get("items", [])
    lines = ["Complete this cloze test. Choose the correct option for each numbered blank.\n",
             "Passage (blanks are numbered 1-20 in the text):\n" + body + "\n",
             "Options:"]
    for it in items:
        opts_str = " ".join(f"{k}.{v}" for k, v in sorted(it.get("options", {}).items()))
        lines.append(f"{it.get('n')}. {opts_str}")
    lines.append('\nOutput ONLY a JSON object mapping question number (as string) to letter, like {"1":"A","2":"B",...}. No other text.')
    return "\n".join(lines)


def build_reading_a_prompt(passage):
    """阅读 A 单 Text：body + 5 题 stem+options。"""
    body = passage.get("body", "")
    items = passage.get("items", [])
    lines = ["Answer these reading comprehension questions based on the passage.\n",
             "Passage:\n" + body + "\n",
             "Questions:"]
    for it in items:
        opts_str = " ".join(f"{k}.{v}" for k, v in sorted(it.get("options", {}).items()))
        lines.append(f"{it.get('n')}. {it.get('stem','')} {opts_str}".strip())
    ns = [it.get("n") for it in items if it.get("n")]
    rng = f'{min(ns)}~{max(ns)}' if ns else ""
    lines.append(f'\nOutput ONLY JSON mapping question number (string) to letter, e.g. {{"{ns[0] if ns else 21}":"A",...}}. Cover questions {rng}. No other text.')
    return "\n".join(lines)


def build_reading_b_prompt(sec):
    """新题型：passage + gaps + options（七选五/排序/小标题）。"""
    body = sec.get("passage", "")
    opts = sec.get("options", {})
    gaps = sec.get("gaps", [])
    lines = ["Complete this Reading Part B task. For each gap number, choose the correct option letter.\n",
             "Passage (gaps marked as numbers):\n" + body + "\n"]
    if opts:
        lines.append("Options:")
        for k, v in sorted(opts.items()):
            lines.append(f"{k}. {v}")
    if gaps:
        lines.append(f"\nGaps to fill: {', '.join(str(g) for g in gaps)}")
    lines.append('\nOutput ONLY JSON mapping gap number (string) to option letter, like {"41":"C",...}. No other text.')
    return "\n".join(lines)


def normalize_ans_keys(d, valid_range=None):
    """把 LLM 返回的键规整为字符串题号→大写字母；过滤无效。"""
    out = {}
    if not isinstance(d, dict):
        return out
    for k, v in d.items():
        try:
            n = int(str(k).strip())
        except Exception:
            continue
        if valid_range and not (valid_range[0] <= n <= valid_range[1]):
            continue
        letter = str(v).strip().upper()[:1]
        if re.match(r"[A-Z]", letter):
            out[str(n)] = letter
    return out


def upsert_cache(year, variant, section, label, answers, source="llm"):
    key = f"{year}|{variant}|{section}|{label or ''}"
    now = now_iso()
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO paper_answers(cache_key, answers, source, model, "
            "created_at, updated_at) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(cache_key) DO UPDATE SET answers=excluded.answers, "
            "source=excluded.source, updated_at=excluded.updated_at",
            (key, json.dumps(answers, ensure_ascii=False), source, None, now, now),
        )
        conn.commit()
    finally:
        conn.close()


def process_paper(jf, variant, only_year=None):
    """对一份 paper.json 跑 LLM 做题，回写 answers + 落缓存。"""
    data = json.loads(jf.read_text(encoding="utf-8"))
    year = data.get("year")
    if only_year and str(year) != str(only_year):
        return
    top_answers = data.get("answers") or {}
    new_answers = dict(top_answers)
    changed = False

    for sec in data.get("sections", []):
        st = sec["type"]
        if st == "use_of_english":
            # 完形题号 1-20
            existing = {k: v for k, v in new_answers.items() if 1 <= int(k) <= 20}
            if len(existing) >= 20:
                continue
            print(f"  {year} {variant} use_of_english: LLM 做题中…")
            try:
                raw = call_llm_json(build_cloze_prompt(sec))
            except LlmNotConfigured as e:
                print(f"    LLM 未配置，跳过：{e}", file=sys.stderr)
                return
            except Exception as e:
                print(f"    调用失败：{e}", file=sys.stderr)
                continue
            ans = normalize_ans_keys(raw, (1, 20))
            print(f"    得 {len(ans)} 个答案")
            new_answers.update(ans)
            upsert_cache(year, variant, "use_of_english", "完形填空", ans, "llm")
            changed = True
        elif st == "reading_a":
            for t in sec.get("passages", []):
                items = t.get("items", [])
                ns = [it.get("n") for it in items if it.get("n")]
                if not ns:
                    continue
                a_min, a_max = min(ns), max(ns)
                existing = {k: v for k, v in new_answers.items() if a_min <= int(k) <= a_max}
                if len(existing) >= len(ns):
                    continue
                label = t.get("label", "")
                print(f"  {year} {variant} reading_a {label}: LLM 做题中…")
                try:
                    raw = call_llm_json(build_reading_a_prompt(t))
                except Exception as e:
                    print(f"    调用失败：{e}", file=sys.stderr)
                    continue
                ans = normalize_ans_keys(raw, (a_min, a_max))
                print(f"    得 {len(ans)} 个答案")
                new_answers.update(ans)
                upsert_cache(year, variant, "reading_a", label, ans, "llm")
                changed = True
        elif st == "reading_b":
            existing = {k: v for k, v in new_answers.items() if 41 <= int(k) <= 45}
            if len(existing) >= 5:
                continue
            print(f"  {year} {variant} reading_b: LLM 做题中…")
            try:
                raw = call_llm_json(build_reading_b_prompt(sec))
            except Exception as e:
                print(f"    调用失败：{e}", file=sys.stderr)
                continue
            ans = normalize_ans_keys(raw, (41, 45))
            print(f"    得 {len(ans)} 个答案")
            new_answers.update(ans)
            upsert_cache(year, variant, "reading_b", "新题型（七选五）", ans, "llm")
            changed = True

    if changed:
        data["answers"] = {k: v for k, v in sorted(new_answers.items(), key=lambda kv: int(kv[0]))}
        if "variant" not in data:
            data["variant"] = variant
        jf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {year} {variant}: 回写 {len(data['answers'])} 个答案")


def main():
    args = sys.argv[1:]
    only_year = None
    only_variant = None
    for a in args:
        if a.lower() in ("en1", "en2"):
            only_variant = a.lower()
        elif a.isdigit():
            only_year = a

    if not is_configured():
        print("error: LLM 未配置（ew_llm.json 缺 url/key），无法做题", file=sys.stderr)
        sys.exit(1)

    json_files = sorted(ROOT.glob("papers/*.json")) + sorted(ROOT.glob("papers/en2/*.json"))
    if not json_files:
        print("no paper.json found", file=sys.stderr)
        sys.exit(1)

    for jf in json_files:
        variant = "en2" if "en2" in str(jf).replace("\\", "/") else "en1"
        if only_variant and variant != only_variant:
            continue
        process_paper(jf, variant, only_year)

    print("done")


if __name__ == "__main__":
    main()
