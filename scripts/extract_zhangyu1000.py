#!/usr/bin/env python3
"""从 2027 张宇 1000 题数一试题册 OCR 抽题，按书内章节挂到图谱考点。"""
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
from math_img import pdf_y_from_norm_top, render_clips
from math_kp_map import apply_overlay, classify_zhangyu

ROOT = Path("/Users/makima/program/web/english_web")
PDF = Path("/Users/makima/Downloads/27张宇1000题数一-试题册.pdf")
OUT_DIR = ROOT / "papers" / "math" / "zhangyu1000"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "math" / "zhangyu1000.json"
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "zy"
CACHE = Path("/tmp/zy1000_ocr")
OCR_WIDTH = 1400
LEFT_FRAC = 0.24

Q_RE = re.compile(r"^(\d{1,2})\s*[\.．、]\s*(.*)$")
SKIP_RE = re.compile(
    r"^(目录|基础篇|强化篇|综合篇|高数|线代|概率|零基础|考研数学|"
    r"张宇|1000|页码|\d{1,3}\s*$)"
)
WATERMARK_RE = re.compile(
    r"公众号.*|微信.*|研七七|做题本集结地|"
    r"这是一条为了防止.*?免费获取"
)


def cn_part(title: str) -> str | None:
    if "基础" in title:
        return "base"
    if "强化" in title:
        return "hard"
    if "综合" in title:
        return "test"
    return None


def cn_subj(title: str) -> str | None:
    t = re.sub(r"\s+", "", title)
    if t.startswith("高数") or "高等数学" in t:
        return "hs"
    if t.startswith("线代") or "线性代数" in t:
        return "la"
    if t.startswith("概率") or "概率论" in t:
        return "prob"
    return None


def parse_toc(doc: fitz.Document) -> list[dict]:
    """Walk bookmarks: part + subject + chapter → start page."""
    rows: list[dict] = []
    part, subj = "base", "hs"
    for lv, title, page in doc.get_toc():
        title = title.strip()
        p = cn_part(title)
        if lv == 1 and p:
            part = p
            continue
        s = cn_subj(title)
        if lv == 2 and s:
            subj = s
            continue
        if part == "test":
            continue
        if "零基础" in title:
            rows.append({"part": part, "subj": subj, "ch": 0, "title": "零基础", "page": int(page)})
            continue
        m = re.search(r"第\s*(\d+)\s*章\s*(.*)", title)
        if m:
            rows.append(
                {
                    "part": part,
                    "subj": subj,
                    "ch": int(m.group(1)),
                    "title": re.sub(r"\s+", "", m.group(2)).strip(),
                    "page": int(page),
                }
            )
    rows.sort(key=lambda x: x["page"])
    return rows


def chapter_at(toc: list[dict], page: int) -> dict | None:
    cur = None
    for row in toc:
        if row["page"] <= page:
            cur = row
    return cur


def vision_top_frac(box: tuple[float, float, float, float]) -> tuple[float, float]:
    """Vision 原点在左下 → 自上而下 0-1。"""
    _x, y, _w, h = box
    return 1.0 - (y + h), 1.0 - y


def ocr_page_lines(png_path: Path) -> list[str]:
    anns = ocrmac.OCR(
        str(png_path), language_preference=["zh-Hans", "en-US"]
    ).recognize()
    items = []
    for text, _conf, box in anns:
        x, y, w, h = box
        items.append((-(y + h / 2), x, text.strip()))
    items.sort()
    lines: list[list[tuple[float, str]]] = []
    line_y: list[float] = []
    for cy_neg, x, text in items:
        cy = -cy_neg
        if not text:
            continue
        if lines and abs(line_y[-1] - cy) < 0.012:
            lines[-1].append((x, text))
        else:
            lines.append([(x, text)])
            line_y.append(cy)
    out = []
    for parts in lines:
        parts.sort()
        ln = re.sub(r"\s+", " ", " ".join(p[1] for p in parts)).strip()
        ln = WATERMARK_RE.sub("", ln).strip()
        if ln:
            out.append(ln)
    return out


def detect_qnos_left(png_path: Path) -> list[dict]:
    """只 OCR 左栏，抓 1. 2. … 题号（公式题全文 OCR 经常丢题号）。"""
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
        m = Q_RE.match(text.strip())
        if not m:
            continue
        n = int(m.group(1))
        if n < 1 or n > 80:
            continue
        top, bot = vision_top_frac(box)
        if top < 0.05 or top > 0.93:
            continue
        found.append({"n": n, "top": top, "bot": bot, "rest": (m.group(2) or "").strip()})
    found.sort(key=lambda x: x["top"])
    dedup: list[dict] = []
    for rec in found:
        if dedup and rec["n"] == dedup[-1]["n"] and rec["top"] - dedup[-1]["top"] < 0.03:
            continue
        dedup.append(rec)
    return dedup


def render_page(page: fitz.Page, dest: Path, width: int = 1400) -> None:
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(str(dest))


OPT_TOKEN = re.compile(r"[（(]\s*([A-D])\s*[）)]|([A-D])[\.．、]")


def split_options(text: str) -> tuple[str, dict[str, str]]:
    """拆 （A）（B）（C）（D） 或 A. B.，同行或分行都行。"""
    matches = list(OPT_TOKEN.finditer(text))
    keys = [(m.start(), (m.group(1) or m.group(2))) for m in matches]
    # 找到第一次出现 A 且后面能看到 B 的位置
    start_i = None
    for i, (_, k) in enumerate(keys):
        rest = {x[1] for x in keys[i : i + 4]}
        if k == "A" and "B" in rest:
            start_i = i
            break
    if start_i is None:
        return text.strip(), {}
    first = matches[start_i]
    opts: dict[str, str] = {}
    seq = matches[start_i:]
    for j, m in enumerate(seq):
        key = m.group(1) or m.group(2)
        end = seq[j + 1].start() if j + 1 < len(seq) else len(text)
        val = text[m.end() : end].strip(" \n\t.;；")
        if key in opts:
            opts[key] = (opts[key] + " " + val).strip()
        else:
            opts[key] = val
    stem = text[: first.start()].strip()
    return stem, {k: v for k, v in opts.items() if v}


def flush(pending: dict | None, out: list[dict]) -> None:
    if not pending:
        return
    body = (pending.pop("body", "") or "").strip()
    if not body:
        return
    stem, opts = split_options(body)
    pending["stem"] = stem or ("（见选项）" if opts else body[:80])
    if opts:
        pending["options"] = opts
        pending["kind"] = "mcq"
    elif "____" in stem or "——" in stem or stem.endswith("="):
        pending["kind"] = "fill"
    extra = " ".join((pending.get("options") or {}).values())
    pending["kp_ids"] = classify_zhangyu(
        pending["part"], pending["subj"], pending["chapter"], pending["stem"], extra
    )
    apply_overlay(pending)
    out.append(pending)


def new_item(info: dict, qno: int, page_no: int, rest: str) -> dict:
    part, subj, ch = info["part"], info["subj"], info["ch"]
    return {
        "id": f"zy-{part}-{subj}-{ch}-{qno}",
        "source": "zhangyu1000",
        "part": part,
        "subj": subj,
        "book": {"hs": "calc", "la": "linear", "prob": "prob"}[subj],
        "kind": "big",
        "chapter": ch,
        "section": f"{subj}-{ch}",
        "section_name": info.get("title") or "",
        "qno": qno,
        "pdf_page": page_no,
        "body": rest,
        "_clips": [],
    }


def lines_between(lines: list[str], qno: int, next_qno: int | None) -> str:
    """从全文 OCR 行里抠本题题干（分类用；显示走原图）。"""
    chunks: list[str] = []
    taking = False
    for ln in lines:
        if SKIP_RE.match(ln):
            continue
        m = Q_RE.match(ln)
        if m:
            n = int(m.group(1))
            if n == qno:
                taking = True
                rest = (m.group(2) or "").strip()
                if rest:
                    chunks.append(rest)
                continue
            if taking and (next_qno is None or n == next_qno or n > qno):
                break
        if taking:
            chunks.append(ln)
    return "\n".join(chunks).strip()


def extract(force: bool = False) -> tuple[list[dict], fitz.Document]:
    doc = fitz.open(str(PDF))
    toc = parse_toc(doc)
    CACHE.mkdir(parents=True, exist_ok=True)
    questions: list[dict] = []
    pending: dict | None = None
    t0 = time.time()
    test_page = next((lv[2] for lv in doc.get_toc() if lv[1].strip() == "综合篇"), 179)
    prev_key: tuple | None = None

    for i in range(doc.page_count):
        page_no = i + 1
        if page_no < 8 or page_no >= test_page:
            continue
        info = chapter_at(toc, page_no)
        if not info or info["part"] == "test":
            continue
        key = (info["part"], info["subj"], info["ch"])
        new_chapter = prev_key is not None and key != prev_key
        prev_key = key

        png = CACHE / f"p{page_no:03d}.png"
        line_cache = CACHE / f"p{page_no:03d}.json"
        qno_cache = CACHE / f"p{page_no:03d}.qnos.json"
        need_png = force or not qno_cache.exists() or not line_cache.exists()
        if need_png or not png.exists():
            render_page(doc[i], png)
        if line_cache.exists() and not force:
            lines = json.loads(line_cache.read_text())
        else:
            lines = ocr_page_lines(png)
            line_cache.write_text(json.dumps(lines, ensure_ascii=False), encoding="utf-8")
        if qno_cache.exists() and not force:
            qnos = json.loads(qno_cache.read_text())
        else:
            qnos = detect_qnos_left(png)
            qno_cache.write_text(json.dumps(qnos, ensure_ascii=False), encoding="utf-8")
        if png.exists() and qno_cache.exists() and line_cache.exists():
            png.unlink(missing_ok=True)

        if page_no % 20 == 0:
            print(
                f"  ocr p{page_no}/{doc.page_count} q={len(questions)} {time.time()-t0:.0f}s",
                flush=True,
            )

        if new_chapter and pending:
            flush(pending, questions)
            pending = None

        # 无题号：扉页/空白，不并进上一题
        if not qnos:
            if pending:
                flush(pending, questions)
                pending = None
            continue

        first_top = qnos[0]["top"]
        # 上一题跨页：本页开头直到第一题题号
        if pending and first_top > 0.18:
            pending["_clips"].append((page_no, 0.07, max(0.12, first_top - 0.004)))

        for j, rec in enumerate(qnos):
            next_rec = qnos[j + 1] if j + 1 < len(qnos) else None
            top = max(0.055, rec["top"] - 0.006)
            bot = (next_rec["top"] - 0.004) if next_rec else 0.955
            if pending:
                flush(pending, questions)
            body = lines_between(lines, rec["n"], next_rec["n"] if next_rec else None)
            if not body:
                body = rec.get("rest") or ""
            pending = new_item(info, rec["n"], page_no, body)
            pending["_clips"] = [(page_no, top, bot)]

    flush(pending, questions)
    seen: dict[str, int] = defaultdict(int)
    for q in questions:
        base = q["id"]
        seen[base] += 1
        if seen[base] > 1:
            q["id"] = f"{base}-x{seen[base]}"
    return questions, doc


def clips_to_pdf(doc: fitz.Document, clips_norm: list[tuple[int, float, float]]) -> list[tuple[int, float, float]]:
    out: list[tuple[int, float, float]] = []
    for page_no, top, bot in clips_norm:
        if page_no < 1 or page_no > doc.page_count:
            continue
        page = doc[page_no - 1]
        y0 = pdf_y_from_norm_top(page, top)
        y1 = pdf_y_from_norm_top(page, bot)
        out.append((page_no, y0, y1))
    return out


def write_images(doc: fitz.Document, questions: list[dict]) -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for q in questions:
        dest = IMG_DIR / f"{q['id']}.jpg"
        pdf_clips = clips_to_pdf(doc, q.get("_clips") or [])
        ok = render_clips(doc, pdf_clips, dest)
        if ok:
            q["img"] = f"/math/img/zy/{q['id']}.jpg"


def slim_row(q: dict) -> dict:
    q = apply_overlay(dict(q))
    row = {
        "id": q["id"],
        "source": "zhangyu1000",
        "book": q["book"],
        "kind": q["kind"],
        "section": q["section"],
        "section_name": q.get("section_name") or "",
        "qno": q["qno"],
        "pdf_page": q.get("pdf_page"),
        "stem": q.get("stem") or "",
        "kp_ids": q.get("kp_ids") or [],
        "part": q.get("part"),
    }
    if q.get("facets"):
        row["facets"] = q["facets"]
    if q.get("options"):
        row["options"] = q["options"]
    if q.get("img"):
        row["img"] = q["img"]
    if q.get("ans_img"):
        row["ans_img"] = q["ans_img"]
    if q.get("answer"):
        row["answer"] = q["answer"]
    return row


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_CATALOG.parent.mkdir(parents=True, exist_ok=True)
    if IMG_DIR.exists():
        for old in IMG_DIR.glob("*.jpg"):
            old.unlink()
    print(f"== 张宇1000 {PDF}", flush=True)
    qs, doc = extract(force=args.force)
    print(f"   -> {len(qs)} 题，裁图…", flush=True)
    write_images(doc, qs)
    doc.close()
    print(f"   -> 图 {sum(1 for q in qs if q.get('img'))}/{len(qs)}", flush=True)
    (OUT_DIR / "questions.json").write_text(
        json.dumps(qs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    slim = [slim_row(q) for q in qs]
    PUBLIC_CATALOG.write_text(
        json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    by_kp = defaultdict(int)
    for q in qs:
        for k in q.get("kp_ids") or ["?"]:
            by_kp[k] += 1
    print("top kp", sorted(by_kp.items(), key=lambda x: -x[1])[:15])
    print(f"wrote {PUBLIC_CATALOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
