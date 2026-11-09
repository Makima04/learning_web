#!/usr/bin/env python3
"""修李林880题图的上下边界：只动被切坏的那一小截，不动其余。

线上“图不全”的根因：旧裁法把边界取成 [本题题号 y, 下一题题号 y]。
但矩阵 / 分式 / 图这类高元素是**竖直居中于题号**排的，几何上会跑到题号上方：
  · 属于本题、但顶部跑到本题题号之上的块  → 被切掉顶部（图不全）
  · 属于下一题、但顶部跑到下一题题号之上的块 → 漏进本图底部（多一条 `[1 1 1]`）

判据只看“跨越题号分隔线”的块：
  · 跨过本题题号的块  必然属于本题  → 上边界抬到它的顶
  · 跨过下一题题号的块 必然属于下一题 → 下边界收到它的顶
其余情况一律沿用旧边界（含原有留白），所以绝大多数图一个像素都不变。

用法：
  .venv/bin/python3 scripts/refit_lilin880_images.py              # 只统计
  .venv/bin/python3 scripts/refit_lilin880_images.py --preview tmp/out
  .venv/bin/python3 scripts/refit_lilin880_images.py --apply       # 写回（先备份 tmp/ll-orig-<ts>/）
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import fitz
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from math_img import render_clips

ROOT = Path("/Users/makima/program/web/english_web")
DL = Path("/Users/makima/Downloads")
PDFS = {
    "calc": DL / "【A4紧凑版】880数一高数篇做题本.pdf",
    "lin": DL / "【A4紧凑版】880数一线概篇做题本.pdf",
}
PDF_KEY = {"calc": "calc", "linear": "lin", "prob": "lin"}
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "ll"
INDEX = ROOT / "frontend" / "public" / "math" / "lilin880" / "index.json"
BACKUP = ROOT / "tmp" / f"ll-orig-{datetime.now():%Y%m%d-%H%M}"

SCALE = 1.9
QUALITY = 58
PAGE_TOP = 40.0
PAGE_BOTTOM = 802.0
Q_XMAX = 95.0
PAD = 3.0           # 与 math_img.render_clips 的白边一致
STADDLE_TOL = 1.5   # 视为“跨越”题号线的容差（pt）
HEAD_RE = re.compile(
    r"^(第[一二三四五六七八九十]+\s*章|基础题|综合题|拓展题|强化题|"
    r"[一二三四五]\s*、\s*(选择题|填空题|解答题)|选择题|填空题|解答题|"
    r"高等数学篇|线性代数篇|概率论与数理统计篇)")
Q_RE = re.compile(r"^\(?\s*(\d{1,2})\s*\)")


def elements_of(page: fitz.Page) -> list[tuple[float, float]]:
    """页面内容元素的纵向区间：文字块 + 位图 + 矢量图。页眉页脚已剔。"""
    out: list[tuple[float, float]] = []
    pr = page.rect
    for b in page.get_text("blocks"):
        y0, y1 = b[1], b[3]
        if y1 <= PAGE_TOP or y0 >= PAGE_BOTTOM:
            continue
        out.append((y0, y1))
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 1:
            continue
        _x0, y0, _x1, y1 = b["bbox"]
        if y1 <= PAGE_TOP or y0 >= PAGE_BOTTOM:
            continue
        out.append((y0, y1))
    for d in page.get_drawings():
        r = d["rect"]
        if r.height < 3 or r.width < 3:
            continue
        if r.width > 0.9 * pr.width and r.height > 0.9 * pr.height:
            continue
        if r.y1 <= PAGE_TOP or r.y0 >= PAGE_BOTTOM:
            continue
        out.append((r.y0, r.y1))
    return out


def markers_of(page: fitz.Page) -> list[float]:
    ys: list[float] = []
    for b in page.get_text("blocks"):
        if b[0] >= Q_XMAX or not Q_RE.match(b[4].strip()):
            continue
        if b[3] <= PAGE_TOP or b[1] >= PAGE_BOTTOM:
            continue
        ys.append(b[1])
    return sorted(ys)


def build_plan(limit: int | None):
    items = json.loads(INDEX.read_text())["items"]
    groups: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for it in items:
        groups[(PDF_KEY[it["book"]], it["pdf_page"])].append(it)
    for v in groups.values():
        v.sort(key=lambda i: i["ord"])

    docs = {k: fitz.open(p) for k, p in PDFS.items()}
    plan: list[dict] = []
    skipped: list[str] = []

    for (pk, page_no), its in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        page = docs[pk][page_no - 1]
        marks = markers_of(page)
        if len(marks) != len(its):
            skipped.append(f"{pk} p{page_no}: 题号 {len(marks)} != 题目 {len(its)}")
            continue
        elems = elements_of(page)
        page_lo = page.rect.y0 + 18
        page_hi = page.rect.y1 - 16

        for k, (it, my) in enumerate(zip(its, marks)):
            top = my
            # 跨过本题题号的块 → 属于本题，顶部被切了
            for y0, y1 in elems:
                if y0 < my - STADDLE_TOL and y1 > my + STADDLE_TOL:
                    top = min(top, y0)
            # 本页题号下方最近的「章名 / 题型小标题」——它一定是下一段的开头
            heads = [b[1] for b in page.get_text("blocks")
                     if b[1] > my + 2 and b[0] < Q_XMAX
                     and HEAD_RE.match(b[4].strip().split("\n")[0].strip())]
            if k + 1 < len(marks):
                bot = marks[k + 1]
            else:
                # 页面最后一题：收到自己内容底沿，别一路吃到页脚
                below = [y1 for y0, y1 in elems if y1 > my + 2]
                bot = min(page_hi, max(below) if below else page_hi)
            if heads and min(heads) < bot:
                bot = min(heads)
                trimmed = True
            trimmed = False
            # 跨过下一题题号的块 → 属于下一题，别带进来
            if k + 1 < len(marks):
                nxt = marks[k + 1]
                for y0, y1 in elems:
                    if y0 < nxt - STADDLE_TOL and y1 > nxt + STADDLE_TOL and y0 < bot:
                        bot = y0
                        trimmed = True
            # render_clips 会在下边界补 3pt 白边；这里先让出去，避免把下一题的首行带进来一条
            bot_clip = bot - PAD
            plan.append({"id": it["id"], "pdf": pk, "page": page_no,
                         "clips": [(page_no, max(page_lo, top), min(page_hi, bot_clip))],
                         "top": max(page_lo, top), "bot": min(page_hi, bot)})
    if limit:
        plan = plan[:limit]
    return docs, plan, skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--preview", type=Path)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    docs, plan, skipped = build_plan(args.limit)
    print(f"计划 {len(plan)} 张，跳过 {len(skipped)} 条")
    for s in skipped[:10]:
        print("  skip:", s)

    report = []
    for rec in plan:
        dest = IMG_DIR / f"{rec['id']}.jpg"
        oh = Image.open(dest).height if dest.exists() else 0
        expect = int((rec["bot"] - rec["top"]) * SCALE)
        report.append((rec["id"], oh, expect, expect - oh))
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            render_clips(docs[rec["pdf"]], rec["clips"], args.preview / dest.name,
                         scale=SCALE, quality=QUALITY)
        elif args.apply:
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and not (BACKUP / dest.name).exists():
                BACKUP.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dest, BACKUP / dest.name)
            render_clips(docs[rec["pdf"]], rec["clips"], dest, scale=SCALE, quality=QUALITY)

    changed = [r for r in report if abs(r[3]) >= 3]
    print(f"边界需要改的：{len(changed)} 张（其余 {len(report) - len(changed)} 张不动）")
    print("\n补全最多的（顶部/底部被切）：")
    for r in sorted(report, key=lambda x: -x[3])[:10]:
        if r[3] >= 3:
            print(f"  {r[0]:26s} old={r[1]:4d} new={r[2]:4d} Δ={r[3]:+d}")
    print("\n收窄最多的（去掉下一题碎片）：")
    for r in sorted(report, key=lambda x: x[3])[:10]:
        if r[3] <= -3:
            print(f"  {r[0]:26s} old={r[1]:4d} new={r[2]:4d} Δ={r[3]:+d}")

    if args.apply:
        print(f"\n已写回 {len(plan)} 张，旧图备份 {BACKUP.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
