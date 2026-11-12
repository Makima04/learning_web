#!/usr/bin/env python3
"""从王道 408 做题本生成完整题面，保留图、表格、公式与所有小问。

用法：.venv/bin/python3 scripts/export_wangdao_images.py --book os --pdf /path/计算机操作系统大题.pdf
计组留空版使用 --layout compact，按原页题号切分同页多题。
随后运行 scripts/apply_wangdao_overlay.py 重建完整目录与分片。
原 PDF 不入库，逐题页码、裁切框和图片摘要保存在 wangdao_question_images.json。
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from pathlib import Path

import fitz
from PIL import Image, ImageChops
from ocrmac import ocrmac

from wangdao_images import IMAGE_MANIFEST, ROOT

PUBLIC = ROOT / "frontend/public"
OUT = PUBLIC / "cs408/img/wangdao"
MARKER = re.compile(r"(\d+)\s*[.．、]\s*[【\[]\s*[Pp]\s*(\d+)")
# 原 OCR 目录把 P155 读成了 P15；原图已人工核对。保留旧值供重建时验证。
ANSWER_PAGE_CORRECTIONS = {"co-big-4.1-1": (15, 155)}


def page_image(page: fitz.Page) -> Image.Image:
    # 渲染完整页面，保留 PDF 叠加的文字/矢量内容，而非只抽其中一张位图。
    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def crop_question(image: Image.Image) -> tuple[Image.Image, list[int]]:
    width, height = image.size
    # 单题版的固定页眉/页码在正文之外；只裁外围留白，不按 OCR 框裁图，避免漏掉图形。
    area = (0, int(height * .075), width, int(height * .925))
    body = image.crop(area)
    ink = ImageChops.difference(body, Image.new("RGB", body.size, "white")).convert("L")
    bbox = ink.point(lambda value: 255 if value > 65 else 0).getbbox()
    if bbox is None:
        raise ValueError("题面为空")
    pad = 24
    box = [max(area[0], area[0] + bbox[0] - pad), max(area[1], area[1] + bbox[1] - pad),
           min(area[2], area[0] + bbox[2] + pad), min(area[3], area[1] + bbox[3] + pad)]
    return image.crop(box), box


def verify_question(image: Image.Image, question: dict) -> None:
    # 与目录书签推导出的题号、现有题库的原书答案页交叉核验，防止错配 PDF 版本。
    header = image.crop((0, 0, image.width, min(image.height, 420)))
    expected = (str(question["qno"]), str(question["book_ans_page"]))
    for width in (1600, image.width):
        probe = header.copy()
        probe.thumbnail((width, 800))
        anns = ocrmac.OCR(probe, language_preference=["zh-Hans", "en-US"]).recognize()
        text = " ".join(text for text, _confidence, _box in anns)
        if expected in MARKER.findall(text):
            return
    raise ValueError(f"{question['id']}: 题号/原书答案页核验失败，预期 {expected}，识别到 {text!r}")


def single_page_plan(doc: fitz.Document, book: str, questions: dict) -> list[tuple[str, int, list[int] | None]]:
    sections = [(re.match(r"(\d+\.\d+)", title).group(1), page)
                for _level, title, page in doc.get_toc() if re.match(r"\d+\.\d+", title)]
    if not sections:
        raise ValueError("PDF 缺少小节书签")
    plan = []
    for i, (section, start) in enumerate(sections):
        end = sections[i + 1][1] if i + 1 < len(sections) else len(doc) + 1
        for page_no in range(start, end):
            qid = f"{book}-big-{section}-{page_no - start + 1}"
            if qid not in questions:
                raise ValueError(f"{qid}: 单题版页序与现有题库不符")
            plan.append((qid, page_no, None))
    return plan


def compact_plan(doc: fitz.Document, book: str, digest: str) -> list[tuple[str, int, list[int], int]]:
    """识别整页的题号和正文小节标题，避免页眉先切到下一节而把上节末题错配。"""
    sections = [(re.match(r"(\d+\.\d+)", title).group(1), page)
                for _level, title, page in doc.get_toc() if re.match(r"\d+\.\d+", title)]
    cache = ROOT / "tmp/wangdao-ocr" / digest
    cache.mkdir(parents=True, exist_ok=True)
    current = sections[0][0]
    plan = []
    for page_no in range(sections[0][1], len(doc) + 1):
        page = doc[page_no - 1]
        width, height = int(page.rect.width), int(page.rect.height)
        ck = cache / f"{page_no}.json"
        if ck.exists():
            anns = json.loads(ck.read_text(encoding="utf-8"))
        else:
            image = page_image(page)
            image.thumbnail((1600, 2400))
            anns = ocrmac.OCR(image, language_preference=["zh-Hans", "en-US"]).recognize()
            ck.write_text(json.dumps(anns, ensure_ascii=False), encoding="utf-8")
        starts, boundaries = [], []
        for text, _confidence, (x, y, w, h) in sorted(anns, key=lambda a: -(a[2][1] + a[2][3])):
            top = round((1 - y - h) * height)
            if not int(height * .075) <= top < int(height * .925):
                continue
            section = re.match(r"^(\d+\.\d+)", text)
            if section and section.group(1) in {s for s, _ in sections} and x < .2:
                current = section.group(1)
                boundaries.append(top - 12)
            marker = MARKER.match(text.strip())
            if marker:
                qno, ans = map(int, marker.groups())
                qid = f"{book}-big-{current}-{qno}"
                starts.append((qid, top - 12, ans))
                boundaries.append(top - 12)
        if not starts:
            raise ValueError(f"p.{page_no}: 未识别到题号，需核对续页后再导出")
        for qid, top, ans in starts:
            bottom = min((y for y in boundaries if y > top), default=int(height * .925))
            plan.append((qid, page_no, [0, top, width, bottom], ans))
    return plan


def export(pdf: Path, book: str = "ds", layout: str = "single") -> None:
    catalog = json.loads((PUBLIC / "cs408/wangdao2027.json").read_text(encoding="utf-8"))
    questions = {q["id"]: q for q in catalog if q["book"] == book and q["kind"] == "big"}
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    manifest = json.loads(IMAGE_MANIFEST.read_text(encoding="utf-8"))
    if "sources" not in manifest:
        manifest["sources"] = {"ds": {"source": manifest.pop("source"), "source_sha256": manifest.pop("source_sha256"), "layout": "single"}}
    exported = {}
    OUT.mkdir(parents=True, exist_ok=True)
    with fitz.open(pdf) as doc:
        plan = compact_plan(doc, book, digest) if layout == "compact" else single_page_plan(doc, book, questions)
        missing = set(questions) - {entry[0] for entry in plan}
        if missing:
            raise ValueError(f"PDF 未覆盖题目：{sorted(missing)}")
        if len({entry[0] for entry in plan}) != len(plan):
            raise ValueError("PDF 题号重复，需核对小节边界")
        unindexed = []
        for n, entry in enumerate(plan, 1):
            qid, page_no, region = entry[:3]
            if qid not in questions:
                unindexed.append(qid)
                continue
            original = questions[qid]["book_ans_page"]
            expected = ANSWER_PAGE_CORRECTIONS.get(qid, (original, original))[1]
            image = page_image(doc[page_no - 1])
            if region:
                if entry[3] != expected:
                    raise ValueError(f"{qid}: 原书答案页应为 P{expected}，实际识别到 P{entry[3]}")
                body = image.crop(tuple(region))
                ink = ImageChops.difference(body, Image.new("RGB", body.size, "white")).convert("L")
                bbox = ink.point(lambda value: 255 if value > 65 else 0).getbbox()
                if bbox is None:
                    raise ValueError(f"{qid}: 题面为空")
                box = [max(0, bbox[0] - 24), max(region[1], region[1] + bbox[1] - 24),
                       min(image.width, bbox[2] + 24), min(region[3], region[1] + bbox[3] + 24)]
                cropped = image.crop(tuple(box))
            else:
                cropped, box = crop_question(image)
            verify_question(cropped, {**questions[qid], "book_ans_page": expected})
            buf = io.BytesIO()
            cropped.save(buf, format="WEBP", quality=92, method=6)
            data = buf.getvalue()
            path = OUT / f"{qid}.webp"
            path.write_bytes(data)
            exported[qid] = {
                "img": "/" + path.relative_to(PUBLIC).as_posix(),
                "pdf_page": page_no,
                "book_ans_page": expected,
                "pdf_edition": "留空" if layout == "compact" else "单题",
                "crop": box,
                "width": cropped.width,
                "height": cropped.height,
                "sha256": hashlib.sha256(data).hexdigest(),
            }
            if qid in ANSWER_PAGE_CORRECTIONS:
                exported[qid]["previous_book_ans_page"] = ANSWER_PAGE_CORRECTIONS[qid][0]
            if n % 10 == 0 or n == len(plan):
                print(f"{book}: 已核验并导出 {len(exported)}/{len(questions)} 道题", flush=True)
    if set(exported) != set(questions):
        raise ValueError("导出未覆盖完整题库")
    manifest["items"] = {qid: item for qid, item in manifest["items"].items() if not qid.startswith(f"{book}-big-")}
    manifest["items"].update(exported)
    manifest["sources"][book] = {"source": pdf.name, "source_sha256": digest, "layout": layout,
                                   "unindexed_questions": unindexed}
    # 全部核验成功后再更新映射；中途失败不会让目录引用未经验证的图片。
    IMAGE_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", choices=["ds", "os", "co", "cn"], required=True)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--layout", choices=["single", "compact"], default="single")
    args = parser.parse_args()
    export(args.pdf, args.book, args.layout)
