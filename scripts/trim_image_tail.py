#!/usr/bin/env python3
"""裁掉题图底部「不属于本题」的碎片（只按 id 指定，人工确认过再跑）。

张宇 1000 没有源 PDF，不能重裁；确认某张图底部混进了别的题内容时，用这个把它切掉。
切法：从最后一条文字行与上一行之间的空白处下刀，再补一条白边。

用法：
  .venv/bin/python3 scripts/trim_image_tail.py --show zy-hard-la-5-10
  .venv/bin/python3 scripts/trim_image_tail.py --apply zy-hard-la-5-10
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/Users/makima/program/web/english_web")
IMG_DIRS = [ROOT / "frontend" / "public" / "math" / "img" / b for b in ("ll", "zy")]
BACKUP = ROOT / "tmp" / "tail-trim-orig"
INK = 160
MERGE = 4
PAD = 10


def bands_of(ink: np.ndarray) -> list[tuple[int, int]]:
    has = ink.sum(axis=1) > 0
    out, start, gap = [], None, 0
    for y, v in enumerate(has):
        if v:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= MERGE:
                out.append((start, y - gap + 1))
                start, gap = None, 0
    if start is not None:
        out.append((start, len(has)))
    return out


def find(book_id: str) -> Path:
    for d in IMG_DIRS:
        p = d / f"{book_id}.jpg"
        if p.exists():
            return p
    raise SystemExit(f"找不到 {book_id}.jpg")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    for qid in args.ids:
        path = find(qid)
        im = Image.open(path).convert("L")
        ink = np.asarray(im) < INK
        bands = bands_of(ink)
        if len(bands) < 2:
            print(f"{qid}: 只有一个文字行，跳过")
            continue
        last = bands[-1]
        prev_bottom = bands[-2][1]
        gap = last[0] - prev_bottom
        cut = prev_bottom + max(1, gap // 2)
        print(f"{qid}: {im.width}x{im.height} 行={len(bands)} 末行={last} 上方空白={gap}px → 切到 y={cut}")

        if args.apply:
            new = im.crop((0, 0, im.width, cut))
            canvas = Image.new("L", (im.width, new.height + PAD), 255)
            canvas.paste(new, (0, 0))
            BACKUP.mkdir(parents=True, exist_ok=True)
            dst = BACKUP / path.name
            if not dst.exists():
                shutil.copy2(path, dst)
            canvas.save(path, format="JPEG", quality=90, optimize=True)
            print(f"   写入 {path.relative_to(ROOT)}  {new.width}x{new.height}+{PAD}")


if __name__ == "__main__":
    main()
