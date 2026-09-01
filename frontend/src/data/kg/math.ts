// 数学知识图谱：大章按李林 880 数一（23 章），小考点对齐张宇 1000 细分。
// scope: math1 | math2 | both —— 用户在设置中选数一/数二后过滤
import type { KgBook } from "@/lib/kg/types";

export const MATH_BOOKS: KgBook[] = [
  {
    id: "calc",
    name: "高等数学",
    subject: "math",
    order: 1,
    modules: [
      {
        id: "calc-limit",
        name: "函数、极限、连续",
        order: 1,
        kps: [
          { id: "calc.limit.fn", name: "函数性质（奇偶/周期/有界/单调）", freq: 3, bigWeight: 0.15, scope: "both" },
          { id: "calc.limit.def", name: "极限定义与性质", freq: 4, bigWeight: 0.3, scope: "both" },
          { id: "calc.limit.seq", name: "数列极限", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "calc.limit.inf", name: "无穷小与无穷大", freq: 5, bigWeight: 0.25, scope: "both" },
          { id: "calc.limit.tech", name: "未定式与求极限技巧", freq: 5, bigWeight: 0.45, scope: "both" },
          { id: "calc.limit.cont", name: "连续性与间断点", freq: 4, bigWeight: 0.35, scope: "both" },
          { id: "calc.limit.asymp", name: "渐近线", freq: 3, bigWeight: 0.2, scope: "both" },
        ],
      },
      {
        id: "calc-diff1",
        name: "一元函数微分学及其应用",
        order: 2,
        kps: [
          { id: "calc.d1.def", name: "导数定义与几何意义", freq: 4, bigWeight: 0.35, scope: "both" },
          { id: "calc.d1.rules", name: "求导法则与高阶导", freq: 5, bigWeight: 0.4, scope: "both" },
          { id: "calc.d1.mvt", name: "中值定理、微分等式与不等式", freq: 5, bigWeight: 0.7, scope: "both" },
          { id: "calc.d1.lhopital", name: "洛必达与泰勒", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "calc.d1.sketch", name: "单调/凹凸/极值/作图", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "calc.d1.ineq", name: "微分等式与不等式证明", freq: 4, bigWeight: 0.5, scope: "both" },
          { id: "calc.d1.phys", name: "微分学物理应用", freq: 2, bigWeight: 0.3, scope: "both" },
        ],
      },
      {
        id: "calc-int1",
        name: "一元函数积分学及其应用",
        order: 3,
        kps: [
          { id: "calc.i1.def", name: "定积分定义与性质", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "calc.i1.indef", name: "不定积分计算", freq: 5, bigWeight: 0.5, scope: "both" },
          { id: "calc.i1.tech", name: "换元/分部/有理函数", freq: 5, bigWeight: 0.45, scope: "both" },
          { id: "calc.i1.improper", name: "反常积分", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "calc.i1.app", name: "积分几何应用", freq: 4, bigWeight: 0.5, scope: "both" },
          { id: "calc.i1.ineq", name: "积分等式与不等式", freq: 4, bigWeight: 0.55, scope: "both" },
          { id: "calc.i1.phys", name: "积分物理应用", freq: 2, bigWeight: 0.35, scope: "both" },
        ],
      },
      {
        id: "calc-geom",
        name: "空间解析几何",
        order: 4,
        kps: [
          { id: "calc.geom.vec", name: "向量代数", freq: 3, bigWeight: 0.2, scope: "math1" },
          { id: "calc.geom.plane", name: "平面与直线", freq: 3, bigWeight: 0.25, scope: "math1" },
          { id: "calc.geom.quad", name: "二次曲面与空间曲线", freq: 3, bigWeight: 0.3, scope: "math1" },
        ],
      },
      {
        id: "calc-multi",
        name: "多元函数微分学及其应用",
        order: 5,
        kps: [
          { id: "calc.m.partial", name: "偏导与全微分", freq: 5, bigWeight: 0.5, scope: "both" },
          { id: "calc.m.dir", name: "方向导数与梯度", freq: 3, bigWeight: 0.35, scope: "math1" },
          { id: "calc.m.impl", name: "隐函数与几何应用", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "calc.m.ext", name: "极值与条件极值", freq: 5, bigWeight: 0.65, scope: "both" },
        ],
      },
      {
        id: "calc-multi-int",
        name: "重积分及其应用",
        order: 6,
        kps: [
          { id: "calc.m.dbl", name: "二重积分", freq: 5, bigWeight: 0.6, scope: "both" },
          { id: "calc.m.tpl", name: "三重积分", freq: 4, bigWeight: 0.5, scope: "math1" },
          { id: "calc.m.app", name: "重积分应用", freq: 3, bigWeight: 0.4, scope: "both" },
        ],
      },
      {
        id: "calc-ode",
        name: "微分方程及其应用",
        order: 7,
        kps: [
          { id: "calc.ode.1st", name: "一阶方程（可分离/齐次/线性）", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "calc.ode.2nd", name: "二阶常系数线性方程", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "calc.ode.euler", name: "欧拉方程等", freq: 2, bigWeight: 0.25, scope: "math1" },
          { id: "calc.ode.app", name: "微分方程应用", freq: 3, bigWeight: 0.4, scope: "both" },
        ],
      },
      {
        id: "calc-series",
        name: "无穷级数",
        order: 8,
        kps: [
          { id: "calc.series.num", name: "数项级数判敛", freq: 4, bigWeight: 0.45, scope: "math1" },
          { id: "calc.series.power", name: "幂级数展开与求和", freq: 5, bigWeight: 0.6, scope: "math1" },
          { id: "calc.series.fourier", name: "傅里叶级数", freq: 3, bigWeight: 0.4, scope: "math1" },
        ],
      },
      {
        id: "calc-line-surf",
        name: "曲线积分与曲面积分",
        order: 9,
        kps: [
          { id: "calc.m.line", name: "第一类曲线积分", freq: 3, bigWeight: 0.4, scope: "math1" },
          { id: "calc.m.line2", name: "第二类曲线积分", freq: 4, bigWeight: 0.55, scope: "math1" },
          { id: "calc.m.surf", name: "第一类曲面积分", freq: 3, bigWeight: 0.4, scope: "math1" },
          { id: "calc.m.surf2", name: "第二类曲面积分", freq: 4, bigWeight: 0.55, scope: "math1" },
          { id: "calc.m.formula", name: "格林 / 高斯 / 斯托克斯公式", freq: 4, bigWeight: 0.6, scope: "math1" },
        ],
      },
    ],
  },
  {
    id: "linear",
    name: "线性代数",
    subject: "math",
    order: 2,
    modules: [
      {
        id: "la-det",
        name: "行列式",
        order: 1,
        kps: [
          { id: "la.det.def", name: "行列式定义与性质", freq: 4, bigWeight: 0.35, scope: "both" },
          { id: "la.det.compute", name: "行列式的计算", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "la.det.cofactor", name: "余子式与代数余子式", freq: 3, bigWeight: 0.35, scope: "both" },
        ],
      },
      {
        id: "la-matrix",
        name: "矩阵",
        order: 2,
        kps: [
          { id: "la.mat.ops", name: "矩阵运算与初等变换", freq: 5, bigWeight: 0.4, scope: "both" },
          { id: "la.mat.inv", name: "逆矩阵、伴随与分块", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "la.mat.rank", name: "矩阵的秩", freq: 5, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "la-vec",
        name: "向量",
        order: 3,
        kps: [
          { id: "la.eq.vector", name: "向量组线性相关与极大无关组", freq: 5, bigWeight: 0.65, scope: "both" },
          { id: "la.sp.basis", name: "基·维数·坐标·过渡矩阵", freq: 4, bigWeight: 0.55, scope: "math1" },
          { id: "la.sp.ortho", name: "正交化与正交矩阵", freq: 4, bigWeight: 0.5, scope: "both" },
        ],
      },
      {
        id: "la-eq",
        name: "线性方程组",
        order: 4,
        kps: [
          { id: "la.eq.solvability", name: "有解判别与含参讨论", freq: 5, bigWeight: 0.5, scope: "both", prereqs: ["la.mat.rank"] },
          { id: "la.eq.structure", name: "基础解系与解的结构", freq: 5, bigWeight: 0.7, scope: "both", prereqs: ["la.eq.solvability", "la.eq.vector"] },
          { id: "la.eq.common", name: "公共解与同解", freq: 5, bigWeight: 0.65, scope: "both", prereqs: ["la.eq.structure"] },
        ],
      },
      {
        id: "la-eigen",
        name: "相似矩阵",
        order: 5,
        kps: [
          { id: "la.eig.value", name: "特征值特征向量", freq: 5, bigWeight: 0.7, scope: "both" },
          { id: "la.eig.diag", name: "相似对角化", freq: 5, bigWeight: 0.75, scope: "both", prereqs: ["la.eig.value"] },
          { id: "la.eig.similar", name: "矩阵相似", freq: 4, bigWeight: 0.55, scope: "both", prereqs: ["la.eig.value"] },
        ],
      },
      {
        id: "la-quad",
        name: "二次型",
        order: 6,
        kps: [
          { id: "la.eig.quad", name: "二次型与合同/标准形", freq: 5, bigWeight: 0.8, scope: "both", prereqs: ["la.eig.diag"] },
          { id: "la.eig.pd", name: "正定二次型", freq: 4, bigWeight: 0.55, scope: "both", prereqs: ["la.eig.quad"] },
        ],
      },
    ],
  },
  {
    id: "prob",
    name: "概率论与数理统计",
    subject: "math",
    order: 3,
    modules: [
      {
        id: "prob-base",
        name: "随机事件及其概率",
        order: 1,
        kps: [
          { id: "prob.base.axioms", name: "概率公理与古典概型", freq: 4, bigWeight: 0.3, scope: "both" },
          { id: "prob.base.cond", name: "条件概率/全概/贝叶斯", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "prob.base.indep", name: "事件独立性", freq: 4, bigWeight: 0.35, scope: "both" },
        ],
      },
      {
        id: "prob-rv",
        name: "随机变量及其分布",
        order: 2,
        kps: [
          { id: "prob.rv.dist", name: "分布函数与常见分布", freq: 5, bigWeight: 0.5, scope: "both" },
          { id: "prob.rv.func", name: "随机变量函数的分布", freq: 4, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "prob-multi",
        name: "多维随机变量及其分布",
        order: 3,
        kps: [
          { id: "prob.mv.joint", name: "联合/边缘/条件分布", freq: 5, bigWeight: 0.65, scope: "both" },
          { id: "prob.mv.indep", name: "变量独立性", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "prob.mv.func", name: "多维函数分布", freq: 4, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "prob-num",
        name: "随机变量的数字特征",
        order: 4,
        kps: [
          { id: "prob.num.ex", name: "期望方差协方差", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "prob.num.ineq", name: "切比雪夫不等式", freq: 3, bigWeight: 0.35, scope: "both" },
        ],
      },
      {
        id: "prob-limit",
        name: "大数定律与中心极限定理",
        order: 5,
        kps: [
          { id: "prob.limit.lln", name: "大数定律", freq: 3, bigWeight: 0.35, scope: "both" },
          { id: "prob.limit.clt", name: "中心极限定理", freq: 4, bigWeight: 0.5, scope: "both" },
        ],
      },
      {
        id: "prob-stat",
        name: "数理统计的基本概念",
        order: 6,
        kps: [
          { id: "prob.stat.sample", name: "样本与抽样分布", freq: 4, bigWeight: 0.45, scope: "both" },
        ],
      },
      {
        id: "prob-est",
        name: "参数估计",
        order: 7,
        kps: [
          { id: "prob.stat.est", name: "点估计与区间估计", freq: 4, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "prob-hyp",
        name: "假设检验",
        order: 8,
        kps: [
          { id: "prob.stat.hyp", name: "假设检验", freq: 3, bigWeight: 0.4, scope: "both" },
        ],
      },
    ],
  },
];
