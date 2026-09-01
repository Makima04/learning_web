"""李林 880 章 / 张宇 1000 章 → 图谱考点。大章跟 880，细点跟 1000。"""
from __future__ import annotations

import json
from pathlib import Path

# 880 章号 → 默认考点（关键词没命中时）
LILIN_CHAPTER_DEFAULT: dict[int, str] = {
    1: "calc.limit.tech",
    2: "calc.d1.rules",
    3: "calc.i1.tech",
    4: "calc.geom.plane",
    5: "calc.m.partial",
    6: "calc.m.dbl",
    7: "calc.ode.1st",
    8: "calc.series.num",
    9: "calc.m.line2",
    10: "la.det.compute",
    11: "la.mat.ops",
    12: "la.eq.vector",
    13: "la.eq.solvability",
    14: "la.eig.value",
    15: "la.eig.quad",
    16: "prob.base.axioms",
    17: "prob.rv.dist",
    18: "prob.mv.joint",
    19: "prob.num.ex",
    20: "prob.limit.lln",
    21: "prob.stat.sample",
    22: "prob.stat.est",
    23: "prob.stat.hyp",
}

LILIN_CHAPTER_NAME: dict[int, str] = {
    1: "函数、极限、连续",
    2: "一元函数微分学及其应用",
    3: "一元函数积分学及其应用",
    4: "空间解析几何",
    5: "多元函数微分学及其应用",
    6: "重积分及其应用",
    7: "微分方程及其应用",
    8: "无穷级数",
    9: "曲线积分与曲面积分",
    10: "行列式",
    11: "矩阵",
    12: "向量",
    13: "线性方程组",
    14: "相似矩阵",
    15: "二次型",
    16: "随机事件及其概率",
    17: "随机变量及其分布",
    18: "多维随机变量及其分布",
    19: "随机变量的数字特征",
    20: "大数定律与中心极限定理",
    21: "数理统计的基本概念",
    22: "参数估计",
    23: "假设检验",
}

# 张宇 1000：基础篇 (part, subject, ch) → 考点
# subject: hs / la / prob
ZHANGYU_CHAPTER: dict[tuple[str, str, int], str] = {}

def _zy(part: str, subj: str, mapping: dict[int, str]) -> None:
    for ch, kp in mapping.items():
        ZHANGYU_CHAPTER[(part, subj, ch)] = kp

_zy("base", "hs", {
    0: "calc.limit.fn",  # 零基础
    1: "calc.limit.tech",
    2: "calc.limit.seq",
    3: "calc.d1.def",
    4: "calc.d1.rules",
    5: "calc.d1.sketch",
    6: "calc.d1.mvt",
    7: "calc.d1.phys",
    8: "calc.i1.def",
    9: "calc.i1.tech",
    10: "calc.i1.app",
    11: "calc.i1.ineq",
    12: "calc.i1.phys",
    13: "calc.m.partial",
    14: "calc.m.dbl",
    15: "calc.ode.1st",
    16: "calc.series.num",
    17: "calc.geom.plane",
    18: "calc.m.tpl",  # 多元积分：再按关键词拆
})
_zy("hard", "hs", {
    1: "calc.limit.tech",
    2: "calc.limit.seq",
    3: "calc.d1.def",
    4: "calc.d1.rules",
    5: "calc.d1.sketch",
    6: "calc.d1.mvt",
    7: "calc.d1.phys",
    8: "calc.i1.def",
    9: "calc.i1.tech",
    10: "calc.i1.app",
    11: "calc.i1.ineq",
    12: "calc.i1.phys",
    13: "calc.m.partial",
    14: "calc.m.dbl",
    15: "calc.ode.1st",
    16: "calc.series.num",
    17: "calc.geom.plane",
    18: "calc.m.tpl",
})
_zy("base", "la", {
    1: "la.det.compute",
    2: "la.mat.ops",
    3: "la.eq.vector",
    4: "la.eq.solvability",
    5: "la.eig.value",
    6: "la.eig.quad",
})
_zy("hard", "la", {
    1: "la.det.compute",
    2: "la.det.cofactor",
    3: "la.mat.ops",
    4: "la.mat.rank",
    5: "la.eq.solvability",
    6: "la.eq.vector",
    7: "la.eig.value",
    8: "la.eig.similar",
    9: "la.eig.quad",
})
_zy("base", "prob", {
    1: "prob.base.cond",
    2: "prob.rv.dist",
    3: "prob.mv.joint",
    4: "prob.num.ex",
    5: "prob.limit.lln",
    6: "prob.stat.sample",
})
_zy("hard", "prob", {
    1: "prob.base.cond",
    2: "prob.rv.dist",
    3: "prob.rv.func",
    4: "prob.mv.joint",
    5: "prob.mv.func",
    6: "prob.num.ex",
    7: "prob.limit.clt",
    8: "prob.stat.sample",
    9: "prob.stat.est",
})


def _hit(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


# 880 章内关键词 → 细考点（先匹配先得）
LILIN_KEYWORDS: dict[int, list[tuple[list[str], str]]] = {
    1: [
        (["渐近"], "calc.limit.asymp"),
        (["间断", "连续"], "calc.limit.cont"),
        (["数列", "a_n", "a n", "递推"], "calc.limit.seq"),
        (["无穷小", "无穷大", "等价"], "calc.limit.inf"),
        (["奇函数", "偶函数", "周期", "有界", "单调函数"], "calc.limit.fn"),
        (["极限", "lim"], "calc.limit.tech"),
    ],
    2: [
        (["速度", "加速度", "质点", "变化率"], "calc.d1.phys"),
        (["不等式", "证明"], "calc.d1.ineq"),
        (["罗尔", "拉格朗日", "柯西", "中值定理"], "calc.d1.mvt"),
        (["洛必达", "泰勒", "麦克劳林"], "calc.d1.lhopital"),
        (["极值", "拐点", "凹凸", "单调", "渐近", "作图", "最值"], "calc.d1.sketch"),
        (["切线", "法线", "几何意义", "可导", "导数定义"], "calc.d1.def"),
        (["求导", "高阶", "微分"], "calc.d1.rules"),
    ],
    3: [
        (["面积", "体积", "弧长", "旋转体", "形心"], "calc.i1.app"),
        (["路程", "变力", "压力", "功", "平均速度"], "calc.i1.phys"),
        (["反常", "无穷限", "瑕"], "calc.i1.improper"),
        (["不等式", "中值定理", "≥", "≤", "证明"], "calc.i1.ineq"),
        (["不定积分", "原函数"], "calc.i1.indef"),
        (["换元", "分部", "有理"], "calc.i1.tech"),
        (["定积分", "积分上限", "变限"], "calc.i1.def"),
    ],
    4: [
        (["二次曲面", "椭球", "抛物面", "双曲面", "柱面", "锥面"], "calc.geom.quad"),
        (["平面", "直线", "夹角", "距离", "平行", "垂直"], "calc.geom.plane"),
        (["向量", "数量积", "向量积"], "calc.geom.vec"),
    ],
    5: [
        (["极值", "条件极值", "拉格朗日乘数"], "calc.m.ext"),
        (["方向导数", "梯度"], "calc.m.dir"),
        (["隐函数", "切平面", "法线"], "calc.m.impl"),
        (["偏导", "全微分", "全增量"], "calc.m.partial"),
    ],
    6: [
        (["质量", "形心", "转动惯量", "质心"], "calc.m.app"),
        (["三重", "dxdydz", "柱坐标", "球坐标", "Ω", "立体", "柱面"], "calc.m.tpl"),
        (["二重", "dxdy", "极坐标", "D"], "calc.m.dbl"),
    ],
    7: [
        (["欧拉方程"], "calc.ode.euler"),
        (["应用", "混合", "衰减", "增长", "溶液", "漏斗"], "calc.ode.app"),
        (["二阶", "常系数", "特征方程"], "calc.ode.2nd"),
        (["可分离", "齐次", "一阶", "线性微分方程"], "calc.ode.1st"),
    ],
    8: [
        (["傅里叶", "正弦", "余弦级数"], "calc.series.fourier"),
        (["幂级数", "展开", "求和", "收敛域", "收敛半径"], "calc.series.power"),
        (["数项", "正项", "交错", "绝对收敛", "条件收敛"], "calc.series.num"),
    ],
    9: [
        (["斯托克斯", "Stokes", "高斯公式", "格林", "散度", "旋度", "div", "rot"], "calc.m.formula"),
        (["dydz", "第二类曲", "对坐标的曲"], "calc.m.surf2"),
        (["dS", "第一类曲", "对面积"], "calc.m.surf"),
        (["Pdx", "Qdy", "对坐标", "第二类曲"], "calc.m.line2"),
        (["ds", "对弧长", "第一类曲"], "calc.m.line"),
    ],
    10: [
        (["余子式", "代数余子式"], "la.det.cofactor"),
        (["克拉默", "Cramer"], "la.det.compute"),
        (["性质", "定义"], "la.det.def"),
    ],
    11: [
        (["秩"], "la.mat.rank"),
        (["逆", "分块", "伴随"], "la.mat.inv"),
        (["初等", "运算", "乘法"], "la.mat.ops"),
    ],
    12: [
        (["正交", "施密特", "Schmidt"], "la.sp.ortho"),
        (["基", "维数", "坐标", "过渡"], "la.sp.basis"),
        (["线性相关", "线性无关", "极大无关", "秩"], "la.eq.vector"),
    ],
    13: [
        (["公共解", "同解"], "la.eq.common"),
        (["基础解系", "解的结构", "通解"], "la.eq.structure"),
        (["消元", "增广", "有解", "无解", "齐次", "非齐次"], "la.eq.solvability"),
    ],
    14: [
        (["对角化", "可对角", "正交对角", "P^{-1}AP", "P-1AP"], "la.eig.diag"),
        (["相似"], "la.eig.similar"),
        (["特征值", "特征向量"], "la.eig.value"),
    ],
    15: [
        (["正定", "负定", "惯性"], "la.eig.pd"),
        (["二次型", "合同", "标准形", "规范形"], "la.eig.quad"),
    ],
    16: [
        (["独立"], "prob.base.indep"),
        (["条件概率", "全概率", "贝叶斯", "Bayes"], "prob.base.cond"),
        (["古典", "几何概型", "公理"], "prob.base.axioms"),
    ],
    17: [
        (["函数的分布", "Y=", "Z="], "prob.rv.func"),
        (["分布函数", "密度", "正态分布", "指数", "泊松", "二项"], "prob.rv.dist"),
    ],
    18: [
        (["函数", "Z=", "U=", "V="], "prob.mv.func"),
        (["独立"], "prob.mv.indep"),
        (["联合", "边缘", "条件密度", "条件分布"], "prob.mv.joint"),
    ],
    19: [
        (["切比雪夫"], "prob.num.ineq"),
        (["期望", "方差", "协方差", "相关"], "prob.num.ex"),
    ],
    20: [
        (["中心极限"], "prob.limit.clt"),
        (["大数"], "prob.limit.lln"),
    ],
    21: [
        (["样本", "统计量", "χ", "卡方", "t分布", "F分布"], "prob.stat.sample"),
    ],
    22: [
        (["矩估计", "最大似然", "区间估计", "置信"], "prob.stat.est"),
    ],
    23: [
        (["假设", "检验", "显著性"], "prob.stat.hyp"),
    ],
}

# 张宇第 18 章（多元积分）再拆
ZHANGYU_CH18_KEYWORDS: list[tuple[list[str], str]] = [
    (["斯托克斯", "Stokes", "高斯公式", "格林", "散度", "旋度"], "calc.m.formula"),
    (["dydz", "第二类曲", "通量", "曲面积分"], "calc.m.surf2"),
    (["dS", "第一类曲", "对面积"], "calc.m.surf"),
    (["Pdx", "Qdy", "xdx", "ydy", "zdz", "第二类曲", "对坐标", "曲线积分"], "calc.m.line2"),
    (["ds", "对弧长", "第一类曲"], "calc.m.line"),
    (["三重", "dxdydz", "柱坐标", "球坐标", "立体", "形心"], "calc.m.tpl"),
]


def classify_lilin(chapter: int, stem: str, extra: str = "") -> list[str]:
    text = f"{stem or ''}\n{extra or ''}"
    for words, kp in LILIN_KEYWORDS.get(chapter, []):
        if _hit(text, words):
            return [kp]
    default = LILIN_CHAPTER_DEFAULT.get(chapter)
    return [default] if default else []


def classify_zhangyu(part: str, subj: str, chapter: int, stem: str, extra: str = "") -> list[str]:
    text = f"{stem or ''}\n{extra or ''}"
    if subj == "hs" and chapter == 18:
        for words, kp in ZHANGYU_CH18_KEYWORDS:
            if _hit(text, words):
                return [kp]
    kp = ZHANGYU_CHAPTER.get((part, subj, chapter))
    return [kp] if kp else []


_OVERLAY_PATH = Path(__file__).resolve().parent / "math_item_overlay.json"
_OVERLAY: dict[str, dict] | None = None


def item_overlay() -> dict[str, dict]:
    global _OVERLAY
    if _OVERLAY is None:
        if _OVERLAY_PATH.exists():
            _OVERLAY = json.loads(_OVERLAY_PATH.read_text(encoding="utf-8"))
        else:
            _OVERLAY = {}
    return _OVERLAY


def apply_overlay(q: dict) -> dict:
    """人工细标覆盖关键词分类：kp_ids / facets。"""
    ov = item_overlay().get(q.get("id") or "")
    if not ov:
        return q
    if ov.get("kp_ids"):
        q["kp_ids"] = list(ov["kp_ids"])
    if ov.get("facets"):
        q["facets"] = list(ov["facets"])
    return q
