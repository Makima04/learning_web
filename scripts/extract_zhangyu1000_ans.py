#!/usr/bin/env python3
"""从 2027 张宇 1000 题数一《解析分册》OCR 题号、裁解析图，按 (part,subj,ch,qno) 挂到已有试题。"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import fitz
from ocrmac import ocrmac
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_zhangyu1000 import clips_to_pdf, render_page, slim_row, vision_top_frac
from math_img import render_clips

ROOT = Path("/Users/makima/program/web/english_web")
PDF = Path("/Users/makima/Downloads/27张宇1000题数一-解析册.pdf")
OUT_DIR = ROOT / "papers" / "math" / "zhangyu1000"
QUESTIONS_JSON = OUT_DIR / "questions.json"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "math" / "zhangyu1000.json"
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "zy-ans"
CACHE = Path("/tmp/zy1000_jiexi_ocr")

# 页脚印刷页码 + 6 = PDF 页码（封面 2 页 + 目录 3 页 + 空白 1 页）
PDF_OFFSET = 6
# 目录页码：综合篇测试卷一起跳过（试题册也没抽）
TEST_PRINTED = 517
LEFT_FRAC = 0.18

Q_RE = re.compile(r"^(\d{1,2})\s*[\.．、]\s*(.*)$")
Q_FLEX = re.compile(r"^(\d{1,2})\s*【(.*)$")
LETTER_RE = re.compile(r"【答案】\s*[（(]?\s*([A-D])\s*[）)]?")

# 解析册目录（印刷页码）→ 与试题册 part/subj/chapter 对齐
TOC: list[tuple[str, str, int, int]] = [
    ("base", "hs", 0, 3),
    ("base", "hs", 1, 8),
    ("base", "hs", 2, 14),
    ("base", "hs", 3, 17),
    ("base", "hs", 4, 22),
    ("base", "hs", 5, 27),
    ("base", "hs", 6, 35),
    ("base", "hs", 7, 42),
    ("base", "hs", 8, 43),
    ("base", "hs", 9, 53),
    ("base", "hs", 10, 69),
    ("base", "hs", 11, 75),
    ("base", "hs", 12, 80),
    ("base", "hs", 13, 83),
    ("base", "hs", 14, 91),
    ("base", "hs", 15, 99),
    ("base", "hs", 16, 105),
    ("base", "hs", 17, 112),
    ("base", "hs", 18, 116),
    ("base", "la", 1, 122),
    ("base", "la", 2, 127),
    ("base", "la", 3, 132),
    ("base", "la", 4, 137),
    ("base", "la", 5, 144),
    ("base", "la", 6, 156),
    ("base", "prob", 1, 173),
    ("base", "prob", 2, 177),
    ("base", "prob", 3, 180),
    ("base", "prob", 4, 188),
    ("base", "prob", 5, 197),
    ("base", "prob", 6, 200),
    ("hard", "hs", 1, 211),
    ("hard", "hs", 2, 223),
    ("hard", "hs", 3, 227),
    ("hard", "hs", 4, 235),
    ("hard", "hs", 5, 239),
    ("hard", "hs", 6, 253),
    ("hard", "hs", 7, 261),
    ("hard", "hs", 8, 262),
    ("hard", "hs", 9, 270),
    ("hard", "hs", 10, 279),
    ("hard", "hs", 11, 290),
    ("hard", "hs", 12, 294),
    ("hard", "hs", 13, 296),
    ("hard", "hs", 14, 312),
    ("hard", "hs", 15, 333),
    ("hard", "hs", 16, 348),
    ("hard", "hs", 17, 367),
    ("hard", "hs", 18, 373),
    ("hard", "la", 1, 389),
    ("hard", "la", 2, 394),
    ("hard", "la", 3, 395),
    ("hard", "la", 4, 399),
    ("hard", "la", 5, 402),
    ("hard", "la", 6, 412),
    ("hard", "la", 7, 417),
    ("hard", "la", 8, 421),
    ("hard", "la", 9, 434),
    ("hard", "prob", 1, 452),
    ("hard", "prob", 2, 455),
    ("hard", "prob", 3, 459),
    ("hard", "prob", 4, 463),
    ("hard", "prob", 5, 467),
    ("hard", "prob", 6, 476),
    ("hard", "prob", 7, 488),
    ("hard", "prob", 8, 490),
    ("hard", "prob", 9, 495),
]


def chapter_at(printed: int) -> tuple[str, str, int] | None:
    cur: tuple[str, str, int] | None = None
    for part, subj, ch, page in TOC:
        if page <= printed:
            cur = (part, subj, ch)
        else:
            break
    return cur


def looks_like_qhead(text: str) -> tuple[int, str] | None:
    t = text.strip()
    m = Q_RE.match(t)
    rest = ""
    n: int | None = None
    if m:
        n = int(m.group(1))
        rest = (m.group(2) or "").strip()
    else:
        m2 = Q_FLEX.match(t)
        if m2:
            n = int(m2.group(1))
            rest = ("【" + (m2.group(2) or "")).strip()
    if n is None or n < 1 or n > 80:
        return None
    hay = t + rest
    if "答" not in hay and "解析" not in hay and "【" not in hay:
        return None
    return n, rest


def detect_qnos_left(png_path: Path) -> list[dict]:
    img = Image.open(png_path)
    w, h = img.size
    left = img.crop((0, 0, max(8, int(w * LEFT_FRAC)), h))
    tmp = png_path.with_name(png_path.stem + ".left.png")
    left.save(tmp)
    try:
        anns = ocrmac.OCR(
            str(tmp), language_preference=["zh-Hans", "en-US"]
        ).recognize()
    finally:
        tmp.unlink(missing_ok=True)
    found: list[dict] = []
    for text, _conf, box in anns:
        parsed = looks_like_qhead(text)
        if not parsed:
            continue
        n, rest = parsed
        top, bot = vision_top_frac(box)
        if top < 0.04 or top > 0.94:
            continue
        found.append({"n": n, "top": top, "bot": bot, "rest": rest})
    found.sort(key=lambda x: x["top"])
    dedup: list[dict] = []
    for rec in found:
        if dedup and rec["n"] == dedup[-1]["n"] and rec["top"] - dedup[-1]["top"] < 0.03:
            continue
        dedup.append(rec)
    return dedup


def letter_of(rest: str) -> str | None:
    m = LETTER_RE.search(rest or "")
    return m.group(1) if m else None


def new_item(info: tuple[str, str, int], qno: int, page_no: int, rest: str) -> dict:
    part, subj, ch = info
    return {
        "part": part,
        "subj": subj,
        "chapter": ch,
        "qno": qno,
        "pdf_page": page_no,
        "answer": letter_of(rest),
        "_clips": [],
    }


def extract(force: bool = False, max_page: int | None = None) -> tuple[list[dict], fitz.Document]:
    doc = fitz.open(str(PDF))
    CACHE.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    pending: dict | None = None
    t0 = time.time()
    last_pdf = min(doc.page_count, TEST_PRINTED + PDF_OFFSET - 1)
    if max_page:
        last_pdf = min(last_pdf, max_page)

    for i in range(doc.page_count):
        page_no = i + 1
        if page_no > last_pdf:
            break
        printed = page_no - PDF_OFFSET
        info = chapter_at(printed) if printed >= 3 else None
        if info is None or printed >= TEST_PRINTED:
            if pending:
                items.append(pending)
                pending = None
            continue

        png = CACHE / f"p{page_no:03d}.png"
        qno_cache = CACHE / f"p{page_no:03d}.qnos.json"
        if force or not qno_cache.exists():
            render_page(doc[i], png)
            qnos = detect_qnos_left(png)
            qno_cache.write_text(json.dumps(qnos, ensure_ascii=False), encoding="utf-8")
            png.unlink(missing_ok=True)
        else:
            qnos = json.loads(qno_cache.read_text(encoding="utf-8"))

        if page_no % 40 == 0:
            print(
                f"  ocr p{page_no}/{last_pdf} ans={len(items)} {time.time()-t0:.0f}s",
                flush=True,
            )

        key = info
        if pending and (pending["part"], pending["subj"], pending["chapter"]) != key:
            items.append(pending)
            pending = None

        if not qnos:
            if pending:
                pending["_clips"].append((page_no, 0.07, 0.955))
            continue

        first_top = qnos[0]["top"]
        if pending and first_top > 0.10:
            pending["_clips"].append((page_no, 0.07, max(0.12, first_top - 0.004)))

        for j, rec in enumerate(qnos):
            next_rec = qnos[j + 1] if j + 1 < len(qnos) else None
            top = max(0.055, rec["top"] - 0.006)
            bot = (next_rec["top"] - 0.004) if next_rec else 0.955
            if pending:
                items.append(pending)
            pending = new_item(info, rec["n"], page_no, rec.get("rest") or "")
            pending["_clips"] = [(page_no, top, bot)]

    if pending:
        items.append(pending)
    return items, doc


def attach(catalog: list[dict], analyses: list[dict], doc: fitz.Document) -> dict:
    for q in catalog:
        q.pop("ans_img", None)
        q.pop("ans_pdf_page", None)
        q.pop("answer", None)
    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for q in catalog:
        buckets[(q.get("part"), q.get("subj"), q.get("chapter"), q.get("qno"))].append(q)

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for old in IMG_DIR.glob("*.jpg"):
        old.unlink()

    matched = 0
    unmatched: list[str] = []
    letters = 0
    for a in analyses:
        key = (a["part"], a["subj"], a["chapter"], a["qno"])
        target = None
        for q in buckets.get(key) or []:
            if not q.get("ans_img"):
                target = q
                break
        if target is None:
            unmatched.append(f"{a['part']}-{a['subj']}-{a['chapter']}-{a['qno']}")
            continue
        dest = IMG_DIR / f"{target['id']}.jpg"
        pdf_clips = clips_to_pdf(doc, a.get("_clips") or [])
        ok = render_clips(doc, pdf_clips, dest)
        if not ok:
            unmatched.append(f"{target['id']}:clip")
            continue
        target["ans_img"] = f"/math/img/zy-ans/{target['id']}.jpg"
        target["ans_pdf_page"] = a.get("pdf_page")
        if a.get("answer") and not target.get("answer"):
            target["answer"] = a["answer"]
            letters += 1
        matched += 1
    return {
        "matched": matched,
        "unmatched": unmatched,
        "letters": letters,
        "analyses": len(analyses),
        "catalog": len(catalog),
        "with_ans": sum(1 for q in catalog if q.get("ans_img")),
    }


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--max-page", type=int, default=0)
    args = ap.parse_args()
    if not QUESTIONS_JSON.exists():
        print(f"missing {QUESTIONS_JSON}", file=sys.stderr)
        return 1
    catalog = json.loads(QUESTIONS_JSON.read_text(encoding="utf-8"))
    print(f"== 张宇1000 解析册 {PDF}", flush=True)
    analyses, doc = extract(force=args.force, max_page=args.max_page or None)
    print(f"   -> OCR {len(analyses)} 条解析，裁图并挂题…", flush=True)
    stats = attach(catalog, analyses, doc)
    doc.close()
    (OUT_DIR / "answers_index.json").write_text(
        json.dumps(
            {
                "matched": stats["matched"],
                "with_ans": stats["with_ans"],
                "letters": stats["letters"],
                "unmatched": stats["unmatched"][:80],
                "unmatched_n": len(stats["unmatched"]),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    QUESTIONS_JSON.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    slim = [slim_row(q) for q in catalog]
    PUBLIC_CATALOG.write_text(
        json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"matched {stats['matched']}/{stats['analyses']}  "
        f"catalog {stats['with_ans']}/{stats['catalog']}  letters {stats['letters']}"
    )
    if stats["unmatched"]:
        print("unmatched", len(stats["unmatched"]), stats["unmatched"][:20])
    print(f"wrote {PUBLIC_CATALOG}")
    from split_practice_catalogs import split_public_catalog

    split_public_catalog(PUBLIC_CATALOG)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
