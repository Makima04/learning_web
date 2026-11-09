#!/usr/bin/env python3
"""修张宇 1000 题图底部「多带的下一题半行」。

背景：extract_zhangyu1000.py 用 `bot = next_rec["top"] - 0.004` 下刀，题号识别偶尔偏高，
裁图尾巴会带进下一题的第一行（只剩上半个字），题图看起来像被切断。
本题内容没丢，纯裁剪即可修，不需要重新渲染 PDF。

候选集只认一条硬证据：**图像最底一行有字迹**（约 74 张，其余 1000+ 张底部本来就有留白）。
再按末行高度分流：
  · 末行 < 正文字高 70%  → 判定为下一题半行，从上方留白处切掉，再补白边
  · 否则               → 是一整行正文压在边界上，只补白边，一个像素都不裁

用法：
  .venv/bin/python3 scripts/trim_zy_image_tails.py            # 干跑
  .venv/bin/python3 scripts/trim_zy_image_tails.py --apply    # 写回（备份到 tmp/zy-orig/）
"""
from __future__ import annotations

import argparse
import shutil
import statistics
from pathlib import Path

from PIL import Image

ROOT = Path("/Users/makima/program/web/english_web")
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "zy"
BACKUP_DIR = ROOT / "tmp" / "zy-orig"
INK = 160          # 灰度阈值：低于此值算字迹
MIN_GAP = 4        # 行间留白 ≥4px 视为换行
BOTTOM_PAD = 14    # 处理后留的白边
HALF_LINE = 0.70   # 末行低于正文字高的这个比例，判为半行
EDGE_INK = 0.008   # 底边一行至少这么多字迹才算「压边」（浅色印刷的字头也要抓到）
MIN_RUN = 1        # 底边连续有墨的行数下限（1 行也要修：只露出一条字头同样难看）
MIN_KEEP = 0.35    # 保护：最多切掉 65% 高度，避免把整张图当尾巴切光


def row_ink(px, w: int, y: int) -> int:
    step = max(1, w // 400)
    return sum(1 for x in range(0, w, step) if px[x, y] < INK)


def row_ink_exact(px, w: int, y: int) -> float:
    """整行逐像素算字迹占比，用于底边这种几十行的小范围判定。"""
    return sum(1 for x in range(w) if px[x, y] < INK) / w


def split_lines(profile: list[int]) -> list[tuple[int, int]]:
    lines: list[tuple[int, int]] = []
    start: int | None = None
    gap = 0
    for y, n in enumerate(profile):
        if n >= 2:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= MIN_GAP:
                lines.append((start, y - gap + 1))
                start = None
    if start is not None:
        lines.append((start, len(profile)))
    return lines


def analyse(path: Path) -> dict | None:
    im = Image.open(path).convert("L")
    w, h = im.size
    px = im.load()
    profile = [row_ink(px, w, y) for y in range(h)]

    # 硬证据：底边一行确实压着字迹，且从底边往上连续有墨（排除噪点与细横线）
    if row_ink_exact(px, w, h - 1) < EDGE_INK:
        return None
    run = 0
    y = h - 1
    while y >= 0 and row_ink_exact(px, w, y) >= EDGE_INK:
        run += 1
        y -= 1
        if run >= 40:
            break
    if run < MIN_RUN:
        return None

    lines = split_lines(profile)
    if len(lines) < 2:
        return None

    last_start, last_end = lines[-1]
    last_h = last_end - last_start
    body = [e - s for s, e in lines[:-1]]
    median_h = statistics.median(body) if body else last_h

    if last_h < median_h * HALF_LINE:
        cut = max(0, last_start - 3)
        if cut < h * MIN_KEEP:
            return None  # 要切的太多，宁可不碰
        return {"path": path, "size": (w, h), "mode": "trim", "cut": cut,
                "new_h": cut + BOTTOM_PAD, "last_h": last_h, "median_h": median_h}
    # 整行压边界：只补白，不裁
    return {"path": path, "size": (w, h), "mode": "pad", "cut": h,
            "new_h": h + BOTTOM_PAD, "last_h": last_h, "median_h": median_h}


def apply_one(info: dict) -> None:
    path: Path = info["path"]
    im = Image.open(path).convert("L")
    w, h = im.size
    cut = min(info["cut"], h)
    canvas = Image.new("L", (w, cut + BOTTOM_PAD), 255)
    canvas.paste(im.crop((0, 0, w, cut)), (0, 0))
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    bak = BACKUP_DIR / path.name
    if not bak.exists():
        shutil.copy2(path, bak)
    canvas.save(path, format="JPEG", quality=60, optimize=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    trims, pads = [], []
    for p in sorted(IMG_DIR.glob("*.jpg")):
        info = analyse(p)
        if not info:
            continue
        (trims if info["mode"] == "trim" else pads).append(info)

    print(f"候选（底边压墨）：{len(trims) + len(pads)} 张　裁掉半行 {len(trims)}　仅补白边 {len(pads)}\n")
    for info in trims:
        w, h = info["size"]
        print(f"  裁  {info['path'].name:26s} {w}x{h} → {w}x{info['new_h']}　末行 {info['last_h']}px / 正文 {info['median_h']:.0f}px")
    for info in pads:
        w, h = info["size"]
        print(f"  补白 {info['path'].name:26s} {w}x{h} → {w}x{info['new_h']}　末行 {info['last_h']}px / 正文 {info['median_h']:.0f}px")

    if not args.apply:
        print("\n干跑结束，加 --apply 才会写回。")
        return
    for info in trims + pads:
        apply_one(info)
    print(f"\n已写回 {len(trims) + len(pads)} 张，原图备份在 {BACKUP_DIR}")


if __name__ == "__main__":
    main()
