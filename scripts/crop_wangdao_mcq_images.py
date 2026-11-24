#!/usr/bin/env python3
"""从 27 王道【选择题】做题本（【平板】.pdf，一页一题）精确裁切带图/带表/OCR 残缺选择题原图。

页码映射：
- 每科【平板】.pdf 均为「2 页封面/目录 + 按章节与题号 (1..max_qno) 顺序一页一题」。
- 经校验四科总页数与章节题号序列 100% 精确对齐（cn=566, os=652, co=606, ds=643）。
- 裁掉顶部页眉（公众号/分隔线）和底部页码，自动按非白区域紧致裁边并留白，输出为 WebP。
- 回写 wangdao2027.json 的 img 字段，并自动运行 split_practice_catalogs.py 重新分片。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "frontend" / "public" / "cs408" / "wangdao2027.json"
OUT_IMG_DIR = ROOT / "frontend" / "public" / "cs408" / "img" / "wangdao"
PDF_BASE = Path("/Users/makima/Downloads/27王道【选择题】做题本")

BOOK_FOLDERS = {
    "cn": "计网",
    "os": "操作系统",
    "co": "计组",
    "ds": "数据结构",
}

FIG_RE = re.compile(
    r"(如图|下图|上图|见图|右图|左图|所示|如下表|下表|上表|表\s*\d|图\s*\d|"
    r"拓扑|流程图|状态图|树形|如下代码|下列代码|程序段如下|以下程序|如下矩阵|如下二叉树|"
    r"如题|如下序列|下述图|该图|图中)"
)
GARBLE_RE = re.compile(r"[①②③④⑤⑥⑦⑧⑨⑩•€£¥]|微信公众号|改信公众号|研七七")


def needs_image(item: dict[str, Any]) -> bool:
    if item.get("kind") != "mcq":
        return False
    stem = item.get("stem") or ""
    if FIG_RE.search(stem):
        return True
    if GARBLE_RE.search(stem):
        return True
    opts = item.get("options") or {}
    if sum(1 for k in ("A", "B", "C", "D") if (opts.get(k) or "").strip()) < 4:
        return True
    return False


def sec_sort_key(sec: str) -> tuple[int, ...]:
    return tuple(int(p) for p in re.findall(r"\d+", sec))


def build_book_page_map(mcqs: list[tuple[int, dict[str, Any]]]) -> tuple[dict[tuple[str, int], int], int]:
    sec_max: dict[str, int] = {}
    for _, it in mcqs:
        s = str(it.get("section") or "").strip()
        q = int(it.get("qno") or 0)
        sec_max[s] = max(sec_max.get(s, 0), q)
    mapping: dict[tuple[str, int], int] = {}
    p = 2  # 前 2 页为封面与目录
    for s in sorted(sec_max.keys(), key=sec_sort_key):
        for q in range(1, sec_max[s] + 1):
            mapping[(s, q)] = p
            p += 1
    return mapping, p


def crop_question_webp(doc: fitz.Document, pno: int, out_path: Path) -> None:
    page = doc[pno]
    # 去掉顶部页眉（前 9.8%）和底部页码（后 7.5%）
    w, h = page.rect.width, page.rect.height
    clip = fitz.Rect(w * 0.04, h * 0.098, w * 0.96, h * 0.925)
    pix = page.get_pixmap(dpi=150, clip=clip)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    # 紧致裁剪纯白边缘，保留 24px 舒适留白
    bg = Image.new("RGB", img.size, (255, 255, 255))
    diff = ImageChops.difference(img, bg).convert("L")
    mask = diff.point(lambda p: 255 if p > 12 else 0)
    bbox = mask.getbbox()
    if bbox:
        pad = 24
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(img.width, bbox[2] + pad)
        y1 = min(img.height, bbox[3] + pad)
        img = img.crop((x0, y0, x1, y1))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="WEBP", quality=88, method=4)


def main() -> int:
    items: list[dict[str, Any]] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    matched_total = 0

    for bk, folder in BOOK_FOLDERS.items():
        pdf_path = PDF_BASE / folder / "【平板】.pdf"
        if not pdf_path.is_file():
            print(f"SKIP {bk}: missing {pdf_path}")
            continue
        doc = fitz.open(pdf_path)
        mcqs = [(i, it) for i, it in enumerate(items) if it.get("book") == bk and it.get("kind") == "mcq"]
        page_map, end_p = build_book_page_map(mcqs)
        if end_p != len(doc):
            print(f"WARNING {bk}: mapped_end={end_p} != pdf_pages={len(doc)}")
        targets = [(i, it) for i, it in mcqs if needs_image(it)]
        print(f"=== {bk}: cropping {len(targets)} MCQs (mapped_end={end_p}/{len(doc)}) ===", flush=True)

        bk_ok = 0
        for global_idx, it in targets:
            key = (str(it.get("section") or "").strip(), int(it.get("qno") or 0))
            pno = page_map.get(key)
            if pno is None or pno >= len(doc):
                print(f"  MISS {it['id']} key={key}")
                continue
            filename = f"{it['id']}.webp"
            out_path = OUT_IMG_DIR / filename
            crop_question_webp(doc, pno, out_path)
            items[global_idx]["img"] = f"/cs408/img/wangdao/{filename}"
            bk_ok += 1
            matched_total += 1
        print(f"  {bk} done: cropped {bk_ok}/{len(targets)}", flush=True)

    CATALOG_PATH.write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"TOTAL cropped: {matched_total}", flush=True)

    sys.path.insert(0, str(ROOT / "scripts"))
    from split_practice_catalogs import split_public_catalog
    split_public_catalog(CATALOG_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
