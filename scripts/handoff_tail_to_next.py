#!/usr/bin/env python3
"""张宇 1000：把「上一题图尾部的外来行」交接给「下一题图的顶部」。

问题成因：裁图按「下一题题号行」下刀，而矩阵 / 分式竖直居中于题干行排版，
几何上会溢出到题号行上方，于是同一行被劈成两半：

  - 第 n 题的图，尾巴上多出一条不属于本题的行；
  - 第 n+1 题的图，顶部缺掉这一行（只剩几个像素的字底）。

两图同页同宽裁切，x 坐标天然对齐，把 n 的尾条贴到 n+1 顶部即可补全。

筛选判据（三道，靠几何而不是靠猜）：
  1. 尾条与上文之间有 ≥8px 空白，高度像单行（12~38px）；
  2. 尾条不出现在左边距（xmin > 200）—— 正常题文一定从左边距起排；
  3. 尾条的 x 范围被下一题图的 ≥2 条竖线（矩阵括号 / 表格线）夹住。

用法：
  .venv/bin/python3 scripts/handoff_tail_to_next.py --scan
  .venv/bin/python3 scripts/handoff_tail_to_next.py --apply-all
  .venv/bin/python3 scripts/handoff_tail_to_next.py --sheet tmp/handoff
  .venv/bin/python3 scripts/handoff_tail_to_next.py --restore zy-base-la-5-3
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path("/Users/makima/program/web/english_web")
BOOK = ROOT / "frontend" / "public" / "math"
INDEX = BOOK / "zhangyu1000" / "index.json"
IMG = BOOK / "img" / "zy"
BACKUP = ROOT / "tmp" / "handoff-orig"
INK = 160
MERGE = 4
MIN_GAP = 8
H_MIN, H_MAX = 12, 38
XMIN_MIN = 200
DROP = 2          # 下一题图顶部这两行是同一行的字底，贴条时去掉以免重影


def bands_of(ink: np.ndarray, merge: int = MERGE) -> list[tuple[int, int]]:
    has = ink.sum(axis=1) > 0
    out, start, gap = [], None, 0
    for y, v in enumerate(has):
        if v:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= merge:
                out.append((start, y - gap + 1))
                start, gap = None, 0
    if start is not None:
        out.append((start, len(has)))
    return out


def ink_of(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L")) < INK


def rule_cols(ink: np.ndarray, frac: float = 0.30) -> list[int]:
    """竖线列（贯穿 ≥30% 图高）的位置，聚类后取中心。"""
    colfrac = ink.sum(axis=0) / max(1, ink.shape[0])
    xs = np.nonzero(colfrac > frac)[0]
    grp, cur = [], []
    for x in xs:
        if cur and x - cur[-1] > 3:
            grp.append(cur)
            cur = []
        cur.append(x)
    if cur:
        grp.append(cur)
    return [int(np.mean(g)) for g in grp]


def scan() -> list[dict]:
    items = json.loads(INDEX.read_text())["items"]
    pages: dict[int, list[dict]] = {}
    for it in items:
        pages.setdefault(it["pdf_page"], []).append(it)
    out = []
    for page, its in pages.items():
        its.sort(key=lambda i: i["qno"])
        for a, b in zip(its, its[1:]):
            pa, pb = IMG / f"{a['id']}.jpg", IMG / f"{b['id']}.jpg"
            if not (pa.exists() and pb.exists()):
                continue
            ia, ib = ink_of(pa), ink_of(pb)
            if ia.shape[1] != ib.shape[1]:
                continue
            bs = bands_of(ia)
            if len(bs) < 2:
                continue
            y0, y1 = bs[-1]
            gap = y0 - bs[-2][1]
            if gap < MIN_GAP or not (H_MIN <= y1 - y0 <= H_MAX):
                continue
            cols = np.nonzero(ia[y0:y1].sum(axis=0))[0]
            if not len(cols) or cols[0] <= XMIN_MIN:
                continue
            xmin, xmax = int(cols[0]), int(cols[-1])
            inside = [c for c in rule_cols(ib) if xmin - 6 <= c <= xmax + 6]
            if len(inside) < 2:
                continue
            out.append({
                "prev": a["id"], "next": b["id"], "page": page,
                "qno": [a["qno"], b["qno"]],
                "strip": [int(y0), int(y1)], "gap": int(gap),
                "x": [xmin, xmax], "rules": inside,
            })
    return out


PAD = 10
WIN = 3          # 匹配窗口行数
JMAX = 8         # 在下一题顶部多少行内找接缝
MIN_MATCH = 0.75


def _iou(u: np.ndarray, v: np.ndarray) -> float:
    un = np.logical_or(u, v).sum()
    return float(np.logical_and(u, v).sum()) / un if un else 0.0


def match(a_ink: np.ndarray, b_ink: np.ndarray, strip: list[int]) -> tuple[float, int, int]:
    """在尾条里找与「下一题图顶部」逐像素相同的那一段。

    两图是同页裁切的相邻窗口，必然有重叠：找到 (A 行 y, B 行 j) 匹配对，
    就能反推下一题第 0 行对应尾条里的哪一行 —— 之前缺的正是这一行以上的内容。
    """
    y0, y1 = strip
    sub = a_ink[y0:y1]
    h = sub.shape[0]
    best = (0.0, y0, 0)
    for y in range(1, max(2, h - WIN)):
        for j in range(0, min(JMAX, b_ink.shape[0] - WIN)):
            s = _iou(sub[y:y + WIN].ravel(), b_ink[j:j + WIN].ravel())
            if s > best[0]:
                best = (s, y0 + y, j)
    return best


def plan(a_ink: np.ndarray, b_ink: np.ndarray, strip: list[int]) -> dict | None:
    """算出一对图该怎么补：keep = 需要从尾条搬到下一题顶部的行数。"""
    s, y, j = match(a_ink, b_ink, strip)
    keep = y - j - strip[0]
    h = strip[1] - strip[0]
    if s < MIN_MATCH or not (3 <= keep <= h - 2):
        return None
    return {"score": round(s, 3), "keep": keep, "a_row": y, "b_row": j}


def stitch(prev_id: str, next_id: str, strip: list[int]) -> tuple[Image.Image, Image.Image, dict]:
    """返回 (上一题裁尾后的图, 下一题补全顶部后的图, 计划)。"""
    a = Image.open(IMG / f"{prev_id}.jpg").convert("L")
    b = Image.open(IMG / f"{next_id}.jpg").convert("L")
    a_ink = np.asarray(a) < INK
    b_ink = np.asarray(b) < INK
    p = plan(a_ink, b_ink, strip)
    if p is None:
        raise ValueError(f"{prev_id}->{next_id} 匹配不上，跳过")
    y0 = strip[0]

    cut = a.crop((0, 0, a.width, y0))
    a_out = Image.new("L", (a.width, cut.height + PAD), 255)
    a_out.paste(cut, (0, 0))

    head = a.crop((0, y0, a.width, y0 + p["keep"]))
    b_out = Image.new("L", (a.width, head.height + b.height), 255)
    b_out.paste(head, (0, 0))
    b_out.paste(b, (0, head.height))
    return a_out, b_out, p


def apply_all(cands: list[dict]) -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    for c in cands:
        try:
            a_out, b_out, p = stitch(c["prev"], c["next"], c["strip"])
        except ValueError as e:
            print(f"  跳过：{e}")
            continue
        for qid, im in ((c["prev"], a_out), (c["next"], b_out)):
            dst = IMG / f"{qid}.jpg"
            bak = BACKUP / dst.name
            if not bak.exists():
                shutil.copy2(dst, bak)
            im.save(dst, format="JPEG", quality=88, optimize=True)
        print(f"{c['prev']} 裁尾 -> {a_out.size}   |   {c['next']} 补全 -> {b_out.size}"
              f"   (贴 {p['keep']} 行, 匹配 {p['score']})")


def restore(ids: list[str]) -> None:
    for qid in ids:
        bak = BACKUP / f"{qid}.jpg"
        if not bak.exists():
            print(f"{qid}: 没有备份")
            continue
        shutil.copy2(bak, IMG / f"{qid}.jpg")
        print(f"{qid}: 已还原")


def sheet(cands: list[dict], dest: Path, per: int = 5) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    H = 92
    for page in range(0, len(cands), per):
        chunk = cands[page:page + per]
        W = Image.open(IMG / f"{chunk[0]['next']}.jpg").width
        cell = H * 2 + 30
        canvas = Image.new("L", (W, cell * len(chunk)), 255)
        d = ImageDraw.Draw(canvas)
        for i, c in enumerate(chunk):
            y = i * cell
            a = Image.open(IMG / f"{c['prev']}.jpg").convert("L")
            b = Image.open(IMG / f"{c['next']}.jpg").convert("L")
            lb = a.crop((0, max(0, a.height - H), a.width, a.height))
            rb = b.crop((0, 0, b.width, min(H, b.height)))
            d.text((3, y + 1), f"[{i}] {c['prev']}  tail-after (p{c['page']})", fill=0)
            canvas.paste(lb, (0, y + 14))
            d.text((3, y + 14 + H + 1), f"[{i}] {c['next']}  top-after", fill=0)
            canvas.paste(rb, (0, y + 14 + H + 14))
            d.line([(0, y + cell - 2), (W, y + cell - 2)], fill=200, width=1)
        out = dest / f"after-{page // per:02d}.png"
        canvas.save(out)
        print(f"  {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true")
    ap.add_argument("--apply-all", action="store_true")
    ap.add_argument("--restore", nargs="*")
    ap.add_argument("--sheet")
    ap.add_argument("--json")
    ap.add_argument("--from-json")
    args = ap.parse_args()

    if args.from_json:
        cands = json.loads(Path(args.from_json).read_text())
    else:
        cands = scan()
    if args.json:
        Path(args.json).write_text(json.dumps(cands, ensure_ascii=False, indent=1))
    if args.scan:
        print(f"候选 {len(cands)} 对")
        for c in cands:
            print(f"  p{c['page']:<3} {c['prev']:24s} -> {c['next']:24s} "
                  f"strip=y{c['strip'][0]}..{c['strip'][1]} x={c['x'][0]}..{c['x'][1]} "
                  f"夹住竖线={c['rules']}")
    if args.apply_all:
        apply_all(cands)
    if args.restore:
        restore(args.restore)
    if args.sheet:
        sheet(cands, Path(args.sheet))


if __name__ == "__main__":
    main()
