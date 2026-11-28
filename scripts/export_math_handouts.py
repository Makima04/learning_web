#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 materials/math/handouts 下全部 46 份网页版数学手稿
完整解析并导出为 frontend/public/math/handouts.json，供「小祥学习」左侧「数学手稿」使用。
- 完整保留原手稿的怎么判表格、看式子找第一步（含公式与跳转）、例题串讲、按方法练习、举一反三与 MathML。
- 自动将历年数一真题关联到 math1Questions.json 的 itemId，将李林 880 例题关联到 lilin880.json 的 id，
  实现与「题目复习」「复习性价比」「知识图谱」的三向精确同步。
"""
import json
import os
import re
import shutil
import subprocess
from html import escape as html_escape, unescape
from html.parser import HTMLParser
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
RENDER_NATIVE_SCRIPT = PROJECT_DIR / "scripts/render_native_solutions.mjs"
NATIVE_SOLUTIONS_HTML = {}
HANDOUT_DIR = PROJECT_DIR / "materials/math/handouts"
MATH1_Q_PATH = os.path.join(PROJECT_DIR, "frontend/src/data/kg/math1Questions.json")
LILIN_Q_PATH = os.path.join(PROJECT_DIR, "frontend/public/math/lilin880.json")
OUT_DIR = os.path.join(PROJECT_DIR, "frontend/public/math/handouts")
INDEX_OUT_PATH = os.path.join(OUT_DIR, "index.json")
LEGACY_MONOLITH_PATH = os.path.join(PROJECT_DIR, "frontend/public/math/handouts.json")

LECTURE_MAP = [
    # ================= 高等数学（9 章 · 27 份） =================
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
        "rel": "函数、极限与连续/03 数列极限的存在性与递推.html",
        "slug": "calc-limit-seq",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-limit",
        "primaryKpId": "calc.limit.seq",
        "secondaryKpIds": ["calc.limit.def", "calc.i1.def"],
        "order": 3,
    },
    {
        "rel": "函数、极限与连续/04 无穷远处的极限与渐近线.html",
        "slug": "calc-limit-asymp",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-limit",
        "primaryKpId": "calc.limit.asymp",
        "secondaryKpIds": ["calc.limit.inf", "calc.limit.tech"],
        "order": 4,
    },
    {
        "rel": "函数、极限与连续/05 函数性质与闭区间连续性质.html",
        "slug": "calc-limit-fn",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-limit",
        "primaryKpId": "calc.limit.fn",
        "secondaryKpIds": ["calc.limit.cont", "calc.limit.def"],
        "order": 5,
    },
    {
        "rel": "一元函数微分学/01 导数定义与求导法则.html",
        "slug": "calc-d1-rules",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-diff1",
        "primaryKpId": "calc.d1.rules",
        "secondaryKpIds": ["calc.d1.def"],
        "order": 6,
    },
    {
        "rel": "一元函数微分学/02 中值定理、微分等式与不等式.html",
        "slug": "calc-d1-mvt",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-diff1",
        "primaryKpId": "calc.d1.mvt",
        "secondaryKpIds": ["calc.d1.def"],
        "order": 7,
    },
    {
        "rel": "一元函数微分学/03 泰勒公式与高阶导数应用.html",
        "slug": "calc-d1-taylor",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-diff1",
        "primaryKpId": "calc.d1.lhopital",
        "secondaryKpIds": ["calc.d1.rules", "calc.d1.mvt"],
        "order": 8,
    },
    {
        "rel": "一元函数微分学/04 单调性、极值、拐点与几何物理应用.html",
        "slug": "calc-d1-sketch",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-diff1",
        "primaryKpId": "calc.d1.sketch",
        "secondaryKpIds": ["calc.d1.phys", "calc.limit.asymp"],
        "order": 9,
    },
    {
        "rel": "一元函数积分学/01 变限积分与积分上限函数.html",
        "slug": "calc-int1-varlimit",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-int1",
        "primaryKpId": "calc.i1.def",
        "secondaryKpIds": ["calc.i1.tech", "calc.d1.rules"],
        "order": 10,
    },
    {
        "rel": "一元函数积分学/02 不定积分与定积分计算技巧.html",
        "slug": "calc-int1-tech",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-int1",
        "primaryKpId": "calc.i1.tech",
        "secondaryKpIds": ["calc.i1.def"],
        "order": 11,
    },
    {
        "rel": "一元函数积分学/03 反常积分与敛散性判别.html",
        "slug": "calc-int1-improper",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-int1",
        "primaryKpId": "calc.i1.improper",
        "secondaryKpIds": ["calc.i1.tech"],
        "order": 12,
    },
    {
        "rel": "一元函数积分学/04 定积分的几何物理应用与积分不等式.html",
        "slug": "calc-int1-app",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-int1",
        "primaryKpId": "calc.i1.app",
        "secondaryKpIds": ["calc.i1.ineq", "calc.i1.phys"],
        "order": 13,
    },
    {
        "rel": "空间解析几何/01 向量代数、平面直线与二次曲面.html",
        "slug": "calc-geom-all",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-geom",
        "primaryKpId": "calc.geom.plane",
        "secondaryKpIds": ["calc.geom.vec", "calc.geom.quad"],
        "order": 14,
    },
    {
        "rel": "多元函数微分学/02 偏导数与可微性的关系.html",
        "slug": "calc-multi-diff",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi",
        "primaryKpId": "calc.m.partial",
        "secondaryKpIds": ["calc.m.impl"],
        "order": 15,
    },
    {
        "rel": "多元函数微分学/03 隐函数求导与几何应用.html",
        "slug": "calc-multi-impl",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi",
        "primaryKpId": "calc.m.impl",
        "secondaryKpIds": ["calc.m.partial"],
        "order": 16,
    },
    {
        "rel": "多元函数微分学/04 方向导数与梯度.html",
        "slug": "calc-multi-dir",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi",
        "primaryKpId": "calc.m.dir",
        "secondaryKpIds": ["calc.m.partial"],
        "order": 17,
    },
    {
        "rel": "多元函数微分学/10 条件极值与区域上的最值.html",
        "slug": "calc-multi-ext",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi",
        "primaryKpId": "calc.m.ext",
        "secondaryKpIds": ["calc.m.partial"],
        "order": 18,
    },
    {
        "rel": "重积分/01 二重积分计算与换序对称.html",
        "slug": "calc-multi-dbl",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi-int",
        "primaryKpId": "calc.m.dbl",
        "secondaryKpIds": ["calc.m.app"],
        "order": 19,
    },
    {
        "rel": "重积分/02 三重积分与重积分应用.html",
        "slug": "calc-multi-tpl",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-multi-int",
        "primaryKpId": "calc.m.tpl",
        "secondaryKpIds": ["calc.m.app", "calc.m.dbl"],
        "order": 20,
    },
    {
        "rel": "微分方程/01 一阶微分方程与可降阶方程.html",
        "slug": "calc-ode-1st",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-ode",
        "primaryKpId": "calc.ode.1st",
        "secondaryKpIds": ["calc.ode.app"],
        "order": 21,
    },
    {
        "rel": "微分方程/02 二阶常系数线性方程、欧拉方程与应用.html",
        "slug": "calc-ode-2nd",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-ode",
        "primaryKpId": "calc.ode.2nd",
        "secondaryKpIds": ["calc.ode.euler", "calc.ode.app"],
        "order": 22,
    },
    {
        "rel": "无穷级数/01 数项级数敛散性判别.html",
        "slug": "calc-series-num",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-series",
        "primaryKpId": "calc.series.num",
        "secondaryKpIds": ["calc.limit.seq"],
        "order": 23,
    },
    {
        "rel": "无穷级数/02 幂级数收敛域、展开求和与傅里叶级数.html",
        "slug": "calc-series-power",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-series",
        "primaryKpId": "calc.series.power",
        "secondaryKpIds": ["calc.series.fourier", "calc.series.num"],
        "order": 24,
    },
    {
        "rel": "多元函数积分学/01 第一类曲线曲面积分与散度旋度.html",
        "slug": "calc-line-surf-1st",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-line-surf",
        "primaryKpId": "calc.m.formula",
        "secondaryKpIds": ["calc.m.line", "calc.m.surf"],
        "order": 25,
    },
    {
        "rel": "多元函数积分学/03 曲线积分与格林、斯托克斯公式.html",
        "slug": "calc-line-stokes",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-line-surf",
        "primaryKpId": "calc.m.line2",
        "secondaryKpIds": ["calc.m.line", "calc.m.formula"],
        "order": 26,
    },
    {
        "rel": "多元函数积分学/04 曲面积分与高斯公式.html",
        "slug": "calc-surf-gauss",
        "book": "calc",
        "bookName": "高等数学",
        "moduleId": "calc-line-surf",
        "primaryKpId": "calc.m.surf2",
        "secondaryKpIds": ["calc.m.surf", "calc.m.formula"],
        "order": 27,
    },
    # ================= 线性代数（6 章 · 10 份） =================
    {
        "rel": "行列式/01 行列式计算与代数余子式.html",
        "slug": "la-det-compute",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-det",
        "primaryKpId": "la.det.compute",
        "secondaryKpIds": ["la.det.def", "la.det.cofactor"],
        "order": 28,
    },
    {
        "rel": "矩阵/01 矩阵运算、逆矩阵、伴随与分块.html",
        "slug": "la-mat-inv",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-matrix",
        "primaryKpId": "la.mat.inv",
        "secondaryKpIds": ["la.mat.ops"],
        "order": 29,
    },
    {
        "rel": "矩阵/02 矩阵的秩与初等变换.html",
        "slug": "la-mat-rank",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-matrix",
        "primaryKpId": "la.mat.rank",
        "secondaryKpIds": ["la.mat.ops"],
        "order": 30,
    },
    {
        "rel": "向量组与线性方程组/01 向量组的线性相关与线性表示.html",
        "slug": "la-vec-indep",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-vec",
        "primaryKpId": "la.eq.vector",
        "secondaryKpIds": ["la.eq.structure", "la.eq.solvability", "la.sp.basis"],
        "order": 31,
    },
    {
        "rel": "向量组与线性方程组/02 向量空间、基过渡矩阵与正交化.html",
        "slug": "la-sp-basis",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-vec",
        "primaryKpId": "la.sp.basis",
        "secondaryKpIds": ["la.sp.ortho"],
        "order": 32,
    },
    {
        "rel": "线性方程组/01 线性方程组有解判别、解结构与公共解.html",
        "slug": "la-eq-all",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-eq",
        "primaryKpId": "la.eq.solvability",
        "secondaryKpIds": ["la.eq.structure", "la.eq.common"],
        "order": 33,
    },
    {
        "rel": "特征值、特征向量与相似/01 相似矩阵、矩阵幂与秩.html",
        "slug": "la-eig-similar",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-eigen",
        "primaryKpId": "la.eig.similar",
        "secondaryKpIds": ["la.eig.diag", "la.eig.value"],
        "order": 34,
    },
    {
        "rel": "特征值、特征向量与相似/02 特征值特征向量与相似对角化.html",
        "slug": "la-eig-value",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-eigen",
        "primaryKpId": "la.eig.value",
        "secondaryKpIds": ["la.eig.diag"],
        "order": 35,
    },
    {
        "rel": "二次型/01 二次型的正定性.html",
        "slug": "la-quad-pd",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-quad",
        "primaryKpId": "la.eig.pd",
        "secondaryKpIds": ["la.eig.quad"],
        "order": 36,
    },
    {
        "rel": "二次型/02 二次型化标准形与合同判别.html",
        "slug": "la-quad-std",
        "book": "linear",
        "bookName": "线性代数",
        "moduleId": "la-quad",
        "primaryKpId": "la.eig.quad",
        "secondaryKpIds": ["la.eig.pd"],
        "order": 37,
    },
    # ================= 概率论与数理统计（8 章 · 9 份） =================
    {
        "rel": "随机事件及其概率/01 古典概型、条件概率全概贝叶斯与独立性.html",
        "slug": "prob-base-all",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-base",
        "primaryKpId": "prob.base.cond",
        "secondaryKpIds": ["prob.base.axioms", "prob.base.indep"],
        "order": 38,
    },
    {
        "rel": "随机变量及其分布/01 分布函数、常见分布与随机变量函数分布.html",
        "slug": "prob-rv-all",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-rv",
        "primaryKpId": "prob.rv.dist",
        "secondaryKpIds": ["prob.rv.func"],
        "order": 39,
    },
    {
        "rel": "多维随机变量及其分布/01 条件分布、联合分布与边缘分布.html",
        "slug": "prob-mv-cond",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-multi",
        "primaryKpId": "prob.mv.joint",
        "secondaryKpIds": ["prob.mv.indep", "prob.mv.func"],
        "order": 40,
    },
    {
        "rel": "多维随机变量及其分布/02 随机变量独立性与多维函数分布.html",
        "slug": "prob-mv-func",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-multi",
        "primaryKpId": "prob.mv.func",
        "secondaryKpIds": ["prob.mv.indep"],
        "order": 41,
    },
    {
        "rel": "随机变量的数字特征/01 数学期望与绝对值.html",
        "slug": "prob-num-ex",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-num",
        "primaryKpId": "prob.num.ex",
        "secondaryKpIds": ["prob.rv.dist"],
        "order": 42,
    },
    {
        "rel": "大数定律与中心极限定理/02 中心极限定理与标准化.html",
        "slug": "prob-limit-clt",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-limit",
        "primaryKpId": "prob.limit.clt",
        "secondaryKpIds": ["prob.limit.lln", "prob.num.ineq"],
        "order": 43,
    },
    {
        "rel": "数理统计的基本概念/02 t 分布、F 分布与尾概率.html",
        "slug": "prob-stat-tf",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-stat",
        "primaryKpId": "prob.stat.sample",
        "secondaryKpIds": ["prob.stat.est"],
        "order": 44,
    },
    {
        "rel": "参数估计/01 矩估计、最大似然估计、无偏性与区间估计.html",
        "slug": "prob-est-all",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-est",
        "primaryKpId": "prob.stat.est",
        "secondaryKpIds": ["prob.stat.sample"],
        "order": 45,
    },
    {
        "rel": "假设检验/01 单个正态总体的假设检验与两类错误.html",
        "slug": "prob-hyp-all",
        "book": "prob",
        "bookName": "概率论与数理统计",
        "moduleId": "prob-hyp",
        "primaryKpId": "prob.stat.hyp",
        "secondaryKpIds": ["prob.stat.sample"],
        "order": 46,
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


# ---------------------------------------------------------------------------
# MathML 括号/绝对值防拉伸规范化 + 题干内联小问自动分行
# ---------------------------------------------------------------------------
_MML_TALL_TAGS = {"mfrac", "munder", "munderover", "msubsup", "msqrt", "mroot", "mtable", "mover"}
_MML_OPEN_TO_CLOSE = {"(": ")", "[": "]", "{": "}", "⟨": "⟩", "⌊": "⌋", "⌈": "⌉"}
_MML_CLOSE_SET = set(_MML_OPEN_TO_CLOSE.values())
_MML_SYM_FENCES = {"|", "‖"}
_MML_ALL_DELIMS = set(_MML_OPEN_TO_CLOSE.keys()) | _MML_CLOSE_SET | _MML_SYM_FENCES
_MML_VOID_TAGS = {"mspace", "mprescripts", "none", "mglyph"}


class _MmlNode:
    __slots__ = ("tag", "attrs", "children", "text", "void")

    def __init__(self, tag=None, attrs=None, text=None, void=False):
        self.tag = tag
        self.attrs = dict(attrs) if attrs else {}
        self.children = []
        self.text = text
        self.void = void


class _MmlParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = _MmlNode("__root__")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        is_void = tag in _MML_VOID_TAGS
        n = _MmlNode(tag=tag, attrs=attrs, void=is_void)
        self.stack[-1].children.append(n)
        if not is_void:
            self.stack.append(n)

    def handle_startendtag(self, tag, attrs):
        n = _MmlNode(tag=tag, attrs=attrs, void=True)
        self.stack[-1].children.append(n)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(_MmlNode(text=data))

    def handle_entityref(self, name):
        self.stack[-1].children.append(_MmlNode(text=f"&{name};"))

    def handle_charref(self, name):
        self.stack[-1].children.append(_MmlNode(text=f"&#{name};"))


def _mml_text(n):
    if n.tag is None:
        return n.text or ""
    return "".join(_mml_text(c) for c in n.children)


def _mml_has_tall(n):
    if n.tag in _MML_TALL_TAGS:
        return True
    return any(_mml_has_tall(c) for c in n.children if c.tag is not None)


def _mml_render(n):
    if n.tag is None:
        return n.text or ""
    if n.tag == "__root__":
        return "".join(_mml_render(c) for c in n.children)
    attr_str = "".join(f' {k}="{html_escape(str(v), quote=True)}"' for k, v in n.attrs.items())
    if n.void and not n.children:
        return f"<{n.tag}{attr_str}/>"
    inner = "".join(_mml_render(c) for c in n.children)
    return f"<{n.tag}{attr_str}>{inner}</{n.tag}>"


def _mml_fix_container(container):
    for c in container.children:
        if c.tag is not None:
            _mml_fix_container(c)
    if container.tag not in ("math", "mrow"):
        return

    def _mo_delim(n):
        if n.tag == "mo":
            t = _mml_text(n).strip()
            if t in _MML_ALL_DELIMS:
                return t
        return None

    if not any(_mo_delim(c) is not None for c in container.children):
        return
    # 保留矩阵/分段函数 mtable 旁的大括号与定界符拉伸
    if any(c.tag == "mtable" for c in container.children):
        return

    def _group_symmetric(nodes):
        for sym in ("|", "‖"):
            positions = [i for i, n in enumerate(nodes) if _mo_delim(n) == sym]
            if len(positions) >= 2 and len(positions) % 2 == 0:
                new_nodes = []
                idx = 0
                for p_idx in range(0, len(positions), 2):
                    s_pos = positions[p_idx]
                    e_pos = positions[p_idx + 1]
                    new_nodes.extend(nodes[idx:s_pos])
                    open_n = nodes[s_pos]
                    inner = nodes[s_pos + 1:e_pos]
                    close_n = nodes[e_pos]
                    if not any(_mml_has_tall(x) for x in inner if x.tag is not None):
                        open_n.attrs["stretchy"] = "false"
                        close_n.attrs["stretchy"] = "false"
                    open_n.attrs["form"] = "prefix"
                    open_n.attrs["lspace"] = "0.12em"
                    open_n.attrs["rspace"] = "0.02em"
                    close_n.attrs["form"] = "postfix"
                    close_n.attrs["lspace"] = "0.02em"
                    close_n.attrs["rspace"] = "0.12em"
                    mrow = _MmlNode("mrow")
                    mrow.children = [open_n] + inner + [close_n]
                    new_nodes.append(mrow)
                    idx = e_pos + 1
                new_nodes.extend(nodes[idx:])
                nodes = new_nodes
            elif positions:
                for p in positions:
                    nodes[p].attrs["stretchy"] = "false"
        return nodes

    def _group_brackets(nodes):
        out = []
        stack = []
        for n in nodes:
            d = _mo_delim(n)
            if d in _MML_OPEN_TO_CLOSE:
                stack.append((d, n, []))
            elif d in _MML_CLOSE_SET and stack and _MML_OPEN_TO_CLOSE[stack[-1][0]] == d:
                _open_d, open_n, inner = stack.pop()
                inner = _group_symmetric(inner)
                if not any(_mml_has_tall(x) for x in inner if x.tag is not None):
                    open_n.attrs["stretchy"] = "false"
                    n.attrs["stretchy"] = "false"
                mrow = _MmlNode("mrow")
                mrow.children = [open_n] + inner + [n]
                if stack:
                    stack[-1][2].append(mrow)
                else:
                    out.append(mrow)
            else:
                if stack:
                    stack[-1][2].append(n)
                else:
                    out.append(n)
        for _open_d, open_n, inner in stack:
            open_n.attrs["stretchy"] = "false"
            out.append(open_n)
            out.extend(inner)
        for x in out:
            d = _mo_delim(x)
            if d in _MML_CLOSE_SET or d in _MML_OPEN_TO_CLOSE:
                x.attrs["stretchy"] = "false"
        return _group_symmetric(out)

    container.children = _group_brackets(container.children)


def fix_mathml_in_html(html_str):
    """修复行内/块级原生 MathML 中平铺括号与绝对值被兄弟分式/max/积分过度拉伸的问题。"""
    if not html_str or "<math" not in html_str:
        return html_str

    def _repl(m):
        raw = m.group(0)
        try:
            parser = _MmlParser()
            parser.feed(raw)
            parser.close()
            for c in parser.root.children:
                if c.tag is not None:
                    _mml_fix_container(c)
            return _mml_render(parser.root)
        except Exception:
            return raw

    return re.sub(r"<math\b[^>]*>.*?</math>", _repl, html_str, flags=re.S)


_SUBQ_ROMAN_SEQ = (
    r"[（(]\s*(?:Ⅰ|I)\s*[）)]",
    r"[（(]\s*(?:Ⅱ|II)\s*[）)]",
    r"[（(]\s*(?:Ⅲ|III)\s*[）)]",
    r"[（(]\s*(?:Ⅳ|IV)\s*[）)]",
)
_SUBQ_NUM_SEQ = (
    r"[（(]\s*1\s*[）)]",
    r"[（(]\s*2\s*[）)]",
    r"[（(]\s*3\s*[）)]",
    r"[（(]\s*4\s*[）)]",
)
_SUBQ_ROMAN_LABELS = ("（Ⅰ）", "（Ⅱ）", "（Ⅲ）", "（Ⅳ）")
_SUBQ_NUM_LABELS = ("（1）", "（2）", "（3）", "（4）")


def format_question_html(q_html):
    """规范化题干 HTML：修复 MathML 括号拉伸，并将挤在同一段内的多小问（Ⅰ）（Ⅱ）等自动拆为清晰独立行。"""
    if not q_html:
        return q_html
    q_html = fix_mathml_in_html(q_html)

    def _split_p(m):
        p_attrs = m.group(1)
        p_inner = m.group(2)
        tokens = []

        def _save(tm):
            tokens.append(tm.group(0))
            return f"@@M{len(tokens) - 1}@@"

        masked = re.sub(r"<math\b[^>]*>.*?</math>|<[^>]+>", _save, p_inner, flags=re.S)

        def _restore(s):
            return re.sub(r"@@M(\d+)@@", lambda tm: tokens[int(tm.group(1))], s)

        for seq, labels in ((_SUBQ_ROMAN_SEQ, _SUBQ_ROMAN_LABELS), (_SUBQ_NUM_SEQ, _SUBQ_NUM_LABELS)):
            hits = []
            search_from = 0
            for idx, pat in enumerate(seq):
                full_pat = re.compile(rf"(?:^|(?<=[：:。；;，,\s]))({pat})(?![中的式问知得处])")
                hm = full_pat.search(masked, search_from)
                if not hm:
                    break
                hits.append((hm.start(1), hm.end(1), labels[idx]))
                search_from = hm.end(1)
            if len(hits) >= 2:
                lead = _restore(masked[:hits[0][0]].strip())
                li_parts = []
                for i, (_st, en, lbl) in enumerate(hits):
                    nxt = hits[i + 1][0] if i + 1 < len(hits) else len(masked)
                    body = _restore(masked[en:nxt].strip())
                    li_parts.append(
                        f'<li class="mh-subq-item">'
                        f'<span class="mh-subq-label">{lbl}</span>'
                        f'<span class="mh-subq-body">{body}</span>'
                        f"</li>"
                    )
                lead_html = f"<p{p_attrs}>{lead}</p>" if lead else ""
                return f'{lead_html}<ol class="mh-subq-list">{"".join(li_parts)}</ol>'
        return m.group(0)

    return re.sub(r"<p([^>]*)>(.*?)</p>", _split_p, q_html, flags=re.S)


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
    # 先完整抽离 <details class="mh-orig-ans"...>...</details>，避免内部 <p><img ...></p> 被按纯文本过滤掉
    orig_ans_blocks = []
    def _save_orig_ans(m):
        blk = m.group(0).strip()
        img_m = re.search(r'<img[^>]+src="([^"]+)"', blk)
        if img_m:
            disk = os.path.join(PROJECT_DIR, "frontend/public", img_m.group(1).lstrip("/"))
            if not os.path.exists(disk):
                return ""
        orig_ans_blocks.append(blk)
        return ""
    s = re.sub(r'<details\s+class="mh-orig-ans"[^>]*>.*?</details>', _save_orig_ans, s, flags=re.S).strip()
    # 同样抽离独立的 <p><img class="mh-ans-img" ...></p>（真题解析图），避免被拆进 <ol class="mh-steps"><li>
    def _save_bare_ans_img(m):
        blk = m.group(0).strip()
        img_m = re.search(r'src="([^"]+)"', blk)
        if img_m:
            disk = os.path.join(PROJECT_DIR, "frontend/public", img_m.group(1).lstrip("/"))
            if not os.path.exists(disk):
                return ""
        orig_ans_blocks.append(blk)
        return ""
    s = re.sub(r'<p>\s*<img\b[^>]*class="mh-ans-img"[^>]*>\s*</p>', _save_bare_ans_img, s, flags=re.S).strip()
    orig_tail = ("\n" + "\n".join(orig_ans_blocks)) if orig_ans_blocks else ""
    if not s:
        return "\n".join(orig_ans_blocks)
    # 如果本身已经包含 ul/ol/div.formula/mh-compare-grid/table/mh-verdict-bar，保留原结构，只把末尾独立的「答案 X」段落高亮
    if any(tok in s for tok in ("<ul", "<ol", 'class="formula"', 'class="mh-compare-grid"', 'class="mh-verdict-bar"', "<table")):
        def highlight_ans_p(m):
            inner = m.group(1).strip()
            if "答案" in inner:
                return f'<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>{inner}</div>'
            return m.group(0)
        return re.sub(r"<p>(.*?)</p>\s*$", highlight_ans_p, s, flags=re.S) + orig_tail

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
            if "<img" in seg and not punct:
                full_seg = restore(seg)
            else:
                full_seg = restore(seg) + (punct if punct else "。")
            plain = strip_tags(full_seg)
            # 过滤纯空白或纯标点的无效碎片，杜绝「4 。」空步骤
            if "<img" not in full_seg and (not plain or re.fullmatch(r"[\s。！？；，、.!?：:]+", plain)):
                continue
            sents.append(full_seg)

    if not sents:
        return orig_tail.strip()

    if len(sents) == 1:
        restored = promote_heavy_math_in_sentence(sents[0])
        if "答案" in strip_tags(restored):
            return f'<div class="mh-verdict-bar"><span class="mh-verdict-tag">结论</span>{restored}</div>' + orig_tail
        return f"<p>{restored}</p>" + orig_tail

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
        return verdict_html + orig_tail

    step_items = []
    for st in sents:
        formatted_st = promote_heavy_math_in_sentence(st)
        step_items.append(f"<li>{formatted_st}</li>")

    return f'<ol class="mh-steps">{"".join(step_items)}</ol>{verdict_html}{orig_tail}'


def strip_missing_orig_ans(html):
    """移除指向不存在磁盘图片的 <details class="mh-orig-ans">，避免前端点击解析图出现空图/破图。"""
    def _filter(m):
        blk = m.group(0)
        img_m = re.search(r'<img[^>]+src="([^"]+)"', blk)
        if img_m:
            disk = os.path.join(PROJECT_DIR, "frontend/public", img_m.group(1).lstrip("/"))
            if not os.path.exists(disk):
                return ""
        return blk
    return re.sub(r'\s*<details\s+class="mh-orig-ans"[^>]*>.*?</details>', _filter, html, flags=re.S)


def load_native_solutions_html():
    """调用 scripts/render_native_solutions.mjs 批量编译原生解析 HTML。"""
    if not RENDER_NATIVE_SCRIPT.exists():
        return {}
    node_bin = shutil.which("node")
    if not node_bin:
        for cand in ("/usr/local/bin/node", "/opt/homebrew/bin/node"):
            if os.path.exists(cand):
                node_bin = cand
                break
    if not node_bin:
        print("[warn] node not found; skipping native solutions compilation")
        return {}
    res = subprocess.run(
        [node_bin, str(RENDER_NATIVE_SCRIPT), "--emit-json"],
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        print(f"[warn] render_native_solutions failed: {res.stderr.strip()}")
        return {}
    if res.stderr.strip():
        print(res.stderr.strip())
    return json.loads(res.stdout or "{}")


def _build_native_detail_block(img_src, img_tag_html, native_html):
    is_exam = "/exams/" in img_src
    src_label = "真题参考解析" if is_exam else "李林 880 原书解析"
    toggle_label = "查看真题解析图" if is_exam else "查看原书扫描图"
    if 'loading=' not in img_tag_html:
        img_tag_html = img_tag_html.replace("<img ", '<img loading="lazy" ', 1)
    return (
        '<div class="mh-detail-proc">'
        f'<div class="mh-detail-head"><span class="mh-detail-title">具体过程</span><span class="mh-detail-src">{src_label}</span></div>'
        f'<div class="mh-detail-body">{native_html}</div>'
        f'<details class="mh-orig-ans is-secondary"><summary>{toggle_label}</summary><p>{img_tag_html}</p></details>'
        '</div>'
    )


def upgrade_answer_images_to_native(steps_html):
    """将已具备原生解析的 880 / 真题解析图升级为默认展开的「具体过程」+ 次级折叠原图入口。"""
    if not steps_html or not NATIVE_SOLUTIONS_HTML:
        return steps_html

    def _repl_details(m):
        blk = m.group(0)
        img_m = re.search(r'<img\b[^>]*class="mh-ans-img"[^>]*>|<img\b[^>]*src="[^"]+"[^>]*class="mh-ans-img"[^>]*>', blk)
        if not img_m:
            return blk
        img_tag = img_m.group(0)
        src_m = re.search(r'src="([^"]+)"', img_tag)
        if not src_m:
            return blk
        src = src_m.group(1)
        native_html = NATIVE_SOLUTIONS_HTML.get(src)
        if not native_html:
            return blk
        return _build_native_detail_block(src, img_tag, native_html)

    out = re.sub(r'<details\s+class="mh-orig-ans"[^>]*>.*?</details>', _repl_details, steps_html, flags=re.S)

    def _repl_bare_img(m):
        img_tag = m.group(1)
        src_m = re.search(r'src="([^"]+)"', img_tag)
        if not src_m:
            return m.group(0)
        src = src_m.group(1)
        native_html = NATIVE_SOLUTIONS_HTML.get(src)
        if not native_html:
            return m.group(0)
        return _build_native_detail_block(src, img_tag, native_html)

    # 匹配未包裹在 <details class="mh-orig-ans"> 中的独立真题解析图 <p><img class="mh-ans-img" ...></p>
    out = re.sub(
        r'(?<!<summary>查看真题解析图</summary>)(?<!<summary>查看原书扫描图</summary>)<p>\s*(<img\b[^>]*class="mh-ans-img"[^>]*>)\s*。?\s*</p>',
        _repl_bare_img,
        out,
        flags=re.S,
    )
    return out


def enhance_steps_html(steps_html, item_id):
    if item_id in CUSTOM_STEPS_OVERRIDES:
        return CUSTOM_STEPS_OVERRIDES[item_id]
    if not steps_html:
        return steps_html
    steps_html = strip_missing_orig_ans(steps_html)
    if 'class="mh-steps"' in steps_html:
        return upgrade_answer_images_to_native(steps_html)

    def repl_exp(m):
        h4 = m.group(1)
        body = m.group(2)
        h4_text = strip_tags(h4)
        if any(k in h4_text for k in ("推导", "结论", "解析", "解答", "证明")):
            return f'<div class="explanation"><h4>{h4}</h4>{format_derivation_explanation(body)}</div>'
        return m.group(0)

    res = re.sub(
        r'<div class="explanation"[^>]*>\s*<h4[^>]*>(.*?)</h4>(.*?)</div>',
        repl_exp,
        steps_html,
        flags=re.S,
    )
    return upgrade_answer_images_to_native(res)


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


def clean_short_title(title):
    s = re.sub(r"^[一二三四五六七八九十\d]+[、.．]\s*", "", title.strip())
    s = re.sub(r"[（(]\s*\d+\s*题\s*[）)]\s*$", "", s).strip()
    return s or title.strip()


def extract_div_by_class(html, cls):
    """按 <div> 嵌套深度提取指定 class 的完整 <div>...</div>，避免内部嵌套 div 截断。"""
    open_re = re.compile(rf'<div\b([^>]*\bclass="[^"]*\b{re.escape(cls)}\b[^"]*"[^>]*)>', re.S)
    m = open_re.search(html)
    if not m:
        return None
    attrs = m.group(1)
    body_start = m.end()
    tag_re = re.compile(r'<div\b|</div>', re.S)
    depth = 1
    for tm in tag_re.finditer(html, body_start):
        if tm.group(0).startswith("</"):
            depth -= 1
            if depth == 0:
                return attrs, html[body_start:tm.start()]
        else:
            depth += 1
    return attrs, html[body_start:]


def parse_scenario_guide(gbody):
    extracted = extract_div_by_class(gbody, "scenario-guide")
    if not extracted:
        return None
    attrs, inner = extracted
    st_m = re.search(r'data-short-title="([^"]+)"', attrs)
    short_title = unescape(st_m.group(1)).strip() if st_m else ""
    sec_m = re.search(r'data-section="([^"]+)"', attrs)
    section = unescape(sec_m.group(1)).strip() if sec_m else ""

    def grab_block(cls):
        # 1) 优先匹配标准独立块 <div class="sg-xxx">...</div>（支持内部嵌套 div）
        blk = extract_div_by_class(inner, cls)
        if blk:
            return blk[1].strip()
        # 2) 兼容 <div class="sg-row"><span class="sg-badge sg-xxx">...</span><span class="sg-text">...</span></div>
        rm = re.search(
            rf'<div\b[^>]*class="[^"]*\bsg-row\b[^"]*"[^>]*>\s*'
            rf'<span\b[^>]*class="[^"]*\b{re.escape(cls)}\b[^"]*"[^>]*>.*?</span>\s*'
            rf'<span\b[^>]*class="[^"]*\bsg-text\b[^"]*"[^>]*>(.*?)</span>\s*</div>',
            inner,
            re.S,
        )
        return rm.group(1).strip() if rm else ""

    clue_html = grab_block("sg-clues")
    core_html = grab_block("sg-core")
    principle_html = grab_block("sg-principle")
    pitfall_html = grab_block("sg-pitfall")
    roadmap_html = grab_block("sg-roadmap")
    featured_ids = list(dict.fromkeys(re.findall(r'href="#([^"]+)"', roadmap_html)))
    return {
        "shortTitle": short_title,
        "section": section,
        "clueHtml": clue_html,
        "coreHtml": core_html,
        "principleHtml": principle_html,
        "pitfallHtml": pitfall_html,
        "roadmapHtml": roadmap_html,
        "featuredAnchorIds": featured_ids,
        "structured": True,
    }


def split_verdict_html(verdict_html):
    if not verdict_html:
        return "", ""
    tables = re.findall(r'<table class="verdict"[^>]*>.*?</table>', verdict_html, re.S)
    table_html = "\n".join(tables).strip()
    lead_html = re.sub(r'<table class="verdict"[^>]*>.*?</table>', "", verdict_html, flags=re.S).strip()
    return lead_html, table_html


def iter_practice_groups(practice_html):
    """按嵌套深度匹配 <details class="practice-group" ...>...</details>，避免内部折叠块截断分组。"""
    open_re = re.compile(
        r'<details\s+class="practice-group"[^>]*id="([^"]+)"[^>]*>\s*<summary[^>]*>(.*?)</summary>',
        re.S,
    )
    tag_re = re.compile(r'<details\b|</details>', re.S)
    pos = 0
    while True:
        m = open_re.search(practice_html, pos)
        if not m:
            break
        gid = m.group(1)
        gtitle = strip_tags(m.group(2))
        body_start = m.end()
        depth = 1
        end_pos = len(practice_html)
        for tm in tag_re.finditer(practice_html, body_start):
            if tm.group(0).startswith("</"):
                depth -= 1
                if depth == 0:
                    end_pos = tm.start()
                    pos = tm.end()
                    break
            else:
                depth += 1
        else:
            pos = len(practice_html)
        yield gid, gtitle, practice_html[body_start:end_pos]


def parse_lecture(meta, math1_by_yn, lilin_lookup):
    full_path = os.path.join(HANDOUT_DIR, meta["rel"])
    html = open(full_path, encoding="utf-8").read()

    m_h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    title = strip_tags(m_h1.group(1)) if m_h1 else os.path.splitext(os.path.basename(full_path))[0]

    m_chap = re.search(r'<p class="chapter"[^>]*>(.*?)</p>', html, re.S)
    chapter_path = strip_tags(m_chap.group(1)) if m_chap else meta["bookName"]

    verdict_heading, verdict_html = extract_section(html, "verdict", ["topic-index", "worked-examples", "practice"])
    verdict_html = re.sub(r'<div class="viz-slot"[^>]*>.*?</div>', "", verdict_html, flags=re.S)
    verdict_lead_html, verdict_table_html = split_verdict_html(verdict_html)

    topic_heading, topic_html = extract_section(html, "topic-index", ["worked-examples", "practice"])
    # 提取 topic-index 开头说明段落
    topic_intro_m = re.match(r'\s*(<p[^>]*>.*?</p>)', topic_html, re.S)
    topic_intro_html = topic_intro_m.group(1).strip() if topic_intro_m else ""
    methods = parse_methods(topic_html)

    worked_heading, worked_html = extract_section(html, "worked-examples", ["practice", "coverage"])
    worked_html = re.sub(r'<div class="viz-slot"[^>]*>.*?</div>', "", worked_html, flags=re.S)
    worked_anchors = set(re.findall(r'href="#([^"]+)"', worked_html))

    practice_heading, practice_html = extract_section(html, "practice", ["coverage"])
    practice_intro_m = re.match(r'\s*(<p[^>]*>.*?</p>)', practice_html, re.S)
    practice_intro_html = practice_intro_m.group(1).strip() if practice_intro_m else ""

    groups = []
    ex_counter = 0
    for gid, gtitle, gbody in iter_practice_groups(practice_html):
        explicit_guide = parse_scenario_guide(gbody)
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
                "questionHtml": format_question_html(q_html),
                "hintHtml": fix_mathml_in_html(hint_html),
                "stepsHtml": fix_mathml_in_html(enhance_steps_html(steps_html, item_id)),
            })

        groups.append({
            "id": gid,
            "title": gtitle,
            "guide": explicit_guide,
            "examples": examples,
        })

    if not methods:
        methods = [{"id": f"pattern-{g['id']}", "titleHtml": g["title"], "title": g["title"], "descHtml": ""} for g in groups]

    # 为尚未写入 <div class="scenario-guide"> 的旧手稿自动合成兜底场景指南
    for idx, g in enumerate(groups):
        if g["guide"]:
            if not g["guide"]["shortTitle"]:
                g["guide"]["shortTitle"] = clean_short_title(g["title"])
            continue
        short_title = clean_short_title(g["title"])
        core_html = ""
        if idx < len(methods) and methods[idx].get("descHtml"):
            core_html = re.sub(r'<a\s+href="#[^"]*"[^>]*>.*?</a>', "", methods[idx]["descHtml"], flags=re.S).strip()
        group_anchor_set = {e["anchorId"] for e in g["examples"]}
        featured = [a for a in worked_anchors if a in group_anchor_set]
        g["guide"] = {
            "shortTitle": short_title,
            "clueHtml": "",
            "coreHtml": core_html,
            "principleHtml": "",
            "pitfallHtml": "",
            "roadmapHtml": "",
            "featuredAnchorIds": featured,
            "structured": False,
        }

    has_structured_scenarios = bool(groups) and all(g["guide"]["structured"] for g in groups)

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
        "verdictHtml": fix_mathml_in_html(verdict_html),
        "verdictLeadHtml": fix_mathml_in_html(verdict_lead_html),
        "verdictTableHtml": fix_mathml_in_html(verdict_table_html),
        "hasStructuredScenarios": has_structured_scenarios,
        "topicHeading": topic_heading or "看式子找第一步",
        "topicIntroHtml": fix_mathml_in_html(topic_intro_html),
        "methods": [
            {
                **m,
                "titleHtml": fix_mathml_in_html(m.get("titleHtml", "")),
                "descHtml": fix_mathml_in_html(m.get("descHtml", "")),
            }
            for m in methods
        ],
        "workedHeading": worked_heading,
        "workedHtml": fix_mathml_in_html(worked_html),
        "practiceHeading": practice_heading or "按方法练习",
        "practiceIntroHtml": fix_mathml_in_html(practice_intro_html),
        "groups": [
            {
                **g,
                "guide": {
                    **g["guide"],
                    "clueHtml": fix_mathml_in_html(g["guide"].get("clueHtml", "")),
                    "coreHtml": fix_mathml_in_html(g["guide"].get("coreHtml", "")),
                    "principleHtml": fix_mathml_in_html(g["guide"].get("principleHtml", "")),
                    "pitfallHtml": fix_mathml_in_html(g["guide"].get("pitfallHtml", "")),
                    "roadmapHtml": fix_mathml_in_html(g["guide"].get("roadmapHtml", "")),
                }
                if g.get("guide")
                else g.get("guide"),
            }
            for g in groups
        ],
        "stats": {
            "total": ex_counter,
            "exam": exam_count,
            "lilin880": lilin880_count,
        },
    }


def build_index_entry(h):
    return {
        "slug": h["slug"],
        "order": h["order"],
        "book": h["book"],
        "bookName": h["bookName"],
        "chapterPath": h["chapterPath"],
        "moduleId": h["moduleId"],
        "primaryKpId": h["primaryKpId"],
        "secondaryKpIds": h["secondaryKpIds"],
        "title": h["title"],
        "hasStructuredScenarios": h.get("hasStructuredScenarios", False),
        "methods": [{"id": m["id"], "title": m["title"]} for m in h["methods"]],
        "groups": [
            {
                "id": g["id"],
                "title": g["title"],
                "examples": [
                    {
                        "id": e["id"],
                        "anchorId": e["anchorId"],
                        "matchedMath1": e["matchedMath1"],
                        "lilin880Id": e["lilin880Id"],
                        "year": e["year"],
                        "n": e["n"],
                        "sourceType": e["sourceType"],
                        "source": e["source"],
                        "title": e["title"],
                        "answerLetter": e["answerLetter"],
                    }
                    for e in g["examples"]
                ],
            }
            for g in h["groups"]
        ],
        "stats": h["stats"],
    }


def main():
    global NATIVE_SOLUTIONS_HTML
    NATIVE_SOLUTIONS_HTML = load_native_solutions_html()
    print(f"Loaded {len(NATIVE_SOLUTIONS_HTML)} compiled native solutions")
    math1_by_yn = load_math1_lookup()
    lilin_lookup = load_lilin880_lookup()
    handouts = [parse_lecture(m, math1_by_yn, lilin_lookup) for m in LECTURE_MAP]
    os.makedirs(OUT_DIR, exist_ok=True)

    index_entries = [build_index_entry(h) for h in handouts]
    with open(INDEX_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"version": 3, "handouts": index_entries}, f, ensure_ascii=False)

    valid_files = {"index.json"}
    for h in handouts:
        fname = f"{h['slug']}.json"
        valid_files.add(fname)
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as f:
            json.dump(h, f, ensure_ascii=False)

    # 清理不再存在的旧分片与已废弃的全量大 JSON
    for name in os.listdir(OUT_DIR):
        if name.endswith(".json") and name not in valid_files:
            os.remove(os.path.join(OUT_DIR, name))
    if os.path.exists(LEGACY_MONOLITH_PATH):
        os.remove(LEGACY_MONOLITH_PATH)

    idx_kb = os.path.getsize(INDEX_OUT_PATH) / 1024
    total_kb = sum(os.path.getsize(os.path.join(OUT_DIR, f"{h['slug']}.json")) for h in handouts) / 1024
    print(
        f"Exported {len(handouts)} handouts (v3 split) to {OUT_DIR} "
        f"(index={idx_kb:.1f} KB, avg_shard={total_kb / max(1, len(handouts)):.1f} KB)"
    )
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
