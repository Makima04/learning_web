#!/usr/bin/env python3
"""从【A4紧凑版】880 数一 做题本（高数篇 / 线概篇）重建李林880题库。

相对旧版做的两件事：
1. 按原书顺序：章 → 题组（基础题/综合题/拓展题）→ 题型（选择/填空/解答）→ 题号，
   顺序即 PDF 出现顺序，写进 `ord` 字段，刷题页不再靠 page/qno 猜。
2. 裁图完整：从本题起始裁到**下一题起始**，题干之外的选项、图形（矢量图）都进图。

id 沿用旧库 `ll-{part}-{ch}-{kind}-{qno}[-xN]`，答案 / 解析图 / 考点 / 题型分类按 id 继承。

用法：
  .venv/bin/python3 scripts/extract_lilin880_compact.py --dry   # 只解析，对比 id
  .venv/bin/python3 scripts/extract_lilin880_compact.py         # 解析 + 裁图 + 写库 + 分片
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_lilin880 import CH_RE, Q_RE, clean_line, page_visual_lines, split_options
from math_img import render_clips
from math_kp_map import LILIN_CHAPTER_NAME, apply_overlay, classify_lilin

ROOT = Path("/Users/makima/program/web/english_web")
DOWNLOADS = Path("/Users/makima/Downloads")
OUT_DIR = ROOT / "papers" / "math" / "lilin880"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "math" / "lilin880.json"
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "ll"

PAGE_TOP = 40.0
PAGE_BOTTOM = 802.0
SCALE = 1.9
JPEG_QUALITY = 58

BAND_PART = {"基础题": "base", "综合题": "hard", "拓展题": "hard"}
KIND_RE2 = re.compile(r"^(?:[一二三四五六七八]、)?\s*(选择题|填空题|解答题)\s*$")
FOOTER_RE = re.compile(r"^·\s*第\s*\d+\s*页")
Q_XMAX = 95.0  # 题号固定在左边距 72pt，正文缩进更深
# 紧凑版有些题号丢左括号（"12) 设f x …"），放宽匹配
Q_RE2 = re.compile(r"^\(?\s*(\d{1,2})\s*\)\s*")


def kind_of(label: str) -> str:
    if "选择" in label:
        return "mcq"
    if "填空" in label:
        return "fill"
    return "big"


def book_of(ch: int) -> str:
    return "calc" if ch <= 9 else ("linear" if ch <= 15 else "prob")


def find_pdfs() -> list[Path]:
    out = sorted(DOWNLOADS.glob("*880*做题本*.pdf"))
    if not out:
        raise FileNotFoundError("~/Downloads 里没找到 880 做题本 PDF")
    return out


def parse_doc(doc: fitz.Document, sources: list[dict]) -> list[dict]:
    """按正文标记切题，返回按原书顺序排列的题目（含裁图范围）。"""
    questions: list[dict] = []
    ch = 0
    band = "基础题"
    kind = "mcq"
    pending: dict | None = None
    # 每题四边：(起始页, 起始 y, 结束页, 结束 y)
    marks: list[tuple[int, float]] = []  # 所有结构行，供算裁图终点

    def flush() -> None:
        nonlocal pending
        if not pending:
            return
        stem = (pending.pop("_body", "") or "").strip()
        if not stem:
            pending = None
            return
        opts: dict[str, str] = {}
        if pending["kind"] == "mcq":
            stem, opts = split_options(stem)
        pending["stem"] = re.sub(r"\n{3,}", "\n\n", stem).strip()
        if opts:
            pending["options"] = {k: v for k, v in opts.items() if v}
        if pending.get("_band") == "基础题" and pending["part"] == "hard":
            pass
        extra = " ".join((pending.get("options") or {}).values())
        pending["kp_ids"] = classify_lilin(pending["chapter"], pending["stem"], extra)
        apply_overlay(pending)
        pending["section_name"] = LILIN_CHAPTER_NAME.get(
            pending["chapter"], pending.get("section_name") or ""
        )
        questions.append(pending)
        pending = None

    for i in range(doc.page_count):
        page_no = i + 1
        for rec in page_visual_lines(doc[i]):
            ln = clean_line(rec["text"])
            if not ln:
                continue
            y0 = rec["y0"]
            if y0 < PAGE_TOP - 10 or y0 > PAGE_BOTTOM + 10:
                continue
            if FOOTER_RE.match(ln) or ln in ("目", "录", "目录"):
                continue
            m_ch = CH_RE.match(ln)
            if m_ch and len(ln) <= 24:
                ch_no = cn_chapter(m_ch.group(1))
                if ch_no:
                    flush()
                    ch = ch_no
                    band = "基础题"
                    kind = "mcq"
                    marks.append((page_no, y0))
                    continue
            if ln in BAND_PART:
                flush()
                band = ln
                marks.append((page_no, y0))
                continue
            m_kind = KIND_RE2.match(ln)
            if m_kind:
                flush()
                kind = kind_of(m_kind.group(1))
                marks.append((page_no, y0))
                continue
            m_q = Q_RE2.match(ln)
            if m_q and rec["x0"] <= Q_XMAX and ch > 0:
                flush()
                qno = int(m_q.group(1))
                pending = {
                    "id": f"ll-{BAND_PART[band]}-{ch}-{kind}-{qno}",
                    "source": "lilin880",
                    "part": BAND_PART[band],
                    "book": book_of(ch),
                    "kind": kind,
                    "chapter": ch,
                    "section": str(ch),
                    "section_name": LILIN_CHAPTER_NAME.get(ch, ""),
                    "band": band,
                    "qno": qno,
                    "pdf_page": page_no,
                    "_body": ln[m_q.end() :].strip(),
                    "_page": page_no,
                    "_y0": y0,
                    "_page_no": page_no,
                }
                marks.append((page_no, y0))
                continue
            if pending:
                pending["_body"] = (pending.get("_body") or "") + "\n" + ln

    flush()
    for q in questions:
        q["_marks"] = marks
    return questions


def cn_chapter(s: str) -> int | None:
    from extract_lilin880 import CN_NUM

    if s.isdigit():
        return int(s)
    return CN_NUM.get(s)


_INTERVALS: dict[tuple[int, int], list[tuple[float, float]]] = {}


def page_intervals(q: dict, page: int) -> list[tuple[float, float]]:
    """某页所有内容行/图块的 (y0, y1)，按 y 排好。"""
    key = (id(q["_doc"]), page)
    hit = _INTERVALS.get(key)
    if hit is not None:
        return hit
    doc = q["_doc"]
    out: list[tuple[float, float]] = []
    if 1 <= page <= doc.page_count:
        for rec in page_visual_lines(doc[page - 1]):
            out.append((rec["y0"], rec["y1"]))
        for b in doc[page - 1].get_text("dict").get("blocks") or []:
            if b.get("type") == 1 and b.get("bbox"):  # 图片块
                out.append((b["bbox"][1], b["bbox"][3]))
    out.sort()
    _INTERVALS[key] = out
    return out


def gap_split(
    q: dict, page: int, y_mark: float, win: float = 95.0
) -> tuple[float, float] | None:
    """在 y_mark 附近找「上一块内容」与「下一块内容」之间的最大空白带。

    返回 (上一块的下沿, 下一块的上沿)。题号所在行的 y0 不一定是题目的上边界：
    矩阵、分式、图形都会伸到题号行上方，按题号行切会把上半截裁掉。
    """
    lo, hi = max(PAGE_TOP, y_mark - win), min(PAGE_BOTTOM, y_mark + 12)
    iv = [(a, b) for a, b in page_intervals(q, page) if b > lo and a < hi]
    if len(iv) < 2:
        return None
    gaps = [
        (iv[i + 1][0] - iv[i][1], iv[i][1], iv[i + 1][0]) for i in range(len(iv) - 1)
    ]
    gaps = [g for g in gaps if g[0] > 1.5]
    if not gaps:
        return None
    best = min(sorted(gaps, key=lambda g: -g[0])[:3], key=lambda g: abs((g[1] + g[2]) / 2 - y_mark))
    if abs((best[1] + best[2]) / 2 - y_mark) > win:
        return None
    return best[1], best[2]


def assign_clips(questions: list[dict]) -> None:
    """裁图 = [本题上边界, 下一题上边界)，跨页时把续页也拼上。"""
    for q in questions:
        page = q["_page"]
        y0 = q["_y0"]
        marks = q["_marks"]
        nxt: tuple[int, float] | None = None
        for p, y in marks:
            if p == page and y > y0 + 1.5:
                nxt = (p, y)
                break
            if p > page:
                nxt = (p, y)
                break
        split = gap_split(q, page, y0)
        start = max(PAGE_TOP, split[0] + 4) if split else max(PAGE_TOP, y0 - 6)
        clips: list[tuple[int, float, float]] = []
        if nxt and nxt[0] == page:
            split_next = gap_split(q, page, nxt[1])
            end = min(PAGE_BOTTOM, split_next[1] - 4) if split_next else min(PAGE_BOTTOM, nxt[1] - 6)
            if end <= start + 20:
                end = min(PAGE_BOTTOM, nxt[1] - 6)
            clips.append((page, start, end))
        else:
            # 本题是这页最后一题：裁到内容末尾，只有贴到页底才认为续页
            last_y1 = max(
                (b for a, b in page_intervals(q, page) if a >= start - 1), default=y0
            )
            end = min(PAGE_BOTTOM, last_y1 + 6)
            clips.append((page, start, end))
            if nxt and nxt[0] > page and last_y1 >= PAGE_BOTTOM - 30:
                for p in range(page + 1, nxt[0]):
                    clips.append((p, PAGE_TOP, PAGE_BOTTOM))
                split_tail = gap_split(q, nxt[0], nxt[1])
                tail = split_tail[1] - 4 if split_tail else nxt[1] - 6
                if tail > PAGE_TOP + 12:
                    clips.append((nxt[0], PAGE_TOP, min(PAGE_BOTTOM, tail)))
        q["_clips"] = clips


def merge_old(rows: list[dict], old: dict[str, dict]) -> None:
    """答案 / 解析图 / 考点 / 分类沿用旧库；新 id 才用 classify 结果。"""
    for q in rows:
        prev = old.get(q["id"])
        if not prev:
            continue
        for key in ("ans_img", "answer", "facets", "book_ans_page"):
            if prev.get(key) not in (None, "", [], {}):
                q[key] = prev[key]
        if prev.get("kp_ids"):
            q["kp_ids"] = prev["kp_ids"]
        for key in ("ans_img", "answer", "facets", "book_ans_page", "kp_ids"):
            q.pop("_" + key, None)


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
        "band": q.get("band"),
        "ord": q.get("ord"),
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


def check_sequence(rows: list[dict]) -> None:
    """同 (part, band, kind) 的题号应是 1..n 递增；否则说明切题误判。"""
    seq: dict[tuple, list[int]] = defaultdict(list)
    for q in rows:
        seq[(q["section"], q["part"], q["band"], q["kind"])].append(q["qno"])
    bad = 0
    for key, qnos in sorted(seq.items()):
        if qnos != list(range(1, len(qnos) + 1)):
            bad += 1
            print(f"  ! 题号不连续 {key}: {qnos[:20]}{'…' if len(qnos) > 20 else ''}")
    print(f"  顺序检查：{len(seq)} 组，异常 {bad} 组")


def main(argv: list[str]) -> int:
    dry = "--dry" in argv
    old_public = PUBLIC_CATALOG
    old = {}
    if old_public.is_file():
        old = {q["id"]: q for q in json.loads(old_public.read_text(encoding="utf-8"))}

    rows: list[dict] = []
    for pdf in find_pdfs():
        doc = fitz.open(str(pdf))
        print(f"== {pdf.name} pages={doc.page_count}", flush=True)
        parsed = parse_doc(doc, [])
        print(f"   解析 {len(parsed)} 题", flush=True)
        for q in parsed:
            q["_doc"] = doc
            q["_src"] = str(pdf)
        rows.extend(parsed)

    # 两本（高数篇 / 线概篇）合并成原书 1..23 章的顺序
    rows.sort(key=lambda q: q["chapter"])
    # 全局顺序号（原书顺序）
    for i, q in enumerate(rows):
        q["ord"] = i + 1
    check_sequence(rows)

    old_ids = set(old)
    new_ids = [q["id"] for q in rows]
    print(f"  新库 {len(new_ids)} 题 / 旧库 {len(old_ids)} 题")
    print(f"  新增 {len(set(new_ids) - old_ids)}：{sorted(set(new_ids) - old_ids)[:10]}")
    print(f"  丢失 {len(old_ids - set(new_ids))}：{sorted(old_ids - set(new_ids))[:10]}")
    dup = [x for x in set(new_ids) if new_ids.count(x) > 1]
    if dup:
        print(f"  同号 {len(dup)} 组（拓展题另起题号）")

    if dry:
        return 0

    # 同 id 重复 → -x2/-x3（与旧库一致：拓展题跟在综合题后面）
    seen: dict[str, int] = defaultdict(int)
    for q in rows:
        seen[q["id"]] += 1
        if seen[q["id"]] > 1:
            q["id"] = f"{q['id']}-x{seen[q['id']]}"
    merge_old(rows, old)
    assign_clips(rows)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    keep = {f"{q['id']}.jpg" for q in rows}
    stale = sorted(p.name for p in IMG_DIR.glob("*.jpg") if p.name not in keep)
    if stale:
        print(f"  多余旧图 {len(stale)} 张（未删，确认后手动清理）：{stale[:5]}")

    for q in rows:
        dest = IMG_DIR / f"{q['id']}.jpg"
        if render_clips(q["_doc"], q["_clips"], dest, scale=SCALE, quality=JPEG_QUALITY):
            q["img"] = f"/math/img/ll/{q['id']}.jpg"

    out_rows = []
    for q in rows:
        clean = {k: v for k, v in q.items() if not k.startswith("_")}
        out_rows.append(clean)

    (OUT_DIR / "questions.json").write_text(
        json.dumps(out_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    slim = [slim_row(q) for q in out_rows]
    PUBLIC_CATALOG.write_text(
        json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    by_ch = defaultdict(int)
    for q in out_rows:
        by_ch[q["section"]] += 1
    print("by chapter:", dict(sorted(by_ch.items(), key=lambda x: int(x[0]))))
    print(f"wrote {len(out_rows)} -> {PUBLIC_CATALOG}")

    from split_practice_catalogs import split_public_catalog

    split_public_catalog(PUBLIC_CATALOG)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
