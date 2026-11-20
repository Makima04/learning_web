#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 /Users/makima/Downloads/考研数学一手稿 下全部 13 份网页版数学手稿
完整解析并导出为 frontend/public/math/handouts.json，供「小祥学习」左侧「数学手稿」使用。
- 完整保留原手稿的怎么判表格、看式子找第一步（含公式与跳转）、例题串讲、按方法练习、举一反三与 MathML。
- 自动将历年数一真题关联到 math1Questions.json 的 itemId，将李林 880 例题关联到 lilin880.json 的 id，
  实现与「题目复习」「复习性价比」「知识图谱」的三向精确同步。
"""
import json
import os
import re
from html import unescape

HANDOUT_DIR = "/Users/makima/Downloads/考研数学一手稿"
PROJECT_DIR = "/Users/makima/program/web/english_web"
MATH1_Q_PATH = os.path.join(PROJECT_DIR, "frontend/src/data/kg/math1Questions.json")
LILIN_Q_PATH = os.path.join(PROJECT_DIR, "frontend/public/math/lilin880.json")
OUT_PATH = os.path.join(PROJECT_DIR, "frontend/public/math/handouts.json")

LECTURE_MAP = [
    {
        "rel": "函数、极限与连续/01 未定式与求极限技巧.html",
        "slug": "calc-limit-tech",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-limit",
        "primaryKpId": "calc.limit.tech",
        "secondaryKpIds": ["calc.limit.inf", "calc.limit.def", "calc.d1.lhopital"],
        "order": 1,
    },
    {
        "rel": "函数、极限与连续/02 连续性与间断点.html",
        "slug": "calc-limit-cont",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-limit",
        "primaryKpId": "calc.limit.cont",
        "secondaryKpIds": ["calc.limit.def", "calc.limit.tech"],
        "order": 2,
    },
    {
        "rel": "一元函数积分学/01 变限积分与积分上限函数.html",
        "slug": "calc-int1-varlimit",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-int1",
        "primaryKpId": "calc.i1.def",
        "secondaryKpIds": ["calc.i1.tech", "calc.d1.rules"],
        "order": 2,
    },
    {
        "rel": "多元函数微分学/02 偏导数与可微性的关系.html",
        "slug": "calc-multi-diff",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi",
        "primaryKpId": "calc.m.partial",
        "secondaryKpIds": ["calc.m.impl"],
        "order": 3,
    },
    {
        "rel": "多元函数微分学/10 条件极值与区域上的最值.html",
        "slug": "calc-multi-ext",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi",
        "primaryKpId": "calc.m.ext",
        "secondaryKpIds": ["calc.m.partial"],
        "order": 4,
    },
    {
        "rel": "多元函数积分学/03 曲线积分与格林、斯托克斯公式.html",
        "slug": "calc-line-stokes",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-line-surf",
        "primaryKpId": "calc.m.line2",
        "secondaryKpIds": ["calc.m.line", "calc.m.formula"],
        "order": 5,
    },
    {
        "rel": "多元函数积分学/04 曲面积分与高斯公式.html",
        "slug": "calc-surf-gauss",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-line-surf",
        "primaryKpId": "calc.m.surf2",
        "secondaryKpIds": ["calc.m.surf", "calc.m.formula"],
        "order": 6,
    },
    {
        "rel": "向量组与线性方程组/01 向量组的线性相关与线性表示.html",
        "slug": "la-vec-indep",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-vec",
        "primaryKpId": "la.eq.vector",
        "secondaryKpIds": ["la.eq.structure", "la.eq.solvability", "la.sp.basis"],
        "order": 7,
    },
    {
        "rel": "特征值、特征向量与相似/01 相似矩阵、矩阵幂与秩.html",
        "slug": "la-eig-similar",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-eigen",
        "primaryKpId": "la.eig.similar",
        "secondaryKpIds": ["la.eig.diag", "la.eig.value"],
        "order": 8,
    },
    {
        "rel": "二次型/01 二次型的正定性.html",
        "slug": "la-quad-pd",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-quad",
        "primaryKpId": "la.eig.pd",
        "secondaryKpIds": ["la.eig.quad"],
        "order": 9,
    },
    {
        "rel": "多维随机变量及其分布/01 条件分布、联合分布与边缘分布.html",
        "slug": "prob-mv-cond",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-multi",
        "primaryKpId": "prob.mv.joint",
        "secondaryKpIds": ["prob.mv.indep", "prob.mv.func"],
        "order": 10,
    },
    {
        "rel": "随机变量的数字特征/01 数学期望与绝对值.html",
        "slug": "prob-num-ex",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-num",
        "primaryKpId": "prob.num.ex",
        "secondaryKpIds": ["prob.rv.dist"],
        "order": 11,
    },
    {
        "rel": "大数定律与中心极限定理/02 中心极限定理与标准化.html",
        "slug": "prob-limit-clt",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-limit",
        "primaryKpId": "prob.limit.clt",
        "secondaryKpIds": ["prob.limit.lln", "prob.num.ineq"],
        "order": 12,
    },
    {
        "rel": "数理统计的基本概念/02 t 分布、F 分布与尾概率.html",
        "slug": "prob-stat-tf",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-stat",
        "primaryKpId": "prob.stat.sample",
        "secondaryKpIds": ["prob.stat.est"],
        "order": 13,
    },
]


def load_math1_lookup():
    d = json.load(open(MATH1_Q_PATH, encoding="utf-8"))
    return {(item["year"], item["n"]): item for item in d["items"]}


def load_lilin880_lookup():
    items = json.load(open(LILIN_Q_PATH, encoding="utf-8"))
    lookup = {}
    for q in items:
        band = q.get("band") or ""
        is_ext = "拓展" in band or q["id"].endswith("-x2")
        key = (q.get("book"), q.get("part"), str(q.get("section")), q.get("kind"), q.get("qno"), is_ext)
        lookup[key] = q["id"]
    return lookup


def strip_tags(s):
    return unescape(re.sub(r"<[^>]+>", "", s)).strip()


def classify_source(src, book, math1_by_yn, lilin_lookup):
    src_clean = src.strip()
    year = None
    qnum = None
    matched_math1_id = None
    matched_lilin_id = None

    has_880 = "880" in src_clean
    has_exam = bool(re.search(r"(19|20)\d{2}\s*年数(?:学)?[一二三]", src_clean))

    if has_880 and not has_exam:
        source_type = "lilin880"
    elif has_880 and has_exam:
        # 同题（既是真题又收录在李林880）：主归类为真题，同时标记 lilin880Id 使其在 880 优先模式也出现
        source_type = "exam"
    elif "李林" in src_clean or "红笔" in src_clean or "预测卷" in src_clean:
        source_type = "lilin_mock"
    else:
        source_type = "exam"

    m_exam = re.search(r"(20\d{2})\s*年数(?:学)?一.*?第\s*(\d+)\s*题", src_clean)
    if m_exam:
        year = int(m_exam.group(1))
        qnum = int(m_exam.group(2))
        if (year, qnum) in math1_by_yn:
            matched_math1_id = math1_by_yn[(year, qnum)]["id"]

    if has_880:
        m_ll = re.search(r"第\s*(\d+)\s*章\s*(基础|综合|拓展)(选择|填空|解答)第\s*(\d+)\s*题", src_clean)
        if m_ll:
            sec = m_ll.group(1)
            band_word = m_ll.group(2)
            part = "base" if band_word == "基础" else "hard"
            is_ext = band_word == "拓展"
            kind = {"选择": "mcq", "填空": "fill", "解答": "big"}[m_ll.group(3)]
            ll_qno = int(m_ll.group(4))
            matched_lilin_id = lilin_lookup.get((book, part, sec, kind, ll_qno, is_ext))
            if not matched_lilin_id and is_ext:
                matched_lilin_id = lilin_lookup.get((book, part, sec, kind, ll_qno, False))

    return source_type, year, qnum, matched_math1_id, matched_lilin_id


def extract_section(html, start_id, next_ids):
    m = re.search(rf'<h2[^>]*id="{re.escape(start_id)}"[^>]*>(.*?)</h2>', html, re.S)
    if not m:
        return "", ""
    heading = strip_tags(m.group(1))
    rest = html[m.end():]
    end_pos = len(rest)
    for nid in next_ids:
        m2 = re.search(rf'<h2[^>]*id="{re.escape(nid)}"[^>]*>', rest)
        if m2 and m2.start() < end_pos:
            end_pos = m2.start()
    return heading, rest[:end_pos].strip()


def split_solution(sol_html):
    """
    将 <div class="solution"> 拆分为：
    - hintHtml: 首个题面线索块（如「题面线索和第一步」）的正文（含标题）
    - stepsHtml: 其余所有具体答题步骤（推导与结论、worked-step、举一反三、note 等）
    """
    s = sol_html.strip()
    if not s:
        return "", ""
    # 检查第一个 div.explanation 是否为「题面线索」类提示
    m_first = re.match(r'\s*(<div class="explanation"[^>]*>\s*<h4[^>]*>(.*?)</h4>.*?</div>)', s, re.S)
    if m_first:
        h4_text = strip_tags(m_first.group(2))
        if any(k in h4_text for k in ("线索", "第一步", "起手", "思路", "判别")):
            hint_html = m_first.group(1).strip()
            steps_html = s[m_first.end():].strip()
            return hint_html, steps_html
    return "", s



# 针对典型左右极限/分段讨论题的精细双栏对照排版（样板）
CUSTOM_STEPS_OVERRIDES = {
    "ll-base-1-mcq-11": """<div class="explanation">
<h4>推导与结论</h4>
<div class="mh-compare-grid">
  <div class="mh-compare-card">
    <div class="mh-compare-head">左侧极限（<math><mi>x</mi><mo>→</mo><msup><mn>0</mn><mo>−</mo></msup></math>）</div>
    <p>此时 <math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>→</mo><mo>−</mo><mi>∞</mi></math>，故 <math><msup><mi mathvariant="normal">e</mi><mfrac><mn>1</mn><mi>x</mi></mfrac></msup><mo>→</mo><mn>0</mn></math>、<math><msup><mi mathvariant="normal">e</mi><mfrac><mn>2</mn><mi>x</mi></mfrac></msup><mo>→</mo><mn>0</mn></math>：</p>
    <div class="formula"><math display="block"><mfrac><mrow><mn>2</mn><mo>+</mo><msup><mi mathvariant="normal">e</mi><mfrac><mn>1</mn><mi>x</mi></mfrac></msup></mrow><mrow><mn>1</mn><mo>+</mo><msup><mi mathvariant="normal">e</mi><mfrac><mn>2</mn><mi>x</mi></mfrac></msup></mrow></mfrac><mo>→</mo><mn>2</mn><mo>,</mo><mspace width="1em"/><mfrac><mrow><mo>sin</mo><mi>x</mi></mrow><mrow><mo>|</mo><mi>x</mi><mo>|</mo></mrow></mfrac><mo>=</mo><mo>−</mo><mfrac><mrow><mo>sin</mo><mi>x</mi></mrow><mi>x</mi></mfrac><mo>→</mo><mo>−</mo><mn>1</mn></math></div>
    <p>相加得左极限 <math><msub><mi>L</mi><mo>−</mo></msub><mo>=</mo><mn>2</mn><mo>−</mo><mn>1</mn><mo>=</mo><mn>1</mn></math>。</p>
  </div>
  <div class="mh-compare-card">
    <div class="mh-compare-head">右侧极限（<math><mi>x</mi><mo>→</mo><msup><mn>0</mn><mo>+</mo></msup></math>）</div>
    <p>此时 <math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>→</mo><mo>+</mo><mi>∞</mi></math>，第一项分子分母同除 <math><msup><mi mathvariant="normal">e</mi><mfrac><mn>2</mn><mi>x</mi></mfrac></msup></math>：</p>
    <div class="formula"><math display="block"><mfrac><mrow><mn>2</mn><msup><mi mathvariant="normal">e</mi><mrow><mo>−</mo><mfrac><mn>2</mn><mi>x</mi></mfrac></mrow></msup><mo>+</mo><msup><mi mathvariant="normal">e</mi><mrow><mo>−</mo><mfrac><mn>1</mn><mi>x</mi></mfrac></mrow></msup></mrow><mrow><msup><mi mathvariant="normal">e</mi><mrow><mo>−</mo><mfrac><mn>2</mn><mi>x</mi></mfrac></mrow></msup><mo>+</mo><mn>1</mn></mrow></mfrac><mo>→</mo><mn>0</mn><mo>,</mo><mspace width="1em"/><mfrac><mrow><mo>sin</mo><mi>x</mi></mrow><mrow><mo>|</mo><mi>x</mi><mo>|</mo></mrow></mfrac><mo>=</mo><mfrac><mrow><mo>sin</mo><mi>x</mi></mrow><mi>x</mi></mfrac><mo>→</mo><mn>1</mn></math></div>
    <p>相加得右极限 <math><msub><mi>L</mi><mo>+</mo></msub><mo>=</mo><mn>0</mn><mo>+</mo><mn>1</mn><mo>=</mo><mn>1</mn></math>。</p>
  </div>
</div>
<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>左右极限相等且均为 <math><mn>1</mn></math>，原式在 <math><mi>x</mi><mo>=</mo><mn>0</mn></math> 处缺值，故为第一类<strong>可去间断点</strong>。答案 <strong>A</strong>。</div>
</div>""",
    "ll-hard-1-fill-5": """<div class="explanation">
<h4>推导与结论</h4>
<div class="mh-compare-grid">
  <div class="mh-compare-card">
    <div class="mh-compare-head">左侧极限（<math><mi>x</mi><mo>→</mo><msup><mn>0</mn><mo>−</mo></msup></math>）</div>
    <p>此时 <math><mo>⌊</mo><mi>x</mi><mo>⌋</mo><mo>=</mo><mo>−</mo><mn>1</mn></math>，且 <math><msup><mi mathvariant="normal">e</mi><mfrac><mn>1</mn><mi>x</mi></mfrac></msup><mo>→</mo><mn>0</mn></math>，用 <math><mo>ln</mo><mo>(</mo><mn>1</mn><mo>+</mo><mi>u</mi><mo>)</mo><mo>∼</mo><mi>u</mi></math>：</p>
    <div class="formula"><math display="block"><mfrac><mrow><mo>ln</mo><mo>(</mo><mn>1</mn><mo>+</mo><msup><mi mathvariant="normal">e</mi><mfrac><mn>2</mn><mi>x</mi></mfrac></msup><mo>)</mo></mrow><mrow><mo>ln</mo><mo>(</mo><mn>1</mn><mo>+</mo><msup><mi mathvariant="normal">e</mi><mfrac><mn>1</mn><mi>x</mi></mfrac></msup><mo>)</mo></mrow></mfrac><mo>∼</mo><mfrac><msup><mi mathvariant="normal">e</mi><mfrac><mn>2</mn><mi>x</mi></mfrac></msup><msup><mi mathvariant="normal">e</mi><mfrac><mn>1</mn><mi>x</mi></mfrac></msup></mfrac><mo>=</mo><msup><mi mathvariant="normal">e</mi><mfrac><mn>1</mn><mi>x</mi></mfrac></msup><mo>→</mo><mn>0</mn></math></div>
    <p>故左极限 <math><msub><mi>L</mi><mo>−</mo></msub><mo>=</mo><mo>−</mo><mi>a</mi><mo>+</mo><mn>0</mn><mo>=</mo><mo>−</mo><mi>a</mi></math>。</p>
  </div>
  <div class="mh-compare-card">
    <div class="mh-compare-head">右侧极限（<math><mi>x</mi><mo>→</mo><msup><mn>0</mn><mo>+</mo></msup></math>）</div>
    <p>此时 <math><mo>⌊</mo><mi>x</mi><mo>⌋</mo><mo>=</mo><mn>0</mn></math>，<math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>→</mo><mo>+</mo><mi>∞</mi></math>，对数内提出主导指数项：</p>
    <div class="formula"><math display="block"><mfrac><mrow><mfrac><mn>2</mn><mi>x</mi></mfrac><mo>+</mo><mo>ln</mo><mo>(</mo><mn>1</mn><mo>+</mo><msup><mi mathvariant="normal">e</mi><mrow><mo>−</mo><mfrac><mn>2</mn><mi>x</mi></mfrac></mrow></msup><mo>)</mo></mrow><mrow><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mo>ln</mo><mo>(</mo><mn>1</mn><mo>+</mo><msup><mi mathvariant="normal">e</mi><mrow><mo>−</mo><mfrac><mn>1</mn><mi>x</mi></mfrac></mrow></msup><mo>)</mo></mrow></mfrac><mo>→</mo><mn>2</mn></math></div>
    <p>故右极限 <math><msub><mi>L</mi><mo>+</mo></msub><mo>=</mo><mn>0</mn><mo>+</mo><mn>2</mn><mo>=</mo><mn>2</mn></math>。</p>
  </div>
</div>
<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>极限存在要求 <math><msub><mi>L</mi><mo>−</mo></msub><mo>=</mo><msub><mi>L</mi><mo>+</mo></msub><mo>=</mo><mi>b</mi></math>，即 <math><mo>−</mo><mi>a</mi><mo>=</mo><mn>2</mn></math>，得 <strong><math><mi>a</mi><mo>=</mo><mo>−</mo><mn>2</mn></math>、<math><mi>b</mi><mo>=</mo><mn>2</mn></math></strong>。</div>
</div>""",
}


def is_heavy_math(math_html):
    """判断行内 MathML 是否为多层嵌套复杂公式（需要提升为独立居中公式行）。"""
    # 1) msup/msub 内嵌套 mfrac，且整体外层还有 mfrac（三层结构）
    if "<mfrac>" in math_html and math_html.count("<mfrac>") >= 2:
        return True
    # 2) mtable.cases 分段大括号
    if 'class="cases"' in math_html:
        return True
    # 3) 较长的方程/积分推导（含多个运算符或上下限积分+分式）
    if ("<msubsup>" in math_html or "<munderover>" in math_html) and "<mfrac>" in math_html:
        return True
    return False


def promote_heavy_math_in_sentence(sent_html):
    """把句子里的复杂多层 MathML 自动提升为独立居中 .formula 块，避免行内压扁。"""
    def repl(m):
        tag = m.group(0)
        if not is_heavy_math(tag):
            return tag
        block_tag = tag.replace("<math>", '<math display="block">', 1) if "<math>" in tag else tag
        return f'<div class="formula">{block_tag}</div>'

    return re.sub(r"<math\b[^>]*>.*?</math>", repl, sent_html, flags=re.S)


def format_derivation_explanation(body_html):
    """把单段或多段文字推导自动整理为：编号步骤流 .mh-steps + 独立公式行 + 底部结论高亮条 .mh-verdict-bar。"""
    s = body_html.strip()
    if not s:
        return s
    # 如果本身已经包含 ul/ol/div.formula/mh-compare-grid/table，保留原结构，只把末尾独立的「答案 X」段落高亮
    if any(tok in s for tok in ("<ul", "<ol", 'class="formula"', 'class="mh-compare-grid"', "<table")):
        def highlight_ans_p(m):
            inner = m.group(1).strip()
            if "答案" in inner:
                return f'<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>{inner}</div>'
            return m.group(0)
        return re.sub(r"<p>(.*?)</p>\s*$", highlight_ans_p, s, flags=re.S)

    # 先按 <p>...</p> 提取全部段落，彻底剥离 <p>/</p>，避免残留标签破坏 <li> 排版
    para_matches = re.findall(r"<p[^>]*>(.*?)</p>", s, flags=re.S)
    if para_matches:
        leftover = re.sub(r"<p[^>]*>.*?</p>", "", s, flags=re.S).strip()
        paragraphs = [p.strip() for p in para_matches if p.strip()]
        if leftover:
            paragraphs.append(leftover)
    else:
        paragraphs = [s]

    # 用占位符保护所有 <math>...</math> 和 <a>...</a> 标签，防止按句末标点拆分破坏标签
    tokens = []
    def save_tok(m):
        idx = len(tokens)
        tokens.append(m.group(0))
        return f"@@TOK{idx}@@"

    def restore(txt):
        return re.sub(r"@@TOK(\d+)@@", lambda m: tokens[int(m.group(1))], txt)

    sents = []
    for para in paragraphs:
        para_clean = re.sub(r"</?p\b[^>]*>", "", para).strip()
        if not para_clean:
            continue
        masked = re.sub(r"<math\b[^>]*>.*?</math>|<a\b[^>]*>.*?</a>", save_tok, para_clean, flags=re.S)
        # 按中文句末标点（。！？）切分并保留原标点，避免把「！」拆断或强行补多余的「。」
        parts = re.split(r"([。！？])", masked)
        idx = 0
        while idx < len(parts):
            seg = parts[idx].strip()
            punct = parts[idx + 1] if idx + 1 < len(parts) else ""
            idx += 2
            if not seg:
                continue
            full_seg = restore(seg) + (punct if punct else "。")
            plain = strip_tags(full_seg)
            # 过滤纯空白或纯标点的无效碎片，杜绝「4 。」空步骤
            if not plain or re.fullmatch(r"[\s。！？；，、.!?：:]+", plain):
                continue
            sents.append(full_seg)

    if not sents:
        return ""

    if len(sents) == 1:
        restored = promote_heavy_math_in_sentence(sents[0])
        if "答案" in strip_tags(restored):
            return f'<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>{restored}</div>'
        return f"<p>{restored}</p>"

    # 末尾句如含「答案」或明显为总结句，则抽为底部结论高亮条
    verdict_html = ""
    last_plain = strip_tags(sents[-1])
    is_verdict = (
        "答案" in last_plain
        or (
            len(sents) >= 3
            and (
                any(k in last_plain for k in ("因此", "综上", "故为", "都是第一类", "都是第二类", "属第一类", "属第二类"))
                or bool(re.match(r"^(?:于是|所以|故|从而|由此|可得)", last_plain))
            )
        )
    )
    if is_verdict:
        verdict_sent = sents.pop()
        if len(sents) >= 2 and re.fullmatch(r"答案\s*[A-D]\s*[。！]?", strip_tags(verdict_sent)):
            prev_sent = sents.pop()
            verdict_sent = prev_sent + " " + verdict_sent
        verdict_html = f'<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>{promote_heavy_math_in_sentence(verdict_sent)}</div>'

    if not sents:
        return verdict_html

    step_items = []
    for st in sents:
        formatted_st = promote_heavy_math_in_sentence(st)
        step_items.append(f"<li>{formatted_st}</li>")

    return f'<ol class="mh-steps">{"".join(step_items)}</ol>{verdict_html}'


def enhance_steps_html(steps_html, item_id):
    if item_id in CUSTOM_STEPS_OVERRIDES:
        return CUSTOM_STEPS_OVERRIDES[item_id]
    if not steps_html:
        return steps_html

    def repl_exp(m):
        h4 = m.group(1)
        body = m.group(2)
        h4_text = strip_tags(h4)
        if any(k in h4_text for k in ("推导", "结论", "解析", "解答", "证明")):
            return f'<div class="explanation"><h4>{h4}</h4>{format_derivation_explanation(body)}</div>'
        return m.group(0)

    return re.sub(
        r'<div class="explanation"[^>]*>\s*<h4[^>]*>(.*?)</h4>(.*?)</div>',
        repl_exp,
        steps_html,
        flags=re.S,
    )


def parse_methods(topic_html):
    methods = []
    # 1) <dl class="methods"> with <dt> + <dd> (标准手稿结构)
    dl_m = re.search(r'<dl class="methods"[^>]*>(.*?)</dl>', topic_html, re.S)
    if dl_m:
        dl_body = dl_m.group(1)
        for m in re.finditer(r'<dt([^>]*)>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', dl_body, re.S):
            dt_attrs, dt_html, dd_html = m.group(1), m.group(2).strip(), m.group(3).strip()
            id_m = re.search(r'id="([^"]+)"', dt_attrs)
            mid = id_m.group(1) if id_m else f"method-{len(methods)+1}"
            methods.append({
                "id": mid,
                "titleHtml": dt_html,
                "title": strip_tags(dt_html),
                "descHtml": dd_html,
            })
        if methods:
            return methods

    # 2) <div class="method-card"> 结构
    for mc in re.finditer(r'<div class="method-card"[^>]*id="([^"]+)"[^>]*>(.*?)</div>\s*(?=<div class="method-card"|$)', topic_html, re.S):
        mid = mc.group(1)
        body = mc.group(2)
        mt = re.search(r"<h3[^>]*>(.*?)</h3>", body, re.S)
        mp = re.search(r"<p[^>]*>(.*?)</p>", body, re.S)
        t_html = mt.group(1).strip() if mt else mid
        methods.append({
            "id": mid,
            "titleHtml": t_html,
            "title": strip_tags(t_html),
            "descHtml": mp.group(1).strip() if mp else "",
        })
    return methods


def parse_lecture(meta, math1_by_yn, lilin_lookup):
    full_path = os.path.join(HANDOUT_DIR, meta["rel"])
    html = open(full_path, encoding="utf-8").read()

    m_h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    title = strip_tags(m_h1.group(1)) if m_h1 else os.path.splitext(os.path.basename(full_path))[0]

    m_chap = re.search(r'<p class="chapter"[^>]*>(.*?)</p>', html, re.S)
    chapter_path = strip_tags(m_chap.group(1)) if m_chap else meta["bookName"]

    verdict_heading, verdict_html = extract_section(html, "verdict", ["topic-index", "worked-examples", "practice"])
    verdict_html = re.sub(r'<div class="viz-slot"[^>]*>.*?</div>', "", verdict_html, flags=re.S)

    topic_heading, topic_html = extract_section(html, "topic-index", ["worked-examples", "practice"])
    # 提取 topic-index 开头说明段落
    topic_intro_m = re.match(r'\s*(<p[^>]*>.*?</p>)', topic_html, re.S)
    topic_intro_html = topic_intro_m.group(1).strip() if topic_intro_m else ""
    methods = parse_methods(topic_html)

    worked_heading, worked_html = extract_section(html, "worked-examples", ["practice", "coverage"])
    worked_html = re.sub(r'<div class="viz-slot"[^>]*>.*?</div>', "", worked_html, flags=re.S)

    practice_heading, practice_html = extract_section(html, "practice", ["coverage"])
    practice_intro_m = re.match(r'\s*(<p[^>]*>.*?</p>)', practice_html, re.S)
    practice_intro_html = practice_intro_m.group(1).strip() if practice_intro_m else ""

    groups = []
    ex_counter = 0
    for gm in re.finditer(r'<details class="practice-group"[^>]*id="([^"]+)"[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>', practice_html, re.S):
        gid = gm.group(1)
        gtitle = strip_tags(gm.group(2))
        gbody = gm.group(3)
        examples = []
        for am in re.finditer(r'<article([^>]*)>(.*?)</article>', gbody, re.S):
            a_attrs, ab = am.group(1), am.group(2)
            if 'class="example"' not in a_attrs:
                continue
            ex_counter += 1
            aid_m = re.search(r'id="([^"]+)"', a_attrs)
            anchor_id = aid_m.group(1) if aid_m else f"ex-{meta['slug']}-{ex_counter}"

            t_m = re.search(r"<h3[^>]*>(.*?)</h3>", ab, re.S)
            s_m = re.search(r'<p class="source"[^>]*>(.*?)</p>', ab, re.S)
            q_m = re.search(r'<div class="question"[^>]*>(.*?)</div>\s*<div class="solution"', ab, re.S)
            sol_m = re.search(r'<div class="solution"[^>]*>(.*)</div>\s*$', ab, re.S)

            ex_title = strip_tags(t_m.group(1)) if t_m else f"例题 {ex_counter}"
            ex_source = strip_tags(s_m.group(1)) if s_m else ""
            q_html = q_m.group(1).strip() if q_m else ""
            sol_html = sol_m.group(1).strip() if sol_m else ""

            hint_html, steps_html = split_solution(sol_html)

            source_type, year, qnum, matched_math1_id, matched_lilin_id = classify_source(
                ex_source, meta["book"], math1_by_yn, lilin_lookup
            )
            # 优先使用题库真实 itemId，确保与题目复习/复习性价比/知识图谱精确同步
            if matched_math1_id:
                item_id = matched_math1_id
            elif matched_lilin_id:
                item_id = matched_lilin_id
            else:
                item_id = f"mh-{meta['slug']}-{ex_counter}"

            ans_m = re.search(r'答案\s*<strong>\s*([A-D])\s*</strong>', ab)
            answer_letter = ans_m.group(1) if ans_m else None

            examples.append({
                "id": item_id,
                "anchorId": anchor_id,
                "matchedMath1": bool(matched_math1_id),
                "lilin880Id": matched_lilin_id,
                "year": year,
                "n": qnum,
                "sourceType": source_type,
                "source": ex_source,
                "title": ex_title,
                "answerLetter": answer_letter,
                "questionHtml": q_html,
                "hintHtml": hint_html,
                "stepsHtml": enhance_steps_html(steps_html, item_id),
            })

        groups.append({
            "id": gid,
            "title": gtitle,
            "examples": examples,
        })

    if not methods:
        methods = [{"id": f"pattern-{g['id']}", "titleHtml": g["title"], "title": g["title"], "descHtml": ""} for g in groups]

    exam_count = sum(1 for g in groups for e in g["examples"] if e["sourceType"] in ("exam", "lilin_mock"))
    lilin880_count = sum(1 for g in groups for e in g["examples"] if e["sourceType"] == "lilin880" or e["lilin880Id"])

    return {
        "slug": meta["slug"],
        "order": meta["order"],
        "book": meta["book"],
        "bookName": meta["bookName"],
        "chapterPath": chapter_path,
        "moduleId": meta["moduleId"],
        "primaryKpId": meta["primaryKpId"],
        "secondaryKpIds": meta["secondaryKpIds"],
        "title": title,
        "verdictHeading": verdict_heading or "怎么判",
        "verdictHtml": verdict_html,
        "topicHeading": topic_heading or "看式子找第一步",
        "topicIntroHtml": topic_intro_html,
        "methods": methods,
        "workedHeading": worked_heading,
        "workedHtml": worked_html,
        "practiceHeading": practice_heading or "按方法练习",
        "practiceIntroHtml": practice_intro_html,
        "groups": groups,
        "stats": {
            "total": ex_counter,
            "exam": exam_count,
            "lilin880": lilin880_count,
        },
    }


def main():
    math1_by_yn = load_math1_lookup()
    lilin_lookup = load_lilin880_lookup()
    handouts = [parse_lecture(m, math1_by_yn, lilin_lookup) for m in LECTURE_MAP]
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"version": 2, "handouts": handouts}, f, ensure_ascii=False)
    print(f"Exported {len(handouts)} handouts (v2) to {OUT_PATH}")
    for h in handouts:
        m_cnt = sum(1 for g in h["groups"] for e in g["examples"] if e["matchedMath1"])
        ll_cnt = sum(1 for g in h["groups"] for e in g["examples"] if e["lilin880Id"])
        print(
            f"  [{h['bookName']}] {h['title']}: total={h['stats']['total']} "
            f"(exam={h['stats']['exam']}, 880_html={h['stats']['lilin880']}, "
            f"math1_linked={m_cnt}, ll880_linked={ll_cnt}, methods={len(h['methods'])})"
        )


if __name__ == "__main__":
    main()
