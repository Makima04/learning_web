#!/usr/bin/env python3
"""解析 2009–2011 年 408 真题合订 PDF → 与 papers/cs408/<year>.json 同构的数据。

来源（个人学习用，勿商用传播）：
  papers/cs408/early/<year>.pdf —— GitHub nanxingtang/Postgraduate-408-old-exam
  2009/2010 为「试题 → 参考答案（答案键 + 大题解答）→ 选择题部分解析」三段式；
  2011 把「解答：」直接附在每题题干后面。

复用 parse_cs408.py 的切题 / 选项拆分 / 考点规则标注，保证字段格式一致。
用法：.venv/bin/python3 scripts/parse_cs408_early.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from parse_cs408 import (  # noqa: E402
    BOOK_NAME,
    Q_BOOK,
    annotate_kps,
    extract_pdf_text,
    parse_mcq,
    split_questions,
)

EARLY = ROOT / "papers" / "cs408" / "early"
OUT = ROOT / "papers" / "cs408"

MCQ_KEY = re.compile(r"(?m)^\s*(\d{1,2})\s*[.．、]\s*([A-D])\b")
MCQ_EXP_HEAD = re.compile(r"(?m)^\s*(\d{1,2})\s*[．.、]\s*(?:考查|【|解答|答案)")
BIG_HEAD = re.compile(r"(?m)^\s*(4[1-7])\s*[．.、]\s*解答\s*[:：]?")
SOL_HEAD = re.compile(r"\n?\s*解答\s*[:：]\s*")


def cut_by_heads(seg: str, pattern: re.Pattern, lo: int, hi: int) -> dict[int, str]:
    """按行首题号锚点切分，返回题号 → 正文（已去掉题号前缀）。"""
    hits: list[tuple[int, int]] = []
    for m in pattern.finditer(seg):
        n = int(m.group(1))
        if lo <= n <= hi and (not hits or n > hits[-1][1]):
            hits.append((m.start(), n))
    out: dict[int, str] = {}
    for i, (pos, n) in enumerate(hits):
        end = hits[i + 1][0] if i + 1 < len(hits) else len(seg)
        body = seg[pos:end]
        body = re.sub(r"^\s*\d{1,2}\s*[．.、]\s*", "", body, count=1).strip()
        body = re.sub(r"^解答\s*[:：]\s*", "", body).strip()
        if len(body) > 8:
            out[n] = body[:6000]
    return out


def build_item(n: int, stem: str, options: dict | None, answer, explanation, source: str) -> dict:
    book = Q_BOOK.get(n, "ds")
    kind = "big" if n >= 41 else "mcq"
    points = 2 if kind == "mcq" else {41: 13, 42: 10, 43: 10, 44: 13, 45: 8, 46: 7, 47: 9}.get(n, 10)
    kps = annotate_kps(stem + " " + " ".join((options or {}).values()), book, n) if stem else []
    return {
        "n": n,
        "kind": kind,
        "book": book,
        "book_name": BOOK_NAME[book],
        "points": points,
        "stem": stem,
        "options": options or None,
        "kps": kps,
        "kps_meta": {"method": "rules", "note": "draft; prefer LLM multilabel"},
        "answer": answer,
        "explanation": explanation,
        "answer_meta": {"method": "pdf_text", "source": source, "quality": "ok"},
        "source": "pdf_early_bundle",
    }


def parse_three_part(year: int, text: str, pdf_name: str) -> dict:
    i = text.find("参考答案")
    j = text.find("选择题部分解析")
    exam = text[:i]
    ans = text[i : j] if j > i else text[i:]
    mcq_exp_seg = text[j:] if j > i else ""

    qmap = split_questions(exam)
    keys = {
        int(m.group(1)): m.group(2)
        for m in MCQ_KEY.finditer(ans[:2500])
        if 1 <= int(m.group(1)) <= 40
    }
    big = cut_by_heads(ans, BIG_HEAD, 41, 47)
    mcq_exp = cut_by_heads(mcq_exp_seg, MCQ_EXP_HEAD, 1, 40)

    items = []
    for n in range(1, 48):
        body = qmap.get(n, "")
        if n <= 40:
            parsed = parse_mcq(body)
            stem, options = parsed["stem"], parsed["options"]
        else:
            stem, options = re.sub(r"\s+", " ", body).strip(), {}
        items.append(
            build_item(
                n,
                stem,
                options,
                keys.get(n),
                mcq_exp.get(n) if n <= 40 else big.get(n),
                pdf_name,
            )
        )
    return items, len(keys), sum(1 for n in range(1, 41) if n in mcq_exp), len(big)


def parse_inline_2011(text: str, pdf_name: str) -> dict:
    qmap = split_questions(text)
    items = []
    n_key = n_exp = n_big = 0
    for n in range(1, 48):
        body = qmap.get(n, "")
        m = SOL_HEAD.search(body)
        if m:
            stem_part, sol = body[: m.start()], body[m.end() :]
        else:
            stem_part, sol = body, ""
        answer, explanation = None, None
        if n <= 40:
            parsed = parse_mcq(stem_part)
            stem, options = parsed["stem"], parsed["options"]
            km = re.match(r"\s*([A-D])\s*[。.、]", sol)
            if km:
                answer = km.group(1)
                n_key += 1
                sol = sol[km.end() :]
            explanation = sol.strip() or None
        else:
            stem, options = re.sub(r"\s+", " ", stem_part).strip(), {}
            answer = None
            explanation = sol.strip() or None
        if explanation:
            n_exp += 1
            if n >= 41:
                n_big += 1
        items.append(build_item(n, stem, options, answer, explanation, pdf_name))
    return items, n_key, n_exp - n_big, n_big


def main() -> int:
    for year in (2009, 2010, 2011):
        pdf = EARLY / f"{year}.pdf"
        if not pdf.exists():
            print(f"skip {year}: missing {pdf}")
            continue
        text = extract_pdf_text(pdf)
        if year == 2011:
            items, n_key, n_mcq_exp, n_big = parse_inline_2011(text, pdf.name)
        else:
            items, n_key, n_mcq_exp, n_big = parse_three_part(year, text, pdf.name)
        nonempty = sum(1 for it in items if it["stem"])
        paper = {
            "year": year,
            "subject": "cs408",
            "title": f"{year}年全国硕士研究生入学统一考试计算机学科专业基础综合",
            "source_pdf": f"early/{pdf.name}",
            "source_note": (
                "GitHub nanxingtang/Postgraduate-408-old-exam 合订版；"
                "考点为规则自动标注；早期年份分科题号按 2012+ 常规布局近似"
            ),
            "counts": {
                "total": len(items),
                "parsed_nonempty": nonempty,
                "mcq": sum(1 for x in items if x["kind"] == "mcq"),
                "big": sum(1 for x in items if x["kind"] == "big"),
            },
            "items": items,
        }
        (OUT / f"{year}.json").write_text(
            json.dumps(paper, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            f"{year}: 题干 {nonempty}/47  答案键 {n_key}/40  "
            f"选择题解析 {n_mcq_exp}/40  大题答案 {n_big}/7"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
