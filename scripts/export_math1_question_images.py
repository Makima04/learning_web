#!/usr/bin/env python3
"""数学一原卷/详解 → 逐题图片；跨页题拼接，公式和图形保留原排版。"""
import json
from pathlib import Path
import re

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/math/exams/math1"
SECTIONS = {"选择题", "填空题", "解答题"}


def question_regions(doc, answers=False):
    """按 PDF 的阅读顺序分组，再用整组公式的最高点确定裁切边界。"""
    regions = {}
    current = None
    for p in range(1, len(doc)):  # 第一页是来源封面
        groups = []
        group = None
        section_top = None
        for block in doc[p].get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = "".join(s["text"] for s in line["spans"]).strip()
                box = fitz.Rect(line["bbox"])
                if box.y0 < 55 or box.y0 > 790:
                    continue  # 页眉、页脚
                if text in SECTIONS:
                    section_top = box.y0
                    continue
                pattern = r"第\s*(\d+)\s*题" if answers else r"(\d+)\."
                match = re.fullmatch(pattern, text)
                if match and abs(box.x0 - 79.37) < .5:
                    current = int(match[1])
                    group = {"n": current, "top": box.y0, "bottom": box.y1, "section": section_top}
                    groups.append(group)
                    section_top = None
                elif group is None and current is not None:
                    group = {"n": current, "top": box.y0, "bottom": box.y1, "section": None}
                    groups.append(group)
                if group is not None:
                    group["top"] = min(group["top"], box.y0)
                    group["bottom"] = max(group["bottom"], box.y1)
        for i, group in enumerate(groups):
            end = 792
            if i + 1 < len(groups):
                following = groups[i + 1]
                end = min(following["top"], following["section"] or 792) - 1
            assert end > group["top"], (p, group)
            assert end >= group["bottom"], (p, group, "裁切边界截断公式")
            regions.setdefault(group["n"], []).append((p, (65, group["top"] - 4, 530, end)))
    return regions


def render_question(doc, regions, target):
    pieces = []
    for page, clip in regions:
        pix = doc[page].get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=fitz.Rect(clip), alpha=False)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        # 只裁上下空白；各页保持同一比例、宽度，不把短公式放大。
        ink = ImageChops.difference(image, Image.new("RGB", image.size, "white")).convert("L")
        bbox = ink.point(lambda v: 255 if v > 35 else 0).getbbox()
        assert bbox, (target, page)
        image = image.crop((0, max(0, bbox[1] - 10), image.width, min(image.height, bbox[3] + 10)))
        pieces.append(image)
    width = max(image.width for image in pieces)
    combined = Image.new("RGB", (width, sum(image.height for image in pieces) + 20 * (len(pieces) - 1)), "white")
    y = 0
    for image in pieces:
        combined.paste(image, (0, y))
        y += image.height + 20
    temporary = target.with_suffix(".tmp.webp")
    combined.save(temporary, "WEBP", quality=92, method=6)
    temporary.replace(target)


def export_all(items):
    count = 0
    for year in sorted({q["year"] for q in items}):
        questions = [q for q in items if q["year"] == year]
        target = PUBLIC / "questions" / str(year)
        target.mkdir(parents=True, exist_ok=True)
        for answers in [False, True]:
            path = PUBLIC / (f"answers/{year}-answer.pdf" if answers else f"{year}.pdf")
            with fitz.open(path) as doc:
                regions = question_regions(doc, answers)
                assert sorted(regions) == sorted(q["n"] for q in questions), (path, sorted(regions))
                for q in questions:
                    assert regions[q["n"]][0][0] + 1 == q["answerPage" if answers else "paperPage"], (path, q["n"])
                    suffix = "-answer" if answers else ""
                    render_question(doc, regions[q["n"]], target / f"q{q['n']}{suffix}.webp")
                    count += 1
    print(f"生成 {count} 张数学一逐题题面/解析图片")


if __name__ == "__main__":
    export_all(json.loads((ROOT / "frontend/src/data/kg/math1Questions.json").read_text())["items"])
