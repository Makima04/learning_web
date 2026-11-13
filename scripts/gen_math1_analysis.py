#!/usr/bin/env python3
"""归档 PDF + 来源逐题元数据 → 数学一题型分析、网页 PDF 与逐题图片。"""
import hashlib
import argparse
import json
from pathlib import Path
import re
import shutil

import fitz
from export_math1_question_images import export_all, question_regions

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "papers/math/math1"
CONFIG = ROOT / "scripts/math1_topic_mapping.json"
REVIEW = ROOT / "scripts/math1_question_review.json"
OUTPUT = ROOT / "frontend/src/data/kg/math1Questions.json"
FACETS = ROOT / "frontend/src/data/kg/math1ReviewFacets.json"
REPORT = ROOT / "docs/math1-question-review.md"
PUBLIC = ROOT / "frontend/public/math/exams/math1"


def question_pages(path, answers=False):
    pages = {}
    with fitz.open(path) as doc:
        for p, page in enumerate(doc):
            if p == 0:
                continue
            if answers:
                for n in re.findall(r"第\s*(\d+)\s*题", page.get_text()):
                    pages.setdefault(int(n), p + 1)
            else:
                for block in page.get_text("dict")["blocks"]:
                    for line in block.get("lines", []):
                        label = "".join(s["text"] for s in line["spans"]).strip()
                        if (m := re.fullmatch(r"(\d+)\.", label)) and abs(line["bbox"][0] - 79.37) < .5:
                            pages.setdefault(int(m[1]), p + 1)
    return pages


def build_report(items, review, kp_names):
    """可逐行核查的完整题单；统计与网页使用同一份生成结果。"""
    lines = ["# 数学一 2009—2026 逐题分类复核", "", review["reviewMethod"], "",
             f"版本：`{review['version']}`；共 {len(items)} 题，18 年，每年 150 分，共 2700 分。", "",
             "- 考频：" + review["frequencyPolicy"], "- 分值：" + review["pointsPolicy"],
             "- 原题为社区重排版；来源与文件哈希见 `scripts/math1_exam_sources.json`、`scripts/math1_question_review.json`。",
             "- 下表的分值是整题分值，不能累加到每个辅助考点。考法可能是不同可行解法，不表示每种解法都必须使用。", "",
             "## 分年完整性", "", "| 年份 | 选择 | 填空 | 大题 | 总题数 | 总分 |", "|---|---:|---:|---:|---:|---:|"]
    for year in range(2009, 2027):
        qs = [q for q in items if q["year"] == year]
        counts = [sum(q["kind"] == kind for q in qs) for kind in ["mcq", "fill", "big"]]
        lines.append(f"| {year} | {' | '.join(map(str, counts))} | {len(qs)} | {sum(q['points'] for q in qs)} |")
    lines += ["", "## 考点考查统计（包含辅助考点，按年份去重）", "",
              "| 考点 | 题数 | 2009—2026 年份数 | 2022—2026 年份 | 主标签归属分值 |",
              "|---|---:|---:|---|---:|"]
    for kp in sorted({kp for q in items for kp in [q["kpId"], *q["secondaryKpIds"]]}):
        qs = [q for q in items if kp in [q["kpId"], *q["secondaryKpIds"]]]
        recent = sorted({q["year"] for q in qs if q["year"] >= 2022})
        lines.append(f"| {kp_names[kp]} `{kp}` | {len(qs)} | {len({q['year'] for q in qs})} | {', '.join(map(str, recent)) or '无'} | {sum(q['points'] for q in qs if q['kpId'] == kp)} |")
    for year in range(2009, 2027):
        lines += ["", f"## {year} 年逐题记录", "", "| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |",
                  "|---|---|---|---|---|---|"]
        for q in [q for q in items if q["year"] == year]:
            kind = {"mcq": "选择", "fill": "填空", "big": "大题"}[q["kind"]]
            secondary = "、".join(kp_names[kp] for kp in q["secondaryKpIds"]) or "—"
            base = "../frontend/public/math/exams/math1"
            links = f"[原题]({base}/{year}.pdf#page={q['paperPage']}) / [解析]({base}/answers/{year}-answer.pdf#page={q['answerPage']})"
            lines.append(f"| {q['n']} | {kind} / {q['points']} | {kp_names[q['kpId']]} | {secondary} | {q['reviewReason']} | {links} |")
    REPORT.write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-only", action="store_true", help="只更新分类、考法及审计表，不重复导出未改变的 PDF/图片")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())
    review = json.loads(REVIEW.read_text())
    assert review["schemaVersion"] == 1, "逐题复核格式不支持"
    kp_names = dict(re.findall(r'id: "([^"]+)", name: "([^"]+)"', (ROOT / "frontend/src/data/kg/math.ts").read_text()))
    known_facets = set(re.findall(r'id: "([^"]+)"', (ROOT / "frontend/src/lib/kg/mathPractice.ts").read_text())) | review["facetNames"].keys()
    source_manifest = json.loads((ROOT / "scripts/math1_exam_sources.json").read_text())
    ref_path = ARCHIVE / ".sources/answers-reference.json"
    expected = next(r["sha256"] for r in source_manifest["resources"] if r["id"] == "answers-reference")
    assert hashlib.sha256(ref_path.read_bytes()).hexdigest() == expected, "来源元数据校验失败"
    reference = json.loads(ref_path.read_text())
    archive_index = {p["year"]: p for p in json.loads((ARCHIVE / "index.json").read_text())["papers"]}
    mapping = config["mapping"]
    items = []
    expected_keys = {f"{year}-{n}" for year in range(2009, 2027) for n in range(1, 24 if year <= 2020 else 23)}
    assert set(review["questions"]) == expected_keys, "逐题复核必须完整覆盖408题，不允许缺题或额外题号"
    for year in range(2009, 2027):
        paper = ARCHIVE / f"{year}.pdf"
        answers = ARCHIVE / f"answers/{year}-answer.pdf"
        for path, key in [(paper, "paper"), (answers, "answers")]:
            assert hashlib.sha256(path.read_bytes()).hexdigest() == archive_index[year][key]["sha256"], f"归档文件已改变：{path}"
            reviewed_hash = review["sources"][str(year)]["paperSha256" if key == "paper" else "answerSha256"]
            assert reviewed_hash == archive_index[year][key]["sha256"], f"复核依据已过期：{path}"
        with fitz.open(paper) as doc:
            regions = question_regions(doc)
            question_hashes = {n: hashlib.sha256(re.sub(r"\s+", " ", " ".join(
                doc[p].get_text(clip=fitz.Rect(clip)) for p, clip in clips)).encode()).hexdigest()
                for n, clips in regions.items()}
        paper_pages = question_pages(paper)
        answer_pages = question_pages(answers, answers=True)
        rows = [
            {"n": int(q["index"]), "points": q["score"], "label": q["knowledge_point"], "sourceType": q["type"]}
            for q in reference.values()
            if int(q["paper"]) == year
        ] if year < 2026 else config["extra2026"]
        mcq_end, fill_end = (8, 14) if year <= 2020 else (10, 16)
        assert sorted(q["n"] for q in rows) == list(range(1, 24 if year <= 2020 else 23)), year
        assert sum(q["points"] for q in rows) == 150, year
        type_totals = {"mcq": [0, 0], "fill": [0, 0], "big": [0, 0]}
        for row in sorted(rows, key=lambda q: q["n"]):
            meta = review["questions"][f"{year}-{row['n']}"]
            kp = meta["kpId"]
            assert kp in kp_names and all(s in kp_names for s in meta["secondaryKpIds"]), (year, row["n"], "未知考点")
            assert kp not in meta["secondaryKpIds"] and len(set(meta["secondaryKpIds"])) == len(meta["secondaryKpIds"]), (year, row["n"], "重复考点")
            assert meta["facets"] and set(meta["facets"]) <= known_facets, (year, row["n"], "未知考法")
            assert meta["reason"].strip(), (year, row["n"], "缺少复核依据")
            assert meta["questionTextSha256"] == question_hashes[row["n"]], (year, row["n"], "复核题干已改变")
            assert meta["paperPage"] == paper_pages[row["n"]] and meta["answerPage"] == answer_pages[row["n"]], (year, row["n"], "复核页码不一致")
            kind = "mcq" if row["n"] <= mcq_end else "fill" if row["n"] <= fill_end else "big"
            if "sourceType" in row:
                assert row["sourceType"] == {"mcq": 1, "fill": 2, "big": 3}[kind], (year, row)
            type_totals[kind][0] += 1
            type_totals[kind][1] += row["points"]
            items.append({
                "id": f"math1-{year}-q{row['n']}", "year": year, "n": row["n"],
                "kind": kind, "points": row["points"], "sourceLabel": row["label"],
                "kpId": kp, "book": "calc" if kp.startswith("calc.") else "linear" if kp.startswith("la.") else "prob",
                "secondaryKpIds": meta["secondaryKpIds"],
                "facets": meta["facets"], "cost": mapping[row["label"]]["cost"],
                "paperPage": paper_pages[row["n"]], "answerPage": answer_pages[row["n"]],
                "classification": "question_reviewed", "reviewReason": meta["reason"],
                "questionTextSha256": meta["questionTextSha256"],
                "note": row.get("note", ""),
            })
        assert type_totals == ({"mcq": [8, 32], "fill": [6, 24], "big": [9, 94]}
                               if year <= 2020 else {"mcq": [10, 50], "fill": [6, 30], "big": [6, 70]}), year
        if not args.metadata_only:
            target = PUBLIC / "answers"
            target.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(paper, PUBLIC / paper.name)
            shutil.copyfile(answers, target / answers.name)
    assert len(items) == 408
    data = {
        "version": review["version"], "years": list(range(2009, 2027)), "includeSecondary": True,
        "recentStart": 2022, "items": items,
        "classificationNote": "2009—2026 全部408题已按题干逐题重新分类（AI复核，可继续纠正）。考查年份包含主考点与辅助考点，同年去重；占分仅按唯一主考点归属，不等于辅助知识的实际得分。",
        "costNote": "补齐成本是人工设定的相对档位（1—3），不是实测学习时长或预计提分。",
        "sources": source_manifest["resources"],
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    FACETS.write_text(json.dumps(review["facetNames"], ensure_ascii=False, indent=2) + "\n")
    build_report(items, review, kp_names)
    if not args.metadata_only:
        export_all(items)
    print(f"生成 {len(items)} 道逐题分类（选择 156 / 填空 108 / 大题 144）、考法及完整审计表：{OUTPUT}")


if __name__ == "__main__":
    main()
