#!/usr/bin/env python3
"""归档 PDF + 来源逐题元数据 → 数学一题型分析、网页 PDF 与逐题图片。"""
import hashlib
import json
from pathlib import Path
import re
import shutil

import fitz
from export_math1_question_images import export_all

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "papers/math/math1"
CONFIG = ROOT / "scripts/math1_topic_mapping.json"
OUTPUT = ROOT / "frontend/src/data/kg/math1Questions.json"
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


def main():
    config = json.loads(CONFIG.read_text())
    source_manifest = json.loads((ROOT / "scripts/math1_exam_sources.json").read_text())
    ref_path = ARCHIVE / ".sources/answers-reference.json"
    expected = next(r["sha256"] for r in source_manifest["resources"] if r["id"] == "answers-reference")
    assert hashlib.sha256(ref_path.read_bytes()).hexdigest() == expected, "来源元数据校验失败"
    reference = json.loads(ref_path.read_text())
    archive_index = {p["year"]: p for p in json.loads((ARCHIVE / "index.json").read_text())["papers"]}
    mapping = config["mapping"]
    items = []
    for year in range(2009, 2027):
        paper = ARCHIVE / f"{year}.pdf"
        answers = ARCHIVE / f"answers/{year}-answer.pdf"
        for path, key in [(paper, "paper"), (answers, "answers")]:
            assert hashlib.sha256(path.read_bytes()).hexdigest() == archive_index[year][key]["sha256"], f"归档文件已改变：{path}"
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
            meta = {**mapping[row["label"]], **config.get("overrides", {}).get(f"{year}-{row['n']}", {})}
            kp = meta["kpId"]
            kind = "mcq" if row["n"] <= mcq_end else "fill" if row["n"] <= fill_end else "big"
            if "sourceType" in row:
                assert row["sourceType"] == {"mcq": 1, "fill": 2, "big": 3}[kind], (year, row)
            type_totals[kind][0] += 1
            type_totals[kind][1] += row["points"]
            items.append({
                "id": f"math1-{year}-q{row['n']}", "year": year, "n": row["n"],
                "kind": kind, "points": row["points"], "sourceLabel": row["label"],
                "kpId": kp, "book": "calc" if kp.startswith("calc.") else "linear" if kp.startswith("la.") else "prob",
                "secondaryKpIds": row.get("secondaryKpIds", []),
                "facets": row.get("facets", meta["facets"]), "cost": meta["cost"],
                "paperPage": paper_pages[row["n"]], "answerPage": answer_pages[row["n"]],
                "classification": "source_mapped" if year < 2026 else "source_read",
                "note": row.get("note", meta.get("note", "")),
            })
        assert type_totals == ({"mcq": [8, 32], "fill": [6, 24], "big": [9, 94]}
                               if year <= 2020 else {"mcq": [10, 50], "fill": [6, 30], "big": [6, 70]}), year
        target = PUBLIC / "answers"
        target.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(paper, PUBLIC / paper.name)
        shutil.copyfile(answers, target / answers.name)
    assert len(items) == 408
    data = {
        "version": config["version"], "years": list(range(2009, 2027)),
        "recentStart": 2022, "items": items,
        "classificationNote": "2009—2025 使用公开题库的主考点标签映射到图谱；2026 按原题与解析补充分类。全部分类为首版待逐题复核，未据此统计辅助考点频率。",
        "costNote": "补齐成本是人工设定的相对档位（1—3），不是实测学习时长或预计提分。",
        "sources": source_manifest["resources"],
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    export_all(items)
    print(f"生成 {len(items)} 道题（选择 156 / 填空 108 / 大题 144）与 36 份网页 PDF：{OUTPUT}")


if __name__ == "__main__":
    main()
