#!/usr/bin/env python3
"""从李林 880 数一《解析分册》OCR 题号/题型，裁解析图，挂到已有 880 题。"""
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
from extract_lilin880 import cn_chapter, slim_row
from extract_zhangyu1000 import clips_to_pdf, render_page, vision_top_frac
from math_img import render_clips

ROOT = Path("/Users/makima/program/web/english_web")
PDF = Path("/Users/makima/Downloads/880数一解析分册.pdf")
OUT_DIR = ROOT / "papers" / "math" / "lilin880"
QUESTIONS_JSON = OUT_DIR / "questions.json"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "math" / "lilin880.json"
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "ll-ans"
CACHE = Path("/tmp/ll880_jiexi_ocr")

# 页脚印刷页码 + 6 = PDF 页码（封面/CIP 2 页 + 目录 3 页 + 空白 1 页）
PDF_OFFSET = 6
LEFT_Q = 0.22  # 题号
LEFT_H = 0.55  # 章/基础综合拓展/选择题型（标题偏中）

Q_RE = re.compile(r"^[（(]\s*(\d{1,2})\s*[）)]\s*(.*)$")
KIND_RE = re.compile(r"(?:[一二三四五六七八]、?\s*)?(选择题|填空题|解答题)")
CH_RE = re.compile(r"第\s*([一二三四五六七八九十]+)\s*章")
LETTER_RE = re.compile(r"^([A-D])(?:\s*[.．、])?")

# 目录印刷页：章 + 基础/综合/拓展。页内切段以 OCR 标题为准，目录只用来兜底章号。
TOC: list[tuple[int, str, int]] = [
    (1, "基础", 1), (1, "综合", 6), (1, "拓展", 18),
    (2, "基础", 20), (2, "综合", 33), (2, "拓展", 49),
    (3, "基础", 52), (3, "综合", 70), (3, "拓展", 92),
    (4, "基础", 96), (4, "拓展", 102),
    (5, "基础", 103), (5, "综合", 111), (5, "拓展", 123),
    (6, "基础", 124), (6, "综合", 138), (6, "拓展", 153),
    (7, "基础", 156), (7, "综合", 163), (7, "拓展", 174),
    (8, "基础", 175), (8, "综合", 186), (8, "拓展", 200),
    (9, "基础", 201), (9, "综合", 211), (9, "拓展", 229),
    (10, "基础", 231), (10, "综合", 234), (10, "拓展", 239),
    (11, "基础", 240), (11, "综合", 247), (11, "拓展", 252),
    (12, "基础", 253), (12, "综合", 258), (12, "拓展", 265),
    (13, "基础", 266), (13, "综合", 271), (13, "拓展", 279),
    (14, "基础", 281), (14, "综合", 290), (14, "拓展", 305),
    (15, "基础", 307), (15, "综合", 313), (15, "拓展", 329),
    (16, "基础", 334), (16, "综合", 336), (16, "拓展", 338),
    (17, "基础", 339), (17, "综合", 342),
    (18, "基础", 347), (18, "综合", 354), (18, "拓展", 363),
    (19, "基础", 366), (19, "综合", 371), (19, "拓展", 382),
    (20, "基础", 384),
    (21, "基础", 387), (21, "综合", 389),
    (22, "基础", 395), (22, "拓展", 406),
    (23, "基础", 409),
]


def toc_chapter(printed: int) -> int | None:
    cur = None
    for ch, _band, page in TOC:
        if page <= printed:
            cur = ch
        else:
            break
    return cur


def part_of(band: str | None) -> str:
    return "base" if band == "基础" else "hard"


def kind_of(label: str) -> str:
    if "选择" in label:
        return "mcq"
    if "填空" in label:
        return "fill"
    return "big"


def letter_of(rest: str) -> str | None:
    m = LETTER_RE.match((rest or "").strip())
    return m.group(1) if m else None


def ocr_strip(png_path: Path, frac: float, tag: str) -> list[dict]:
    img = Image.open(png_path)
    w, h = img.size
    left = img.crop((0, 0, max(8, int(w * frac)), h))
    tmp = png_path.with_name(f"{png_path.stem}.{tag}.png")
    left.save(tmp)
    try:
        anns = ocrmac.OCR(
            str(tmp), language_preference=["zh-Hans", "en-US"]
        ).recognize()
    finally:
        tmp.unlink(missing_ok=True)
    out: list[dict] = []
    for text, _conf, box in anns:
        t = text.strip()
        if not t:
            continue
        x, y, _bw, _bh = box
        top, _bot = vision_top_frac(box)
        out.append({"text": t, "top": top, "x": x, "bot": 1.0 - y})
    out.sort(key=lambda r: r["top"])
    return out


def parse_band(text: str, x: float) -> str | None:
    """标题在版心中部；OCR 常把「综合题」认成「综合是」。"""
    if x < 0.55 or len(text) > 10:
        return None
    t = re.sub(r"\s+", "", text)
    if "基础" in t:
        return "基础"
    if "综合" in t or t.startswith("综"):
        return "综合"
    if "拓展" in t or "拓" in t:
        return "拓展"
    return None


def events_from_ocr(q_recs: list[dict], h_recs: list[dict]) -> list[dict]:
    """页内事件：章 / 基础综合拓展 / 选择填空解答 / 题号，按 y 排。"""
    evs: list[dict] = []
    for rec in h_recs:
        t = rec["text"]
        top = rec["top"]
        if top < 0.035 or top > 0.96:
            continue
        m_ch = CH_RE.search(t)
        if m_ch and rec["x"] > 0.25:
            nch = cn_chapter(m_ch.group(1).strip())
            if nch:
                evs.append({"typ": "ch", "top": top, "ch": nch})
                continue
        band = parse_band(t, rec["x"])
        if band:
            evs.append({"typ": "band", "top": top, "band": band})
            continue
        m_kind = KIND_RE.search(t)
        if m_kind and rec["x"] < 0.45 and len(t) <= 12:
            evs.append({"typ": "kind", "top": top, "kind": kind_of(m_kind.group(1))})
    for rec in q_recs:
        t = rec["text"]
        top = rec["top"]
        if top < 0.04 or top > 0.95:
            continue
        m_q = Q_RE.match(t)
        if not m_q:
            continue
        n = int(m_q.group(1))
        if n < 1 or n > 40:
            continue
        evs.append({"typ": "q", "top": top, "n": n, "rest": (m_q.group(2) or "").strip()})
    evs.sort(key=lambda e: (e["top"], 0 if e["typ"] != "q" else 1))
    dedup: list[dict] = []
    for ev in evs:
        if (
            dedup
            and ev["typ"] == "q"
            and dedup[-1]["typ"] == "q"
            and ev["n"] == dedup[-1]["n"]
            and ev["top"] - dedup[-1]["top"] < 0.03
        ):
            continue
        dedup.append(ev)
    return dedup


def new_item(ch: int, band: str, kind: str, qno: int, page_no: int, rest: str) -> dict:
    return {
        "part": part_of(band),
        "band": band,
        "chapter": ch,
        "kind": kind,
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
    ch: int | None = None
    band: str | None = None
    kind: str | None = None
    t0 = time.time()
    last_pdf = doc.page_count
    if max_page:
        last_pdf = min(last_pdf, max_page)

    for i in range(doc.page_count):
        page_no = i + 1
        if page_no > last_pdf:
            break
        printed = page_no - PDF_OFFSET
        if printed < 1:
            if pending:
                items.append(pending)
                pending = None
            continue

        png = CACHE / f"p{page_no:03d}.png"
        q_cache = CACHE / f"p{page_no:03d}.q.json"
        h_cache = CACHE / f"p{page_no:03d}.h.json"
        if force or not q_cache.exists() or not h_cache.exists():
            render_page(doc[i], png)
            q_recs = ocr_strip(png, LEFT_Q, "q")
            h_recs = ocr_strip(png, LEFT_H, "h")
            q_cache.write_text(json.dumps(q_recs, ensure_ascii=False), encoding="utf-8")
            h_cache.write_text(json.dumps(h_recs, ensure_ascii=False), encoding="utf-8")
            png.unlink(missing_ok=True)
        else:
            q_recs = json.loads(q_cache.read_text(encoding="utf-8"))
            h_recs = json.loads(h_cache.read_text(encoding="utf-8"))

        evs = events_from_ocr(q_recs, h_recs)
        if page_no % 40 == 0:
            print(
                f"  ocr p{page_no}/{last_pdf} ans={len(items)} {time.time()-t0:.0f}s",
                flush=True,
            )

        toc_ch = toc_chapter(printed)
        if ch is None and toc_ch:
            ch = toc_ch

        def close_clip(bot: float) -> None:
            if not pending or not pending["_clips"]:
                return
            page, y0, _y1 = pending["_clips"][-1]
            if page != page_no:
                return
            pending["_clips"][-1] = (page, y0, max(y0 + 0.02, bot))

        q_evs = [e for e in evs if e["typ"] == "q"]
        if not evs:
            if pending:
                pending["_clips"].append((page_no, 0.07, 0.955))
            continue

        first_cut = min(e["top"] for e in evs)
        if pending and first_cut > 0.10:
            pending["_clips"].append((page_no, 0.07, max(0.12, first_cut - 0.004)))

        for ev in evs:
            if ev["typ"] == "ch":
                ch = ev["ch"]
                continue
            if ev["typ"] == "band":
                close_clip(ev["top"] - 0.004)
                if pending:
                    items.append(pending)
                    pending = None
                band = ev["band"]
                kind = None
                continue
            if ev["typ"] == "kind":
                close_clip(ev["top"] - 0.004)
                if pending:
                    items.append(pending)
                    pending = None
                kind = ev["kind"]
                continue
            if ch is None or band is None:
                continue
            close_clip(ev["top"] - 0.004)
            if pending:
                items.append(pending)
            use_kind = kind or ("big" if band == "拓展" else "mcq")
            top = max(0.055, ev["top"] - 0.006)
            pending = new_item(ch, band, use_kind, ev["n"], page_no, ev.get("rest") or "")
            pending["_clips"] = [(page_no, top, 0.955)]

    if pending:
        items.append(pending)
    return items, doc


def attach(catalog: list[dict], analyses: list[dict], doc: fitz.Document) -> dict:
    for q in catalog:
        q.pop("ans_img", None)
        q.pop("ans_pdf_page", None)
        q.pop("answer", None)
    exact: dict[tuple, list[dict]] = defaultdict(list)
    loose: dict[tuple, list[dict]] = defaultdict(list)
    for q in catalog:
        ch = int(q.get("chapter") or q.get("section") or 0)
        band = (q.get("band") or "")[:2]
        key_e = (q.get("part"), ch, q.get("kind"), q.get("qno"), band)
        key_l = (q.get("part"), ch, q.get("kind"), q.get("qno"))
        exact[key_e].append(q)
        loose[key_l].append(q)

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for old in IMG_DIR.glob("*.jpg"):
        old.unlink()

    matched = 0
    unmatched: list[str] = []
    letters = 0
    for a in analyses:
        key_e = (a["part"], a["chapter"], a["kind"], a["qno"], a["band"])
        key_l = (a["part"], a["chapter"], a["kind"], a["qno"])
        target = None
        for q in exact.get(key_e) or []:
            if not q.get("ans_img"):
                target = q
                break
        if target is None:
            for q in loose.get(key_l) or []:
                if not q.get("ans_img"):
                    target = q
                    break
        if target is None:
            unmatched.append(
                f"{a['part']}-{a['chapter']}-{a['kind']}-{a['qno']}-{a['band']}"
            )
            continue
        dest = IMG_DIR / f"{target['id']}.jpg"
        pdf_clips = clips_to_pdf(doc, a.get("_clips") or [])
        ok = render_clips(doc, pdf_clips, dest)
        if not ok:
            unmatched.append(f"{target['id']}:clip")
            continue
        target["ans_img"] = f"/math/img/ll-ans/{target['id']}.jpg"
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
    print(f"== 李林880 解析册 {PDF}", flush=True)
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
                "unmatched": stats["unmatched"][:100],
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
        print("unmatched", len(stats["unmatched"]), stats["unmatched"][:25])
    print(f"wrote {PUBLIC_CATALOG}")
    from split_practice_catalogs import split_public_catalog

    split_public_catalog(PUBLIC_CATALOG)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
