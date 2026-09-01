#!/usr/bin/env python3
"""从李林 880 数一 基础/强化做题本抽取题目，按 880 章 + 关键词挂到图谱考点。"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parent))
from math_img import render_clips
from math_kp_map import LILIN_CHAPTER_NAME, classify_lilin

ROOT = Path("/Users/makima/program/web/english_web")
DOWNLOADS = Path("/Users/makima/Downloads")
OUT_DIR = ROOT / "papers" / "math" / "lilin880"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "math" / "lilin880.json"
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "ll"
PAGE_BOTTOM = 805.0
PAGE_TOP = 50.0
# 题号行上方常有指数/分数分子，裁图时向上扩一点
SUP_PT = 10.0

SOURCES = [
    {
        "part": "base",
        "label": "基础篇",
        "pdf": DOWNLOADS / "【基础强化】880数一基础篇做题本.pdf",
    },
    {
        "part": "hard",
        "label": "强化篇",
        "pdf": DOWNLOADS / "【基础强化】880数一强化篇做题本.pdf",
    },
]

WATERMARK_RE = re.compile(
    r"公众号[：:]\s*做题本集结地"
    r"|李林\s*880\s*[基础强化综扩]*篇?[·.\s]*.*"
    r"|·\s*第\s*\d+\s*页[，,]\s*共\s*\d+\s*页\s*·"
    r"|https://nocode\.host/\S+"
    r"|👆所有题本"
    r"|书籍作者.*李林"
    r"|题本再排.*"
    r"|精讲精练880题"
    r"|数一[基础强化]+篇做题本"
    r"|2027\s*$"
    r"|这是一条为了防止.*?免费获取[^。]*"
    r"|发出来的资料都是免费获取[^。]*"
)

CH_RE = re.compile(r"^第\s*([一二三四五六七八九十百零\d]+)\s*章")
KIND_RE = re.compile(r"^[一二三四五六七八]、?\s*(选择题|填空题|解答题)")
KIND_ALT_RE = re.compile(r"^(综合题|拓展题)$")
Q_RE = re.compile(r"^\((\d{1,2})\)\s*")
OPT_LINE_RE = re.compile(r"^([A-D])[\.．、]\s*(.*)$")
CN_NUM = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8,
    "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13, "十四": 14,
    "十五": 15, "十六": 16, "十七": 17, "十八": 18, "十九": 19,
    "二十": 20, "二十一": 21, "二十二": 22, "二十三": 23,
}


def cn_chapter(s: str) -> int | None:
    if s.isdigit():
        return int(s)
    return CN_NUM.get(s)


def toc_chapters(doc: fitz.Document) -> list[tuple[int, int, str]]:
    """[(chapter_no, start_pdf_page_1indexed, title), ...]"""
    out: list[tuple[int, int, str]] = []
    for _lv, title, page in doc.get_toc():
        m = re.search(r"第\s*([一二三四五六七八九十百零\d]+)\s*章\s*(.+)", title)
        if not m:
            continue
        ch = cn_chapter(m.group(1).strip())
        if not ch:
            continue
        name = re.sub(r"\s+", "", m.group(2)).strip()
        out.append((ch, int(page), name or LILIN_CHAPTER_NAME.get(ch, "")))
    out.sort(key=lambda x: x[1])
    return out


def chapter_at(toc: list[tuple[int, int, str]], page: int) -> tuple[int, str]:
    cur = (0, "")
    for ch, p, name in toc:
        if p <= page:
            cur = (ch, name)
    return cur


def clean_line(s: str) -> str:
    s = WATERMARK_RE.sub("", s)
    s = s.replace("\u0000", "")
    s = re.sub(r"[\uf000-\uf8ff]", "", s)
    return s.strip()


def page_visual_lines(page: fitz.Page) -> list[dict]:
    """按视觉 y/x 排 span，并把同一行的 A/B/C/D 拼回来。"""
    d = page.get_text("dict")
    raw: list[dict] = []
    for b in d.get("blocks") or []:
        if b.get("type") != 0:
            continue
        for ln in b.get("lines") or []:
            spans = [s for s in (ln.get("spans") or []) if s.get("text")]
            if not spans:
                continue
            spans.sort(key=lambda s: s["bbox"][0])
            text = clean_line("".join(s["text"] for s in spans))
            if not text:
                continue
            raw.append(
                {
                    "text": text,
                    "x0": min(s["bbox"][0] for s in spans),
                    "y0": min(s["bbox"][1] for s in spans),
                    "y1": max(s["bbox"][3] for s in spans),
                }
            )
    raw.sort(key=lambda r: (round(r["y0"], 1), r["x0"]))
    clusters: list[list[dict]] = []
    for rec in raw:
        if clusters and abs(clusters[-1][0]["y0"] - rec["y0"]) < 3.6:
            clusters[-1].append(rec)
        else:
            clusters.append([rec])
    merged: list[dict] = []
    for group in clusters:
        group.sort(key=lambda r: r["x0"])
        merged.append(
            {
                "text": " ".join(r["text"] for r in group).strip(),
                "x0": min(r["x0"] for r in group),
                "y0": min(r["y0"] for r in group),
                "y1": max(r["y1"] for r in group),
            }
        )
    return merged


def split_options(text: str) -> tuple[str, dict[str, str]]:
    """从题干末尾拆 A-D。"""
    opts: dict[str, str] = {}
    # 优先按行
    lines = text.splitlines()
    stem_lines: list[str] = []
    mode = "stem"
    for ln in lines:
        m = OPT_LINE_RE.match(ln.strip())
        if m:
            mode = "opt"
            opts[m.group(1)] = m.group(2).strip()
            continue
        if mode == "opt" and opts:
            last = max(opts)
            opts[last] = (opts[last] + ln.strip()).strip()
        else:
            stem_lines.append(ln)
    stem = "\n".join(stem_lines).strip()
    if len(opts) >= 2:
        return stem, opts
    # 单行 A. .. B. ..
    inline = re.search(r"(?:^|\n)\s*(A[\.．、].+)", text, re.S)
    if inline:
        blob = inline.group(1)
        parts = re.split(r"(?=[A-D][\.．、])", blob)
        got: dict[str, str] = {}
        for p in parts:
            m = OPT_LINE_RE.match(p.strip())
            if m:
                got[m.group(1)] = m.group(2).strip()
        if len(got) >= 2:
            stem = text[: inline.start(1)].strip()
            return stem, got
    return text.strip(), opts


def kind_of(label: str) -> str:
    if "选择" in label:
        return "mcq"
    if "填空" in label:
        return "fill"
    return "big"


def flush_pending(pending: dict | None, out: list[dict]) -> None:
    if not pending:
        return
    stem = pending.pop("body", "").strip()
    if not stem:
        return
    opts: dict[str, str] = {}
    if pending["kind"] == "mcq":
        stem, opts = split_options(stem)
    pending["stem"] = re.sub(r"\n{3,}", "\n\n", stem).strip()
    if opts:
        pending["options"] = {k: v for k, v in opts.items() if v}
        if not pending["options"]:
            pending.pop("options", None)
    extra = " ".join((pending.get("options") or {}).values())
    pending["kp_ids"] = classify_lilin(pending["chapter"], pending["stem"], extra)
    pending["section_name"] = LILIN_CHAPTER_NAME.get(pending["chapter"], pending.get("section_name") or "")
    out.append(pending)


def extract_pdf(src: dict) -> tuple[list[dict], fitz.Document]:
    pdf: Path = src["pdf"]
    part: str = src["part"]
    doc = fitz.open(str(pdf))
    toc = toc_chapters(doc)
    questions: list[dict] = []
    pending: dict | None = None
    kind_label = "选择题"
    kind = "mcq"
    band = "综合" if part == "hard" else "基础"
    cuts: list[tuple[int, float, str]] = []

    for i in range(doc.page_count):
        page_no = i + 1
        ch, ch_name = chapter_at(toc, page_no)
        if page_no <= 2 or ch <= 0:
            continue
        lines = page_visual_lines(doc[i])
        for rec in lines:
            ln = rec["text"]
            y0 = rec["y0"]
            if ln in ("目", "录", "目录"):
                continue
            m_ch = CH_RE.match(ln)
            if m_ch and len(ln) <= 18:
                cuts.append((page_no, y0, "h"))
                continue
            if ln in ("综合题", "拓展题"):
                band = ln[0:2]
                cuts.append((page_no, y0, "h"))
                if pending:
                    flush_pending(pending, questions)
                    pending = None
                continue
            m_kind = KIND_RE.match(ln)
            if m_kind:
                kind_label = m_kind.group(1)
                kind = kind_of(kind_label)
                cuts.append((page_no, y0, "h"))
                if pending:
                    flush_pending(pending, questions)
                    pending = None
                continue
            m_q = Q_RE.match(ln)
            if m_q:
                if pending:
                    flush_pending(pending, questions)
                qno = int(m_q.group(1))
                rest = ln[m_q.end() :].strip()
                qid = f"ll-{part}-{ch}-{kind}-{qno}"
                pending = {
                    "id": qid,
                    "source": "lilin880",
                    "part": part,
                    "book": "calc" if ch <= 9 else ("linear" if ch <= 15 else "prob"),
                    "kind": kind,
                    "chapter": ch,
                    "section": str(ch),
                    "section_name": ch_name or LILIN_CHAPTER_NAME.get(ch, ""),
                    "band": band,
                    "qno": qno,
                    "pdf_page": page_no,
                    "body": rest,
                    "_y0": y0,
                    "_y1": rec["y1"],
                }
                cuts.append((page_no, y0, "q"))
                continue
            if pending:
                pending["body"] = (pending.get("body") or "") + "\n" + ln
                prev_y1 = float(pending.get("_y1") or y0)
                # 大段空白后面往往是下一题的指数/分数分子，不要把裁图拉下去
                if rec["y0"] - prev_y1 < 36:
                    pending["_y1"] = max(prev_y1, rec["y1"])

    flush_pending(pending, questions)
    cuts.sort(key=lambda c: (c[0], c[1]))
    assign_clips(questions, cuts, doc.page_count)
    # 同一章+题型题号重复（强化综合/拓展会重置题号）→ 给拓展加后缀
    seen: dict[str, int] = defaultdict(int)
    for q in questions:
        base = q["id"]
        seen[base] += 1
        if seen[base] > 1:
            q["id"] = f"{base}-x{seen[base]}"
            q["band"] = q.get("band") or "拓展"
    return questions, doc


def assign_clips(questions: list[dict], cuts: list[tuple[int, float, str]], page_count: int) -> None:
    for i, q in enumerate(questions):
        page = int(q["pdf_page"])
        y0 = float(q.get("_y0") or PAGE_TOP)
        next_page, next_y = page_count, PAGE_BOTTOM
        for p, y, _kind in cuts:
            if p == page and y > y0 + 1.5:
                next_page, next_y = p, y
                break
            if p > page:
                next_page, next_y = p, y
                break
        y0s = y0 - SUP_PT
        prev_h = None
        for p, y, kind in reversed(cuts):
            if p == page and y < y0 - 0.5:
                if kind == "h":
                    prev_h = y
                break
            if p < page:
                break
        if prev_h is not None:
            y0s = max(y0s, prev_h + 14)
        content_y1 = float(q.get("_y1") or y0) + 8
        clips: list[tuple[int, float, float]] = []
        if next_page == page:
            y1s = min(content_y1, next_y - SUP_PT)
            clips.append((page, y0s, max(y0s + 18, y1s)))
        elif content_y1 >= PAGE_BOTTOM - 36:
            # 内容贴页脚，下一页还有续
            clips.append((page, y0s, PAGE_BOTTOM))
            for p in range(page + 1, next_page):
                clips.append((p, PAGE_TOP, PAGE_BOTTOM))
            if next_page > page:
                clips.append((next_page, PAGE_TOP, min(content_y1, next_y - SUP_PT)))
        else:
            clips.append((page, y0s, max(y0s + 18, content_y1)))
        q["_clips"] = clips


def write_images(doc: fitz.Document, questions: list[dict]) -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for q in questions:
        dest = IMG_DIR / f"{q['id']}.jpg"
        ok = render_clips(doc, q.get("_clips") or [], dest)
        if ok:
            q["img"] = f"/math/img/ll/{q['id']}.jpg"


def slim_row(q: dict) -> dict:
    row = {
        "id": q["id"],
        "source": "lilin880",
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
    if q.get("options"):
        row["options"] = q["options"]
    if q.get("img"):
        row["img"] = q["img"]
    return row


def write_markdown(qs: list[dict], path: Path) -> None:
    by_kp: dict[str, list[dict]] = defaultdict(list)
    for q in qs:
        kps = q.get("kp_ids") or ["?"]
        by_kp[kps[0]].append(q)
    lines = [f"# 李林 880 数一 · {len(qs)} 题", ""]
    for kp in sorted(by_kp):
        group = by_kp[kp]
        lines.append(f"## `{kp}`  {len(group)} 题")
        lines.append("")
        for q in group[:8]:
            stem = (q.get("stem") or "").replace("\n", " ")[:80]
            lines.append(
                f"- {q['id']} p.{q.get('pdf_page')} ch{q.get('chapter')} #{q['qno']} {stem}"
            )
        if len(group) > 8:
            lines.append(f"- … 另 {len(group) - 8} 题")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_CATALOG.parent.mkdir(parents=True, exist_ok=True)
    if IMG_DIR.exists():
        for old in IMG_DIR.glob("*.jpg"):
            old.unlink()
    all_q: list[dict] = []
    for src in SOURCES:
        print(f"== {src['label']} {src['pdf']}", flush=True)
        qs, doc = extract_pdf(src)
        print(f"   -> {len(qs)} 题，裁图…", flush=True)
        write_images(doc, qs)
        doc.close()
        print(f"   -> 图 {sum(1 for q in qs if q.get('img'))}/{len(qs)}", flush=True)
        all_q.extend(qs)

    (OUT_DIR / "questions.json").write_text(
        json.dumps(all_q, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    slim = [slim_row(q) for q in all_q]
    PUBLIC_CATALOG.write_text(
        json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    write_markdown(all_q, OUT_DIR / "by_kp.md")

    by_ch = defaultdict(int)
    by_kp = defaultdict(int)
    for q in all_q:
        by_ch[q.get("chapter", 0)] += 1
        for k in q.get("kp_ids") or ["?"]:
            by_kp[k] += 1
    print("by chapter:", dict(sorted(by_ch.items())))
    print("by kp:", dict(sorted(by_kp.items(), key=lambda x: -x[1])[:20]))
    print(f"wrote {len(all_q)} -> {PUBLIC_CATALOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
