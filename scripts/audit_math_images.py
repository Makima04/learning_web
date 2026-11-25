#!/usr/bin/env python3
"""体检数学题图：找出「图不全 / 重复切图 / 错切封面页」的题图。

判据（默认毫秒级零 OCR 依赖）：
  · 行墨迹分布：压边截断（cut_top / cut_bottom）、尾行异物（tail_foreign）、空白/尺寸异常（blank / tiny / tall / flat）
  · 同目录 MD5 完全重复（dup_md5）：拦截批量错切同一张封面/空白页
  · 同目录 8x8 dHash 近似重复（dup_dhash，汉明距离 <= 2）：拦截仅页码/边缘略异的重复切图
  · 封面/目录异常特征（cover_suspect）：极高墨水占比或整页长宽比异常
  · 可选 --ocr-suspects：仅对可疑图调用 tesseract（若本机已安装）检查非题干关键词
  · 可选 --strict：命中严重回归标记（dup_md5 / blank / cover_suspect）时返回退出码 1

用法：
  python3 scripts/audit_math_images.py                         # 全量体检（ll + zy + math1）
  python3 scripts/audit_math_images.py --only math1 --strict   # 真题图严格防回归校验
  python3 scripts/audit_math_images.py --ocr-suspects          # 对可疑图追加 OCR 复核
  python3 scripts/audit_math_images.py --json tmp/audit.json --worst 12
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import statistics
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG_ROOT = ROOT / "frontend" / "public" / "math" / "img"
MATH1_IMG_ROOT = ROOT / "frontend" / "public" / "math" / "exams" / "math1" / "questions"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

INK = 160         # 灰度低于此值算墨
MERGE = 4         # 行内空隙：小于此值不切行
EDGE = 2          # 距边界多少像素内算「压边」
CUT_RATIO = 0.62  # 行高低于中位行高的这个比例 → 可疑被切
GAP_RATIO = 1.45  # 行距超过中位行距的倍数 → 可疑分隔
SPARSE = 0.55     # 末行横向覆盖率低于此值 → 稀疏
COVER_INK_RATIO = 0.28  # 整图墨水覆盖率过高（典型实色封面/黑底图）
DHASH_MAX_DIST = 2
STRICT_FLAGS = ("dup_md5", "blank", "cover_suspect")
COVER_KEYWORDS = ("目录", "封面", "全国硕士研究生", "版权所有", "前言", "目录页")


def md5_of(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def dhash_of(gray: Image.Image) -> int:
    """8x8 差分感知哈希（64-bit int），零额外依赖。"""
    small = np.asarray(gray.resize((9, 8), Image.Resampling.BILINEAR), dtype=np.int16)
    diff = small[:, 1:] > small[:, :-1]
    bits = 0
    for b in diff.flatten():
        bits = (bits << 1) | int(b)
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


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


def book_of(path: Path) -> str:
    posix = path.as_posix()
    if "/exams/math1/" in posix:
        return "math1"
    if "/zy/" in posix:
        return "zy"
    return "ll"


def audit_one(path: Path) -> dict:
    gray = Image.open(path).convert("L")
    arr = np.asarray(gray)
    ink = arr < INK
    h, w = ink.shape
    ink_ratio = float(ink.mean()) if h and w else 0.0
    bands = bands_of(ink.sum(axis=1))
    rec: dict = {
        "id": path.stem,
        "book": book_of(path),
        "dir": path.parent.relative_to(ROOT).as_posix(),
        "file": path.relative_to(ROOT).as_posix(),
        "w": int(w),
        "h": int(h),
        "ratio": round(h / w, 3) if w else 0.0,
        "ink_ratio": round(ink_ratio, 4),
        "md5": md5_of(path),
        "dhash": dhash_of(gray),
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
    if w and h / w > 1.25:
        rec["flags"].append("tall")
    if w and h / w < 0.06:
        rec["flags"].append("flat")
    if ink_ratio > COVER_INK_RATIO:
        rec["flags"].append("cover_suspect")
    return rec


def detect_directory_duplicates(recs: list[dict]) -> None:
    """同目录 MD5 完全重复 + dHash 近似重复标记。"""
    by_dir: dict[str, list[dict]] = {}
    for r in recs:
        by_dir.setdefault(r["dir"], []).append(r)

    for items in by_dir.values():
        md5_groups: dict[str, list[dict]] = {}
        for r in items:
            md5_groups.setdefault(r["md5"], []).append(r)
        for group in md5_groups.values():
            if len(group) >= 2:
                peers = [g["id"] for g in group]
                for r in group:
                    r["flags"].append("dup_md5")
                    r["dup_count"] = len(group)
                    r["dup_peers"] = [p for p in peers if p != r["id"]][:5]

        # dHash 近似重复（排除已标 dup_md5 或 blank）
        non_blank = [r for r in items if "blank" not in r["flags"]]
        for i, a in enumerate(non_blank):
            if "dup_md5" in a["flags"] or "dup_dhash" in a["flags"]:
                continue
            for b in non_blank[i + 1:]:
                if b["md5"] == a["md5"]:
                    continue
                if hamming(a["dhash"], b["dhash"]) <= DHASH_MAX_DIST:
                    if "dup_dhash" not in a["flags"]:
                        a["flags"].append("dup_dhash")
                        a["near_peer"] = b["id"]
                    if "dup_dhash" not in b["flags"]:
                        b["flags"].append("dup_dhash")
                        b["near_peer"] = a["id"]


def run_ocr_on_suspects(recs: list[dict]) -> None:
    """仅对可疑图运行 tesseract OCR（若本机已安装），拦截错切封面/目录页。"""
    if not shutil.which("tesseract"):
        print("[ocr-suspects] 未检测到 tesseract，已跳过 OCR 复核（保留几何与哈希硬校验）")
        return
    suspects = [
        r for r in recs
        if any(f in r["flags"] for f in ("dup_md5", "dup_dhash", "cover_suspect", "tall"))
    ]
    if not suspects:
        return
    checked = 0
    for r in suspects:
        img_path = ROOT / r["file"]
        try:
            proc = subprocess.run(
                ["tesseract", str(img_path), "stdout", "-l", "chi_sim+eng", "--psm", "6"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            txt = proc.stdout or ""
            checked += 1
            hit = [kw for kw in COVER_KEYWORDS if kw in txt]
            if hit:
                if "cover_suspect" not in r["flags"]:
                    r["flags"].append("cover_suspect")
                r["ocr_hits"] = hit
        except Exception:
            continue
    print(f"[ocr-suspects] 已对 {checked} 张可疑图完成 OCR 复核")


def collect_files(only: str | None) -> list[Path]:
    files: list[Path] = []
    if only in (None, "ll", "zy") and IMG_ROOT.exists():
        for p in sorted(IMG_ROOT.rglob("*")):
            if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
                continue
            if only and f"/{only}/" not in p.as_posix():
                continue
            files.append(p)
    if only in (None, "math1") and MATH1_IMG_ROOT.exists():
        for p in sorted(MATH1_IMG_ROOT.rglob("*")):
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                files.append(p)
    return files


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
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path)
    ap.add_argument("--only", choices=["zy", "ll", "math1"])
    ap.add_argument("--worst", type=int, default=0, help="为每类生成对照图，取前 N 条")
    ap.add_argument("--ocr-suspects", action="store_true", help="对可疑图追加 tesseract OCR 复核")
    ap.add_argument("--strict", action="store_true", help="命中 dup_md5 / blank / cover_suspect 时以退出码 1 阻断")
    args = ap.parse_args()

    files = collect_files(args.only)
    recs = [audit_one(p) for p in files]
    detect_directory_duplicates(recs)
    if args.ocr_suspects:
        run_ocr_on_suspects(recs)

    by_flag: dict[str, list[dict]] = {}
    for r in recs:
        for f in r["flags"]:
            by_flag.setdefault(f, []).append(r)

    print(f"\n共体检 {len(recs)} 张")
    for flag, items in sorted(by_flag.items(), key=lambda kv: -len(kv[1])):
        ll = sum(1 for r in items if r["book"] == "ll")
        zy = sum(1 for r in items if r["book"] == "zy")
        m1 = sum(1 for r in items if r["book"] == "math1")
        print(f"  {flag:14s} {len(items):5d}   ll {ll:4d} / zy {zy:4d} / math1 {m1:4d}")

    display_order = (
        "dup_md5",
        "dup_dhash",
        "cover_suspect",
        "blank",
        "cut_top",
        "cut_bottom",
        "tail_foreign",
        "tiny",
        "tall",
        "flat",
    )
    for flag in display_order:
        items = by_flag.get(flag, [])
        if not items:
            continue
        print(f"\n[{flag}] 前 10 条：")
        for r in items[:10]:
            extra = ""
            if "dup_count" in r:
                extra += f" dup={r['dup_count']} peers={','.join(r.get('dup_peers', []))}"
            if "near_peer" in r:
                extra += f" near={r['near_peer']}"
            if "ocr_hits" in r:
                extra += f" ocr={','.join(r['ocr_hits'])}"
            if "tail_cov" in r:
                extra += f" tail_cov={r['tail_cov']} tail_gap={r['tail_gap']}"
            med_h = r.get("med_h", "-")
            print(f"  {r['file']}  {r['w']}x{r['h']} bands={r['bands']} "
                  f"med_h={med_h} ink={r['ink_ratio']}{extra}")
        if args.worst:
            out = ROOT / f"tmp/audit-{flag}.png"
            contact_sheet(items, out)
            print(f"  → 对照图 {out.relative_to(ROOT)}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        serializable = [{k: v for k, v in r.items() if k != "dhash"} for r in recs]
        args.json.write_text(json.dumps(serializable, ensure_ascii=False, indent=1))
        print(f"\n明细写入 {args.json}")

    if args.strict:
        fatal = {f: len(by_flag.get(f, [])) for f in STRICT_FLAGS if by_flag.get(f)}
        if fatal:
            summary = ", ".join(f"{k}={v}" for k, v in fatal.items())
            print(f"\n[STRICT FAIL] 检测到严重图片回归：{summary}", file=sys.stderr)
            sys.exit(1)
        print("\n[STRICT PASS] 零重复图 / 零空白图 / 零疑似封面图")


if __name__ == "__main__":
    main()
