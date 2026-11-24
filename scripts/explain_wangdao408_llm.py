#!/usr/bin/env python3
"""使用项目 ew_llm.json 并发补全王道 408 题库（wangdao2027.json）的逐题文字解析。

特点：
- 严格按科目优先级顺序处理：默认 cn -> os -> co -> ds，每科先选择题后大题。
- 断点续跑：跳过已有非空 explanation 的题目，每完成 50 题原子落盘一次。
- 适配 deepseek-v4-flash（关闭 thinking 避免占满 max_tokens）。
- 跑完后自动调用 split_practice_catalogs.py 重新生成分片。

用法：
  python3 scripts/explain_wangdao408_llm.py --workers 60
  python3 scripts/explain_wangdao408_llm.py --books cn os --kind mcq --workers 60
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
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "frontend" / "public" / "cs408" / "wangdao2027.json"
LLM_PATHS = [
    ROOT / "ew_llm.json",
    Path(os.environ.get("EW_LLM_CONFIG", "")),
]

BOOK_NAME = {
    "cn": "计算机网络",
    "os": "操作系统",
    "co": "计算机组成原理",
    "ds": "数据结构",
}

MCQ_SYSTEM_PROMPT = """你是考研 408（计算机学科专业基础综合）辅导专家。请为给定的王道 408 选择题撰写准确、简洁、考场导向的逐题解析。

输出格式：只输出一个 JSON 对象，不要 markdown 代码块围栏，不要额外前后缀：
{"explanation": "解析正文", "answer": "A"}

要求：
1. 若题目已提供非空参考答案，answer 必须与参考答案保持一致，解析结论必须自洽；若参考答案为空，请给出你确认的单个字母 A/B/C/D。
2. 解析内容包含：① 开头直接点明「选 X。」并给出核心依据（计算题写出清晰公式与代入步骤）；② 简明排除干扰项（若各选项为独立概念或易混项）；③ 必要时补 1 句常考易错点。篇幅控制在 80~240 字，精炼不注水。
3. 解析使用纯文本和普通换行符（\\n），严禁使用 Markdown 标题（#）、加粗星号（**）或 LaTeX 符号（$...$）；数学表达式请用易读纯文本/Unicode，如 2^n、×、÷、≤、≥、μs、Mbps。
4. 若题干存在明显 OCR 错字（如把 μs 识成 HS、把 200m/μs 识成 200m/s 等），请按原题正确物理/计算机含义解答，并在括号中顺带提醒一句。"""

BIG_SYSTEM_PROMPT = """你是考研 408（计算机学科专业基础综合）辅导专家。请为给定的王道 408 综合应用题（大题）撰写准确、条理清晰的参考解答与解析。

输出格式：只输出一个 JSON 对象，不要 markdown 代码块围栏，不要额外前后缀：
{"explanation": "分步解答与解析正文"}

要求：
1. 按题干小问顺序（如（1）（2）...）分步作答，给出核心思路、关键公式/推导过程、算法思想或复杂度分析，以及常见失分点。
2. 篇幅适中（约 150~450 字），保证准确、易读、可直接对照复习。
3. 使用纯文本和普通换行符（\\n），严禁使用 Markdown 标题（#）、加粗星号（**）或 LaTeX 符号（$...$）；数学/代码表达请用易读纯文本/Unicode。
4. 若题干因缺图导致部分具体数值/拓扑无法完全确认，请先说明“本题含原书配图”，再给出通用解题步骤与关键得分点。"""


def load_llm_conf(model_override: str | None = None) -> dict[str, str]:
    env_url = (os.environ.get("EW_LLM_URL") or "").rstrip("/")
    env_key = os.environ.get("EW_LLM_KEY") or ""
    env_model = os.environ.get("EW_LLM_MODEL") or ""
    if env_url and env_key and (model_override or env_model):
        return {"url": env_url, "key": env_key, "model": model_override or env_model}
    for p in LLM_PATHS:
        if p and p.is_file():
            conf = json.loads(p.read_text(encoding="utf-8"))
            url = (conf.get("url") or "").rstrip("/")
            key = conf.get("key") or ""
            model = model_override or conf.get("model") or ""
            if url and key and model:
                return {"url": url, "key": key, "model": model}
    raise SystemExit("未找到 ew_llm.json 或 EW_LLM_* 环境变量")


def join_chat_url(base: str) -> str:
    b = base.rstrip("/")
    if not re.search(r"/v\d+$", b):
        b = b + "/v1"
    return b + "/chat/completions"


def chat(
    conf: dict[str, str],
    system: str,
    user: str,
    max_tokens: int = 1200,
    timeout: int = 120,
    retries: int = 3,
) -> str:
    url = join_chat_url(conf["url"])
    payload = {
        "model": conf["model"],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "thinking": {"type": "disabled"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {conf['key']}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            msg = body["choices"][0]["message"]
            content = msg.get("content") or ""
            if not str(content).strip():
                alt = msg.get("reasoning_content") or msg.get("reasoning") or ""
                if "{" in str(alt):
                    content = alt
            if not str(content).strip():
                raise RuntimeError(f"empty content finish={body['choices'][0].get('finish_reason')}")
            return str(content)
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")[:300]
            last_err = RuntimeError(f"HTTP {e.code}: {err}")
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2.0 * (attempt + 1))
                continue
        except Exception as e:
            last_err = e
        if attempt < retries:
            time.sleep(1.5 * (attempt + 1))
    assert last_err is not None
    raise last_err


def parse_json_response(content: str) -> dict[str, Any]:
    text = content.strip()
    text = re.sub(r"(?is)<think>.*?</think>", "", text).strip()
    text = re.sub(r"(?is)<thinking>.*?</thinking>", "", text).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def build_user_prompt(item: dict[str, Any]) -> str:
    book = BOOK_NAME.get(item.get("book", ""), item.get("book", ""))
    sec = f"{item.get('section', '')} {item.get('section_name', '')}".strip()
    stem = (item.get("stem") or "").strip()
    ans = (item.get("answer") or "").strip()
    if item.get("kind") == "mcq":
        opts = item.get("options") or {}
        opt_lines = [f"{k}. {opts[k]}" for k in ("A", "B", "C", "D") if opts.get(k)]
        return (
            f"科目：{book}\n章节：{sec}\n题号：{item.get('id')}\n"
            f"【题干】\n{stem}\n\n"
            f"【选项】\n" + "\n".join(opt_lines) + "\n\n"
            f"【参考答案】{ans or '（空，请判断）'}"
        )
    return (
        f"科目：{book}\n章节：{sec}\n题号：{item.get('id')}\n"
        f"【题干】\n{stem}\n\n"
        f"【参考答案提示】{ans or '（无）'}"
    )


def explain_one(conf: dict[str, str], item: dict[str, Any], timeout: int) -> tuple[str, str | None]:
    is_mcq = item.get("kind") == "mcq"
    system = MCQ_SYSTEM_PROMPT if is_mcq else BIG_SYSTEM_PROMPT
    user = build_user_prompt(item)
    max_tokens = 900 if is_mcq else 1600
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            raw_text = chat(conf, system, user, max_tokens=max_tokens, timeout=timeout)
            try:
                parsed = parse_json_response(raw_text)
                exp = str(parsed.get("explanation") or "").strip()
                ans = str(parsed.get("answer") or "").strip().upper()
                if ans not in ("A", "B", "C", "D"):
                    ans = None
            except Exception:
                # 兜底：若模型直接返回纯文本而非 JSON，清理后使用
                cleaned = re.sub(r"(?is)<think>.*?</think>", "", raw_text).strip()
                cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned).strip()
                if len(cleaned) >= 20 and not cleaned.startswith("{"):
                    exp, ans = cleaned, None
                else:
                    raise
            if len(exp) < 15:
                raise ValueError(f"explanation too short: {exp!r}")
            return exp, ans
        except Exception as e:
            last_err = e
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"explain failed: {last_err}")


def save_atomic(path: Path, items: list[dict[str, Any]]) -> None:
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def main() -> int:
    ap = argparse.ArgumentParser(description="Concurrent LLM explanation generator for Wangdao 408")
    ap.add_argument("--books", nargs="+", default=["cn", "os", "co", "ds"], help="科目顺序")
    ap.add_argument("--kind", choices=["all", "mcq", "big"], default="all", help="题型过滤")
    ap.add_argument("--workers", type=int, default=60, help="并发数")
    ap.add_argument("--limit", type=int, default=None, help="最多处理题数（调试用）")
    ap.add_argument("--timeout", type=int, default=90, help="单题超时秒数")
    ap.add_argument("--save-every", type=int, default=50, help="每完成多少题落盘一次")
    ap.add_argument("--no-split", action="store_true", help="完成后不自动运行分片脚本")
    args = ap.parse_args()

    conf = load_llm_conf()
    print(f"LLM: model={conf['model']} url={conf['url']}", flush=True)

    items: list[dict[str, Any]] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    book_rank = {b: i for i, b in enumerate(args.books)}
    kind_rank = {"mcq": 0, "big": 1}

    jobs: list[int] = []
    for i, it in enumerate(items):
        if it.get("book") not in book_rank:
            continue
        if args.kind != "all" and it.get("kind") != args.kind:
            continue
        if (it.get("explanation") or "").strip():
            continue
        if not (it.get("stem") or "").strip():
            continue
        jobs.append(i)

    jobs.sort(key=lambda idx: (
        book_rank[items[idx].get("book", "")],
        kind_rank.get(items[idx].get("kind", "mcq"), 9),
        idx,
    ))
    if args.limit is not None:
        jobs = jobs[: args.limit]

    total = len(jobs)
    if total == 0:
        print("没有需要补全解析的题目。", flush=True)
        return 0

    print(f"待补全：{total} 题，顺序={args.books}，题型={args.kind}，并发={args.workers}", flush=True)
    lock = threading.Lock()
    done = 0
    failed = 0
    t0 = time.time()

    def work(idx: int) -> tuple[int, str | None, str | None, str | None]:
        try:
            exp, ans = explain_one(conf, items[idx], timeout=args.timeout)
            return idx, exp, ans, None
        except Exception as e:
            return idx, None, None, str(e)

    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, total))) as ex:
        futs = [ex.submit(work, idx) for idx in jobs]
        for fut in as_completed(futs):
            idx, exp, ans, err = fut.result()
            should_save = False
            with lock:
                if exp:
                    items[idx]["explanation"] = exp
                    if ans and not (items[idx].get("answer") or "").strip() and items[idx].get("kind") == "mcq":
                        items[idx]["answer"] = ans
                    done += 1
                else:
                    failed += 1
                    print(f"  FAIL {items[idx].get('id')}: {(err or '')[:140]}", flush=True)
                finished = done + failed
                if finished % 25 == 0 or finished == total:
                    elapsed = time.time() - t0
                    rate = finished / elapsed if elapsed > 0 else 0
                    eta = (total - finished) / rate if rate > 0 else 0
                    print(
                        f"  progress {finished}/{total} ok={done} fail={failed} "
                        f"rate={rate:.1f} q/s elapsed={elapsed:.0f}s eta={eta:.0f}s",
                        flush=True,
                    )
                if finished % args.save_every == 0 or finished == total:
                    should_save = True
            if should_save:
                with lock:
                    save_atomic(CATALOG_PATH, items)

    with lock:
        save_atomic(CATALOG_PATH, items)
    print(f"ALL DONE: ok={done} fail={failed} total={total} in {time.time() - t0:.1f}s", flush=True)

    if not args.no_split:
        sys.path.insert(0, str(ROOT / "scripts"))
        from split_practice_catalogs import split_public_catalog
        split_public_catalog(CATALOG_PATH)

    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
