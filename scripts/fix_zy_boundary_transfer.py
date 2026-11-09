#!/usr/bin/env python3
"""张宇1000 题图边界修复：把「跑到上一题图底部的下一题碎片」搬回下一题顶部。

背景：题图按「本题题号行 → 下一题题号行」裁。矩阵、分式这类高元素竖直居中于题号，
顶部会溢出到题号上方，于是出现一对互补的毛病：
  · 第 n 张图底部多出一条 `[1 2 a]`（其实是第 n+1 题的矩阵首行）
  · 第 n+1 张图顶部被切掉矩阵首行（图不全）

张宇没有源 PDF，不能重裁；但两张图是同一次渲染、同宽度、同底色，所以可以**整块搬移**：
把第 n 张底部那条碎片从 n 上切下来，贴到 n+1 的顶部，两题都完整。

安全阀：只在「n+1 顶部确实被切」（首行贴边且比正常行矮）且「搬移后首行高度回到正常范围」
时才动手，其余一律不碰。

用法：
  .venv/bin/python3 scripts/fix_zy_boundary_transfer.py           # 干跑，列出候选
  .venv/bin/python3 scripts/fix_zy_boundary_transfer.py --apply    # 写回（备份 tmp/zy-transfer-orig/）
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/Users/makima/program/web/english_web")
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "zy"
INDEX = ROOT / "frontend" / "public" / "math" / "zhangyu1000" / "index.json"

INK = 160
MERGE = 4
PAD = 6            # 搬移后拼缝留白
CUT_RATIO = 0.75   # 首行高度低于中位行高的这个比例 → 判为被切
MIN_GAP = 8        # 碎片与正文之间的最小空白


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


def ink_of(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L")) < INK


def analyse(path: Path) -> dict:
    ink = ink_of(path)
    h, w = ink.shape
    bands = bands_of(ink)
    if not bands:
        return {"path": path, "bands": [], "med": 0, "h": h, "w": w}
    heights = [b - a for a, b in bands]
    med = float(np.median(heights))
    return {"path": path, "bands": bands, "med": med, "h": h, "w": w,
            "top_cut": bands[0][0] <= 1 and (bands[0][1] - bands[0][0]) < CUT_RATIO * med}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    items = json.loads(INDEX.read_text())["items"]
    items.sort(key=lambda i: (i["pdf_page"], i["qno"]))
    order = [it for it in items if (IMG_DIR / f"{it['id']}.jpg").exists()]

    backup = ROOT / "tmp" / "zy-transfer-orig"
    pairs = []
    for prev, cur in zip(order, order[1:]):
        p_path = IMG_DIR / f"{prev['id']}.jpg"
        c_path = IMG_DIR / f"{cur['id']}.jpg"
        a, b = analyse(p_path), analyse(c_path)
        if not a["bands"] or not b["bands"] or a["w"] != b["w"]:
            continue
        if not b["top_cut"]:
            continue
        # 上一张图：末行与其上方必须有明显空白，末行才是“漂过来的碎片”
        last = a["bands"][-1]
        prev_bottom = a["bands"][-2][1] if len(a["bands"]) >= 2 else 0
        gap = last[0] - prev_bottom
        if gap < MIN_GAP:
            continue
        frag_h = a["h"] - last[0]
        if frag_h < 3:
            continue
        # 拼起来后的首行高度要回到正常范围
        composed = frag_h + PAD + (b["bands"][0][1] - b["bands"][0][0])
        if not (0.75 * b["med"] <= composed <= 1.8 * b["med"]):
            continue
        pairs.append((prev["id"], cur["id"], a, b, last[0], frag_h, composed))

    print(f"候选 {len(pairs)} 对")
    for pid, cid, a, b, cut, frag_h, composed in pairs[:20]:
        print(f"  {pid:22s} → {cid:22s} 碎片 {frag_h:3d}px  首行 {b['bands'][0][1] - b['bands'][0][0]:3d} → {composed:3d}px (中位 {b['med']:.0f})")

    if not args.apply:
        return

    backup.mkdir(parents=True, exist_ok=True)
    done = 0
    for pid, cid, a, b, cut, frag_h, composed in pairs:
        p_path = IMG_DIR / f"{pid}.jpg"
        c_path = IMG_DIR / f"{cid}.jpg"
        p_im = Image.open(p_path).convert("L")
        c_im = Image.open(c_path).convert("L")
        if p_im.width != c_im.width:
            continue

        frag = p_im.crop((0, cut, p_im.width, p_im.height))
        # 上一张：切掉碎片，补白边
        new_p = p_im.crop((0, 0, p_im.width, cut))
        canvas_p = Image.new("L", (p_im.width, new_p.height + PAD), 255)
        canvas_p.paste(new_p, (0, 0))
        # 下一张：顶部贴上碎片
        canvas_c = Image.new("L", (c_im.width, frag.height + PAD + c_im.height), 255)
        canvas_c.paste(frag, (0, 0))
        canvas_c.paste(c_im, (0, frag.height + PAD))

        for src in (p_path, c_path):
            dst = backup / src.name
            if not dst.exists():
                shutil.copy2(src, dst)
        canvas_p.save(p_path, format="JPEG", quality=90, optimize=True)
        canvas_c.save(c_path, format="JPEG", quality=90, optimize=True)
        done += 1

    print(f"已修 {done} 对，备份 {backup.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
