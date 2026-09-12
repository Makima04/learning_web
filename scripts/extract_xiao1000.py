#!/usr/bin/env python3
"""从 2027 肖秀荣 1000 题试题分册抽选择题，并从解析册 OCR 答案/出处/简析。

个人学习用索引，不是原书电子版。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz
from ocrmac import ocrmac
from PIL import Image

ROOT = Path("/Users/makima/program/web/english_web")
Q_PDF = Path("/Users/makima/Downloads/27版肖1000试题分册.pdf")
A_PDF = Path("/Users/makima/Downloads/27版肖1000答案解析册.pdf")
OUT_DIR = ROOT / "papers" / "politics" / "xiao1000"
PUBLIC = ROOT / "frontend" / "public" / "politics" / "xiao1000.json"
OCR_CACHE = Path("/tmp/xiao1000_ocr")
OCR_WIDTH = 1600

# 1-indexed PDF page ranges in 试题分册（含分析题页，解析时丢掉无选项的题）
SUBJECTS: list[tuple[str, str, int, int]] = [
    ("marx", "马原", 6, 64),
    ("mao", "毛中特", 65, 81),
    ("xi", "新思想", 82, 112),
    ("history", "史纲", 113, 149),
    ("moral", "思法", 150, 169),
]

NOISE_RE = re.compile(
    r"^(?:2027\s*考研政治.*|《?2027.*1000\s*题.*|试题分册.*|"
    r"马原[·．.\-].*|毛中特[·．.\-].*|新思想[·．.\-].*|史纲[·．.\-].*|"
    r"思法[·．.\-].*|思修[·．.\-].*|思法分析.*|"
    r"第一部分.*|第二部分.*|第三部分.*|第四部分.*|第五部分.*|"
    r"国开考研.*|GUO\s*K.*|OPEN\s*UNIVERSITY.*|"
    r"[J》>»\s]*2027.*|"
    r"\d{1,3}\s*)$",
    re.I,
)
KIND_RE = re.compile(r"(单项选择题|多项选择题|材料分析题)")
CHAPTER_RE = re.compile(
    r"^(导论|绪论|第[一二三四五六七八九十0-9]+章)\s*(.*)$"
)
Q_RE = re.compile(r"^(\d{1,3})(?:[\.．、]\s*|\s+)(\S.*)$")
OPT_RE = re.compile(r"^([A-D])[\.．、，,]\s*(.*)$")
OPT_INLINE_RE = re.compile(r"([A-D])[\.．、，,]\s*")
ANS_RE = re.compile(
    r"(\d{1,3})\s*[\.．]?\s*答\s*[案菜]\s*([A-Da-d]{1,4})"
)
SRC_RE = re.compile(r"出处\s*精讲\s*P?\s*(\d+)\s*考点\s*(\S+)")
WATERMARK_RE = re.compile(r"更多考研干货.*|微信公众号.*|一烫")


def cn_kind(s: str) -> str | None:
    if "单项" in s:
        return "single"
    if "多项" in s:
        return "multi"
    if "分析" in s:
        return "essay"
    return None


def clean_line(s: str) -> str:
    s = WATERMARK_RE.sub("", s)
    s = s.replace("\u3000", " ").strip()
    s = re.sub(r"[ \t]+", " ", s)
    return s


def page_lines(page: fitz.Page) -> list[str]:
    text = page.get_text("text") or ""
    out: list[str] = []
    for raw in text.splitlines():
        ln = clean_line(raw)
        if not ln or NOISE_RE.match(ln):
            continue
        out.append(ln)
    return out


def split_inline_options(text: str) -> dict[str, str] | None:
    """A.xx B.yy C.zz D.ww 写在一行时拆开。"""
    marks = list(OPT_INLINE_RE.finditer(text))
    if len(marks) < 2:
        return None
    letters = [m.group(1) for m in marks]
    if letters[0] != "A" or len(set(letters)) != len(letters):
        return None
    opts: dict[str, str] = {}
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        body = text[m.end() : end].strip()
        opts[m.group(1)] = body
    return opts if {"A", "B", "C", "D"} <= set(opts) or {"A", "B", "C"} <= set(opts) else None


def flush_question(buf: dict, sink: list[dict]) -> None:
    if not buf:
        return
    stem = "\n".join(buf["stem_lines"]).strip()
    opts = dict(buf["opts"])
    if not stem or len(opts) < 2:
        return
    if buf.get("kind") == "essay":
        return
    sink.append(
        {
            "id": f"xiao-{buf['subject']}-{buf['kind'][0]}-{buf['qno']}",
            "source": "xiao1000",
            "subject": buf["subject"],
            "kind": buf["kind"],
            "chapter": buf.get("chapter") or "",
            "chapter_no": buf.get("chapter_no"),
            "qno": buf["qno"],
            "stem": stem,
            "options": opts,
            "pdf_page": buf["pdf_page"],
            "kp_ids": [],
        }
    )


def parse_subject_pages(doc: fitz.Document, subject: str, p0: int, p1: int) -> list[dict]:
    """p0/p1 为 1-indexed 闭区间。"""
    kind = "single"
    chapter = ""
    chapter_no: int | None = 0
    cur: dict = {}
    opt_key: str | None = None
    out: list[dict] = []

    def start_q(qno: int, rest: str, page: int) -> None:
        nonlocal cur, opt_key
        flush_question(cur, out)
        cur = {
            "subject": subject,
            "kind": kind,
            "chapter": chapter,
            "chapter_no": chapter_no,
            "qno": qno,
            "stem_lines": [rest] if rest else [],
            "opts": {},
            "pdf_page": page,
        }
        opt_key = None

    for pno in range(p0, p1 + 1):
        for ln in page_lines(doc[pno - 1]):
            km = KIND_RE.search(ln)
            if km:
                nk = cn_kind(km.group(1))
                if nk:
                    kind = nk
                # 同行可能还有章名
                ln = KIND_RE.sub("", ln).strip()
                ln = re.sub(r"^[一二三]、\s*", "", ln).strip()
                if not ln:
                    continue

            cm = CHAPTER_RE.match(ln)
            if cm and kind != "essay":
                title = (cm.group(1) + " " + cm.group(2)).strip()
                # 「导论马克思主义…」这种粘连也当章
                chapter = title
                if cm.group(1) in ("导论", "绪论"):
                    chapter_no = 0
                else:
                    nums = {
                        "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
                        "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
                    }
                    raw = cm.group(1)
                    mnum = re.search(r"(\d+)", raw)
                    if mnum:
                        chapter_no = int(mnum.group(1))
                    else:
                        chapter_no = nums.get(raw.replace("第", "").replace("章", ""), None)
                continue

            qm = Q_RE.match(ln)
            if qm and kind != "essay":
                qno = int(qm.group(1))
                rest = qm.group(2).strip()
                # 页码误识别：光秃数字且后面不像题干
                if qno > 250:
                    continue
                start_q(qno, rest, pno)
                inline = split_inline_options(rest)
                if inline:
                    cur["stem_lines"] = [rest[: OPT_INLINE_RE.search(rest).start()].strip()]
                    cur["opts"] = inline
                    opt_key = list(inline)[-1]
                continue

            om = OPT_RE.match(ln)
            if om and cur:
                opt_key = om.group(1)
                body = om.group(2).strip()
                inline = split_inline_options(ln)
                if inline:
                    cur["opts"].update(inline)
                    opt_key = list(inline)[-1]
                else:
                    cur["opts"][opt_key] = body
                continue

            if cur and opt_key and opt_key in cur["opts"]:
                cur["opts"][opt_key] = (cur["opts"][opt_key] + body_join(cur["opts"][opt_key], ln)).strip()
            elif cur:
                cur["stem_lines"].append(ln)

    flush_question(cur, out)
    return out


def body_join(prev: str, nxt: str) -> str:
    if not prev:
        return nxt
    if prev.endswith(("-", "—")):
        return nxt
    return " " + nxt


def dump_raw_text(doc: fitz.Document) -> None:
    raw_dir = OUT_DIR / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for sid, label, p0, p1 in SUBJECTS:
        chunks = [f"# {label} PDF {p0}-{p1}\n"]
        for pno in range(p0, p1 + 1):
            chunks.append(f"\n----- p{pno} -----\n")
            chunks.append("\n".join(page_lines(doc[pno - 1])))
        (raw_dir / f"{sid}.txt").write_text("".join(chunks), encoding="utf-8")
        print(f"  raw {sid}: {raw_dir / f'{sid}.txt'}")


def extract_questions() -> list[dict]:
    if not Q_PDF.is_file():
        raise SystemExit(f"missing {Q_PDF}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(Q_PDF)
    dump_raw_text(doc)
    items: list[dict] = []
    for sid, label, p0, p1 in SUBJECTS:
        qs = parse_subject_pages(doc, sid, p0, p1)
        print(f"  {label}: {len(qs)} mcq")
        by_kind = defaultdict(int)
        by_ch = defaultdict(int)
        for q in qs:
            by_kind[q["kind"]] += 1
            by_ch[q["chapter"] or "?"] += 1
        print("    kind", dict(by_kind))
        print("    chapters", {k: by_ch[k] for k in list(by_ch)[:12]}, "..." if len(by_ch) > 12 else "")
        items.extend(qs)
        (OUT_DIR / f"{sid}.questions.json").write_text(
            json.dumps(qs, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    doc.close()
    (OUT_DIR / "questions.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  total {len(items)} -> {OUT_DIR / 'questions.json'}")
    return items


def render_page(page: fitz.Page, dest: Path) -> None:
    zoom = OCR_WIDTH / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False, colorspace=fitz.csGRAY)
    dest.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(dest))


def ocr_two_col(png: Path) -> list[str]:
    """左栏再右栏，按阅读顺序拼行。"""
    anns = ocrmac.OCR(str(png), language_preference=["zh-Hans", "en-US"]).recognize()
    left, right = [], []
    for text, _conf, box in anns:
        x, y, w, h = box
        t = clean_line(str(text))
        if not t:
            continue
        cy = 1 - (y + h / 2)
        row = (cy, x, t)
        (left if x + w / 2 < 0.50 else right).append(row)

    def lines_of(items: list[tuple[float, float, str]]) -> list[str]:
        items.sort()
        grouped: list[list[tuple[float, str]]] = []
        ys: list[float] = []
        for cy, x, t in items:
            if grouped and abs(ys[-1] - cy) < 0.012:
                grouped[-1].append((x, t))
            else:
                grouped.append([(x, t)])
                ys.append(cy)
        out = []
        for parts in grouped:
            parts.sort()
            ln = clean_line(" ".join(p[1] for p in parts))
            if ln:
                out.append(ln)
        return out

    return lines_of(left) + ["---COL---"] + lines_of(right)


def parse_answer_lines(lines: list[str], page_no: int) -> list[dict]:
    recs: list[dict] = []
    cur: dict | None = None
    field = None
    for ln in lines:
        if ln == "---COL---":
            continue
        am = ANS_RE.search(ln)
        if am:
            if cur:
                recs.append(cur)
            ans = am.group(2).upper()
            ans = "".join(ch for ch in ans if ch in "ABCD")
            cur = {
                "qno": int(am.group(1)),
                "answer": ans,
                "source_ref": "",
                "explain": "",
                "ans_pdf_page": page_no,
            }
            field = "explain"
            rest = ln[am.end() :].strip()
            if rest:
                cur["explain"] = rest
            continue
        if not cur:
            continue
        sm = SRC_RE.search(ln)
        if sm or ln.startswith("出处"):
            cur["source_ref"] = (cur["source_ref"] + " " + ln).strip()
            field = "explain"
            continue
        if ln.startswith("简析"):
            field = "explain"
            cur["explain"] = (cur["explain"] + " " + ln).strip()
            continue
        if ln.startswith("点拨"):
            field = "explain"
            cur["explain"] = (cur["explain"] + " " + ln).strip()
            continue
        if field == "explain":
            cur["explain"] = (cur["explain"] + " " + ln).strip()
    if cur:
        recs.append(cur)
    return recs


def extract_answers(force: bool = False) -> list[dict]:
    if not A_PDF.is_file():
        raise SystemExit(f"missing {A_PDF}")
    OCR_CACHE.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(A_PDF)
    all_recs: list[dict] = []
    ocr_txt = OUT_DIR / "answers.ocr.txt"
    chunks: list[str] = []
    for i in range(doc.page_count):
        png = OCR_CACHE / f"ans_{i+1:03d}.png"
        if force or not png.is_file():
            render_page(doc[i], png)
        lines = ocr_two_col(png)
        chunks.append(f"\n===== p{i+1} =====\n" + "\n".join(lines))
        recs = parse_answer_lines(lines, i + 1)
        all_recs.extend(recs)
        if (i + 1) % 10 == 0 or i + 1 == doc.page_count:
            print(f"  ocr {i+1}/{doc.page_count} recs={len(all_recs)}")
    doc.close()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ocr_txt.write_text("".join(chunks), encoding="utf-8")
    (OUT_DIR / "answers.json").write_text(
        json.dumps(all_recs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  answers {len(all_recs)} -> {OUT_DIR / 'answers.json'}")
    return all_recs


def split_answer_segments(answers: list[dict]) -> list[list[dict]]:
    """题号回绕处分段；过短的尾巴并入上一段（解析册翻页造成的假重置）。"""
    segments: list[list[dict]] = []
    cur: list[dict] = []
    last = 0
    for rec in answers:
        n = rec["qno"]
        if cur and n < last - 5 and n <= 8:
            segments.append(cur)
            cur = []
        cur.append(rec)
        last = n
    if cur:
        segments.append(cur)
    merged: list[list[dict]] = []
    for seg in segments:
        if merged and len(seg) < 15:
            merged[-1].extend(seg)
        else:
            merged.append(seg)
    return merged


def attach_source_ref(rec: dict) -> None:
    if rec.get("source_ref"):
        return
    blob = rec.get("explain") or ""
    m = SRC_RE.search(blob)
    if m:
        rec["source_ref"] = f"精讲 P{m.group(1)} 考点{m.group(2)}"


def merge(questions: list[dict], answers: list[dict]) -> list[dict]:
    """按科目+题型出现顺序对齐解析册（题号每段重置）。"""
    for rec in answers:
        attach_source_ref(rec)
    segments = split_answer_segments(answers)

    q_segs: list[tuple[str, str, list[dict]]] = []
    for q in questions:
        if not q_segs or q_segs[-1][0] != q["subject"] or q_segs[-1][1] != q["kind"]:
            q_segs.append((q["subject"], q["kind"], []))
        q_segs[-1][2].append(q)

    print(f"  answer segments={len(segments)} question segs={len(q_segs)}")
    for i, (subj, kind, qs) in enumerate(q_segs):
        if i >= len(segments):
            print(f"  WARN no answer seg for {subj} {kind}")
            continue
        amap: dict[int, dict] = {}
        for r in segments[i]:
            # 先出现的是本段正文；段尾假重置的题号不能覆盖
            if r["qno"] not in amap:
                amap[r["qno"]] = r
        hit = 0
        for q in qs:
            rec = amap.get(q["qno"])
            if not rec:
                continue
            q["answer"] = rec["answer"]
            q["source_ref"] = rec.get("source_ref") or ""
            q["explain"] = rec.get("explain") or ""
            q["ans_pdf_page"] = rec.get("ans_pdf_page")
            hit += 1
        print(f"  merge {subj} {kind}: {hit}/{len(qs)}")
    return questions


def write_public(items: list[dict]) -> None:
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  public {len(items)} -> {PUBLIC}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", nargs="?", default="questions", choices=["questions", "answers", "merge", "all"])
    ap.add_argument("--force-ocr", action="store_true")
    args = ap.parse_args()
    if args.mode in ("questions", "all"):
        extract_questions()
    if args.mode in ("answers", "all"):
        extract_answers(force=args.force_ocr)
    if args.mode in ("merge", "all"):
        qpath = OUT_DIR / "questions.json"
        apath = OUT_DIR / "answers.json"
        qs = json.loads(qpath.read_text(encoding="utf-8"))
        ans = json.loads(apath.read_text(encoding="utf-8"))
        merged = merge(qs, ans)
        (OUT_DIR / "questions.merged.json").write_text(
            json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        write_public(merged)


if __name__ == "__main__":
    main()
