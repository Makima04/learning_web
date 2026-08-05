// 数学知识图谱：高数 / 线代 / 概率
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
        name: "函数·极限·连续",
        order: 1,
        kps: [
          { id: "calc.limit.def", name: "极限定义与性质", freq: 4, bigWeight: 0.3, scope: "both" },
          { id: "calc.limit.tech", name: "七种未定式与求极限技巧", freq: 5, bigWeight: 0.45, scope: "both" },
          { id: "calc.limit.cont", name: "连续性与间断点", freq: 4, bigWeight: 0.35, scope: "both" },
          { id: "calc.limit.asymp", name: "渐近线", freq: 3, bigWeight: 0.2, scope: "both" },
        ],
      },
      {
        id: "calc-diff1",
        name: "一元微分学",
        order: 2,
        kps: [
          { id: "calc.d1.def", name: "导数定义与几何意义", freq: 4, bigWeight: 0.35, scope: "both" },
          { id: "calc.d1.rules", name: "求导法则与高阶导", freq: 5, bigWeight: 0.4, scope: "both" },
          { id: "calc.d1.mvt", name: "微分中值定理", freq: 5, bigWeight: 0.7, scope: "both" },
          { id: "calc.d1.lhopital", name: "洛必达与泰勒", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "calc.d1.sketch", name: "单调/凹凸/极值/作图", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "calc.d1.ineq", name: "不等式证明", freq: 4, bigWeight: 0.5, scope: "both" },
        ],
      },
      {
        id: "calc-int1",
        name: "一元积分学",
        order: 3,
        kps: [
          { id: "calc.i1.indef", name: "不定积分计算", freq: 5, bigWeight: 0.5, scope: "both" },
          { id: "calc.i1.def", name: "定积分定义与性质", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "calc.i1.tech", name: "换元/分部/有理函数", freq: 5, bigWeight: 0.45, scope: "both" },
          { id: "calc.i1.improper", name: "反常积分", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "calc.i1.app", name: "几何与物理应用", freq: 4, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "calc-ode",
        name: "常微分方程",
        order: 4,
        kps: [
          { id: "calc.ode.1st", name: "一阶方程（可分离/齐次/线性）", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "calc.ode.2nd", name: "二阶常系数线性方程", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "calc.ode.euler", name: "欧拉方程等", freq: 2, bigWeight: 0.25, scope: "math1" },
        ],
      },
      {
        id: "calc-series",
        name: "级数（数一）",
        order: 5,
        kps: [
          { id: "calc.series.num", name: "数项级数判敛", freq: 4, bigWeight: 0.45, scope: "math1" },
          { id: "calc.series.power", name: "幂级数展开与求和", freq: 5, bigWeight: 0.6, scope: "math1" },
          { id: "calc.series.fourier", name: "傅里叶级数", freq: 3, bigWeight: 0.4, scope: "math1" },
        ],
      },
      {
        id: "calc-multi",
        name: "多元函数微积分",
        order: 6,
        kps: [
          { id: "calc.m.partial", name: "偏导与全微分", freq: 5, bigWeight: 0.5, scope: "both" },
          { id: "calc.m.ext", name: "极值与条件极值", freq: 5, bigWeight: 0.65, scope: "both" },
          { id: "calc.m.dbl", name: "二重积分", freq: 5, bigWeight: 0.6, scope: "both" },
          { id: "calc.m.tpl", name: "三重积分", freq: 3, bigWeight: 0.4, scope: "math1" },
          { id: "calc.m.line", name: "曲线积分", freq: 4, bigWeight: 0.55, scope: "math1" },
          { id: "calc.m.surf", name: "曲面积分与公式", freq: 4, bigWeight: 0.6, scope: "math1" },
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
          { id: "la.det.compute", name: "计算与克拉默法则", freq: 4, bigWeight: 0.4, scope: "both" },
        ],
      },
      {
        id: "la-matrix",
        name: "矩阵",
        order: 2,
        kps: [
          { id: "la.mat.ops", name: "矩阵运算与初等变换", freq: 5, bigWeight: 0.4, scope: "both" },
          { id: "la.mat.inv", name: "逆矩阵与分块", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "la.mat.rank", name: "矩阵的秩", freq: 5, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "la-eq",
        name: "线性方程组",
        order: 3,
        kps: [
          { id: "la.eq.gauss", name: "高斯消元与解的结构", freq: 5, bigWeight: 0.6, scope: "both" },
          { id: "la.eq.vector", name: "向量组线性相关与极大无关组", freq: 5, bigWeight: 0.65, scope: "both" },
        ],
      },
      {
        id: "la-space",
        name: "向量空间",
        order: 4,
        kps: [
          { id: "la.sp.basis", name: "基·维数·坐标·过渡矩阵", freq: 4, bigWeight: 0.55, scope: "both" },
          { id: "la.sp.ortho", name: "正交化与正交矩阵", freq: 4, bigWeight: 0.5, scope: "both" },
        ],
      },
      {
        id: "la-eigen",
        name: "特征值与二次型",
        order: 5,
        kps: [
          { id: "la.eig.value", name: "特征值特征向量", freq: 5, bigWeight: 0.7, scope: "both" },
          { id: "la.eig.diag", name: "相似对角化", freq: 5, bigWeight: 0.75, scope: "both", prereqs: ["la.eig.value"] },
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
        name: "随机事件与概率",
        order: 1,
        kps: [
          { id: "prob.base.axioms", name: "概率公理与古典概型", freq: 4, bigWeight: 0.3, scope: "both" },
          { id: "prob.base.cond", name: "条件概率/全概/贝叶斯", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "prob.base.indep", name: "事件独立性", freq: 4, bigWeight: 0.35, scope: "both" },
        ],
      },
      {
        id: "prob-rv",
        name: "一维随机变量",
        order: 2,
        kps: [
          { id: "prob.rv.dist", name: "分布函数与常见分布", freq: 5, bigWeight: 0.5, scope: "both" },
          { id: "prob.rv.func", name: "随机变量函数的分布", freq: 4, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "prob-multi",
        name: "多维随机变量",
        order: 3,
        kps: [
          { id: "prob.mv.joint", name: "联合/边缘/条件分布", freq: 5, bigWeight: 0.65, scope: "both" },
          { id: "prob.mv.indep", name: "变量独立性", freq: 4, bigWeight: 0.4, scope: "both" },
          { id: "prob.mv.func", name: "多维函数分布", freq: 4, bigWeight: 0.55, scope: "both" },
        ],
      },
      {
        id: "prob-num",
        name: "数字特征",
        order: 4,
        kps: [
          { id: "prob.num.ex", name: "期望方差协方差", freq: 5, bigWeight: 0.55, scope: "both" },
          { id: "prob.num.ineq", name: "切比雪夫与大数/中心极限", freq: 4, bigWeight: 0.5, scope: "both" },
        ],
      },
      {
        id: "prob-stat",
        name: "统计初步",
        order: 5,
        kps: [
          { id: "prob.stat.sample", name: "样本与抽样分布", freq: 4, bigWeight: 0.45, scope: "both" },
          { id: "prob.stat.est", name: "点估计与区间估计", freq: 4, bigWeight: 0.55, scope: "both" },
          { id: "prob.stat.hyp", name: "假设检验", freq: 3, bigWeight: 0.4, scope: "both" },
        ],
      },
    ],
  },
];
