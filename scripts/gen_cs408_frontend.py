#!/usr/bin/env python3
"""
从 papers/cs408 生成前端可用的 408 真题与考频数据。

产物：
  frontend/public/cs408/index.json     年份索引
  frontend/public/cs408/<year>.json    瘦身后的卷（stem/options/kps）
  frontend/src/data/kg/cs408ExamStats.ts  考点实测考频（供 freq/bigWeight 校准）

用法：
  .venv/bin/python3 scripts/gen_cs408_frontend.py
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "papers" / "cs408"
PUBLIC = ROOT / "frontend" / "public" / "cs408"
STATS_TS = ROOT / "frontend" / "src" / "data" / "kg" / "cs408ExamStats.ts"


def to_freq(count: int, year_span: int) -> int:
    """映射为 1–5 考频档。"""
    if year_span >= 13:
        base = 5
    elif year_span >= 10:
        base = 4
    elif year_span >= 6:
        base = 3
    elif year_span >= 3:
        base = 2
    else:
        base = 1
    if count >= 25:
        base = max(base, 5)
    elif count >= 15:
        base = max(base, 4)
    elif count >= 8:
        base = max(base, 3)
    return min(5, base)


def to_big_weight(as_big_primary: int, count: int) -> float:
    """大题主考点次数 → bigWeight 0–1。"""
    if as_big_primary >= 8:
        return 0.9
    if as_big_primary >= 5:
        return 0.8
    if as_big_primary >= 3:
        return 0.7
    if as_big_primary >= 2:
        return 0.55
    if as_big_primary == 1:
        return 0.45
    if count >= 15:
        return 0.25
    if count >= 5:
        return 0.2
    return 0.15


# 每次改题库结构都要 +1，前端用它给 /cs408/*.json 加查询串避免浏览器缓存旧数据
DATA_VER = "20261106b"

EARLY_YEARS = {2009, 2010, 2011}          # 早期合订本，考点为规则草稿标注
SCANNED_YEARS = {2019, 2021, 2024, 2025}  # 答案 PDF 为纯扫描件，解析走 OCR
RECALL_YEARS = {2026}                      # 考后回忆整理版，无官方卷

EDITION_LABEL = {
    "recall": "考后回忆整理版",
    "compilation": "早期真题合订本",
    "rebuild": "社区重构版 PDF",
}


def paper_meta(year: int, data: dict, items: list[dict]) -> dict:
    """把版本/质量/覆盖度做成结构化元数据，前端据此提示数据可信度。"""
    edition = "recall" if year in RECALL_YEARS else (
        "compilation" if year in EARLY_YEARS else "rebuild"
    )
    answer_keys = sum(
        1 for it in items if it.get("kind") == "mcq" and it.get("answer")
    )
    explanations = sum(1 for it in items if it.get("explanation"))
    images = sorted({
        src
        for it in items
        for src in ((it.get("answer_meta") or {}).get("page_images") or [])
    })
    quality = "needs_review" if year in SCANNED_YEARS else "ok"
    cls = "llm" if year not in EARLY_YEARS else "rules"
    excluded = year in EARLY_YEARS or year in RECALL_YEARS
    warnings: list[str] = []
    if edition == "recall":
        warnings.append(
            "教育部未公开 408 正式卷，本卷为考后回忆整理版，题干/选项措辞可能与原卷有出入；"
            "选择题答案键已与来源页逐题核对，但不作为考频校准依据"
        )
    if year in SCANNED_YEARS:
        warnings.append("答案解析来自扫描件 OCR，公式/图表可能失真，已附原版答案页供校对")
    if explanations < len(items) * 0.9:
        warnings.append(f"逐题解析覆盖 {explanations}/{len(items)}，缺口以原版答案页为准")
    if year in EARLY_YEARS:
        warnings.append("考点为关键词规则草稿标注，不参与考频校准与题集分类")
    return {
        "edition": edition,
        "edition_label": data.get("edition_label") or EDITION_LABEL[edition],
        "quality": quality,
        "confidence": data.get("confidence") or ("medium" if edition == "recall" else "high"),
        "annotation": cls,
        "excluded_from_stats": excluded,
        "source_url": data.get("source_url"),
        "source_note": data.get("source_note"),
        "warning": "；".join(warnings),
        "verification": data.get("verification"),
        "answer_keys": answer_keys,
        "explanations": explanations,
        "page_images": len(images),
    }


def slim_item(it: dict) -> dict:
    ans = it.get("answer")
    exp = it.get("explanation")
    # 2026 回忆版把大题参考答案塞在 answer 里，统一挪到解析区展示
    if isinstance(ans, str) and len(ans) > 24:
        exp = exp or ans
        ans = None
    meta = it.get("answer_meta") or {}
    return {
        "n": it["n"],
        "kind": it["kind"],
        "book": it.get("book"),
        "book_name": it.get("book_name"),
        "points": it.get("points"),
        "stem": it.get("stem") or "",
        "options": it.get("options"),
        "kps": it.get("kps") or [],
        "answer": ans,
        "explanation": exp,
        "answer_meta": {
            "method": meta.get("method"),
            "quality": meta.get("quality"),
            "note": meta.get("note"),
            "page_images": meta.get("page_images"),
        }
        if meta
        else None,
    }


def main() -> None:
    years: list[int] = []
    papers_meta: list[dict] = []
    all_kps: Counter[str] = Counter()
    big_primary: Counter[str] = Counter()
    years_hit: dict[str, set[int]] = defaultdict(set)
    approx_pts: Counter[str] = Counter()
    kind_count: Counter[str] = Counter()

    PUBLIC.mkdir(parents=True, exist_ok=True)

    for path in sorted(SRC.glob("2*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        year = int(data["year"])
        years.append(year)
        items = [slim_item(it) for it in data.get("items") or []]
        meta = paper_meta(year, data, items)
        slim = {
            "year": year,
            "subject": "cs408",
            "title": data.get("title")
            or f"{year}年全国硕士研究生入学考试计算机学科专业基础综合",
            "counts": data.get("counts")
            or {
                "total": len(items),
                "mcq": sum(1 for x in items if x["kind"] == "mcq"),
                "big": sum(1 for x in items if x["kind"] == "big"),
            },
            "meta": meta,
            "items": items,
        }
        out = PUBLIC / f"{year}.json"
        out.write_text(
            json.dumps(slim, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        papers_meta.append(
            {
                "year": year,
                "file": f"{year}.json",
                "total": slim["counts"].get("total", len(items)),
                "mcq": slim["counts"].get("mcq", 0),
                "big": slim["counts"].get("big", 0),
                **meta,
            }
        )

        for it in data.get("items") or []:
            kind_count[it.get("kind") or "?"] += 1
            # 考频校准只采信 2012-2025 重构卷的 LLM 多标签：
            # 2009-2011 为关键词规则草稿、2026 为考后回忆版，计入都会稀释
            # freq / bigWeight（题目本身仍完整进入前端，可练可看解析）。
            if (it.get("kps_meta") or {}).get("method") != "llm":
                continue
            if year in RECALL_YEARS:
                continue
            pts = it.get("points") or (2 if it.get("kind") == "mcq" else 10)
            for k in it.get("kps") or []:
                kid = k.get("id")
                if not kid:
                    continue
                all_kps[kid] += 1
                years_hit[kid].add(year)
                approx_pts[kid] += int(pts)
                if it.get("kind") == "big" and k.get("role") == "primary":
                    big_primary[kid] += 1

        print(f"  wrote {out.relative_to(ROOT)} ({len(items)} items)")

    index = {
        "subject": "cs408",
        "years": years,
        "paper_count": len(years),
        "papers": papers_meta,
        "data_ver": DATA_VER,
        "notes": (
            "由 scripts/gen_cs408_frontend.py 从 papers/cs408 生成；"
            "meta 记录每套卷的版本（回忆版/早期合订本/重构版）、质量、答案与解析覆盖；"
            "考频校准只采信 2012-2025 的 LLM 多标签，2009-2011 规则草稿与 2026 回忆版不参与"
        ),
    }
    (PUBLIC / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # 考频 TS 模块
    rows: list[dict] = []
    for kid, count in sorted(all_kps.items(), key=lambda x: (-x[1], x[0])):
        ys = len(years_hit[kid])
        bp = int(big_primary[kid])
        rows.append(
            {
                "id": kid,
                "count": int(count),
                "yearSpan": ys,
                "asBigPrimary": bp,
                "approxPoints": int(approx_pts[kid]),
                "freq": to_freq(count, ys),
                "bigWeight": to_big_weight(bp, count),
            }
        )

    lines = [
        "// 由 scripts/gen_cs408_frontend.py 自动生成，勿手改。",
        "// 数据源：papers/cs408/*.json；考频只统计 2012-2025 重构卷的 LLM 多标签标注。",
        "// 2009-2011 规则草稿、2026 考后回忆版题目可练可看解析，但不参与 freq / bigWeight 校准。",
        "export interface Cs408KpExamStat {",
        "  count: number;",
        "  yearSpan: number;",
        "  asBigPrimary: number;",
        "  approxPoints: number;",
        "  /** 校准后的考频 1–5 */",
        "  freq: number;",
        "  /** 校准后的大题权重 0–1 */",
        "  bigWeight: number;",
        "}",
        "",
        f"export const CS408_EXAM_PAPER_COUNT = {len(years)};",
        f"export const CS408_EXAM_YEARS = {json.dumps(years)} as const;",
        "",
        "export const CS408_KP_STATS: Record<string, Cs408KpExamStat> = {",
    ]
    for r in rows:
        lines.append(
            f'  "{r["id"]}": {{ count: {r["count"]}, yearSpan: {r["yearSpan"]}, '
            f'asBigPrimary: {r["asBigPrimary"]}, approxPoints: {r["approxPoints"]}, '
            f'freq: {r["freq"]}, bigWeight: {r["bigWeight"]} }},'
        )
    lines.append("};")
    lines.append("")
    lines.append("/** 按实测考频覆盖图谱先验 freq / bigWeight */")
    lines.append(
        "export function applyCs408ExamStats<T extends { id: string; freq: number; bigWeight: number }>(kp: T): T {"
    )
    lines.append("  const s = CS408_KP_STATS[kp.id];")
    lines.append("  if (!s) return kp;")
    lines.append("  return { ...kp, freq: s.freq, bigWeight: s.bigWeight };")
    lines.append("}")
    lines.append("")

    STATS_TS.parent.mkdir(parents=True, exist_ok=True)
    STATS_TS.write_text("\n".join(lines), encoding="utf-8")

    print(f"wrote {PUBLIC.relative_to(ROOT)}/index.json ({len(years)} years)")
    print(f"wrote {STATS_TS.relative_to(ROOT)} ({len(rows)} kps)")
    print(f"item kinds: {dict(kind_count)}")
    print("top5 big primary:", big_primary.most_common(5))


if __name__ == "__main__":
    main()
