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


def slim_item(it: dict) -> dict:
    return {
        "n": it["n"],
        "kind": it["kind"],
        "book": it.get("book"),
        "book_name": it.get("book_name"),
        "points": it.get("points"),
        "stem": it.get("stem") or "",
        "options": it.get("options"),
        "kps": it.get("kps") or [],
        "answer": it.get("answer"),
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
            }
        )

        for it in data.get("items") or []:
            kind_count[it.get("kind") or "?"] += 1
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
        "notes": "由 scripts/gen_cs408_frontend.py 从 papers/cs408 生成；考点为 LLM 多标签。",
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
        "// 数据源：papers/cs408/*.json（LLM 标注 kps）",
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
