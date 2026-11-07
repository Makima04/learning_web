#!/usr/bin/env python3
"""核对 2026 卷（考后回忆整理版）的答案键，并把校对状态写回源 JSON。

教育部不公开 408 正式卷，2026 年只有考后整理/回忆版。这个脚本不假装能拿到
「官方卷」，而是做一件可复跑、可验证的事：把本地 40 道选择题答案键与来源页
逐题比对，把结果记为结构化状态，供前端明确提示、供统计口径决定是否采信。

用法：
  .venv/bin/python3 scripts/verify_cs408_2026.py            # 核对并写回 verification
  .venv/bin/python3 scripts/verify_cs408_2026.py --check   # 只核对，不写文件；不一致退出码 1
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPER = ROOT / "papers" / "cs408" / "2026.json"
SOURCE_URL = "https://csgraduates.com/study_methods/408quiz/2026/"
HEAD_RE = re.compile(r"<h([1-6])[^>]*>\s*(\d{1,2})\s*</h\1>")
KEY_RE = re.compile(r"正确答案\s*[:：]\s*([A-D])")


def fetch_answer_keys(url: str = SOURCE_URL) -> dict[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (study-tool)"})
    raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    # <head> 里的 meta description 会重复前几题答案，必须剔除
    body = re.sub(r"(?is)<head\b.*?</head>", "", raw)
    heads = list(HEAD_RE.finditer(body))
    keys: dict[int, str] = {}
    for i, h in enumerate(heads):
        n = int(h.group(2))
        if not 1 <= n <= 47:
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(body)
        seg = html.unescape(re.sub(r"<[^>]+>", " ", body[h.start() : end]))
        m = KEY_RE.search(seg)
        if m:
            keys[n] = m.group(1)
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只核对，不写回源 JSON")
    args = ap.parse_args()

    paper = json.loads(PAPER.read_text(encoding="utf-8"))
    mcq = [i for i in paper["items"] if i.get("kind") == "mcq"]
    local = "".join((i.get("answer") or "?") for i in mcq)
    try:
        remote_keys = fetch_answer_keys()
    except Exception as e:  # 网络不可用时不能破坏已有数据
        print(f"来源页读取失败：{type(e).__name__}: {e}", file=sys.stderr)
        print("已有 verification 状态保持不变；本次不做改动。", file=sys.stderr)
        return 2
    remote = "".join(remote_keys.get(n, "?") for n in range(1, 41))
    matched = sum(1 for a, b in zip(local, remote) if a == b and a in "ABCD")
    ok = len(local) == 40 and len(remote_keys) == 40 and matched == 40

    print(f"来源页题号数：{len(remote_keys)}")
    print(f"本地答案键  ：{local}")
    print(f"来源页答案键：{remote}")
    print(f"逐题一致    ：{matched}/40  {'✓' if ok else '✗'}")

    if not ok:
        print("答案键存在差异，未写回。请人工核对来源页与 papers/cs408/2026.json。", file=sys.stderr)
        return 1

    if args.check:
        return 0

    paper["edition"] = "recall"
    paper["edition_label"] = "考后回忆整理版（无官方卷）"
    paper["confidence"] = "medium"
    paper["source_note"] = (
        "csgraduates.com 考后整理版；教育部未公开 408 正式卷，题干/选项措辞可能与原卷有出入；"
        "答案键已与来源页逐题核对，考点为 LLM 多标签标注"
    )
    paper["verification"] = {
        "source_url": SOURCE_URL,
        "checked_at": date.today().isoformat(),
        "status": "verified_against_source",
        "answer_key_match": f"{matched}/40",
        "official_pdf": False,
        "scope": "仅核对选择题答案键；大题参考答案与解析同源于该网页",
        "residual_risk": "题干/选项为考后整理，可能与原卷措辞、数值、图不一致；不作为统计校准依据",
        "promote_when": (
            "取得权威正式卷或更完整校订版后：替换题干/选项 → 重跑本脚本 → "
            "把 edition 改为 verified 并更新 SOURCES.md"
        ),
    }
    PAPER.write_text(json.dumps(paper, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已写回 {PAPER.relative_to(ROOT)} 的 edition / verification 状态")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
