#!/usr/bin/env python3
"""从 408 答案 PDF 抽取选择题答案键与逐题解析，写回 papers/cs408/<year>.json。

用法:
  .venv/bin/python3 scripts/extract_cs408_answers.py                 # 全量 2012-2025
  .venv/bin/python3 scripts/extract_cs408_answers.py --year 2015
  .venv/bin/python3 scripts/extract_cs408_answers.py --dry-run       # 只打印覆盖率

答案键来源按优先级合并（冲突时后者不覆盖前者）:
  1. key_linear      「一、单项选择题」后的线性 `1. B` 列表（2012/2020）
  2. key_grid        第 1 页 8 列 × 5 行答案表（2013-2018/2022），
                     竖排 5 字母串按列展开、单字母按 (x,y) 落到单元格
  3. key_titles      解析标题里的答案（2022 `01. B。【解析】` / 2023 `1.【参考答案】D`）
  4. key_ocr         扫描件 tesseract OCR（2019/2021/2024/2025）
  5. ANSWER_KEYS     人工核对表（见文件末尾，覆盖上述所有结果）

解析文本按行首题号锚点切分 1..47；扫描件解析标记 quality=ocr，
并保留原页裁图路径（ans_img）作为保真兜底。

来源与口径见 papers/cs408/SOURCES.md：社区重构版 / 个人学习用，勿商用传播。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "papers" / "cs408"
ANS = SRC / "answers"
OCR_CACHE = SRC / ".ocr_cache"
IMG_DIR = ROOT / "frontend" / "public" / "cs408" / "ans"

try:
    import fitz  # pymupdf
except ImportError:
    raise SystemExit("need pymupdf: pip install pymupdf")

# 视觉核对后的权威答案键（对着答案表原页逐题抄录，优先级最高，按题号 1..40）
# 来源：papers/cs408/answers/<year>-answer.pdf 第 1 页答案表
# 全部 14 年答案键均对着答案表原页逐题视觉核准；纯自动抽取在个别年份
# （2013/2022 等）会出现错格，故以此表为唯一权威值。按原页行分组抄录，
# 空格只是分段，脚本会去掉：多数为 8 题 × 5 行，2024/2025 为 5 题 × 8 行。
ANSWER_KEYS: dict[int, str] = {
    2012: "BAABCCCA DADDBDDA CCCDDBCB BADABCAB BCABCADD",
    2013: "DCDBACCD CACCAACA DCBBBDAA CACBDBBB BADBABBA",
    2014: "CBADCDDD DBCDCAAD ACCCDBAB DAACBACD CBDCBABD",
    2015: "ABDDDCAC CCAABDCB BDCBBDBC DBAABCCC DABBACAC",
    2016: "DDCBCDBB BADCDACC CBBAAAAB CABDACDA CCDBBDCC",
    2017: "BCABBDBA BBDCCADA CBADDBDC BDBDBDBB ADBADCAC",
    2018: "BCAAACDB CDADCAAB CBADBCCD BACDDADC BCDDDCBD",
    2019: "BBCACADC BDBCADDD BCBCADBC CBCBCBAC CABBBCDB",
    2020: "CDACBBAB CBABADDA BACCBCBA DDBDBDBC CBCDADCD",
    2021: "DDBCBDAC ACBDDACA DCCABABB CCDCBACC BABBDBDC",
    2022: "BDBCDDBD DADABACA CBDACCDA CBCDADBA BCBDBCDB",
    2023: "DCABABBB CCDCAACB ABCDDCDA CDCDBCBD DCBCDABD",
    2024: "DAABD ADABC DBBCD DCBCB ACAAD AABAC CCBCD BDDCD",
    2025: "BDDBD CCCAD ADDDC BCBAA BADCC BDCCA CBBCC CBABA",
}

NUM_TOKEN = re.compile(r"^(?:0\s*)?(\d{1,2})\s*[.．、:：]?$")
LETTER_TOKEN = re.compile(r"^[A-D]$")
LETTER_RUN = re.compile(r"^[A-D]{5}$")
LINEAR_KEY = re.compile(r"(?<!\d)([0-4]?\d)\s*[.．、•:：]\s*([A-D])(?![A-Za-z])")
REF_ANS = re.compile(r"(\d{1,2})\s*[.．、]?\s*【参考答案】\s*([A-D])")
TITLE_ANS = re.compile(r"(?m)^\s*(?:0\s*)?(\d{1,2})\s*[.．、•]?\s*([A-D])\s*[。.]?\s*【解析】")
ANCHOR = re.compile(
    r"(?m)^[ \t]*(?:0\s*)?(\d{1,2})\s*[.．、•]?\s*"
    r"(?:[A-D]\s*[。.．]?\s*)?"  # 2022: 01. B。【解析】
    r"(?:【参考答案】\s*[A-D]\s*)?"
    r"(?:【?\s*解\s*析\s*】?|解\s*答|【答案)"
)
NOISE_LINE = re.compile(r"第\s*\d+\s*页|共\s*\d+\s*页|^\s*\d+\s*$")
# 扫描件 OCR 会把 `19, 解析` / `LL. 解析` / `25，解析` 的题号或分隔符认错，
# 只放宽正则会误吃正文，改成按行还原成规范锚点（并按题序推断被认错的题号）。
OCR_ANCHOR_LINE = re.compile(
    r"^([0-9OolLI]{1,3})\s*[.．、,，;；:：]?\s*(?:解\s*析|解\s*答)"
)
OCR_DIGIT_FIX = {"LL": 11, "ll": 11, "l1": 11, "II": 11, "I": 1, "l": 1, "O": 0}


def repair_ocr_anchors(text: str) -> str:
    """把扫描 OCR 里走样的「N 解析」行还原成 `N. 解析:`，题号按题序推断。"""
    out: list[str] = []
    expected = 1
    for ln in text.splitlines():
        s = ln.strip()
        if len(s) <= 48 and ("解析" in s or "解答" in s):
            m = OCR_ANCHOR_LINE.match(s)
            if m:
                tok = m.group(1)
                n = OCR_DIGIT_FIX.get(tok)
                if n is None and tok.isdigit():
                    n = int(tok)
                if n is None or not (expected - 1 <= n <= expected + 2) or n > 40:
                    n = expected
                if 1 <= n <= 40:
                    out.append(f"{n}. 解析: {s[m.end():].strip()}")
                    expected = n + 1
                    continue
        out.append(ln)
    return "\n".join(out)


def ensure_page_images(year: int, doc: fitz.Document) -> list[str]:
    """扫描件原页转 JPEG 供前端「原版答案页校对」使用（幂等）。"""
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for i, page in enumerate(doc):
        rel = f"/cs408/ans/{year}-p{i + 1}.jpg"
        dst = IMG_DIR / f"{year}-p{i + 1}.jpg"
        if not dst.exists():
            pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6))
            try:
                from PIL import Image  # 可选：压缩成 JPEG

                png = IMG_DIR / f".{year}-p{i + 1}.png"
                pix.save(png)
                Image.open(png).convert("RGB").save(dst, quality=78, optimize=True)
                png.unlink(missing_ok=True)
            except ImportError:
                pix.save(dst)
            print(f"  render {dst.name}", flush=True)
        paths.append(rel)
    return paths


def pdf_text(doc: fitz.Document) -> str:
    return "\n".join(p.get_text("text") for p in doc)


def ocr_pages(year: int, doc: fitz.Document) -> str:
    """扫描件逐页 OCR，结果缓存为纯文本。"""
    OCR_CACHE.mkdir(parents=True, exist_ok=True)
    cache = OCR_CACHE / f"{year}.txt"
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    tmp = SRC / ".tmp_ocr"
    tmp.mkdir(parents=True, exist_ok=True)
    parts: list[str] = []
    for i, page in enumerate(doc):
        img = tmp / f"{year}-p{i + 1}.png"
        page.get_pixmap(matrix=fitz.Matrix(2, 2)).save(img)
        r = subprocess.run(
            ["tesseract", str(img), "stdout", "-l", "chi_sim+eng", "--psm", "6"],
            capture_output=True,
            timeout=240,
        )
        parts.append(r.stdout.decode("utf-8", "replace"))
        img.unlink(missing_ok=True)
        print(f"  OCR {year} p{i + 1}/{len(doc)}", flush=True)
    text = "\n".join(parts)
    cache.write_text(text, encoding="utf-8")
    return text


def key_linear(text: str) -> dict[int, str]:
    """「一、单项选择题」后的线性答案列表。"""
    i = text.find("一、单项选择题")
    if i < 0:
        return {}
    seg = text[i : i + 3000]
    m = re.search(r"解\s*析|【解析|参考答案】", seg[20:])
    if m:
        seg = seg[: 20 + m.start()]
    return {
        int(g.group(1)): g.group(2)
        for g in LINEAR_KEY.finditer(seg)
        if 1 <= int(g.group(1)) <= 40
    }


def key_grid(page: fitz.Page) -> dict[int, str]:
    """8 列 × 5 行答案表：题号 token 标定单元格，字母按坐标落格。

    表格题号按行排 1..8 / 9..16 / ...；答案在题号右侧，有两种形态：
      - 单字母 token：按 (x, y) 直接归格
      - 竖排 5 字母串（如 'BCDBA'）：按 x 归列，串内第 i 字符对应第 i 行
    解析区题号会污染聚类，故只取页面最上方的 5 行，且只用这些行的
    题号做列聚类。字母相对题号有约 25~30pt 的右偏，归列时取左侧最近列。
    """
    raw = page.get_text("words")
    nums: list[tuple[float, float, int]] = []
    singles: list[tuple[float, float, str]] = []
    runs: list[tuple[float, float, str]] = []
    for x0, y0, _x1, _y1, w, *_ in raw:
        w = w.strip()
        m = NUM_TOKEN.match(w)
        if m and 1 <= int(m.group(1)) <= 40:
            nums.append((x0, y0, int(m.group(1))))
        elif LETTER_TOKEN.match(w):
            singles.append((x0, y0, w))
        elif LETTER_RUN.match(w):
            runs.append((x0, y0, w))
    if len(nums) < 20:
        return {}

    def cluster(vals: list[float], tol: float) -> list[float]:
        vals = sorted(vals)
        groups: list[list[float]] = []
        for v in vals:
            if groups and v - groups[-1][-1] <= tol:
                groups[-1].append(v)
            else:
                groups.append([v])
        return [sum(g) / len(g) for g in groups]

    def nearest(val: float, centers: list[float], tol: float = 9) -> int | None:
        if not centers:
            return None
        k = min(range(len(centers)), key=lambda i: abs(centers[i] - val))
        return k if abs(centers[k] - val) <= tol else None

    ys = cluster([y for _x, y, _n in nums], 7)[:5]
    if len(ys) < 4:
        return {}
    table = [(x, y, n) for x, y, n in nums if nearest(y, ys) is not None]
    xs = cluster([x for x, _y, _n in table], 18)[:8]
    if len(xs) < 6:
        return {}
    gap = (xs[-1] - xs[0]) / max(1, len(xs) - 1)

    def col_of(x: float) -> int | None:
        # 答案在题号右侧：归到不超过它的最右题号列
        left = [i for i, c in enumerate(xs) if c - 12 <= x <= c + gap * 1.05]
        if not left:
            return None
        return max(left, key=lambda i: xs[i])

    cell_no: dict[tuple[int, int], int] = {}
    for x, y, n in table:
        r, c = nearest(y, ys), col_of(x)
        if r is not None and c is not None:
            cell_no[(r, c)] = n
    letters: dict[tuple[int, int], str] = {}
    for x, _y, s in runs:
        c = col_of(x)
        if c is None:
            continue
        for i, ch in enumerate(s):
            if i < len(ys):
                letters.setdefault((i, c), ch)
    for x, y, ch in singles:
        r, c = nearest(y, ys), col_of(x)
        if r is not None and c is not None:
            letters.setdefault((r, c), ch)
    return {n: letters[(r, c)] for (r, c), n in cell_no.items() if (r, c) in letters}


def key_titles(text: str) -> dict[int, str]:
    out = {int(m.group(1)): m.group(2) for m in REF_ANS.finditer(text)}
    for m in TITLE_ANS.finditer(text):
        out.setdefault(int(m.group(1)), m.group(2))
    return {n: v for n, v in out.items() if 1 <= n <= 40}


def clean_explanation(s: str) -> str:
    lines = [ln.rstrip() for ln in s.splitlines() if not NOISE_LINE.search(ln)]
    s = "\n".join(lines).strip()
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s


def big_section_anchors(text: str) -> list[tuple[int, int]]:
    """扫描件大题区容错锚点：`41. 【答案要点】` / `42. (SRA` 这类 OCR 噪声。"""
    i = max(text.find("二、综合应用题"), text.find("二、简答题"))
    if i < 0:
        return []
    seg = text[i:]
    return [
        (i + m.start(), int(m.group(1)))
        for m in re.finditer(r"(?m)^[ \t]*(4[1-7])\s*[.．、]?\s*[【(（]", seg)
    ]


def explanations(text: str) -> dict[int, str]:
    """按行首 `N. 解析 / N. 解答` 锚点切出逐题解析。"""
    hits = [
        (m.start(), int(m.group(1)))
        for m in ANCHOR.finditer(text)
        if 1 <= int(m.group(1)) <= 47
    ]
    hits += big_section_anchors(text)
    # 按位置排序，同题号只留第一次；题号须大体递增，剔除正文误匹配
    hits.sort()
    picked: list[tuple[int, int]] = []
    seen: set[int] = set()
    for start, n in hits:
        if n in seen:
            continue
        if picked and n < picked[-1][1]:
            continue
        seen.add(n)
        picked.append((start, n))
    out: dict[int, str] = {}
    for i, (start, n) in enumerate(picked):
        end = picked[i + 1][0] if i + 1 < len(picked) else len(text)
        body = clean_explanation(text[start:end])
        # 去掉锚点本身的题号/「解析」字样
        body = re.sub(
            r"^\s*(?:0\s*)?\d{1,2}\s*[.．、•]?\s*(?:【参考答案】\s*[A-D]\s*)?"
            r"(?:【?\s*解\s*析\s*】?|解\s*答|【答案[^\]\n]{0,10}】?|"
            r"【答案要点[】了]?)\s*[:：]?\s*",
            "",
            body,
            count=1,
        ).strip()
        if len(body) > 8:
            out[n] = body[:6000]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    years = [args.year] if args.year else list(range(2012, 2026))
    summary: list[str] = []

    for year in years:
        pdf = ANS / f"{year}-answer.pdf"
        target = SRC / f"{year}.json"
        if not (pdf.exists() and target.exists()):
            print(f"skip {year}: missing pdf/json")
            continue
        doc = fitz.open(pdf)
        text = pdf_text(doc)
        scanned = len(text.strip()) < 500
        page_images: list[str] = []
        if scanned:
            text = repair_ocr_anchors(ocr_pages(year, doc))
            if not args.dry_run:
                page_images = ensure_page_images(year, doc)

        keys: dict[int, str] = {}
        keys.update(key_linear(text))
        if not scanned:
            grid = key_grid(doc[0])
            for n, v in grid.items():
                keys.setdefault(n, v)
        for n, v in key_titles(text).items():
            keys.setdefault(n, v)
        if scanned:
            for m in LINEAR_KEY.finditer(text[:2500]):
                n = int(m.group(1))
                if 1 <= n <= 40:
                    keys.setdefault(n, m.group(2))
        # 人工核对表优先级最高
        if year in ANSWER_KEYS:
            s = ANSWER_KEYS[year].replace(" ", "")
            if len(s) == 40:
                keys = {i + 1: s[i] for i in range(40)}

        exps = explanations(text)
        method = "ocr" if scanned else "pdf_text"

        paper = json.loads(target.read_text(encoding="utf-8"))
        items = paper.get("items") or []
        no_mcq_exp = sum(1 for n in range(1, 41) if n in exps) < 5
        n_key = n_exp = 0
        for it in items:
            n = it.get("n")
            if not isinstance(n, int):
                continue
            if n <= 40 and n in keys:
                it["answer"] = keys[n]
                n_key += 1
            if n in exps:
                it["explanation"] = exps[n]
                n_exp += 1
                if n >= 41 and not it.get("answer"):
                    # 大题参考答案用解析全文，前端统一放解析区展示
                    it["answer"] = None
            notes: list[str] = []
            if scanned:
                notes.append("本卷答案为扫描件 OCR 文本，公式/图表可能失真，请对照原版答案页")
            if no_mcq_exp:
                notes.append("源答案页仅给出答案键与大题答案要点，未含选择题逐题解析")
            meta = {
                "method": method,
                "source": pdf.name,
                "quality": "needs_review" if scanned else "ok",
            }
            if notes:
                meta["note"] = "；".join(notes)
            # 所有扫描件都挂原页图：OCR 待校对的题也能一页一页核对，
            # 不再只有「完全没有解析」的年份才能看原卷。
            if scanned:
                meta["page_images"] = page_images or [
                    f"/cs408/ans/{year}-p{i + 1}.jpg" for i in range(len(doc))
                ]
            it["answer_meta"] = meta
        if not args.dry_run:
            target.write_text(
                json.dumps(paper, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        summary.append(
            f"{year}: 答案键 {n_key:2}/40  解析 {n_exp:2}/47  来源 {method}"
            + ("  [DRY]" if args.dry_run else "")
        )

    print("\n".join(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
