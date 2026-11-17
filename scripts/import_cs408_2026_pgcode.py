#!/usr/bin/env python3
"""把 pgcode.cn 2026 年 408 预览页（SSR HTML）导入为 papers/cs408/2026.json 源。

用法：python scripts/import_cs408_2026_pgcode.py   （随后重跑 gen_cs408_frontend.py）
在任何有 papers/cs408/2026.json 源的机器上可重跑（如 Mac），HTML 缓存于
papers/cs408/.pgcode-2026-preview.html（gitignore 内），缺失时自动下载。

- 题干/解析：markdown HTML → 纯文本（KaTeX 取 annotation TeX 转可读文本，表格转行）。
- 题干图片：下载到 frontend/public/cs408/pic/2026/，记入 item.stem_images。
- 选择题选项：从题干末尾 A./B./C./D. 块拆出。
- 考点 kps：沿用原 LLM 标注（同题号同主题），kps_meta 加来源注记。
- 与 git HEAD 的原 csgraduates 回忆版逐题比对 book/kind/答案键，差异打印出来人工裁决。
"""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "papers/cs408/2026.json"
PIC = ROOT / "frontend/public/cs408/pic/2026"
PAGE_URL = "https://pgcode.cn/exams/408/years/2026/preview"
CACHE = ROOT / "papers/cs408/.pgcode-2026-preview.html"
if not CACHE.exists():
    print("下载", PAGE_URL)
    urllib.request.urlretrieve(PAGE_URL, CACHE)
HTML = CACHE.read_text(encoding="utf-8")

# ---------- TeX → 可读文本 ----------
SUB_MAP = dict(zip("0123456789+-=()aeorxhklmnpst", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒᵣₓₕₖₗₘₙₚₛₜ"))
SUP_MAP = dict(zip("0123456789+-=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ"))
SYMBOLS = {
    "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥", "ne": "≠", "neq": "≠",
    "times": "×", "cdot": "·", "div": "÷", "pm": "±", "mp": "∓",
    "in": "∈", "notin": "∉", "subset": "⊂", "subseteq": "⊆", "cup": "∪", "cap": "∩",
    "emptyset": "∅", "infty": "∞", "to": "→", "rightarrow": "→", "leftarrow": "←",
    "Rightarrow": "⇒", "Leftarrow": "⇐", "leftrightarrow": "↔",
    "approx": "≈", "sim": "∼", "propto": "∝", "equiv": "≡",
    "sum": "Σ", "prod": "Π", "int": "∫", "forall": "∀", "exists": "∃",
    "land": "∧", "lor": "∨", "neg": "¬", "oplus": "⊕", "otimes": "⊗",
    "lceil": "⌈", "rceil": "⌉", "lfloor": "⌊", "rfloor": "⌋",
    "langle": "⟨", "rangle": "⟩", "mid": "|", "vert": "|", "Vert": "‖",
    "dots": "…", "cdots": "⋯", "ldots": "…", "prime": "′", "circ": "∘",
    "degree": "°", "bullet": "•", "ast": "*", "colon": ":", "setminus": "∖",
    "therefore": "∴", "because": "∵", "checkmark": "✓", "backslash": "\\",
    "log": "log", "ln": "ln", "lg": "lg", "sin": "sin", "cos": "cos", "tan": "tan",
    "max": "max", "min": "min", "lim": "lim", "exp": "exp",
}
ARG_MACROS = {"text", "mathrm", "mathbf", "mathit", "mathsf", "mathbb", "textrm", "textbf",
              "operatorname", "boldsymbol", "overline", "underline", "hat", "bar", "vec",
              "widehat", "widetilde", "overrightarrow", "boxed", "cancel"}
SKIP_MACROS = {"left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle",
               "limits", "nolimits", "strut", "mathstrut"}


def take_arg(s: str, i: int) -> tuple[str, int]:
    while i < len(s) and s[i] == " ":
        i += 1
    if i >= len(s):
        return "", i
    if s[i] == "{":
        depth, j = 1, i + 1
        while j < len(s) and depth:
            if s[j] == "{":
                depth += 1
            elif s[j] == "}":
                depth -= 1
            j += 1
        return s[i + 1 : j - 1], j
    if s[i] == "\\":
        m = re.match(r"\\[a-zA-Z]+", s[i:])
        if m:
            return m.group(0), i + m.end()
    return s[i], i + 1


def script(a: str, table: dict) -> str | None:
    return "".join(table[c] for c in a) if all(c in table for c in a) else None


def tex2txt(tex: str) -> str:
    out, i = [], 0
    while i < len(tex):
        c = tex[i]
        if c == "\\":
            m = re.match(r"\\([a-zA-Z]+)", tex[i:])
            if m:
                name, j = m.group(1), i + m.end()
                if name in ("frac", "dfrac", "tfrac"):
                    a, j = take_arg(tex, j)
                    b, j = take_arg(tex, j)
                    out.append(f"{tex2txt(a)}/{tex2txt(b)}")
                elif name == "sqrt":
                    a, j = take_arg(tex, j)
                    out.append(f"√({tex2txt(a)})")
                elif name in ARG_MACROS:
                    a, j = take_arg(tex, j)
                    out.append(tex2txt(a))
                elif name in SKIP_MACROS:
                    pass
                elif name in SYMBOLS:
                    out.append(SYMBOLS[name])
                elif name in ("quad", "qquad"):
                    out.append(" ")
                else:
                    out.append(name)
                i = j
                continue
            nxt = tex[i + 1] if i + 1 < len(tex) else ""
            if nxt == "\\":
                out.append("\n")
            elif nxt in ",; ":
                out.append(" ")
            elif nxt != "!":
                out.append(nxt)
            i += 2
            continue
        if c in "_^":
            a, j = take_arg(tex, i + 1)
            conv = script(a, SUB_MAP if c == "_" else SUP_MAP)
            out.append(conv if conv is not None else f"{c}({tex2txt(a)})")
            i = j
            continue
        if c not in "{}":
            out.append(c)
        i += 1
    return "".join(out)


# ---------- HTML → 文本 ----------
class Conv(HTMLParser):
    BLOCK = {"p", "div", "ul", "ol", "table", "h1", "h2", "h3", "h4", "blockquote", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.images: list[str] = []
        self.katex = 0
        self.depth = 0
        self.in_ann = False
        self.tex: list[str] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def emit(self, s: str):
        if self.cell is not None:
            self.cell.append(s)
        else:
            self.out.append(s)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.katex:
            self.depth += 1
            if tag == "annotation":
                self.in_ann, self.tex = True, []
            return
        if tag == "span" and "md-editor-katex" in a.get("class", ""):
            self.katex, self.depth, self.tex = 1, 1, []
            return
        if tag == "img":
            if a.get("src"):
                self.images.append(a["src"])
            return
        if tag == "br":
            self.emit("\n")
            return
        if tag == "tr":
            self.row = []
            return
        if tag in ("td", "th"):
            self.cell = []
            return
        if tag == "li":
            self.emit("\n- ")
            return
        if tag in self.BLOCK:
            self.emit("\n\n")

    def handle_endtag(self, tag):
        if self.katex:
            if tag == "annotation":
                self.in_ann = False
            self.depth -= 1
            if self.depth <= 0:
                self.katex = 0
                self.emit(tex2txt("".join(self.tex)))
            return
        if tag in ("td", "th") and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
            return
        if tag == "tr" and self.row is not None:
            self.emit("\n" + " | ".join(self.row))
            self.row = None
            return
        if tag in self.BLOCK:
            self.emit("\n")

    def handle_data(self, data):
        if self.katex:
            if self.in_ann:
                self.tex.append(data)
            return
        self.emit(data)

    def text(self) -> str:
        s = "".join(self.out)
        s = re.sub(r"[ \t]+\n", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()


def convert(seg: str) -> tuple[str, list[str]]:
    c = Conv()
    c.feed(seg)
    return c.text(), c.images


def split_options(text: str) -> tuple[str, dict | None]:
    m = re.search(r"(?m)^\s*A[.．、]", text)
    if not m:
        return text, None
    parts = re.split(r"(?m)^\s*([A-D])[.．、]\s*", text[m.start():])
    opts = {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}
    if set(opts) != set("ABCD"):
        return text, None
    return text[: m.start()].strip(), opts


# ---------- 逐题解析 ----------
old = json.loads(SRC.read_text(encoding="utf-8"))
old_items = {it["n"]: it for it in old["items"]}
# 答案键比对基准：git HEAD 里的原 csgraduates 回忆版（源文件可能已被本脚本写过）
import subprocess
_orig = subprocess.run(["git", "show", "HEAD:frontend/public/cs408/2026.json"],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
orig_items = {it["n"]: it for it in json.loads(_orig.stdout)["items"]} if _orig.returncode == 0 else old_items
arts = re.split(r'(?=<article[^>]+id="question-\d+")', HTML)
items, diffs, img_urls = [], [], {}
for a in arts[1:]:
    head = a[:500]
    n = int(re.search(r'data-exam-preview-question-number="(\d+)"', head).group(1))
    book = re.search(r'data-exam-preview-question-code="([a-z]+)-2026-\d+"', head).group(1)
    typ = re.search(r'data-exam-preview-question-type="(\w+)"', head).group(1)
    kind = "big" if typ == "subjective" else "mcq"
    points = int(re.search(r'exam-preview-score">(\d+)\s*分', a).group(1))
    stem_seg = a.split('data-exam-preview-stem="">', 1)[1].split("exam-preview-question-actions", 1)[0]
    stem, images = convert(stem_seg)
    options = None
    if kind == "mcq":
        stem, options = split_options(stem)
        if options is None:
            diffs.append(f"q{n}: 选项拆分失败，保留整体题干")
    ana_seg = a.split('data-exam-preview-analysis="">', 1)[1].split("</details>", 1)[0] \
        if 'data-exam-preview-analysis="">' in a else ""
    explanation, ana_imgs = convert(ana_seg)
    if ana_imgs:
        diffs.append(f"q{n}: 解析含图 {ana_imgs}（未下载，需人工处理）")
    ans_m = re.search(r"参考答案：<strong[^>]*>([^<]*)</strong>", a)
    answer = ans_m.group(1).strip() if ans_m else None
    if kind == "big" and answer and len(answer) > 24:
        explanation = f"参考答案：{answer}\n\n{explanation}"
        answer = None
    oi = old_items[n]
    if orig_items[n]["book"] != book or orig_items[n]["kind"] != kind:
        diffs.append(f"q{n}: 分科/题型不一致 原={orig_items[n]['book']}/{orig_items[n]['kind']} pgcode={book}/{kind}")
    if kind == "mcq" and orig_items[n].get("answer") != answer:
        diffs.append(f"q{n}: 答案键不一致 原回忆版={orig_items[n].get('answer')} pgcode={answer}")
    if kind == "mcq" and not answer:
        diffs.append(f"q{n}: 未解析到答案键！")
    if orig_items[n]["points"] != points:
        diffs.append(f"q{n}: 分值 原回忆版={orig_items[n]['points']} pgcode={points}")
    for src in images:
        img_urls.setdefault(src, f"/cs408/pic/2026/{src.split('/')[-1]}")
    kps_meta = dict(oi.get("kps_meta") or {"method": "llm"})
    kps_meta["note"] = "LLM 多标签沿用 csgraduates 回忆版同题标注；题干已换 pgcode.cn 校订版（2026-11-17）"
    items.append({
        "n": n, "kind": kind, "book": book,
        "book_name": oi["book_name"], "points": points,
        "stem": stem, "options": options, "kps": oi.get("kps") or [],
        "kps_meta": kps_meta,
        "answer": answer if kind == "mcq" else None,
        "explanation": explanation or None,
        "stem_images": [img_urls[s] for s in images],
        "answer_meta": {"method": "web_html", "source": PAGE_URL, "quality": "ok",
                        "note": "pgcode.cn 预览页 SSR HTML 导入；KaTeX 转纯文本"},
    })

assert len(items) == 47, len(items)
assert sum(it["points"] for it in items) == 150
assert all(it["stem"] for it in items)
assert all(it["explanation"] for it in items)
mcq_keys = sum(1 for it in items if it["kind"] == "mcq" and it["answer"] and it["answer"] in "ABCD" and len(it["answer"]) == 1)
print(f"解析完成：47 题 / 150 分；选择题答案键 {mcq_keys}/40；图片 {len(img_urls)} 张")
print("=== 与原回忆版差异 ===")
for d in diffs:
    print(" ", d)
if not diffs:
    print("  （无）")

# ---------- 下载图片 ----------
PIC.mkdir(parents=True, exist_ok=True)
for src, local in img_urls.items():
    dst = ROOT / "frontend/public" / local.lstrip("/")
    if not dst.exists():
        urllib.request.urlretrieve(src, dst)
    print(f"图片 {dst.name}: {dst.stat().st_size} bytes")

# ---------- 写源文件 ----------
old["items"] = items
old["edition_label"] = "社区校订版（pgcode.cn，无官方卷）"
old["confidence"] = "medium"
old["source_url"] = PAGE_URL
old["source_note"] = (
    "pgcode.cn 社区校订版（2026-11-17 抓取 SSR 预览页）；替换原 csgraduates.com 考后回忆整理版；"
    "教育部未公开 408 正式卷，题干/选项仍可能与原卷措辞有出入"
)
old["verification"] = {
    "source_url": PAGE_URL,
    "checked_at": "2026-11-17",
    "status": "imported_from_pgcode",
    "answer_key_match": f"{mcq_keys}/40",
    "official_pdf": False,
    "scope": "题干/选项/答案/解析整体替换为 pgcode 校订版；考点标注沿用同题 LLM 多标签",
    "residual_risk": (
        "仍为社区整理，非官方卷；站点自述第42题题干 n=9 与候选序列8项不一致（校对注已指出）；"
        "第44题题干写满分15分、小问标记合计9分，按站点标注与2020–2025组成原理大题合计23分的结构取13分"
    ),
    "promote_when": "取得权威正式卷后：替换题干/选项 → 重跑生成脚本 → edition 改 verified 并更新 SOURCES.md",
    "points_reconciliation": old.get("verification", {}).get("points_reconciliation", ""),
}
SRC.write_text(json.dumps(old, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("已写入", SRC)