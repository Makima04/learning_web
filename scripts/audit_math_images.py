#!/usr/bin/env python3
"""体检数学题图：找出「图不全」的题图。

判据只用图像本身的行墨迹分布（不依赖源 PDF）：
  · 文字行 = 连续有墨的行（空隙 < MERGE 视为同一行）
  · 行贴着图像边界、且高度明显低于正常行  → 这一行被切掉了半截
  · 末行与上一行之间隔了远超正常行距的空白，且该行稀疏  → 这行不是本题的（下一题碎片）
  · 尺寸异常（过矮 / 过高 / 全白）

用法：
  .venv/bin/python3 scripts/audit_math_images.py              # 打印汇总
  .venv/bin/python3 scripts/audit_math_images.py --json tmp/audit.json
  .venv/bin/python3 scripts/audit_math_images.py --worst 12  # 顺带存疑图拼一张对照图
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/Users/makima/program/web/english_web")
IMG_ROOT = ROOT / "frontend" / "public" / "math" / "img"
INK = 160         # 灰度低于此值算墨
MERGE = 4         # 行内空隙：小于此值不切行
EDGE = 2          # 距边界多少像素内算「压边」
CUT_RATIO = 0.62  # 行高低于中位行高的这个比例 → 可疑被切
GAP_RATIO = 1.45  # 行距超过中位行距的倍数 → 可疑分隔
SPARSE = 0.55     # 末行横向覆盖率低于此值 → 稀疏


def load_ink(path: Path) -> np.ndarray:
    g = Image.open(path).convert("L")
    return np.asarray(g) < INK


def bands_of(row_ink: np.ndarray) -> list[tuple[int, int]]:
    has = row_ink > 0
    bands: list[tuple[int, int]] = []
    start = None
    gap = 0
    for y, v in enumerate(has):
        if v:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= MERGE:
                bands.append((start, y - gap + 1))
                start = None
                gap = 0
    if start is not None:
        bands.append((start, len(has)))
    return bands


def audit_one(path: Path) -> dict:
    ink = load_ink(path)
    h, w = ink.shape
    bands = bands_of(ink.sum(axis=1))
    rec: dict = {
        "id": path.stem,
        "book": "zy" if "/zy/" in path.as_posix() else "ll",
        "file": path.relative_to(ROOT).as_posix(),
        "w": int(w),
        "h": int(h),
        "ratio": round(h / w, 3),
        "bands": len(bands),
        "flags": [],
    }
    if not bands:
        rec["flags"].append("blank")
        return rec

    heights = [b - a for a, b in bands]
    med_h = float(statistics.median(heights))
    gaps = [bands[i + 1][0] - bands[i][1] for i in range(len(bands) - 1)]
    med_gap = float(statistics.median(gaps)) if gaps else float(MERGE)
    rec["med_h"] = round(med_h, 1)
    rec["med_gap"] = round(med_gap, 1)

    first_y0, first_y1 = bands[0]
    last_y0, last_y1 = bands[-1]

    if first_y0 <= EDGE and (first_y1 - first_y0) < CUT_RATIO * med_h:
        rec["flags"].append("cut_top")
    if last_y1 >= h - EDGE and (last_y1 - last_y0) < CUT_RATIO * med_h:
        rec["flags"].append("cut_bottom")

    if len(bands) >= 2:
        gap_prev = last_y0 - bands[-2][1]
        band_h = last_y1 - last_y0
        if gap_prev > GAP_RATIO * max(med_gap, med_h * 0.9):
            cols = ink[last_y0:last_y1].any(axis=0)
            cov = float(cols.mean())
            if cov < SPARSE or band_h < CUT_RATIO * med_h:
                rec["flags"].append("tail_foreign")
                rec["tail_cov"] = round(cov, 3)
                rec["tail_gap"] = int(gap_prev)

    if h < 90:
        rec["flags"].append("tiny")
    if h / w > 1.25:
        rec["flags"].append("tall")
    if h / w < 0.06:
        rec["flags"].append("flat")
    return rec


def contact_sheet(items: list[dict], out: Path, cols: int = 3) -> None:
    from PIL import ImageDraw

    pad = 16
    label_h = 22
    thumbs = []
    for r in items[:cols * 4]:
        im = Image.open(ROOT / r["file"]).convert("RGB")
        scale = 560 / im.width
        im = im.resize((560, max(1, int(im.height * scale))))
        canvas = Image.new("RGB", (560, im.height + label_h), "white")
        canvas.paste(im, (0, label_h))
        d = ImageDraw.Draw(canvas)
        d.text((4, 4), f"{r['id']}  {'/'.join(r['flags'])}", fill="black")
        d.rectangle([0, label_h, 559, label_h + im.height - 1], outline="#dddddd")
        thumbs.append(canvas)

    if not thumbs:
        return
    rows = (len(thumbs) + cols - 1) // cols
    cw = 560 + pad
    ch = max(t.height for t in thumbs) + pad
    sheet = Image.new("RGB", (cw * cols + pad, ch * rows + pad), "#f2f3f5")
    for i, t in enumerate(thumbs):
        sheet.paste(t, (pad + (i % cols) * cw, pad + (i // cols) * ch))
    sheet.save(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path)
    ap.add_argument("--only", choices=["zy", "ll"])
    ap.add_argument("--worst", type=int, default=0, help="为每类生成对照图，取前 N 条")
    args = ap.parse_args()

    files = sorted(IMG_ROOT.rglob("*.jpg"))
    if args.only:
        files = [p for p in files if f"/{args.only}/" in p.as_posix()]

    recs = [audit_one(p) for p in files]

    by_flag: dict[str, list[dict]] = {}
    for r in recs:
        for f in r["flags"]:
            by_flag.setdefault(f, []).append(r)

    print(f"\n共体检 {len(recs)} 张")
    for flag, items in sorted(by_flag.items(), key=lambda kv: -len(kv[1])):
        ll = sum(1 for r in items if r["book"] == "ll")
        print(f"  {flag:13s} {len(items):5d}   ll {ll:4d} / zy {len(items) - ll:4d}")

    for flag in ("cut_top", "cut_bottom", "tail_foreign", "blank", "tiny", "tall", "flat"):
        items = by_flag.get(flag, [])
        if not items:
            continue
        print(f"\n[{flag}] 前 10 条：")
        for r in items[:10]:
            extra = ""
            if "tail_cov" in r:
                extra = f" tail_cov={r['tail_cov']} tail_gap={r['tail_gap']}"
            print(f"  {r['file']}  {r['w']}x{r['h']} bands={r['bands']} "
                  f"med_h={r['med_h']}{extra}")
        if args.worst:
            out = ROOT / f"tmp/audit-{flag}.png"
            contact_sheet(items, out)
            print(f"  → 对照图 {out.relative_to(ROOT)}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(recs, ensure_ascii=False, indent=1))
        print(f"\n明细写入 {args.json}")


if __name__ == "__main__":
    main()
