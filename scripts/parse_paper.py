#!/usr/bin/env python3
# parse_paper.py — 把考研英语真题 PDF 解析成结构化 JSON（统一版）
#
# 用法:  python parse_paper.py <paper.pdf> [paper.json]
# 不依赖年份；靠 Section / Part / Text / 题号 / 选项标记 识别结构。
# 输出 schema 见 parse_paper()。主要目的：抽干净的篇章正文供单词匹配 + 阅读。
#
# 本版相对初版的统一修复（已用 2006–2025 共 20 份真题回归验证）：
#   1. Section 头兼容 Unicode 罗马数字 Ⅰ Ⅱ Ⅲ（及 "Section ⅠUse of English" 无空格、
#      "Section\nⅢ" 跨行 形式）；只取每个 Section 的首次出现，自动排除末尾答案区。
#   2. 选项格式兼容 [A] / 【A】 / (A) / （A） / A.（句点）多种写法；题号允许 "1.[A]"
#      "31.What" 等无空格形式；同行多选项自动拆行。
#   3. 完形选项多列网格布局：用 PyMuPDF 词级坐标按 y 重建行，把"按列读"还原成"按行读"。
#   4. Part B（新题型）自动识别 七选五 / 排序 / 小标题 三种变体。
#   5. Writing 51/52 的 Directions 冒号兼容全角"："，并截断答案区尾巴。

import re
import sys
import json
from pathlib import Path

import fitz  # pymupdf


# ============ 排版噪声（页眉页脚/水印/页码），逐行剔除 ============
NOISE_PATTERNS = [
    re.compile(r"^英语试题\s*$"),
    re.compile(r"^\.\s*\d+\s*\.\s*$"),          # ". 3 ." 页码
    re.compile(r"^（共\s*\d+\s*页）\s*$"),
    re.compile(r"^pastpapers\.cn\s*$", re.I),
    re.compile(r"^绝密.*启用前.*$"),
    re.compile(r"^\d{1,3}\s*$"),                 # 裸页码 "3"
    re.compile(r"^[·•．.]\s*$"),                 # 点分隔
    re.compile(r"^本资料由淘宝店铺.*$"),
    re.compile(r"^光速考$"),
    re.compile(r"^作室整$"),
    re.compile(r"^[编型类试店获]+$"),            # 拆字水印残片
    re.compile(r"^第\s*\d+\s*页\s*共\s*\d+\s*页$"),
    re.compile(r"^共\s*\d+\s*页$"),
]

# 答案区标题行（出现即视为答案区开始，整段截断）。考研英文正文/指导语里不会出现中文"答案"。
ANSWER_LINE_RE = re.compile(
    r"(?m)^[^\n]*(?:真题|试题)[^\n]*答案[^\n]*$|^[^\n]*参考答案[^\n]*$|^[^\n]*答案与解析[^\n]*$|^答案[:：]?\s*$"
)


def clean_line(line: str) -> str:
    line = line.replace("　", " ").rstrip()
    if any(p.match(line) for p in NOISE_PATTERNS):
        return ""
    return line


def cut_answer_key(text: str) -> str:
    """从首个答案区标题行处截断，丢弃后面的答案/解析。"""
    m = ANSWER_LINE_RE.search(text)
    return text[: m.start()] if m else text


# ============ 页面提取：词级坐标按 y 重建行（修复多列网格）============
def words_to_lines(words, y_tol: float = 3.0):
    """把 PyMuPDF 的 words 按 y 坐标聚成视觉行，每行内按 x 排序。
    关键作用：完形选项若排成 4 列网格，get_text('text') 会按列读（全是 A 再全是 B…），
    这里按 y 聚行后还原成 "1. [A].. [B].. [C].. [D].." 的真实阅读顺序。
    另：修复题号被切成相邻 word 的情形（如 "2" 与 "4." 在同一行但 x 相邻、本属同一题号 "24."）：
    聚行后，对相邻的「裸数字 + 句点数字」做粘连还原。"""
    ws = sorted(words, key=lambda w: (w[1], w[0]))  # (y0, x0)
    if not ws:
        return []
    rows = []
    cur = [ws[0]]
    cur_y = ws[0][1]
    for w in ws[1:]:
        if abs(w[1] - cur_y) <= y_tol:
            cur.append(w)
        else:
            rows.append(cur)
            cur = [w]
            cur_y = w[1]
    rows.append(cur)
    out = []
    for r in rows:
        r.sort(key=lambda w: w[0])
        out.append(" ".join(x[4] for x in r))
    # 修复行内 "Text N" 标签：部分年份（如 2023）把 "Text 1" 当作侧栏标签
    # 贴在正文首行同一基线上，y 合并后正文与标签交错，如
    # "Communities ... England Text have 2 been ..." 或 "...recordkeepers Text of progress 4 in..."。
    # 抽取 "Text" + 后续首个 1-4 数字（中间可有任意正文词）作为标题，余词按 x 顺序拼回正文。
    final = []
    for row in out:
        # 先修复题号粘连：行首若出现「裸整数 word + 紧随其后的 "N." word」、且二者 x 紧邻
        # （如 "2" + "4." 本是 "24."），还原成完整题号，避免 QNUM_RE 把 "2" 当题号、
        # "4." 漂成下一题的题号。仅当裸整数是 1-2 位且后续句点数字也是 1-2 位时合并。
        row = _merge_split_qnum(row)
        m = re.search(r"Text\s+(?:\S+\s+)*?([1-4])(?!\d)", row)
        if m:
            header = "Text " + m.group(1)
            # 去掉行内的 'Text' 与该数字之间的词也属于正文，但数字是标签的一部分，
            # 所以删除 'Text' 起到匹配数字止的整段，再把中间的正文词放回。
            between = row[m.start() + len("Text"): m.start(1)].strip()  # Text 与数字之间的词
            body_before = row[: m.start()]
            body_after = row[m.end():]
            body = re.sub(r"\s{2,}", " ", (body_before + " " + between + " " + body_after)).strip()
            if body:
                final.append(body)
            final.append(header)
        else:
            final.append(row)
    return final


def _merge_split_qnum(row: str) -> str:
    """修复题号被 PyMuPDF 切成两个相邻 word 的情形：行首「裸整数 + 句点数字」
    如 "2 4." 本是 "24."。仅当行首匹配且合并后落在合理题号区间（1-52）时还原。
    避免误合并正文里"1 2."这类并列数字（正文行通常不以裸整数+句点数字开头）。"""
    m = re.match(r"^(\d{1,2})\s+(\d{1,2})\.", row)
    if not m:
        return row
    merged = m.group(1) + m.group(2)
    if 1 <= int(merged) <= 52:
        return merged + "." + row[m.end():]
    return row


def extract_pages(pdf_path: str):
    """返回每页清洗后的文本行列表。页间用 '' 占位空行隔开。"""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        words = page.get_text("words")  # (x0,y0,x1,y1,word,block,line,word_no)
        if words:
            lines = words_to_lines(words)
        else:
            lines = page.get_text("text").splitlines()  # 扫描件兜底
        lines = [clean_line(l) for l in lines]
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        pages.append(lines)
    doc.close()
    return pages


def join_pages(pages):
    out = []
    for lines in pages:
        out.extend(lines)
        out.append("")  # 页边界
    joined = "\n".join(out)
    # 去跨页重复行：某行若与相邻页第一非空行完全相同，视为页脚/页眉重叠或排版重复，
    # 保留首次出现即可。常见于 2018 完形：item 1 同时出现在两页底部/顶部。
    seen_lines = set()
    dedup = []
    for ln in joined.split("\n"):
        s = ln.strip()
        # 只去重"实质性"行（有内容且不太长），空行与短噪声保留原序
        if s and len(s) > 12 and s in seen_lines:
            continue
        if s and len(s) > 12:
            seen_lines.add(s)
        dedup.append(ln)
    return "\n".join(dedup)


# ---- 段落正规化：把被 PDF 折行拆断的句子重新拼起来 ----
SENT_END = re.compile(r"[.!?]['\")\]]?\s*$")


def reflow(text: str) -> str:
    raw_lines = [l.rstrip() for l in text.splitlines() if l.strip() != ""]
    if not raw_lines:
        return ""
    merged = [raw_lines[0]]
    for line in raw_lines[1:]:
        prev = merged[-1]
        if SENT_END.search(prev) or prev.endswith("-"):
            if prev.endswith("-"):
                merged[-1] = prev[:-1] + line.lstrip()
            else:
                merged.append(line)
            continue
        merged[-1] = prev + " " + line.lstrip()
    return "\n".join(merged)


# ============ 区块切分 ============

# Section 头：兼容 ASCII I/V/X 与 Unicode Ⅰ Ⅱ Ⅲ；允许 "Section ⅠUse" 无空格、
# "Section\nⅢ" 跨行。用 finditer 在整段文本上定位，天然处理跨行。
SECTION_RE = re.compile(r"Section\s*\n?\s*([ⅠⅡⅢⅣⅤIVX]+)", re.I)
PART_RE = re.compile(r"^Part\s+([A-C])\b", re.I)
TEXT_RE = re.compile(r"^Text\s+(\d+)(?:\s+(.*))?$", re.I)
DIRECTIONS_RE = re.compile(r"^Directions:\s*$", re.I)

_ROMAN_MAP = str.maketrans({"Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V"})


def norm_roman(s: str) -> str:
    return s.translate(_ROMAN_MAP)


def split_top_sections(text: str):
    """按 Section I/II/III 切顶层。只取每个罗马数字的【首次出现】——
    PDF 末尾的答案区会重复 Section 头，遇到重复即停止，整段答案区被丢弃。"""
    text = cut_answer_key(text)
    marks = [(m.start(), m.end(), norm_roman(m.group(1))) for m in SECTION_RE.finditer(text)]
    kept = []
    seen = set()
    for start, end, roman in marks:
        if roman in seen:
            break  # 进入答案区
        seen.add(roman)
        kept.append((start, end, roman))
    sections = []
    for i, (start, end, roman) in enumerate(kept):
        body_start = end
        body_end = kept[i + 1][0] if i + 1 < len(kept) else len(text)
        sections.append((roman, text[body_start:body_end]))
    return sections


def take_directions(body: str):
    """从区块开头摘出 Directions/指导段，返回 (directions, rest)。
    指导段统一以 (N points) 标记结束。rest 保持原始行结构。"""
    lines = body.split("\n")
    i = 0
    has_directions = False
    while i < len(lines):
        ln = lines[i].strip()
        if not ln:
            i += 1
            continue
        if DIRECTIONS_RE.match(lines[i]):
            has_directions = True
            break
        if len(ln) < 40 and "." not in ln and not ln[0].islower():
            i += 1
            continue
        break
    if i >= len(lines):
        return "", body
    flat = ""
    marker_end_line = None
    for li in range(i, len(lines)):
        flat += re.sub(r"\s+", " ", lines[li]) + " "
        m = re.search(r"\(\s*\d+\s*points?\s*\)", flat)
        if m:
            marker_end_line = li
            break
    if marker_end_line is not None:
        directions = reflow("\n".join(lines[i:marker_end_line + 1]))
        rest = "\n".join(lines[marker_end_line + 1:])
        directions = re.sub(r"^(Use of English|Reading Comprehension|Part [A-C])\s+", "", directions).strip()
        return directions, rest
    if has_directions:
        j = i + 1
        buf = []
        while j < len(lines):
            if lines[j].strip() == "" and buf:
                break
            buf.append(lines[j])
            j += 1
        return reflow("\n".join(buf)), "\n".join(lines[j:])
    return "", body


# ============ 选项格式归一化 ============
# 把 【A】 / (A) / （A） 等统一成 [A]；A. 句点式选项转成 [A]。
# 全角句号 ．(U+FF0E) 统一转 ASCII .（题号和选项句点都覆盖）。
def normalize_option_brackets(text: str) -> str:
    t = text.replace("【", "[").replace("】", "]")
    t = t.replace("．", ".")  # 全角句号 → ASCII
    t = re.sub(r"（\s*([A-G])\s*）", r"[\1]", t)
    t = re.sub(r"\(\s*([A-G])\s*\)", r"[\1]", t)
    return t


def normalize_options(text: str) -> str:
    """归一化选项块：统一括号为 [X]；把 "A." 句点式选项标记转成 [A]；
    全角句号 ． 转 .。仅在选项块上下文调用（不用于正文）。"""
    t = normalize_option_brackets(text)
    # 句点式选项标记 "A." → "[A]"：仅对【选项行】整体转换，避免误伤正文里的人名缩写
    # （如 "Robert F. Kennedy" 中的 F.）。判定一行是否为选项行：
    #   - "数字. A. xxx"  完形题号后紧跟选项
    #   - "A. xxx"        行首即为选项字母
    # 满足时把该行所有 字母+句点+空格 统一转 [字母]。
    out = []
    for ln in t.split("\n"):
        if re.match(r"^\s*\d+\.\s+[A-G]\.\s", ln) or re.match(r"^\s*[A-G]\.\s", ln):
            ln = re.sub(r"([A-G])\.\s", r"[\1] ", ln)
        out.append(ln)
    t = "\n".join(out)
    # 题号紧贴选项: "10.[A]" → "10. [A]"（保证题号与选项之间有空格）
    t = re.sub(r"(?m)^(\d{1,2})\.(\[)", r"\1. \2", t)
    return t


def split_inline_options(text: str) -> str:
    """把同一行里的多个 [X] 选项拆成多行；题号前缀单独成行。
    使后续逐行解析能稳定识别。"""
    out = []
    for ln in text.split("\n"):
        s = ln.rstrip()
        marks = list(re.finditer(r"\[[A-G]\]", s))
        if len(marks) <= 1 and not (marks and marks[0].start() > 0 and re.match(r"^\s*\d{1,2}\.", s)):
            out.append(s)
            continue
        if not marks:
            out.append(s)
            continue
        first = marks[0].start()
        prefix = s[:first].rstrip()
        if prefix.strip():
            out.append(prefix)
        for i, m in enumerate(marks):
            seg = s[m.start(): (marks[i + 1].start() if i + 1 < len(marks) else len(s))]
            out.append(seg.strip())
    return "\n".join(out)


# 题号：允许 "1." / "1. " / "1.[A]" / "31.What"（句点后无空格）。
# (?!\d) 防止把正文里的 "75.6 percent" 这类小数误判为题号 75。
QNUM_RE = re.compile(r"^(\d{1,2})\.(?!\d)\s*", re.M)
# 选项行（归一化后）: "[A] text"
OPT_RE = re.compile(r"^\[([A-G])\]\s*(.*)")
# 选项块起始：题号 + 任意格式选项标记（用于切分完形正文/选项边界）
OPT_START_RE = re.compile(
    r"^\s*\d{1,2}\.\s*(?:\[[A-G]\]|【[A-G]】|（[A-G]）|\([A-G]\)|[A-G]\.)", re.M
)


# ---- Use of English（完形）----
def parse_use_of_english(body: str):
    directions, rest = take_directions(body)
    # 先归一化括号/全角句号，使 OPT_START_RE 能命中 7．[A] 这种全角题号
    rest = normalize_option_brackets(rest)
    m = OPT_START_RE.search(rest)
    passage_raw = rest[: m.start()] if m else rest
    items_raw = rest[m.start():] if m else ""
    passage = reflow(passage_raw)
    items = parse_options_items(items_raw)
    return {
        "type": "use_of_english",
        "title": "Section I Use of English",
        "directions": directions,
        "passage": passage.strip(),
        "items": items,
    }


def parse_options_items(text: str):
    """解析形如  N. [A].. [B].. [C].. [D]..  的选项题块（完形）。
    题号与 [A] 解耦：题号行开新题，后续 [X] 行挂选项，续行并入当前选项/stem。"""
    text = split_inline_options(normalize_options(text))
    items = []
    cur = None
    cur_opt = None
    for ln in text.split("\n"):
        s = ln.strip()
        if not s:
            continue
        m = QNUM_RE.match(s)
        om = OPT_RE.match(s)
        if m and not om:
            if cur:
                items.append(cur)
            cur = {"n": int(m.group(1)), "stem": s[m.end():].strip(), "options": {}}
            cur_opt = None
        elif om:
            if cur is None:
                continue
            cur["options"][om.group(1)] = om.group(2).strip()
            cur_opt = om.group(1)
        else:
            if cur is None:
                continue
            if cur_opt and cur_opt in cur["options"]:
                cur["options"][cur_opt] += " " + s
            else:
                cur["stem"] = (cur["stem"] + " " + s).strip()
    if cur:
        items.append(cur)
    return items


# ---- Reading Part A ----
def parse_reading_a(body: str):
    directions, rest = take_directions(body)
    texts = []
    cur_label = None
    cur_buf = []
    for ln in rest.split("\n"):
        s = ln.strip()
        m = TEXT_RE.match(s)
        if m:
            if cur_label:
                texts.append((cur_label, "\n".join(cur_buf)))
            cur_label = "Text " + m.group(1)
            after = s[m.end():].strip()
            cur_buf = [after] if after else []
        elif cur_label is not None:
            cur_buf.append(ln)
    if cur_label:
        texts.append((cur_label, "\n".join(cur_buf)))

    passages = []
    for label, t in texts:
        m = None
        for ln in t.split("\n"):
            if QNUM_RE.match(ln.strip()):
                m = QNUM_RE.search(t)
                break
        passage_raw = t[: m.start()] if m else t
        items_raw = t[m.start():] if m else ""
        passages.append({
            "label": label,
            "body": reflow(passage_raw).strip(),
            "items": parse_stem_items(items_raw),
        })
    return {
        "type": "reading_a",
        "title": "Section II Reading Comprehension — Part A",
        "directions": directions,
        "passages": passages,
    }


def parse_stem_items(text: str):
    """解析阅读题：N. stem... [A].. [B].. [C].. [D].."""
    text = split_inline_options(normalize_options(text))
    lines = text.split("\n")
    items = []
    cur = None
    cur_opt = None
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        m = QNUM_RE.match(s)
        om = OPT_RE.match(s)
        if m and not om:
            if cur:
                items.append(cur)
            cur = {"n": int(m.group(1)), "stem": s[m.end():].strip(), "options": {}}
            cur_opt = None
        elif om:
            if cur is None:
                continue
            cur["options"][om.group(1)] = om.group(2).strip()
            cur_opt = om.group(1)
        else:
            if cur is None:
                continue
            if cur_opt and cur_opt in cur["options"] and cur["stem"]:
                cur["options"][cur_opt] += " " + s
            elif cur_opt and cur_opt in cur["options"]:
                cur["stem"] = (cur["stem"] + " " + s).strip()
            else:
                cur["stem"] = (cur["stem"] + " " + s).strip()
    if cur:
        items.append(cur)
    return items


# ---- Reading Part B（新题型：七选五 / 排序 / 小标题）----
GAP_RE = re.compile(r"\(\s*(\d{1,2})\s*\)")


def parse_option_list(text: str):
    """解析 [A]..[H] 选项/段落列表（选项可能跨多行）。允许到 H（排序题有 A-H 段）。"""
    opt_line_re = re.compile(r"^\s*\[([A-H])\]\s*(.*)")
    options = {}
    cur = None
    for ln in text.split("\n"):
        m = opt_line_re.match(ln.strip())
        if m:
            cur = m.group(1)
            options[cur] = m.group(2).strip()
        elif cur:
            options[cur] += " " + ln.strip()
    # 去尾部噪声
    for k in list(options):
        options[k] = re.sub(r"\s*第\s*\d+\s*页共\s*\d+\s*页\s*$", "", options[k]).strip()
        options[k] = re.sub(r"\s*英语试题.*$", "", options[k]).strip()
    return options


def parse_reading_b(body: str):
    directions, rest = take_directions(body)
    rest = normalize_option_brackets(rest)
    # 句点式选项标记 "A. xxx"（行首）→ "[A] xxx"。
    # 仅在确属选项/段落列表时转换：要求全卷出现 ≥3 个 A-H 行首句点标记（排除正文里偶发的 "A. " 缩写）。
    dot_starts = re.findall(r"(?m)^\s*([A-H])\.\s+\S", rest)
    if len(dot_starts) >= 3:
        rest = re.sub(r"(?m)^([A-H])\.\s+", r"[\1] ", rest)
    lines = rest.split("\n")
    opt_line_re = re.compile(r"^\s*\[([A-H])\]\s*(.*)")
    # 找首个选项行（允许 i==0：排序题段落列表可能从首行开始）
    opt_start = None
    for i, ln in enumerate(lines):
        if opt_line_re.match(ln.strip()):
            opt_start = i
            break
    if opt_start is not None:
        passage_raw = "\n".join(lines[:opt_start])
        options_raw = "\n".join(lines[opt_start:])
        options = parse_option_list(options_raw)
    else:
        passage_raw = rest
        options = {}

    passage = reflow(passage_raw)
    # gaps: 优先 (41)..(45) 括号标记；其次裸数字 41..45（小标题题型）；再次 41.→42.→ 箭头序列
    gaps = []
    for m in re.finditer(r"\(\s*(4[1-5])\s*\)", passage):
        gaps.append(int(m.group(1)))
    if not gaps:
        # 箭头序列 "41. →42. →C →43. ..." 或行尾裸 41-45
        arrow_run = re.findall(r"(4[1-5])\s*(?:→|➡)", rest)
        gaps.extend(int(g) for g in arrow_run)
    if not gaps:
        for m in re.finditer(r"(?<!\d)(4[1-5])(?!\d)", passage):
            gaps.append(int(m.group(1)))
    gaps = sorted(set(gaps))
    # 排序题变体：passage 里没有 gap 标记，options 是待排序段落 [A]..[H]
    if not gaps and options:
        gaps = [41, 42, 43, 44, 45]
    return {
        "type": "reading_b",
        "title": "Section II Reading Comprehension — Part B",
        "directions": directions,
        "passage": passage.strip(),
        "gaps": gaps,
        "options": options,
    }


# ---- Part C 翻译 ----
def parse_translation(body: str):
    directions, rest = take_directions(body)
    passage = reflow(rest)
    segments = []
    marks = list(GAP_RE.finditer(passage))
    for i, m in enumerate(marks):
        n = int(m.group(1))
        if not (45 <= n <= 55):
            continue
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(passage)
        seg = passage[start:end].strip()
        seg = re.sub(r"\s*\(\s*\d+\s*\)\s*$", "", seg).strip()
        segments.append({"n": n, "segment": seg})
    # 英语二翻译是「整篇全文翻译」：正文里没有 (46)..(50) 段标记。
    # 兜底：若无 segment 命中但正文非空，把整篇当作 1 段（题号取 directions 里的
    # 「46.」；取不到则默认 46）。避免英二翻译段全空。
    if not segments and passage.strip():
        mnum = re.search(r"(\d{1,2})\s*\.\s*Directions", directions or body)
        n = int(mnum.group(1)) if mnum and 45 <= int(mnum.group(1)) <= 55 else 46
        segments.append({"n": n, "segment": passage.strip()})
    return {
        "type": "translation",
        "title": "Section II Reading Comprehension — Part C",
        "directions": directions,
        "passage": passage.strip(),
        "segments": segments,
    }


# ---- Writing ----
def parse_writing(body: str):
    """按 N. Directions 切 Part A/B（英一题号 51/52、英二题号 47/48，统一 \\d{1,2} 兼容）。
    冒号兼容 ASCII":"与全角"："；两者之间的文本归属前者；并截断答案区尾巴。
    题号与 Directions 之间允许夹一行「Part A/B」（英二 2023 等年份排版）。"""
    body = cut_answer_key(body)
    pat = re.compile(r"(?m)^\s*(\d{1,2})\s*\.\s*(?:Part\s+[A-C]\b[^\n]*\n\s*)?Directions\s*[:：]")
    marks = [(int(m.group(1)), m.start(), m.end()) for m in pat.finditer(body)]
    # 去重：同一题号只取首次
    seen_n = set()
    uniq = []
    for n, ms, me in marks:
        if n in seen_n:
            break
        seen_n.add(n)
        uniq.append((n, ms, me))
    parts = []
    for i, (n, ms, me) in enumerate(uniq):
        end = uniq[i + 1][1] if i + 1 < len(uniq) else len(body)
        text = body[me:end]
        parts.append({"n": n, "directions": reflow(text).strip()})
    # 兜底：若没匹配到 Directions 行，按 "51."/"52." 题号切
    found = {p["n"] for p in parts}
    for n in (51, 52):
        if n in found:
            continue
        m = re.search(r"(?m)^\s*" + str(n) + r"\s*\.\s*", body)
        if m:
            tail = body[m.start():]
            if uniq:
                tail = tail  # 简化：不再精切
            parts.append({"n": n, "directions": reflow(tail.split("\n", 1)[-1]).strip()})
    parts.sort(key=lambda p: p["n"])
    return {
        "type": "writing",
        "title": "Section III Writing",
        "parts": parts,
    }


def parse_paper(pdf_path: str, year=None):
    pages = extract_pages(pdf_path)
    full = join_pages(pages)
    sections = split_top_sections(full)

    sec_map = {}
    for roman, body in sections:
        sec_map[roman] = body

    out = {
        "year": year,
        "source": Path(pdf_path).name,
        "sections": [],
    }

    if "I" in sec_map:
        out["sections"].append(parse_use_of_english(sec_map["I"]))
    if "II" in sec_map:
        body = sec_map["II"]
        part_lines = body.split("\n")
        parts = {}
        cur = None
        buf = []
        for ln in part_lines:
            m = PART_RE.match(ln)
            if m:
                if cur:
                    parts[cur] = "\n".join(buf)
                cur = m.group(1)
                buf = []
            elif cur is not None:
                buf.append(ln)
        if cur:
            parts[cur] = "\n".join(buf)
        first_part_idx = None
        for i, ln in enumerate(part_lines):
            if PART_RE.match(ln):
                first_part_idx = i
                break
        if first_part_idx:
            pre = "\n".join(part_lines[:first_part_idx])
            parts["A"] = pre + "\n" + parts.get("A", "")

        if "A" in parts:
            out["sections"].append(parse_reading_a(parts["A"]))
        if "B" in parts:
            out["sections"].append(parse_reading_b(parts["B"]))
        if "C" in parts:
            out["sections"].append(parse_translation(parts["C"]))

    has_translation = any(s["type"] == "translation" for s in out["sections"])
    # 英语二：翻译是独立 Section III（Section II 只有 Part A/B，无 Part C）。
    # split_top_sections 对重复罗马数字早停，故 2022+ 年份 sec_map["III"] 里
    # 会夹带第二个「Section III Writing」——_truncate_at_writing 把写作段切掉。
    if not has_translation and "III" in sec_map:
        out["sections"].append(parse_translation(_truncate_at_writing(sec_map["III"])))

    # 写作：英一在 Section III；英二在 Section IV（传统）或第二个 Section III（2022+）。
    if "IV" in sec_map:
        out["sections"].append(parse_writing(sec_map["IV"]))
    elif "III" in sec_map:
        if has_translation:
            # 英一：Section III 即写作
            out["sections"].append(parse_writing(sec_map["III"]))
        else:
            # 英二 2022+：写作是全文里第二个「Section III Writing」
            wb = _find_writing_in_full(full)
            if wb is not None:
                out["sections"].append(parse_writing(wb))

    return out


def _truncate_at_writing(sec_iii_body: str) -> str:
    """EN2 Section III（翻译）正文若夹带第二个「Section III Writing」子标题，截掉写作段。"""
    m = re.search(r"Section\s*\n?\s*(?:Ⅲ|III)\s+Writing", sec_iii_body, re.I)
    return sec_iii_body[: m.start()] if m else sec_iii_body


def _find_writing_in_full(full: str):
    """EN2 2022+：全文里定位第二个「Section III Writing」（写作段），返回该段正文到文末。
    答案区由 parse_writing 内 cut_answer_key 再截。未找到返回 None。"""
    m = re.search(r"Section\s*\n?\s*(?:Ⅲ|III|Ⅳ|IV)\s+Writing", full, re.I)
    return full[m.start():] if m else None


def guess_year(pdf_path: str, data):
    if data.get("year"):
        return data["year"]
    name = Path(pdf_path).name
    m = re.search(r"(19\d{2}|20\d{2})", name)
    if m:
        return int(m.group(1))
    return None


def section_summary(sec):
    t = sec["type"]
    if t == "use_of_english":
        return f"  {t}: passage {len(sec['passage'])} chars, items {len(sec['items'])} (4-opt: {sum(1 for it in sec['items'] if len(it.get('options',{}))==4)})"
    if t == "reading_a":
        return f"  {t}: {len(sec['passages'])} texts " + "|".join(
            f"{p['label']}:{len(p.get('body',''))}c/{len(p.get('items',[]))}q" for p in sec["passages"])
    if t == "reading_b":
        return f"  {t}: passage {len(sec.get('passage',''))} chars, gaps {sec.get('gaps')}, options {list(sec.get('options',{}).keys())}"
    if t == "translation":
        return f"  {t}: passage {len(sec['passage'])} chars, segments {len(sec['segments'])}"
    if t == "writing":
        return f"  {t}: parts {[p['n'] for p in sec['parts']]}"
    return f"  {t}"


def main():
    if len(sys.argv) < 2:
        print("usage: parse_paper.py <paper.pdf> [out.json]")
        sys.exit(1)
    pdf = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else None
    data = parse_paper(pdf)
    data["year"] = guess_year(pdf, data)
    if not out_path:
        stem = Path(pdf).stem
        out_path = str(Path(pdf).parent / f"{stem}.json")
    Path(out_path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"parsed {pdf} -> {out_path}")
    print(f"year: {data['year']}")
    for sec in data["sections"]:
        print(section_summary(sec))


if __name__ == "__main__":
    main()
