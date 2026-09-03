#!/usr/bin/env python3
"""从 2027 王道选择题【答案速查】OCR 字母答案，按 (book, section, qno) 挂到已有目录。"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz
from ocrmac import ocrmac

ROOT = Path("/Users/makima/program/web/english_web")
DOWNLOADS = Path("/Users/makima/Downloads/27王道选择题【答案速查】")
OUT_DIR = ROOT / "papers" / "cs408" / "wangdao2027"
QUESTIONS_JSON = OUT_DIR / "questions.json"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "cs408" / "wangdao2027.json"
CACHE = Path("/tmp/wd408_ans_ocr")

SOURCES = [
    ("ds", DOWNLOADS / "27王道《数据结构》选择题【答案速查】.pdf"),
    ("os", DOWNLOADS / "27王道《操作系统》选择题【答案速查】.pdf"),
    ("co", DOWNLOADS / "27王道《计组》选择题【答案速查】.pdf"),
    ("cn", DOWNLOADS / "27王道《计网》选择题【答案速查】.pdf"),
]

WATERMARK_RE = re.compile(
    r"微信公众号.*?【研七七】|微信公众号.*|【研七七】|研七七|微信"
)
SEC_RE = re.compile(r"^(\d{1,2}\.\d{1,2})\s*")
SKIP_RE = re.compile(r"^(2027|注[:：]|王道|选择题|答案速查)")


def render_page(page: fitz.Page, dest: Path, width: int = 2000) -> None:
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(str(dest))


def ocr_lines(png: Path) -> list[str]:
    anns = ocrmac.OCR(str(png), language_preference=["zh-Hans", "en-US"]).recognize()
    items = []
    for text, _conf, box in anns:
        x, y, w, h = box
        top = 1.0 - (y + h)
        t = (text or "").strip()
        if t:
            items.append((top, x, t))
    items.sort()
    lines: list[list[tuple[float, str]]] = []
    line_y: list[float] = []
    for top, x, t in items:
        if lines and abs(line_y[-1] - top) < 0.012:
            lines[-1].append((x, t))
        else:
            lines.append([(x, t)])
            line_y.append(top)
    out = []
    for parts in lines:
        parts.sort()
        ln = re.sub(r"\s+", " ", " ".join(p[1] for p in parts)).strip()
        ln = WATERMARK_RE.sub("", ln).strip()
        if ln:
            out.append(ln)
    return out


def _normalize_blob(blob: str) -> str:
    """顿号在括号外是 5 个一组的换行，在括号内是罗马数字分隔。"""
    s = WATERMARK_RE.sub("", blob or "")
    out: list[str] = []
    depth = 0
    for ch in s:
        if ch in "(（":
            if depth == 1:
                out.append(")")
            depth += 1
            out.append("(")
        elif ch in ")）":
            if depth:
                depth -= 1
            out.append(")")
        elif ch in "、":
            out.append("," if depth else "")
        elif ch in " \t":
            if depth:
                out.append(" ")
        elif ch in "O0" and depth == 0:
            out.append("C")  # C 常被认成 O/0
        else:
            out.append(ch)
    while depth > 0:
        out.append(")")
        depth -= 1
    return "".join(out)


def expand_answers(blob: str) -> list[str]:
    """CACAC / BCCBD、DCDAA / (BA)DBCD / AA(AB)(AD)D / (I、IV、VI) → 逐题答案。"""
    s = _normalize_blob(blob)
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch in "，,;；":
            i += 1
            continue
        if ch == "(":
            j = i + 1
            depth = 1
            while j < n and depth:
                if s[j] == "(":
                    depth += 1
                elif s[j] == ")":
                    depth -= 1
                j += 1
            inner = re.sub(r"\s+", "", s[i + 1 : j - 1]).strip(" ,")
            if inner:
                out.append(inner)
            i = j
            continue
        if ch in "ABCD":
            out.append(ch)
            i += 1
            continue
        i += 1
    return out


def parse_book_lines(lines: list[str]) -> dict[str, list[str]]:
    """section → 答案列表。"""
    sections: dict[str, list[str]] = {}
    cur: str | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal cur, buf
        if cur and buf:
            sections[cur] = expand_answers("".join(buf))
        buf = []

    for ln in lines:
        if SKIP_RE.search(ln):
            continue
        m = SEC_RE.match(ln)
        if m and ("【P" in ln or "【p" in ln.lower() or re.search(r"[\u4e00-\u9fff]", ln)):
            flush()
            cur = m.group(1)
            rest = ln[m.end() :].strip()
            # 标题行一般不含答案；CISC/CPU/UDP 里的字母不要当答案
            rest = re.sub(r"【P\d+】?", "", rest)
            rest = re.sub(r"[\u4e00-\u9fff].*", "", rest).strip()
            if rest and re.fullmatch(r"[A-D()（）IV,，、\s]+", rest) and re.search(r"[A-D]", rest):
                buf.append(rest)
            continue
        if cur:
            buf.append(ln)
    flush()
    return sections


def extract_book(book: str, pdf: Path, force: bool = False) -> dict[str, list[str]]:
    CACHE.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf))
    all_lines: list[str] = []
    for i in range(doc.page_count):
        png = CACHE / f"{book}_p{i+1}.png"
        cache = CACHE / f"{book}_p{i+1}.json"
        if force or not cache.exists():
            render_page(doc[i], png)
            lines = ocr_lines(png)
            cache.write_text(json.dumps(lines, ensure_ascii=False), encoding="utf-8")
        else:
            lines = json.loads(cache.read_text(encoding="utf-8"))
        all_lines.extend(lines)
    doc.close()
    return parse_book_lines(all_lines)


def slim_row(q: dict) -> dict:
    row = {
        "id": q["id"],
        "book": q["book"],
        "kind": q["kind"],
        "section": q["section"],
        "section_name": q.get("section_name") or "",
        "qno": q["qno"],
        "pdf_page": q.get("pdf_page"),
        "book_ans_page": q.get("book_ans_page"),
        "year": q.get("year"),
        "stem": q.get("stem") or "",
        "kp_ids": q.get("kp_ids") or [],
    }
    if q.get("options"):
        row["options"] = q["options"]
    if q.get("answer"):
        row["answer"] = q["answer"]
    if q.get("ans_img"):
        row["ans_img"] = q["ans_img"]
    return row


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if not QUESTIONS_JSON.exists():
        print(f"missing {QUESTIONS_JSON}", file=sys.stderr)
        return 1
    catalog = json.loads(QUESTIONS_JSON.read_text(encoding="utf-8"))
    for q in catalog:
        if q.get("kind") == "mcq":
            q.pop("answer", None)

    by_sec: dict[tuple, list[dict]] = defaultdict(list)
    for q in catalog:
        if q.get("kind") != "mcq":
            continue
        by_sec[(q["book"], str(q["section"]))].append(q)
    for qs in by_sec.values():
        qs.sort(key=lambda x: x["qno"])

    matched = 0
    miss_sec: list[str] = []
    len_mismatch: list[str] = []
    parsed_n = 0

    for book, pdf in SOURCES:
        print(f"== {book} {pdf.name}", flush=True)
        sections = extract_book(book, pdf, force=args.force)
        for sec, answers in sorted(sections.items()):
            parsed_n += len(answers)
            qs = by_sec.get((book, sec), [])
            cat_max = max((q["qno"] for q in qs), default=0)
            if not qs:
                miss_sec.append(f"{book}-{sec} ans={len(answers)}")
                continue
            if len(answers) != cat_max:
                len_mismatch.append(
                    f"{book}-{sec} ans={len(answers)} catalog_max={cat_max} n={len(qs)}"
                )
            by_qno = {q["qno"]: q for q in qs}
            for i, ans in enumerate(answers, start=1):
                q = by_qno.get(i)
                if not q:
                    continue
                q["answer"] = ans
                matched += 1

    QUESTIONS_JSON.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    slim = [slim_row(q) for q in catalog]
    PUBLIC_CATALOG.write_text(
        json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    report = {
        "matched": matched,
        "parsed": parsed_n,
        "mcq": sum(1 for q in catalog if q.get("kind") == "mcq"),
        "mcq_with_answer": sum(
            1 for q in catalog if q.get("kind") == "mcq" and q.get("answer")
        ),
        "missing_sections": miss_sec,
        "len_mismatch": len_mismatch,
    }
    (OUT_DIR / "mcq_answers_index.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"matched {matched}  parsed {parsed_n}  "
        f"mcq_with_answer {report['mcq_with_answer']}/{report['mcq']}"
    )
    if miss_sec:
        print("missing sections", miss_sec)
    if len_mismatch:
        print("len mismatch", len(len_mismatch))
        for row in len_mismatch:
            print(" ", row)
    print(f"wrote {PUBLIC_CATALOG}")
    from split_practice_catalogs import split_public_catalog

    split_public_catalog(PUBLIC_CATALOG)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
