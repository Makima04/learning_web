# 数学一 2009—2026 逐题分类复核

逐题读取2009—2026年归档题干；复杂与歧义题对照解析。主标签按主要任务归类，辅助标签仅记录题干直接要求或解题中实质使用的知识，不展开先修闭包。分类为AI复核，可根据原题继续纠正。

版本：`20261113-question-review-v1`；共 408 题，18 年，每年 150 分，共 2700 分。

- 考频：主考点与辅助考点均计入考查年份，同年同考点去重；当前题型分别统计。
- 分值：整题分值仅分配给唯一主考点；辅助考点不分配整题分值。未拆小问评分，主考点占分不等于单个知识点的实际得分份额。
- 原题为社区重排版；来源与文件哈希见 `scripts/math1_exam_sources.json`、`scripts/math1_question_review.json`。
- 下表的分值是整题分值，不能累加到每个辅助考点。考法可能是不同可行解法，不表示每种解法都必须使用。

## 分年完整性

| 年份 | 选择 | 填空 | 大题 | 总题数 | 总分 |
|---|---:|---:|---:|---:|---:|
| 2009 | 8 | 6 | 9 | 23 | 150 |
| 2010 | 8 | 6 | 9 | 23 | 150 |
| 2011 | 8 | 6 | 9 | 23 | 150 |
| 2012 | 8 | 6 | 9 | 23 | 150 |
| 2013 | 8 | 6 | 9 | 23 | 150 |
| 2014 | 8 | 6 | 9 | 23 | 150 |
| 2015 | 8 | 6 | 9 | 23 | 150 |
| 2016 | 8 | 6 | 9 | 23 | 150 |
| 2017 | 8 | 6 | 9 | 23 | 150 |
| 2018 | 8 | 6 | 9 | 23 | 150 |
| 2019 | 8 | 6 | 9 | 23 | 150 |
| 2020 | 8 | 6 | 9 | 23 | 150 |
| 2021 | 10 | 6 | 6 | 22 | 150 |
| 2022 | 10 | 6 | 6 | 22 | 150 |
| 2023 | 10 | 6 | 6 | 22 | 150 |
| 2024 | 10 | 6 | 6 | 22 | 150 |
| 2025 | 10 | 6 | 6 | 22 | 150 |
| 2026 | 10 | 6 | 6 | 22 | 150 |

## 考点考查统计（包含辅助考点，按年份去重）

| 考点 | 题数 | 2009—2026 年份数 | 2022—2026 年份 | 主标签归属分值 |
|---|---:|---:|---|---:|
| 导数定义与几何意义 `calc.d1.def` | 15 | 11 | 2023, 2024 | 41 |
| 微分等式与不等式证明 `calc.d1.ineq` | 4 | 4 | 无 | 10 |
| 洛必达与泰勒 `calc.d1.lhopital` | 26 | 16 | 2022, 2023, 2024, 2025, 2026 | 29 |
| 中值定理、微分等式与不等式 `calc.d1.mvt` | 11 | 11 | 2022, 2023, 2024, 2025, 2026 | 64 |
| 求导法则与高阶导 `calc.d1.rules` | 17 | 13 | 2022, 2023, 2024, 2026 | 34 |
| 单调/凹凸/极值/作图 `calc.d1.sketch` | 22 | 14 | 2022, 2023, 2025, 2026 | 70 |
| 平面与直线 `calc.geom.plane` | 13 | 10 | 2024, 2025 | 0 |
| 二次曲面与空间曲线 `calc.geom.quad` | 9 | 8 | 2025, 2026 | 0 |
| 向量代数 `calc.geom.vec` | 5 | 4 | 2025, 2026 | 0 |
| 积分几何应用 `calc.i1.app` | 5 | 4 | 无 | 34 |
| 定积分定义与性质 `calc.i1.def` | 27 | 17 | 2022, 2023, 2024, 2025, 2026 | 50 |
| 反常积分 `calc.i1.improper` | 8 | 7 | 2026 | 22 |
| 不定积分计算 `calc.i1.indef` | 2 | 2 | 无 | 14 |
| 积分等式与不等式 `calc.i1.ineq` | 4 | 4 | 2022, 2024, 2026 | 22 |
| 积分物理应用 `calc.i1.phys` | 1 | 1 | 无 | 4 |
| 换元/分部/有理函数 `calc.i1.tech` | 23 | 16 | 2022, 2023, 2024, 2025, 2026 | 41 |
| 渐近线 `calc.limit.asymp` | 4 | 4 | 2022, 2023 | 13 |
| 连续性与间断点 `calc.limit.cont` | 11 | 8 | 2022, 2023, 2024 | 4 |
| 极限定义与性质 `calc.limit.def` | 3 | 3 | 2022 | 5 |
| 函数性质（奇偶/周期/有界/单调） `calc.limit.fn` | 10 | 9 | 2022, 2023, 2024, 2025 | 0 |
| 无穷小与无穷大 `calc.limit.inf` | 20 | 15 | 2022, 2023, 2024, 2025, 2026 | 31 |
| 数列极限 `calc.limit.seq` | 8 | 7 | 2022 | 35 |
| 未定式与求极限技巧 `calc.limit.tech` | 16 | 13 | 2022, 2023, 2024, 2025, 2026 | 70 |
| 重积分应用 `calc.m.app` | 3 | 3 | 无 | 24 |
| 二重积分 `calc.m.dbl` | 20 | 16 | 2022, 2023, 2024, 2025 | 63 |
| 方向导数与梯度 `calc.m.dir` | 6 | 6 | 2022, 2025 | 28 |
| 极值与条件极值 `calc.m.ext` | 13 | 13 | 2022, 2023, 2024, 2026 | 119 |
| 格林 / 高斯 / 斯托克斯公式 `calc.m.formula` | 17 | 14 | 2022, 2023, 2024, 2025, 2026 | 0 |
| 隐函数与几何应用 `calc.m.impl` | 11 | 10 | 2023, 2024, 2026 | 34 |
| 第一类曲线积分 `calc.m.line` | 2 | 2 | 无 | 8 |
| 第二类曲线积分 `calc.m.line2` | 16 | 15 | 2022, 2024, 2025, 2026 | 117 |
| 偏导与全微分 `calc.m.partial` | 46 | 18 | 2022, 2023, 2024, 2025, 2026 | 72 |
| 第一类曲面积分 `calc.m.surf` | 4 | 4 | 无 | 24 |
| 第二类曲面积分 `calc.m.surf2` | 12 | 11 | 2022, 2023, 2024, 2025 | 88 |
| 三重积分 `calc.m.tpl` | 12 | 12 | 2023, 2025, 2026 | 13 |
| 一阶方程（可分离/齐次/线性） `calc.ode.1st` | 12 | 11 | 2022, 2023, 2024, 2025 | 51 |
| 二阶常系数线性方程 `calc.ode.2nd` | 12 | 11 | 2023, 2026 | 71 |
| 微分方程应用 `calc.ode.app` | 3 | 3 | 2023 | 20 |
| 欧拉方程等 `calc.ode.euler` | 2 | 2 | 2025 | 17 |
| 傅里叶级数 `calc.series.fourier` | 4 | 4 | 2023, 2024, 2025 | 19 |
| 数项级数判敛 `calc.series.num` | 17 | 14 | 2022, 2023, 2025, 2026 | 53 |
| 幂级数展开与求和 `calc.series.power` | 13 | 12 | 2024, 2026 | 86 |
| 余子式与代数余子式 `la.det.cofactor` | 2 | 2 | 无 | 5 |
| 行列式的计算 `la.det.compute` | 9 | 8 | 2022, 2025, 2026 | 16 |
| 行列式定义与性质 `la.det.def` | 11 | 11 | 2024, 2026 | 0 |
| 相似对角化 `la.eig.diag` | 21 | 14 | 2022, 2023, 2024 | 75 |
| 正定二次型 `la.eig.pd` | 4 | 4 | 2024 | 5 |
| 二次型与合同/标准形 `la.eig.quad` | 18 | 18 | 2022, 2023, 2024, 2025, 2026 | 136 |
| 矩阵相似 `la.eig.similar` | 10 | 9 | 2023 | 38 |
| 特征值特征向量 `la.eig.value` | 36 | 18 | 2022, 2023, 2024, 2025, 2026 | 41 |
| 公共解与同解 `la.eq.common` | 3 | 3 | 2022, 2023, 2025 | 10 |
| 有解判别与含参讨论 `la.eq.solvability` | 11 | 9 | 2024, 2026 | 57 |
| 基础解系与解的结构 `la.eq.structure` | 17 | 13 | 2022, 2023, 2025 | 35 |
| 向量组线性相关与极大无关组 `la.eq.vector` | 26 | 17 | 2022, 2023, 2024, 2025, 2026 | 70 |
| 逆矩阵、伴随与分块 `la.mat.inv` | 12 | 10 | 2022, 2026 | 17 |
| 矩阵运算与初等变换 `la.mat.ops` | 25 | 16 | 2022, 2023, 2024, 2025, 2026 | 24 |
| 矩阵的秩 `la.mat.rank` | 35 | 15 | 2022, 2023, 2024, 2025, 2026 | 31 |
| 基·维数·坐标·过渡矩阵 `la.sp.basis` | 4 | 4 | 无 | 30 |
| 正交化与正交矩阵 `la.sp.ortho` | 18 | 12 | 2022, 2023, 2024, 2026 | 10 |
| 概率公理与古典概型 `prob.base.axioms` | 11 | 11 | 2022, 2025 | 12 |
| 条件概率/全概/贝叶斯 `prob.base.cond` | 13 | 11 | 2022, 2024, 2025, 2026 | 37 |
| 事件独立性 `prob.base.indep` | 9 | 8 | 2022, 2024, 2025 | 4 |
| 中心极限定理 `prob.limit.clt` | 1 | 1 | 无 | 4 |
| 大数定律 `prob.limit.lln` | 1 | 1 | 无 | 0 |
| 多维函数分布 `prob.mv.func` | 14 | 11 | 2023, 2024 | 40 |
| 变量独立性 `prob.mv.indep` | 21 | 14 | 2022, 2023, 2024, 2026 | 0 |
| 联合/边缘/条件分布 `prob.mv.joint` | 18 | 13 | 2022, 2023, 2024, 2025 | 74 |
| 期望方差协方差 `prob.num.ex` | 49 | 18 | 2022, 2023, 2024, 2025, 2026 | 114 |
| 切比雪夫不等式 `prob.num.ineq` | 1 | 1 | 2022 | 5 |
| 分布函数与常见分布 `prob.rv.dist` | 53 | 18 | 2022, 2023, 2024, 2025, 2026 | 53 |
| 随机变量函数的分布 `prob.rv.func` | 7 | 7 | 2025, 2026 | 40 |
| 点估计与区间估计 `prob.stat.est` | 20 | 17 | 2022, 2023, 2024, 2026 | 190 |
| 假设检验 `prob.stat.hyp` | 3 | 3 | 2025 | 14 |
| 样本与抽样分布 `prob.stat.sample` | 10 | 10 | 2023, 2024, 2025, 2026 | 13 |

## 2009 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 无穷小与无穷大 | 洛必达与泰勒 | 比较两个无穷小的最低阶项并确定参数。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=2) |
| 2 | 选择 / 4 | 二重积分 | — | 用区域对称性与被积函数符号比较四个二重积分。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=2) |
| 3 | 选择 / 4 | 定积分定义与性质 | 单调/凹凸/极值/作图 | 由变上限积分的导数判断函数图像与极值。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=3) |
| 4 | 选择 / 4 | 数项级数判敛 | 极限定义与性质 | 利用趋零数列有界及绝对收敛级数比较判敛。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=3) |
| 5 | 选择 / 4 | 基·维数·坐标·过渡矩阵 | 向量组线性相关与极大无关组 | 题目要求两组基之间的过渡矩阵，不涉及正交化。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=3) |
| 6 | 选择 / 4 | 逆矩阵、伴随与分块 | 行列式定义与性质 | 由分块矩阵行列式及逆矩阵求伴随矩阵。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=4) |
| 7 | 选择 / 4 | 期望方差协方差 | 分布函数与常见分布 | 由混合正态分布的权重计算期望。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=5) |
| 8 | 选择 / 4 | 多维函数分布 | 分布函数与常见分布、变量独立性 | 独立连续与离散变量乘积在零点产生概率质量。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=5) |
| 9 | 填空 / 4 | 偏导与全微分 | — | 复合二元函数的混合偏导计算。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=6) |
| 10 | 填空 / 4 | 二阶常系数线性方程 | — | 从齐次通解确定重根，再求非齐次初值解。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=6) |
| 11 | 填空 / 4 | 第一类曲线积分 | — | 将第一类曲线积分化为参数积分。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=6) |
| 12 | 填空 / 4 | 三重积分 | — | 在单位球上计算三重积分，可用球坐标或对称性。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=6) |
| 13 | 填空 / 4 | 特征值特征向量 | 矩阵运算与初等变换 | 利用外积矩阵平方关系求非零特征值。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=7) |
| 14 | 填空 / 4 | 点估计与区间估计 | 期望方差协方差、分布函数与常见分布 | 利用二项总体均值与样本方差的无偏性确定系数。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=7) |
| 15 | 大题 / 10 | 极值与条件极值 | 偏导与全微分 | 求驻点并由二阶偏导判别二元极值。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=7) |
| 16 | 大题 / 10 | 数项级数判敛 | 积分几何应用 | 先积分求两曲线面积，再分别对全项和奇数项求和。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=8) |
| 17 | 大题 / 10 | 积分几何应用 | 二次曲面与空间曲线、导数定义与几何意义 | 建立旋转椭球及切锥方程后用截面法求体积。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=8) |
| 18 | 大题 / 10 | 中值定理、微分等式与不等式 | 导数定义与几何意义 | 证明拉格朗日定理并用其建立端点单侧导数。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=9) |
| 19 | 大题 / 10 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式 | 通量场在原点奇异，挖球后用高斯公式计算。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=9) |
| 20 | 大题 / 11 | 向量组线性相关与极大无关组 | 基础解系与解的结构、矩阵运算与初等变换 | 先解两组非齐次方程，再用矩阵连乘关系证明无关。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=9) |
| 21 | 大题 / 11 | 二次型与合同/标准形 | 特征值特征向量 | 计算二次型特征值并用规范形的正负惯性指数确定参数。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=10) |
| 22 | 大题 / 11 | 联合/边缘/条件分布 | 条件概率/全概/贝叶斯、概率公理与古典概型 | 有放回取球，分别求条件概率及二维离散分布。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=10) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差 | 由总体一阶矩和似然函数分别估计参数。 | [原题](../frontend/public/math/exams/math1/2009.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2009-answer.pdf#page=11) |

## 2010 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 未定式与求极限技巧 | 洛必达与泰勒 | 对幂指型极限取对数后求极限。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=2) |
| 2 | 选择 / 4 | 隐函数与几何应用 | 偏导与全微分 | 对隐式齐次关系求偏导并消去公共项。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=2) |
| 3 | 选择 / 4 | 反常积分 | 无穷小与无穷大 | 分别比较两端点的对数与幂函数奇性。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=2) |
| 4 | 选择 / 4 | 二重积分 | 定积分定义与性质 | 把二重和整理为矩形区域上的黎曼和。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=3) |
| 5 | 选择 / 4 | 矩阵的秩 | 矩阵运算与初等变换 | 由矩阵乘积为单位阵推出两矩阵满行或满列秩。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=3) |
| 6 | 选择 / 4 | 相似对角化 | 特征值特征向量、矩阵的秩 | 实对称矩阵的多项式关系给出特征值，再由秩确定重数。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=3) |
| 7 | 选择 / 4 | 分布函数与常见分布 | — | 利用分布函数在一点的跳跃量求点概率。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=4) |
| 8 | 选择 / 4 | 分布函数与常见分布 | — | 由分段密度归一化确定两个系数的关系。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=4) |
| 9 | 填空 / 4 | 求导法则与高阶导 | 定积分定义与性质 | 参数方程的二阶导数与变上限积分求导。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=4) |
| 10 | 填空 / 4 | 换元/分部/有理函数 | — | 先作根式换元再分部积分。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=4) |
| 11 | 填空 / 4 | 第二类曲线积分 | — | 沿含绝对值的分段曲线计算第二类曲线积分。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=5) |
| 12 | 填空 / 4 | 重积分应用 | 三重积分 | 以三重积分求旋转体体积和形心高度。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=5) |
| 13 | 填空 / 4 | 基·维数·坐标·过渡矩阵 | 向量组线性相关与极大无关组、矩阵的秩 | 向量生成空间的维数为二，等价于列秩为二，不涉及正交。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=6) |
| 14 | 填空 / 4 | 期望方差协方差 | 分布函数与常见分布 | 由归一化识别泊松分布并求二阶矩。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=6) |
| 15 | 大题 / 10 | 二阶常系数线性方程 | — | 含共振指数多项式右端的二阶非齐次方程。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=7) |
| 16 | 大题 / 10 | 单调/凹凸/极值/作图 | 定积分定义与性质 | 对含参变限积分求导后讨论单调区间与极值。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=7) |
| 17 | 大题 / 10 | 积分等式与不等式 | 数列极限、换元/分部/有理函数 | 比较积分并以分部积分计算的上界夹逼积分数列。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=7) |
| 18 | 大题 / 10 | 幂级数展开与求和 | 数项级数判敛、换元/分部/有理函数 | 判定幂级数端点收敛性，再逐项求导积分求和。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=8) |
| 19 | 大题 / 10 | 第一类曲面积分 | 隐函数与几何应用、平面与直线、二重积分 | 由切平面垂直条件确定轨迹，再投影计算第一类曲面积分。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=9) |
| 20 | 大题 / 11 | 有解判别与含参讨论 | 基础解系与解的结构、矩阵的秩 | 利用存在两个不同解确定参数，再解非齐次通解。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=10) |
| 21 | 大题 / 11 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量、相似对角化、正定二次型 | 由正交变换及已知单位特征向量反求矩阵，并证明正定。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=10) |
| 22 | 大题 / 11 | 联合/边缘/条件分布 | 分布函数与常见分布 | 对联合正态型密度归一化，求边缘及条件密度。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=11) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差、分布函数与常见分布 | 按参数多项式恒等式构造无偏估计并求其方差。 | [原题](../frontend/public/math/exams/math1/2010.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2010-answer.pdf#page=11) |

## 2011 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 单调/凹凸/极值/作图 | — | 通过零点的重数与凹凸变化识别拐点。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=2) |
| 2 | 选择 / 4 | 幂级数展开与求和 | 数项级数判敛 | 以趋零系数及部分和无界判定幂级数两个端点。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=2) |
| 3 | 选择 / 4 | 极值与条件极值 | 偏导与全微分 | 由二阶偏导正定条件选择二元函数极小值的充分条件。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=2) |
| 4 | 选择 / 4 | 定积分定义与性质 | — | 根据积分区间内三角函数大小比较定积分。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=2) |
| 5 | 选择 / 4 | 矩阵运算与初等变换 | 逆矩阵、伴随与分块 | 把行列初等变换分别写成左右乘初等矩阵。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=3) |
| 6 | 选择 / 4 | 基础解系与解的结构 | 逆矩阵、伴随与分块、矩阵的秩、向量组线性相关与极大无关组 | 利用伴随矩阵秩与列向量的线性关系选取基础解系。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=3) |
| 7 | 选择 / 4 | 分布函数与常见分布 | — | 利用分布函数乘积的导数判断密度非负及归一性。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=4) |
| 8 | 选择 / 4 | 期望方差协方差 | 变量独立性 | 利用最大值与最小值乘积等于原变量乘积及独立性求期望。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=5) |
| 9 | 填空 / 4 | 积分几何应用 | 定积分定义与性质 | 由变上限积分求导后代入平面曲线弧长公式。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=5) |
| 10 | 填空 / 4 | 一阶方程（可分离/齐次/线性） | — | 一阶线性非齐次方程的初值问题。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=6) |
| 11 | 填空 / 4 | 偏导与全微分 | 定积分定义与性质 | 复合上限积分的二阶偏导。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=6) |
| 12 | 填空 / 4 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式、平面与直线 | 沿空间闭曲线计算第二类曲线积分，可参数化或用斯托克斯公式。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=6) |
| 13 | 填空 / 4 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量、矩阵的秩 | 正交变换后的曲面方程给出特征值与秩，据此确定参数。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=7) |
| 14 | 填空 / 4 | 期望方差协方差 | 变量独立性、联合/边缘/条件分布 | 二维正态零相关推出独立，进而分解混合矩。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=8) |
| 15 | 大题 / 10 | 未定式与求极限技巧 | 洛必达与泰勒 | 幂指型极限取对数并使用泰勒展开或洛必达。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=8) |
| 16 | 大题 / 10 | 偏导与全微分 | 单调/凹凸/极值/作图 | 链式法则结合一元极值点处导数为零。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=9) |
| 17 | 大题 / 10 | 单调/凹凸/极值/作图 | 连续性与间断点、函数性质（奇偶/周期/有界/单调） | 借助奇性、单调区间与介值性质讨论含参方程根数。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=9) |
| 18 | 大题 / 10 | 数列极限 | 微分等式与不等式证明、中值定理、微分等式与不等式 | 先证对数不等式，再证明调和和减对数的数列单调有界。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=10) |
| 19 | 大题 / 10 | 二重积分 | 换元/分部/有理函数、偏导与全微分 | 二重积分转累次积分后两次分部积分并用边界条件。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=11) |
| 20 | 大题 / 11 | 向量组线性相关与极大无关组 | 矩阵的秩、有解判别与含参讨论 | 由不能线性表示得到秩约束，再用增广矩阵求表示系数。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=11) |
| 21 | 大题 / 11 | 特征值特征向量 | 正交化与正交矩阵、相似对角化、矩阵的秩 | 由矩阵作用识别特征对，利用实对称矩阵特征向量正交补全并反求矩阵。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=12) |
| 22 | 大题 / 11 | 联合/边缘/条件分布 | 多维函数分布、期望方差协方差 | 由边缘及约束确定联合分布，继而求乘积分布和相关系数。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=13) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差、样本与抽样分布 | 求正态方差的最大似然估计，再用卡方抽样分布求期望与方差。 | [原题](../frontend/public/math/exams/math1/2011.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2011-answer.pdf#page=14) |

## 2012 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 渐近线 | 连续性与间断点 | 约去公因子后区分可去间断点、垂直及水平渐近线。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=2) |
| 2 | 选择 / 4 | 求导法则与高阶导 | — | 多因子乘积求导时利用零因子简化。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=2) |
| 3 | 选择 / 4 | 偏导与全微分 | — | 由二元函数可微定义判断极限条件的充分必要性。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=2) |
| 4 | 选择 / 4 | 定积分定义与性质 | — | 按半周期拆分积分并比较指数权重。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=3) |
| 5 | 选择 / 4 | 向量组线性相关与极大无关组 | 行列式定义与性质 | 由向量分量的结构关系或行列式恒零判断线性相关。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=3) |
| 6 | 选择 / 4 | 相似对角化 | 特征值特征向量 | 在同一特征子空间内更换基，判断对角化结果。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=4) |
| 7 | 选择 / 4 | 联合/边缘/条件分布 | 变量独立性、分布函数与常见分布 | 由独立指数分布的联合密度积分求大小比较概率。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=4) |
| 8 | 选择 / 4 | 期望方差协方差 | — | 两段长度和为常数，利用完全负线性关系求相关系数。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=4) |
| 9 | 填空 / 4 | 二阶常系数线性方程 | — | 利用两个微分约束确定二阶常系数方程的解。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=5) |
| 10 | 填空 / 4 | 换元/分部/有理函数 | — | 配方及换元计算含二次根式的定积分。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=5) |
| 11 | 填空 / 4 | 方向导数与梯度 | 偏导与全微分 | 按梯度定义计算三个偏导。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=5) |
| 12 | 填空 / 4 | 第一类曲面积分 | 二重积分 | 把平面上的第一类曲面积分投影到三角形区域。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=5) |
| 13 | 填空 / 4 | 矩阵的秩 | 特征值特征向量、正交化与正交矩阵 | 单位向量的外积给出秩一正交投影，据此求补投影的秩。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=6) |
| 14 | 填空 / 4 | 条件概率/全概/贝叶斯 | 概率公理与古典概型 | 利用互斥条件及补事件的条件概率公式。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=6) |
| 15 | 大题 / 10 | 微分等式与不等式证明 | 单调/凹凸/极值/作图 | 构造差函数并求导证明对数三角不等式。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=6) |
| 16 | 大题 / 10 | 极值与条件极值 | 偏导与全微分 | 求二元函数驻点并作二阶判别。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=7) |
| 17 | 大题 / 10 | 幂级数展开与求和 | 数项级数判敛 | 拆解系数，利用幂级数求导积分求和并核对端点。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=7) |
| 18 | 大题 / 10 | 积分几何应用 | 求导法则与高阶导、微分方程应用 | 把切线长度条件转为参数微分关系，求曲线及围成面积。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=8) |
| 19 | 大题 / 10 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式、二重积分 | 补线封闭曲线后用格林公式，扣除补线积分。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=8) |
| 20 | 大题 / 11 | 有解判别与含参讨论 | 行列式的计算、基础解系与解的结构、矩阵的秩 | 先求四阶行列式，再讨论无穷多解的参数并求通解。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=8) |
| 21 | 大题 / 11 | 二次型与合同/标准形 | 矩阵的秩、特征值特征向量、正交化与正交矩阵、相似对角化 | 由格拉姆矩阵秩确定参数，求单位正交特征向量化标准形。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=9) |
| 22 | 大题 / 11 | 期望方差协方差 | 联合/边缘/条件分布 | 从二维分布表求事件概率及线性组合的协方差。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=10) |
| 23 | 大题 / 11 | 点估计与区间估计 | 多维函数分布、变量独立性、期望方差协方差、分布函数与常见分布 | 独立正态变量之差的分布、方差参数估计及无偏性证明。 | [原题](../frontend/public/math/exams/math1/2012.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2012-answer.pdf#page=11) |

## 2013 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 无穷小与无穷大 | 洛必达与泰勒 | 用反正切展开确定无穷小阶数及非零系数。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=2) |
| 2 | 选择 / 4 | 隐函数与几何应用 | 偏导与全微分 | 由隐式曲面梯度写出切平面。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=2) |
| 3 | 选择 / 4 | 傅里叶级数 | 函数性质（奇偶/周期/有界/单调） | 正弦级数对应奇延拓，再按周期性及收敛定理求值。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=2) |
| 4 | 选择 / 4 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式、二重积分 | 由格林公式比较四个区域上的二重积分。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=2) |
| 5 | 选择 / 4 | 向量组线性相关与极大无关组 | 矩阵运算与初等变换、逆矩阵、伴随与分块 | 右乘可逆矩阵保持列向量组等价。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=3) |
| 6 | 选择 / 4 | 矩阵相似 | 特征值特征向量、相似对角化 | 由相似不变量确定参数，并利用对称性验证对角化。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=3) |
| 7 | 选择 / 4 | 分布函数与常见分布 | — | 比较平移缩放后正态分布在固定区间内的概率。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=4) |
| 8 | 选择 / 4 | 样本与抽样分布 | — | 利用t分布的平方服从F分布以及对称尾概率。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=4) |
| 9 | 填空 / 4 | 导数定义与几何意义 | 求导法则与高阶导 | 将数列式极限识别为导数定义，再用隐函数求导。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=5) |
| 10 | 填空 / 4 | 二阶常系数线性方程 | — | 已知三个非齐次解，取差得到齐次基础解并写通解。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=5) |
| 11 | 填空 / 4 | 求导法则与高阶导 | — | 参数方程二阶导数计算。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=5) |
| 12 | 填空 / 4 | 反常积分 | 换元/分部/有理函数 | 对无穷区间对数有理函数作分部积分。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=5) |
| 13 | 填空 / 4 | 逆矩阵、伴随与分块 | 余子式与代数余子式、行列式定义与性质 | 把元素与代数余子式关系写成伴随矩阵恒等式求行列式。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=5) |
| 14 | 填空 / 4 | 分布函数与常见分布 | 条件概率/全概/贝叶斯 | 指数分布的条件概率与无记忆性。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=6) |
| 15 | 大题 / 10 | 换元/分部/有理函数 | 定积分定义与性质 | 含变上限积分的定积分，分部积分后换元。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=6) |
| 16 | 大题 / 10 | 幂级数展开与求和 | 二阶常系数线性方程 | 把系数递推关系转为二阶微分方程并由初值求和函数。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=7) |
| 17 | 大题 / 10 | 极值与条件极值 | 偏导与全微分 | 求驻点并用二阶偏导判别极值。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=7) |
| 18 | 大题 / 10 | 中值定理、微分等式与不等式 | 函数性质（奇偶/周期/有界/单调） | 奇函数端点条件配合中值定理与辅助函数证明微分等式。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=8) |
| 19 | 大题 / 10 | 重积分应用 | 二次曲面与空间曲线、平面与直线、三重积分 | 建立旋转曲面方程，三重积分求形心。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=8) |
| 20 | 大题 / 11 | 有解判别与含参讨论 | 矩阵运算与初等变换、基础解系与解的结构 | 把交换子矩阵方程展开为含参线性方程组并求全部矩阵解。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=9) |
| 21 | 大题 / 11 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量、相似对角化、矩阵运算与初等变换 | 写出外积形式的二次型矩阵，用正交单位向量构造标准形。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=10) |
| 22 | 大题 / 11 | 随机变量函数的分布 | 分布函数与常见分布 | 分段函数变换同时产生连续部分和点质量，另求比较事件概率。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=10) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差 | 计算总体一阶矩并建立参数似然函数。 | [原题](../frontend/public/math/exams/math1/2013.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2013-answer.pdf#page=11) |

## 2014 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 渐近线 | 未定式与求极限技巧 | 通过函数与直线之差的极限判断渐近线。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=2) |
| 2 | 选择 / 4 | 单调/凹凸/极值/作图 | 微分等式与不等式证明 | 二阶导数符号决定曲线与端点弦线的相对位置。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=2) |
| 3 | 选择 / 4 | 二重积分 | — | 识别积分区域，比较交换次序及极坐标变换后的积分。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=2) |
| 4 | 选择 / 4 | 极值与条件极值 | 换元/分部/有理函数 | 先展开并计算积分，再对两个参数求最小值。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=3) |
| 5 | 选择 / 4 | 行列式的计算 | 行列式定义与性质 | 通过行列交换或分块结构计算四阶行列式。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=4) |
| 6 | 选择 / 4 | 向量组线性相关与极大无关组 | — | 按线性相关定义判断向量组无关命题的充分必要关系。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=4) |
| 7 | 选择 / 4 | 事件独立性 | 概率公理与古典概型 | 利用事件独立与差事件概率求未知概率。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=5) |
| 8 | 选择 / 4 | 期望方差协方差 | 变量独立性、分布函数与常见分布 | 比较混合分布与独立变量平均值的期望方差。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=5) |
| 9 | 填空 / 4 | 隐函数与几何应用 | 偏导与全微分 | 显式曲面切平面的偏导法。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=5) |
| 10 | 填空 / 4 | 定积分定义与性质 | 函数性质（奇偶/周期/有界/单调） | 利用奇性周期性化归区间，再由已知导数恢复函数值。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=5) |
| 11 | 填空 / 4 | 一阶方程（可分离/齐次/线性） | — | 用y除以x换元化齐次一阶方程并代入初值。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=6) |
| 12 | 填空 / 4 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式、平面与直线 | 空间椭圆的定向曲线积分，可用参数法或斯托克斯公式。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=6) |
| 13 | 填空 / 4 | 二次型与合同/标准形 | — | 按配方法或特征值符号讨论负惯性指数。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=7) |
| 14 | 填空 / 4 | 点估计与区间估计 | 期望方差协方差 | 计算总体二阶矩并利用期望线性性确定无偏系数。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=7) |
| 15 | 大题 / 10 | 未定式与求极限技巧 | 洛必达与泰勒、定积分定义与性质 | 对含变上限积分的比式用洛必达及泰勒展开。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=7) |
| 16 | 大题 / 10 | 单调/凹凸/极值/作图 | 求导法则与高阶导 | 隐函数求导得到驻点并判断一元极值。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=8) |
| 17 | 大题 / 10 | 二阶常系数线性方程 | 偏导与全微分 | 复合二元函数的二阶偏导关系化为常系数方程。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=8) |
| 18 | 大题 / 10 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式、三重积分 | 补平面封闭抛物面，用高斯公式并扣补面通量。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=9) |
| 19 | 大题 / 10 | 数项级数判敛 | 数列极限、无穷小与无穷大 | 从收敛正项级数推出趋零，再以比较判别证明比值级数收敛。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=10) |
| 20 | 大题 / 11 | 基础解系与解的结构 | 矩阵运算与初等变换 | 先求齐次基础解系，再按列解右逆矩阵方程。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=11) |
| 21 | 大题 / 11 | 矩阵相似 | 相似对角化、特征值特征向量、矩阵的秩 | 证明两个秩一矩阵具有相同特征值且都可对角化。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=14) |
| 22 | 大题 / 11 | 联合/边缘/条件分布 | 分布函数与常见分布、期望方差协方差 | 由条件均匀分布和离散混合求边缘分布函数及期望。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=14) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差、大数定律、分布函数与常见分布 | 先求总体矩及最大似然估计，再用大数定律证明依概率收敛。 | [原题](../frontend/public/math/exams/math1/2014.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2014-answer.pdf#page=15) |

## 2015 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 单调/凹凸/极值/作图 | — | 从二阶导数图像的变号判断原函数拐点。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=2) |
| 2 | 选择 / 4 | 二阶常系数线性方程 | — | 把给定非齐次特解代入方程，比较指数项系数确定参数。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=2) |
| 3 | 选择 / 4 | 幂级数展开与求和 | 数项级数判敛 | 由条件收敛确定原幂级数半径，再用逐项求导半径不变判断内外点。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=2) |
| 4 | 选择 / 4 | 二重积分 | — | 双曲线与射线围成的区域改写为极坐标累次积分。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=2) |
| 5 | 选择 / 4 | 有解判别与含参讨论 | 矩阵的秩、行列式的计算 | 由系数和增广矩阵等秩且不满秩判断含参方程无穷多解。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=3) |
| 6 | 选择 / 4 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量 | 正交特征向量换序及变号对应标准形系数的重新排列。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=3) |
| 7 | 选择 / 4 | 概率公理与古典概型 | — | 用交事件包含于各事件比较其概率和算术平均。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=3) |
| 8 | 选择 / 4 | 期望方差协方差 | — | 由不相关关系和方差公式求二次混合矩。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=4) |
| 9 | 填空 / 4 | 未定式与求极限技巧 | 洛必达与泰勒、无穷小与无穷大 | 对数余弦的二阶等价无穷小极限。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=4) |
| 10 | 填空 / 4 | 换元/分部/有理函数 | 函数性质（奇偶/周期/有界/单调） | 奇函数项在对称区间积分为零，余下绝对值项求积分。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=4) |
| 11 | 填空 / 4 | 隐函数与几何应用 | 偏导与全微分 | 对隐函数关系全微分并代入指定点。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=5) |
| 12 | 填空 / 4 | 三重积分 | — | 在四面体区域对线性函数作三重积分。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=5) |
| 13 | 填空 / 4 | 行列式的计算 | 行列式定义与性质 | 利用行列变换计算特殊n阶行列式。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=6) |
| 14 | 填空 / 4 | 联合/边缘/条件分布 | 变量独立性、分布函数与常见分布 | 二维正态零相关推出独立，按中心化变量符号计算事件概率。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=6) |
| 15 | 大题 / 10 | 无穷小与无穷大 | 洛必达与泰勒 | 展开到三阶，消去低阶项以匹配等价无穷小。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=6) |
| 16 | 大题 / 10 | 微分方程应用 | 导数定义与几何意义、一阶方程（可分离/齐次/线性） | 将切线截距围成三角形面积条件化为可分离方程。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=7) |
| 17 | 大题 / 10 | 极值与条件极值 | 方向导数与梯度、偏导与全微分 | 先求最大方向导数等于梯度模，再在椭圆约束上求最大值。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=8) |
| 18 | 大题 / 10 | 导数定义与几何意义 | 求导法则与高阶导 | 用导数定义证明乘积法则，并推广到多个因子。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=8) |
| 19 | 大题 / 10 | 第二类曲线积分 | 平面与直线 | 用球面与平面交线的参数化及端点方向计算空间曲线积分。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=9) |
| 20 | 大题 / 11 | 基·维数·坐标·过渡矩阵 | 向量组线性相关与极大无关组、有解判别与含参讨论 | 证明两组向量均为基，再解两基下坐标相同的非零向量。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=9) |
| 21 | 大题 / 11 | 相似对角化 | 矩阵相似、特征值特征向量 | 利用相似不变量确定参数，再求对角化的特征向量矩阵。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=11) |
| 22 | 大题 / 11 | 分布函数与常见分布 | 事件独立性、期望方差协方差 | 直到第二次成功停止，建立负二项分布并求观察次数期望。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=12) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差、样本与抽样分布 | 均匀分布端点参数用矩法及样本最小值的似然边界估计。 | [原题](../frontend/public/math/exams/math1/2015.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2015-answer.pdf#page=12) |

## 2016 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 反常积分 | — | 分别检查零点附近和无穷远处的幂次可积性。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=2) |
| 2 | 选择 / 4 | 不定积分计算 | 连续性与间断点 | 分段积分后匹配积分常数，使原函数在连接点连续可导。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=2) |
| 3 | 选择 / 4 | 一阶方程（可分离/齐次/线性） | — | 两个非齐次解的差解齐次方程，据此确定系数及右端。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=2) |
| 4 | 选择 / 4 | 导数定义与几何意义 | 连续性与间断点、极限定义与性质 | 阶梯函数在零点通过夹逼求连续性及导数。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=2) |
| 5 | 选择 / 4 | 矩阵相似 | 逆矩阵、伴随与分块、矩阵运算与初等变换 | 检验相似关系对转置、求逆及矩阵和的保持性。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=3) |
| 6 | 选择 / 4 | 二次型与合同/标准形 | 特征值特征向量、二次曲面与空间曲线 | 由二次型矩阵特征值的符号判断二次曲面类型。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=3) |
| 7 | 选择 / 4 | 分布函数与常见分布 | — | 正态标准化后判断区间概率对参数的单调关系。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=3) |
| 8 | 选择 / 4 | 期望方差协方差 | 联合/边缘/条件分布、事件独立性 | 重复试验中两类结果计数的联合分布及协方差。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=3) |
| 9 | 填空 / 4 | 未定式与求极限技巧 | 定积分定义与性质、洛必达与泰勒、无穷小与无穷大 | 变上限积分比式用洛必达和等价无穷小。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=4) |
| 10 | 填空 / 4 | 偏导与全微分 | — | 按向量场旋度的偏导定义计算。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=4) |
| 11 | 填空 / 4 | 隐函数与几何应用 | 偏导与全微分 | 复合函数隐式关系的全微分，利用点值简化。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=4) |
| 12 | 填空 / 4 | 求导法则与高阶导 | 洛必达与泰勒 | 利用三阶导数与泰勒系数的对应关系确定参数。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=5) |
| 13 | 填空 / 4 | 行列式的计算 | — | 按特殊矩阵结构展开四阶行列式。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=5) |
| 14 | 填空 / 4 | 点估计与区间估计 | — | 正态均值双侧置信区间关于样本均值对称。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=5) |
| 15 | 大题 / 10 | 二重积分 | — | 在圆与心形线之间的极坐标区域计算二重积分。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=6) |
| 16 | 大题 / 10 | 二阶常系数线性方程 | 反常积分 | 由负特征根证明解在无穷远可积，再由初值求积分。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=6) |
| 17 | 大题 / 10 | 第二类曲线积分 | 偏导与全微分、单调/凹凸/极值/作图 | 先从偏导恢复势函数，再把路径无关积分化为一元最小值。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=7) |
| 18 | 大题 / 10 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式、三重积分 | 封闭四面体外向通量用高斯公式化为三重积分。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=7) |
| 19 | 大题 / 10 | 数项级数判敛 | 中值定理、微分等式与不等式、数列极限 | 由导数界得到压缩估计，证明差分级数绝对收敛及递推数列收敛。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=8) |
| 20 | 大题 / 11 | 有解判别与含参讨论 | 基础解系与解的结构、矩阵运算与初等变换、矩阵的秩 | 按列讨论含参矩阵方程的无解、唯一解与无穷多解。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=8) |
| 21 | 大题 / 11 | 相似对角化 | 特征值特征向量、矩阵运算与初等变换、向量组线性相关与极大无关组 | 用对角化求高次幂，再由矩阵关系把高次幂列向量作线性表示。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=10) |
| 22 | 大题 / 11 | 联合/边缘/条件分布 | 变量独立性、多维函数分布 | 区域均匀分布下引入指示变量，判断独立并求和变量分布函数。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=11) |
| 23 | 大题 / 11 | 点估计与区间估计 | 样本与抽样分布、期望方差协方差 | 求样本最大值密度，再以期望调整为端点参数的无偏估计。 | [原题](../frontend/public/math/exams/math1/2016.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2016-answer.pdf#page=12) |

## 2017 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 连续性与间断点 | 无穷小与无穷大 | 比较零点左右极限并用余弦等价无穷小确定连续条件。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=2) |
| 2 | 选择 / 4 | 单调/凹凸/极值/作图 | — | 由平方函数导数为正推出绝对值单调。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=2) |
| 3 | 选择 / 4 | 方向导数与梯度 | 向量代数、偏导与全微分 | 将给定向量单位化后与梯度作内积。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=2) |
| 4 | 选择 / 4 | 积分物理应用 | 定积分定义与性质 | 速度差的定积分给出相对位移，据阴影面积判断追及时刻。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=2) |
| 5 | 选择 / 4 | 逆矩阵、伴随与分块 | 特征值特征向量、正交化与正交矩阵 | 单位向量的外积作用于自身，可直接判别秩一扰动是否可逆。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=3) |
| 6 | 选择 / 4 | 矩阵相似 | 相似对角化、特征值特征向量、矩阵的秩 | 比较重特征值特征空间维数来判断与对角矩阵是否相似。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=3) |
| 7 | 选择 / 4 | 条件概率/全概/贝叶斯 | 概率公理与古典概型 | 把含补事件的条件概率不等式化为交概率与边缘概率关系。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=4) |
| 8 | 选择 / 4 | 样本与抽样分布 | 分布函数与常见分布 | 检验标准化后的正态平方和是否服从卡方分布。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=4) |
| 9 | 填空 / 4 | 求导法则与高阶导 | 洛必达与泰勒 | 用偶函数性质或幂级数系数求零点三阶导数。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=4) |
| 10 | 填空 / 4 | 二阶常系数线性方程 | — | 特征方程有共轭复根的二阶齐次方程。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=5) |
| 11 | 填空 / 4 | 第二类曲线积分 | 偏导与全微分 | 在单连通圆域内由交叉偏导相等确定路径无关的参数。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=5) |
| 12 | 填空 / 4 | 幂级数展开与求和 | — | 对几何级数逐项求导得到和函数。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=5) |
| 13 | 填空 / 4 | 矩阵的秩 | 向量组线性相关与极大无关组、矩阵运算与初等变换 | 线性无关向量组成可逆矩阵，右乘后秩保持。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=6) |
| 14 | 填空 / 4 | 期望方差协方差 | 分布函数与常见分布 | 由正态混合分布的权重和均值计算总体期望。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=6) |
| 15 | 大题 / 10 | 偏导与全微分 | 求导法则与高阶导 | 二元复合函数沿参数曲线的一阶及二阶导数。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=7) |
| 16 | 大题 / 10 | 定积分定义与性质 | 换元/分部/有理函数 | 把和式极限化成定积分，再分部积分。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=7) |
| 17 | 大题 / 10 | 单调/凹凸/极值/作图 | 求导法则与高阶导 | 隐函数一二阶求导及驻点极值判别。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=8) |
| 18 | 大题 / 10 | 中值定理、微分等式与不等式 | 连续性与间断点、导数定义与几何意义 | 由端点极限与介值定理得零点，再对乘积函数反复用罗尔定理。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=8) |
| 19 | 大题 / 10 | 第一类曲面积分 | 二次曲面与空间曲线、二重积分 | 先求曲面交线投影，再对曲面密度积分求质量。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=8) |
| 20 | 大题 / 11 | 基础解系与解的结构 | 矩阵的秩、特征值特征向量、向量组线性相关与极大无关组 | 不同特征值与列相关关系确定秩，再由特解及基础解系写通解。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=9) |
| 21 | 大题 / 11 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量、相似对角化、矩阵的秩 | 由缺少一个平方项确定参数，再构造正交特征向量矩阵。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=10) |
| 22 | 大题 / 11 | 多维函数分布 | 期望方差协方差、变量独立性、分布函数与常见分布 | 先计算连续变量期望，再利用独立离散变量平移密度求和分布。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=11) |
| 23 | 大题 / 11 | 点估计与区间估计 | 随机变量函数的分布、期望方差协方差、分布函数与常见分布 | 正态绝对误差的折叠分布、矩估计与最大似然估计。 | [原题](../frontend/public/math/exams/math1/2017.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2017-answer.pdf#page=12) |

## 2018 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 导数定义与几何意义 | 无穷小与无穷大 | 分别比较零点两侧差商，判断含绝对值根式函数的可导性。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=2) |
| 2 | 选择 / 4 | 隐函数与几何应用 | 偏导与全微分、平面与直线 | 设切点写曲面切平面，再代入两个已知点。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=2) |
| 3 | 选择 / 4 | 幂级数展开与求和 | — | 把数项和拆成正弦余弦的麦克劳林级数。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=2) |
| 4 | 选择 / 4 | 定积分定义与性质 | 换元/分部/有理函数 | 对称区间消去奇项并作变量反射后比较积分。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=3) |
| 5 | 选择 / 4 | 矩阵相似 | 矩阵的秩、特征值特征向量 | 比较减单位阵后的秩与幂次结构，识别非对角化矩阵的相似类。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=3) |
| 6 | 选择 / 4 | 矩阵的秩 | 向量组线性相关与极大无关组、矩阵运算与初等变换 | 利用乘积列向量可由原矩阵列向量表示来判断分块矩阵秩。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=4) |
| 7 | 选择 / 4 | 分布函数与常见分布 | — | 密度关于一点对称，利用中间区间概率求尾部概率。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=4) |
| 8 | 选择 / 4 | 假设检验 | — | 比较显著性水平不同时嵌套的拒绝域。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=4) |
| 9 | 填空 / 4 | 未定式与求极限技巧 | 无穷小与无穷大 | 幂指型极限取对数并匹配指数极限确定参数。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=5) |
| 10 | 填空 / 4 | 换元/分部/有理函数 | 导数定义与几何意义 | 由过点及切线得到边值，再对含二阶导数积分分部积分。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=5) |
| 11 | 填空 / 4 | 偏导与全微分 | — | 计算向量场旋度的指定点值。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=5) |
| 12 | 填空 / 4 | 第一类曲线积分 | 平面与直线 | 利用球面大圆的对称性和所在平面关系计算第一类曲线积分。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=5) |
| 13 | 填空 / 4 | 特征值特征向量 | 向量组线性相关与极大无关组、行列式定义与性质 | 用不同特征向量的无关性分离矩阵平方关系，再求特征值乘积。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=6) |
| 14 | 填空 / 4 | 条件概率/全概/贝叶斯 | 事件独立性、概率公理与古典概型 | 把独立、互斥和条件概率联合化为事件概率方程。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=6) |
| 15 | 大题 / 10 | 不定积分计算 | 换元/分部/有理函数 | 含指数根式反正切的不定积分，换元后分部积分。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=6) |
| 16 | 大题 / 10 | 极值与条件极值 | 偏导与全微分 | 在总周长约束下求三种图形总面积最小值。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=6) |
| 17 | 大题 / 10 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式、三重积分 | 给半椭球补平面后用高斯公式计算定向通量。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=7) |
| 18 | 大题 / 10 | 一阶方程（可分离/齐次/线性） | 函数性质（奇偶/周期/有界/单调） | 求一阶线性通解，并由周期边值条件证明周期解唯一。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=8) |
| 19 | 大题 / 10 | 数列极限 | 微分等式与不等式证明 | 由指数不等式建立递推数列正性与单调性，再解极限方程。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=9) |
| 20 | 大题 / 11 | 二次型与合同/标准形 | 基础解系与解的结构、矩阵的秩、正定二次型 | 平方和为零化齐次方程，按秩确定规范形及正定情形。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=9) |
| 21 | 大题 / 11 | 矩阵运算与初等变换 | 矩阵的秩、基础解系与解的结构、逆矩阵、伴随与分块 | 初等列等价约束确定参数，再解矩阵方程并筛选可逆解。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=10) |
| 22 | 大题 / 11 | 期望方差协方差 | 多维函数分布、变量独立性、分布函数与常见分布 | 先用独立性求协方差，再分正负取值求乘积变量分布。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=11) |
| 23 | 大题 / 11 | 点估计与区间估计 | 期望方差协方差、随机变量函数的分布 | 拉普拉斯尺度参数的似然估计为样本绝对值均值，再求其期望方差。 | [原题](../frontend/public/math/exams/math1/2018.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2018-answer.pdf#page=12) |

## 2019 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 无穷小与无穷大 | 洛必达与泰勒 | 用正切泰勒展开确定同阶无穷小的幂次。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=2) |
| 2 | 选择 / 4 | 单调/凹凸/极值/作图 | 导数定义与几何意义、连续性与间断点 | 按分段函数左右差商及邻域符号判断可导性与极值。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=2) |
| 3 | 选择 / 4 | 数项级数判敛 | 数列极限 | 用有界单调数列收敛及裂项级数部分和判断收敛。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=2) |
| 4 | 选择 / 4 | 第二类曲线积分 | 偏导与全微分 | 单连通上半平面内闭路积分为零，利用交叉偏导确定函数。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=2) |
| 5 | 选择 / 4 | 二次型与合同/标准形 | 特征值特征向量、行列式定义与性质 | 由矩阵多项式与行列式确定特征值符号及规范形。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=3) |
| 6 | 选择 / 4 | 有解判别与含参讨论 | 矩阵的秩、平面与直线 | 把三平面两两相交但无公共交点的几何关系转为秩判据。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=3) |
| 7 | 选择 / 4 | 概率公理与古典概型 | — | 将两个事件的概率相等改写为两差事件概率相等。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=3) |
| 8 | 选择 / 4 | 多维函数分布 | 变量独立性、分布函数与常见分布 | 独立同分布正态变量的差消去均值参数。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=3) |
| 9 | 填空 / 4 | 偏导与全微分 | — | 复合函数偏导的线性组合中消去外函数导数。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=4) |
| 10 | 填空 / 4 | 一阶方程（可分离/齐次/线性） | — | 用平方变量换元化一阶线性方程并用初值选取分支。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=4) |
| 11 | 填空 / 4 | 幂级数展开与求和 | — | 识别余弦麦克劳林级数并代入根式变量。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=4) |
| 12 | 填空 / 4 | 第二类曲面积分 | 二重积分 | 利用上半椭球投影，将定向曲面积分转为圆盘二重积分。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=4) |
| 13 | 填空 / 4 | 基础解系与解的结构 | 向量组线性相关与极大无关组、矩阵的秩 | 由列向量相关关系及前两列无关直接写齐次通解。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=5) |
| 14 | 填空 / 4 | 分布函数与常见分布 | 期望方差协方差、随机变量函数的分布 | 先由密度求期望与分布函数，再计算分布函数变换的概率。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=5) |
| 15 | 大题 / 10 | 一阶方程（可分离/齐次/线性） | 单调/凹凸/极值/作图 | 先解一阶初值方程，再求二阶导数讨论凹凸与拐点。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=5) |
| 16 | 大题 / 10 | 方向导数与梯度 | 第一类曲面积分、偏导与全微分、二重积分 | 由最大方向导数的方向与模确定参数，再求抛物面面积。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=6) |
| 17 | 大题 / 10 | 积分几何应用 | 反常积分、数项级数判敛、换元/分部/有理函数 | 按正弦符号分段计算无穷区间面积，归结为几何级数。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=6) |
| 18 | 大题 / 10 | 数列极限 | 换元/分部/有理函数、定积分定义与性质 | 由积分比较得单调性，分部积分得递推式，再夹逼相邻项比值。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=7) |
| 19 | 大题 / 10 | 重积分应用 | 三重积分、二次曲面与空间曲线 | 按高度分层计算斜锥体的体积和一阶矩以求形心。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=8) |
| 20 | 大题 / 11 | 基·维数·坐标·过渡矩阵 | 向量组线性相关与极大无关组、有解判别与含参讨论 | 由给定坐标确定参数，证明新向量组为基并求过渡矩阵。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=8) |
| 21 | 大题 / 11 | 矩阵相似 | 特征值特征向量、相似对角化、矩阵运算与初等变换 | 利用相似不变量确定参数，再求实现给定非对角相似形式的矩阵。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=10) |
| 22 | 大题 / 11 | 多维函数分布 | 期望方差协方差、变量独立性、分布函数与常见分布 | 求符号与指数变量乘积密度，再区分不相关与不独立。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=12) |
| 23 | 大题 / 11 | 点估计与区间估计 | 分布函数与常见分布 | 半正态型密度归一化及方差参数的最大似然估计。 | [原题](../frontend/public/math/exams/math1/2019.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2019-answer.pdf#page=13) |

## 2020 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 4 | 无穷小与无穷大 | 定积分定义与性质、洛必达与泰勒 | 比较不同变上限积分的无穷小阶数。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=2) |
| 2 | 选择 / 4 | 导数定义与几何意义 | 无穷小与无穷大 | 比较可导性与不同阶趋零条件之间的充分必要关系。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=3) |
| 3 | 选择 / 4 | 偏导与全微分 | 向量代数、隐函数与几何应用 | 用二元可微展开判断图面位移与法向量内积的极限。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=3) |
| 4 | 选择 / 4 | 幂级数展开与求和 | 数项级数判敛 | 用幂级数收敛圆内绝对收敛性质推断偶次子级数的点与半径关系。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=4) |
| 5 | 选择 / 4 | 矩阵运算与初等变换 | 逆矩阵、伴随与分块 | 初等列变换等价于右乘可逆矩阵及其逆变换。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=4) |
| 6 | 选择 / 4 | 向量组线性相关与极大无关组 | 平面与直线 | 由空间两直线相交的参数式导出三向量线性表示关系。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=4) |
| 7 | 选择 / 4 | 概率公理与古典概型 | — | 把恰好一个事件发生拆为互斥事件，用容斥计算。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=5) |
| 8 | 选择 / 4 | 中心极限定理 | 期望方差协方差、分布函数与常见分布 | 伯努利和标准化后用中心极限定理近似概率。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=5) |
| 9 | 填空 / 4 | 未定式与求极限技巧 | 洛必达与泰勒 | 对两个倒数差通分并展开至足够阶数。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=6) |
| 10 | 填空 / 4 | 求导法则与高阶导 | — | 参数方程二阶导数并代入指定参数值。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=6) |
| 11 | 填空 / 4 | 二阶常系数线性方程 | 反常积分 | 利用正阻尼解的衰减性，将方程积分并代入初值。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=7) |
| 12 | 填空 / 4 | 偏导与全微分 | 定积分定义与性质 | 含积分参数及复合上限的混合偏导计算。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=7) |
| 13 | 填空 / 4 | 行列式的计算 | 行列式定义与性质 | 利用结构与行列变换计算含参四阶行列式。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=7) |
| 14 | 填空 / 4 | 期望方差协方差 | 分布函数与常见分布、换元/分部/有理函数 | 均匀变量与其正弦变换的协方差，利用对称性及分部积分。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=8) |
| 15 | 大题 / 10 | 极值与条件极值 | 偏导与全微分 | 求二元多项式驻点并作二阶极值判别。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=9) |
| 16 | 大题 / 10 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式 | 圆周积分的场在原点奇异，需参数化或挖孔后用格林公式。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=9) |
| 17 | 大题 / 10 | 幂级数展开与求和 | 数项级数判敛、一阶方程（可分离/齐次/线性） | 比值判定收敛后将系数递推转为和函数的一阶方程。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=10) |
| 18 | 大题 / 10 | 第二类曲面积分 | 二重积分 | 圆锥侧面投影消去抽象函数项，再用极坐标积分。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=11) |
| 19 | 大题 / 10 | 中值定理、微分等式与不等式 | 单调/凹凸/极值/作图 | 在绝对最大值点两侧应用中值定理，并分析导数界的取等条件。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=11) |
| 20 | 大题 / 11 | 二次型与合同/标准形 | 正交化与正交矩阵、矩阵相似、特征值特征向量、相似对角化 | 正交合同同时为相似，先求不变量参数，再求连接两二次型的正交矩阵。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=12) |
| 21 | 大题 / 11 | 相似对角化 | 矩阵相似、特征值特征向量、向量组线性相关与极大无关组 | 由非特征向量构成循环基，求该基下矩阵并用不同特征值判定对角化。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=13) |
| 22 | 大题 / 11 | 联合/边缘/条件分布 | 多维函数分布、变量独立性、分布函数与常见分布 | 按伯努利开关分情况求联合分布函数及正态边缘分布。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=14) |
| 23 | 大题 / 11 | 点估计与区间估计 | 条件概率/全概/贝叶斯、分布函数与常见分布 | 由寿命分布求生存和条件生存概率，再估计已知形状参数下的尺度。 | [原题](../frontend/public/math/exams/math1/2020.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2020-answer.pdf#page=15) |

## 2021 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 5 | 导数定义与几何意义 | 洛必达与泰勒 | 对连续补定义的指数比式求零点导数。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=2) |
| 2 | 选择 / 5 | 偏导与全微分 | — | 沿两条参数曲线求导得到两个偏导组成的线性方程。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=2) |
| 3 | 选择 / 5 | 洛必达与泰勒 | — | 正弦与倒数展开相乘，截取三阶泰勒多项式。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=2) |
| 4 | 选择 / 5 | 定积分定义与性质 | — | 按黎曼和的区间长度及取样点判断定积分表达式。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=3) |
| 5 | 选择 / 5 | 二次型与合同/标准形 | — | 通过化平方或合同变换确定正负惯性指数。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=3) |
| 6 | 选择 / 5 | 正交化与正交矩阵 | — | 题干直接给出施密特正交化结构，由内积为零确定投影系数。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=3) |
| 7 | 选择 / 5 | 矩阵的秩 | 矩阵运算与初等变换 | 分块初等变换结合实矩阵及其格拉姆矩阵秩相等。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=4) |
| 8 | 选择 / 5 | 条件概率/全概/贝叶斯 | 事件独立性、概率公理与古典概型 | 用全概率与补事件关系判断条件概率及独立性命题。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=4) |
| 9 | 选择 / 5 | 点估计与区间估计 | 期望方差协方差、联合/边缘/条件分布 | 二维正态样本均值差的无偏性及协方差修正。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=5) |
| 10 | 选择 / 5 | 假设检验 | 样本与抽样分布、分布函数与常见分布 | 在备择参数下计算样本均值落入接受域的概率。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=5) |
| 11 | 填空 / 5 | 反常积分 | 换元/分部/有理函数 | 配方后用反正切原函数计算无穷积分。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=6) |
| 12 | 填空 / 5 | 求导法则与高阶导 | — | 参数方程二阶导数的链式换算。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=6) |
| 13 | 填空 / 5 | 欧拉方程等 | — | 欧拉方程幂函数试解并由初值确定系数。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=6) |
| 14 | 填空 / 5 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式、三重积分 | 封闭椭圆柱面外侧通量用高斯公式及对称性计算。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=7) |
| 15 | 填空 / 5 | 余子式与代数余子式 | 逆矩阵、伴随与分块、行列式定义与性质 | 由各行和为常数及伴随矩阵恒等式求代数余子式之和。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=7) |
| 16 | 填空 / 5 | 期望方差协方差 | 联合/边缘/条件分布、条件概率/全概/贝叶斯 | 转移球后按首次取球颜色建立二维分布并求相关系数。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=7) |
| 17 | 大题 / 10 | 未定式与求极限技巧 | 洛必达与泰勒、定积分定义与性质 | 对变上限积分和两个奇异比式统一展开消去低阶项。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=8) |
| 18 | 大题 / 12 | 幂级数展开与求和 | 数项级数判敛 | 分拆指数几何级数与幂级数，取收敛域交集并求和。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=9) |
| 19 | 大题 / 12 | 极值与条件极值 | 偏导与全微分、二次曲面与空间曲线 | 两曲面交线上的点到坐标面距离最大，消元或乘子法求条件极值。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=10) |
| 20 | 大题 / 12 | 第二类曲线积分 | 二重积分、格林 / 高斯 / 斯托克斯公式 | 先按被积函数正负选最优圆域，再处理有奇点的闭路积分。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=10) |
| 21 | 大题 / 12 | 相似对角化 | 正交化与正交矩阵、特征值特征向量、正定二次型 | 构造单位正交特征向量使对称矩阵对角化，并求正定平方根。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=11) |
| 22 | 大题 / 12 | 随机变量函数的分布 | 多维函数分布、期望方差协方差、分布函数与常见分布 | 随机分割区间求短段密度、长短比密度及比值期望。 | [原题](../frontend/public/math/exams/math1/2021.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2021-answer.pdf#page=13) |

## 2022 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 5 | 极限定义与性质 | 无穷小与无穷大 | 由函数与对数比式极限推出函数趋零，不能推出点值或导数。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=2) |
| 2 | 选择 / 5 | 偏导与全微分 | 求导法则与高阶导 | 计算齐次复合式偏导组合，反求外函数及导数。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=2) |
| 3 | 选择 / 5 | 数列极限 | 函数性质（奇偶/周期/有界/单调）、连续性与间断点 | 利用给定区间上的单调可逆性判断复合数列极限与原数列极限。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=2) |
| 4 | 选择 / 5 | 定积分定义与性质 | — | 在固定区间上比较三个被积函数以判断积分大小。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=2) |
| 5 | 选择 / 5 | 相似对角化 | 特征值特征向量、向量组线性相关与极大无关组 | 区分不同特征值、特征向量线性无关与两两无关对可对角化的作用。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=3) |
| 6 | 选择 / 5 | 公共解与同解 | 基础解系与解的结构、矩阵运算与初等变换 | 利用同解齐次方程组的零空间关系判断分块方程组是否同解。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=3) |
| 7 | 选择 / 5 | 向量组线性相关与极大无关组 | 矩阵的秩、行列式的计算 | 讨论含参三向量组的秩与相互表示条件。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=3) |
| 8 | 选择 / 5 | 期望方差协方差 | 分布函数与常见分布 | 由均匀和泊松变量方差及已知协方差求线性组合方差。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=4) |
| 9 | 选择 / 5 | 切比雪夫不等式 | 期望方差协方差、变量独立性 | 对独立平方变量的样本均值直接使用切比雪夫不等式，不是中心极限定理。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=4) |
| 10 | 选择 / 5 | 期望方差协方差 | 联合/边缘/条件分布 | 由条件正态分布求条件矩，再算协方差和相关系数。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=4) |
| 11 | 填空 / 5 | 方向导数与梯度 | 偏导与全微分 | 最大方向导数等于给定点梯度的模。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=4) |
| 12 | 填空 / 5 | 换元/分部/有理函数 | — | 对数与根式乘积的换元及分部积分。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=5) |
| 13 | 填空 / 5 | 极值与条件极值 | 单调/凹凸/极值/作图 | 把恒成立不等式化为第一象限含边界的最大值问题。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=5) |
| 14 | 填空 / 5 | 数项级数判敛 | 未定式与求极限技巧 | 对含指数参数的正项级数用比值判别，再检验临界点通项。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=5) |
| 15 | 填空 / 5 | 矩阵运算与初等变换 | 逆矩阵、伴随与分块 | 整理含逆矩阵的矩阵方程，并利用同一矩阵函数可交换化简。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=6) |
| 16 | 填空 / 5 | 条件概率/全概/贝叶斯 | 事件独立性、概率公理与古典概型 | 互斥与独立并用，计算并事件作为条件的概率。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=6) |
| 17 | 大题 / 10 | 一阶方程（可分离/齐次/线性） | 渐近线、未定式与求极限技巧 | 求一阶线性初值解，再按渐近线定义分析无穷远。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=6) |
| 18 | 大题 / 12 | 二重积分 | — | 直线圆弧围成区域需拆分或换极坐标计算有理式二重积分。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=7) |
| 19 | 大题 / 12 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式、第二类曲面积分、二重积分 | 由右手定向使用斯托克斯公式，再投影并作椭圆极坐标积分。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=7) |
| 20 | 大题 / 12 | 积分等式与不等式 | 单调/凹凸/极值/作图、中值定理、微分等式与不等式、洛必达与泰勒 | 证明凸性与积分中点不等式的充要关系，逆向用局部泰勒展开。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=8) |
| 21 | 大题 / 12 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量、相似对角化、基础解系与解的结构 | 题干明确要求正交变换化标准形，再求二次型为零的齐次解。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=8) |
| 22 | 大题 / 12 | 点估计与区间估计 | 期望方差协方差、变量独立性、分布函数与常见分布 | 两组不同尺度的独立指数样本联合构造似然函数并求估计方差。 | [原题](../frontend/public/math/exams/math1/2022.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2022-answer.pdf#page=9) |

## 2023 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 5 | 渐近线 | 未定式与求极限技巧、洛必达与泰勒 | 按斜渐近线斜率和截距极限计算对数函数渐近线。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=2) |
| 2 | 选择 / 5 | 二阶常系数线性方程 | 函数性质（奇偶/周期/有界/单调） | 由全实轴解有界限制特征根实部及根重数。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=2) |
| 3 | 选择 / 5 | 导数定义与几何意义 | 求导法则与高阶导、连续性与间断点 | 把含绝对值参数式分段，依次判断函数与各阶导数的连续可导性。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=2) |
| 4 | 选择 / 5 | 数项级数判敛 | — | 利用两个收敛级数的非负差建立绝对收敛的等价关系。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=3) |
| 5 | 选择 / 5 | 矩阵的秩 | 矩阵运算与初等变换 | 通过分块消元和零乘积约束比较三个矩阵的秩。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=3) |
| 6 | 选择 / 5 | 相似对角化 | 特征值特征向量、矩阵的秩 | 不同特征值、实对称性及重根特征空间维数判断可对角化。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=3) |
| 7 | 选择 / 5 | 向量组线性相关与极大无关组 | 公共解与同解、基础解系与解的结构 | 两向量组公共表示转成齐次方程组，求公共生成向量。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=4) |
| 8 | 选择 / 5 | 期望方差协方差 | 分布函数与常见分布 | 按泊松变量相对均值的取值分段计算绝对离差期望。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=4) |
| 9 | 选择 / 5 | 样本与抽样分布 | — | 两个独立正态样本方差标准化后构造F分布。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=4) |
| 10 | 选择 / 5 | 点估计与区间估计 | 多维函数分布、期望方差协方差、分布函数与常见分布 | 正态样本之差取绝对值后的期望用于确定无偏估计系数。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=5) |
| 11 | 填空 / 5 | 无穷小与无穷大 | 洛必达与泰勒 | 匹配对数与指数余弦差的最低非零阶项。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=5) |
| 12 | 填空 / 5 | 隐函数与几何应用 | 偏导与全微分 | 用显式曲面偏导写切平面方程。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=5) |
| 13 | 填空 / 5 | 傅里叶级数 | 换元/分部/有理函数 | 求余弦系数或利用傅里叶展开在端点的取值计算偶数项和。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=5) |
| 14 | 填空 / 5 | 定积分定义与性质 | 换元/分部/有理函数 | 用平移换元和已知函数差关系计算不同区间积分。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=6) |
| 15 | 填空 / 5 | 正交化与正交矩阵 | 向量组线性相关与极大无关组 | 三个向量两两正交，由投影内积关系分别求展开系数。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=6) |
| 16 | 填空 / 5 | 分布函数与常见分布 | 变量独立性 | 独立二项变量相等事件按共同取值求和。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=7) |
| 17 | 大题 / 10 | 微分方程应用 | 一阶方程（可分离/齐次/线性）、导数定义与几何意义、定积分定义与性质、单调/凹凸/极值/作图 | 由切线截距建立一阶方程，再求积分函数的全局最大值。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=7) |
| 18 | 大题 / 12 | 极值与条件极值 | 偏导与全微分 | 二阶判别退化的原点需要按定义选路径检验，其余驻点作Hessian判别。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=7) |
| 19 | 大题 / 12 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式、三重积分 | 注意dy乘dx的符号，以高斯公式计算封闭柱体外向通量。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=8) |
| 20 | 大题 / 12 | 洛必达与泰勒 | 中值定理、微分等式与不等式、连续性与间断点、单调/凹凸/极值/作图 | 利用二阶泰勒余项与介值性证明二阶导数等式和估计。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=9) |
| 21 | 大题 / 12 | 二次型与合同/标准形 | 正交化与正交矩阵、矩阵相似、特征值特征向量 | 先配方构造可逆合同变换，再用正交合同等于相似及迹不等排除正交变换。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=10) |
| 22 | 大题 / 12 | 期望方差协方差 | 联合/边缘/条件分布、变量独立性、多维函数分布、二重积分 | 计算协方差、判别变量独立性，并求平方和的连续分布。 | [原题](../frontend/public/math/exams/math1/2023.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2023-answer.pdf#page=11) |

## 2024 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 5 | 定积分定义与性质 | 函数性质（奇偶/周期/有界/单调） | 利用偶函数积分的奇性与复合上限判断奇偶性、周期性。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=2) |
| 2 | 选择 / 5 | 第二类曲面积分 | 偏导与全微分 | 将球面上侧的坐标面积元投影到水平面，注意法向量符号。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=2) |
| 3 | 选择 / 5 | 幂级数展开与求和 | — | 取和函数的偶部，再求导得到偶次系数的加权和。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=2) |
| 4 | 选择 / 5 | 导数定义与几何意义 | 连续性与间断点 | 区分函数极限、点值、导数存在及导函数连续的关系。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=2) |
| 5 | 选择 / 5 | 有解判别与含参讨论 | 矩阵的秩、平面与直线 | 由三个平面的位置关系判断系数矩阵与增广矩阵的秩。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=2) |
| 6 | 选择 / 5 | 向量组线性相关与极大无关组 | 矩阵的秩 | 整体相关且任意两向量无关，用秩二及子组条件确定参数。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=3) |
| 7 | 选择 / 5 | 特征值特征向量 | 正交化与正交矩阵、相似对角化、矩阵的秩 | 沿零空间与其正交补分解，识别投影矩阵特征值并求幂的迹。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=3) |
| 8 | 选择 / 5 | 多维函数分布 | 变量独立性、分布函数与常见分布 | 两种独立正态线性组合标准化后比较概率确定阈值。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=3) |
| 9 | 选择 / 5 | 期望方差协方差 | 联合/边缘/条件分布、分布函数与常见分布 | 用条件均匀分布的均值或联合密度求混合矩与协方差。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=4) |
| 10 | 选择 / 5 | 多维函数分布 | 变量独立性、分布函数与常见分布 | 两个独立同参数指数变量之差取绝对值后的分布。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=4) |
| 11 | 填空 / 5 | 未定式与求极限技巧 | 洛必达与泰勒、无穷小与无穷大 | 把可变指数写成指数对数形式，比较三阶项确定参数。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=4) |
| 12 | 填空 / 5 | 偏导与全微分 | 求导法则与高阶导 | 由全微分读取偏导，并对复合曲线函数二次求导。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=4) |
| 13 | 填空 / 5 | 傅里叶级数 | 换元/分部/有理函数、无穷小与无穷大 | 计算余弦系数的奇数项，再用正弦等价无穷小求极限。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=5) |
| 14 | 填空 / 5 | 一阶方程（可分离/齐次/线性） | — | 用x与y的和换元，或交换自变量解一阶初值方程。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=5) |
| 15 | 填空 / 5 | 正定二次型 | 二次型与合同/标准形、行列式定义与性质 | 二次型版本柯西不等式对应半正定条件，由主子式确定参数。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=5) |
| 16 | 填空 / 5 | 条件概率/全概/贝叶斯 | 事件独立性、分布函数与常见分布 | 三次伯努利试验在至少成功一次条件下求全成功概率。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=5) |
| 17 | 大题 / 10 | 二重积分 | — | 圆弧与竖线间区域按直角坐标先对x积分，利用对称性简化。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=6) |
| 18 | 大题 / 12 | 极值与条件极值 | 隐函数与几何应用、偏导与全微分、平面与直线 | 先求切平面及其三角形投影，再比较内部驻点、边界和顶点值。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=6) |
| 19 | 大题 / 12 | 洛必达与泰勒 | 中值定理、微分等式与不等式、积分等式与不等式 | 由二阶导数界估计线性插值误差，再积分得到梯形求积误差界。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=6) |
| 20 | 大题 / 12 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式、第二类曲面积分、平面与直线 | 球面与斜平面交线上的空间定向积分，用斯托克斯公式选平面曲面。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=7) |
| 21 | 大题 / 12 | 相似对角化 | 特征值特征向量、矩阵运算与初等变换 | 把三数列递推写成矩阵递推，用对角化求幂及数列通项。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=7) |
| 22 | 大题 / 12 | 点估计与区间估计 | 样本与抽样分布、期望方差协方差 | 均匀总体最大值的矩用于无偏估计及均方误差最小化。 | [原题](../frontend/public/math/exams/math1/2024.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2024-answer.pdf#page=8) |

## 2025 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 5 | 单调/凹凸/极值/作图 | 定积分定义与性质、洛必达与泰勒 | 利用积分局部展开或导数符号区分极值点与拐点。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=2) |
| 2 | 选择 / 5 | 数项级数判敛 | 洛必达与泰勒、无穷小与无穷大 | 三角通项转为交错形式，再用泰勒展开及比较判别区分绝对和条件收敛。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=2) |
| 3 | 选择 / 5 | 未定式与求极限技巧 | 洛必达与泰勒、定积分定义与性质 | 检验函数极限、导数极限和积分平均值极限的推导关系。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=3) |
| 4 | 选择 / 5 | 二重积分 | — | 抛物线与水平线之间区域交换积分次序时必须拆成左右两段。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=3) |
| 5 | 选择 / 5 | 二次型与合同/标准形 | — | 将二次型配方为一正一负平方项并确定正惯性指数。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=3) |
| 6 | 选择 / 5 | 基础解系与解的结构 | 向量组线性相关与极大无关组、矩阵的秩、平面与直线 | 由向量组秩二及一个非零特解判断解集为不过原点的直线。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=4) |
| 7 | 选择 / 5 | 矩阵的秩 | — | 用Sylvester乘积秩不等式及题设取等条件推导各级乘积的秩关系。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=4) |
| 8 | 选择 / 5 | 期望方差协方差 | 联合/边缘/条件分布 | 由相关系数写线性组合方差，在单位圆约束下取最大值。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=4) |
| 9 | 选择 / 5 | 分布函数与常见分布 | 事件独立性 | 将伯努利样本和作为二项分布，再用泊松近似计算小计数概率。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=4) |
| 10 | 选择 / 5 | 假设检验 | 样本与抽样分布、分布函数与常见分布 | 已知方差的正态均值单侧检验，构造标准化拒绝域。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=5) |
| 11 | 填空 / 5 | 未定式与求极限技巧 | 无穷小与无穷大 | 用指数对数展开处理x的x次幂与对数乘积的极限。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=5) |
| 12 | 填空 / 5 | 傅里叶级数 | 函数性质（奇偶/周期/有界/单调） | 按奇延拓与周期化确定间断点处傅里叶级数和的左右均值。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=5) |
| 13 | 填空 / 5 | 方向导数与梯度 | 向量代数、偏导与全微分 | 梯度与单位化方向向量的内积。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=6) |
| 14 | 填空 / 5 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式 | 沿定向抛物线参数化，或补线后使用格林公式。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=6) |
| 15 | 填空 / 5 | 公共解与同解 | 基础解系与解的结构、矩阵的秩、行列式的计算 | 由A与平方矩阵的零空间不同推出存在非零中间像，再用行列式为零及秩关系确定参数。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=7) |
| 16 | 填空 / 5 | 条件概率/全概/贝叶斯 | 事件独立性、概率公理与古典概型 | 由并事件概率求边缘概率，再求恰好一个发生的条件概率。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=8) |
| 17 | 大题 / 10 | 换元/分部/有理函数 | — | 有理函数部分分式分解及二次式配方积分。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=8) |
| 18 | 大题 / 12 | 欧拉方程等 | 偏导与全微分、一阶方程（可分离/齐次/线性） | 二阶复合偏导关系化为欧拉方程，再降阶并代入初值。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=9) |
| 19 | 大题 / 12 | 中值定理、微分等式与不等式 | 单调/凹凸/极值/作图 | 用中值定理证明导数严格递增与相邻弦斜率严格递增等价。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=9) |
| 20 | 大题 / 12 | 第二类曲面积分 | 格林 / 高斯 / 斯托克斯公式、二次曲面与空间曲线、向量代数、三重积分 | 先建立绕斜轴旋转圆锥，补截面后用高斯公式求侧面通量。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=10) |
| 21 | 大题 / 12 | 特征值特征向量 | 基础解系与解的结构、矩阵运算与初等变换 | 由特征多项式重根求参数，再把两个矩阵作用条件化为平方零空间问题。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=10) |
| 22 | 大题 / 12 | 随机变量函数的分布 | 期望方差协方差、联合/边缘/条件分布、条件概率/全概/贝叶斯、分布函数与常见分布 | 先求免赔额变换的赔付概率与期望，再用条件二项和泊松混合求理赔次数分布。 | [原题](../frontend/public/math/exams/math1/2025.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2025-answer.pdf#page=11) |

## 2026 年逐题记录

| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |
|---|---|---|---|---|---|
| 1 | 选择 / 5 | 隐函数与几何应用 | 偏导与全微分 | 对含指数的二元隐函数关系求偏导并组合。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=2) |
| 2 | 选择 / 5 | 幂级数展开与求和 | 数项级数判敛 | 按奇偶指标拆成幂级数分别求半径并检查两个端点。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=2) |
| 3 | 选择 / 5 | 单调/凹凸/极值/作图 | — | 区分极小值与两侧单调性，并用凸函数弦斜率性质判断命题。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=2) |
| 4 | 选择 / 5 | 三重积分 | 二次曲面与空间曲线 | 球面与圆锥围成空间区域，正确设置球坐标角度和雅可比。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=3) |
| 5 | 选择 / 5 | 逆矩阵、伴随与分块 | 矩阵运算与初等变换、正交化与正交矩阵、行列式定义与性质 | 置换矩阵列为单位正交向量，逆为转置，伴随还取决于行列式符号。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=3) |
| 6 | 选择 / 5 | 向量组线性相关与极大无关组 | 有解判别与含参讨论、矩阵运算与初等变换 | 列向量可表示写成矩阵分解，从而传递非齐次方程有解性。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=4) |
| 7 | 选择 / 5 | 二次型与合同/标准形 | 正交化与正交矩阵、特征值特征向量、二次曲面与空间曲线 | 由圆柱面退化条件求参数，再区分正交标准形与规范形。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=2) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=4) |
| 8 | 选择 / 5 | 期望方差协方差 | 分布函数与常见分布 | 用方差加均值平方求平移变量二阶矩的最小值。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=4) |
| 9 | 选择 / 5 | 随机变量函数的分布 | 期望方差协方差、分布函数与常见分布 | 由分布函数的仿射变换识别变量缩放，匹配期望零和方差一。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=5) |
| 10 | 选择 / 5 | 条件概率/全概/贝叶斯 | 分布函数与常见分布 | 对两项几何尾概率的混合计算条件尾概率，比较无记忆性不等式。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=5) |
| 11 | 填空 / 5 | 偏导与全微分 | 向量代数 | 先求向量叉积，再按散度定义求偏导之和。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=5) |
| 12 | 填空 / 5 | 未定式与求极限技巧 | 洛必达与泰勒、无穷小与无穷大 | 统一分母后使用对数及正弦泰勒展开求极限。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=6) |
| 13 | 填空 / 5 | 求导法则与高阶导 | — | 参数曲线二阶导数并在给定角度求值。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=6) |
| 14 | 填空 / 5 | 反常积分 | 换元/分部/有理函数 | 无穷区间对数积分通过分部积分转为有理积分。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=6) |
| 15 | 填空 / 5 | 特征值特征向量 | 行列式的计算 | 分别计算分块三角矩阵与另一非对称矩阵的实特征值，比较最大值确定参数。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=3) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=7) |
| 16 | 填空 / 5 | 期望方差协方差 | 变量独立性、分布函数与常见分布 | 利用X与Y减X独立及泊松变量的矩计算乘积期望。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=7) |
| 17 | 大题 / 10 | 极值与条件极值 | 偏导与全微分 | 求驻点并用二阶偏导判别二元函数极值。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=7) |
| 18 | 大题 / 12 | 二阶常系数线性方程 | 偏导与全微分、第二类曲线积分 | 全微分相容条件导出一阶守恒关系，再解二阶常系数初值方程。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=8) |
| 19 | 大题 / 12 | 第二类曲线积分 | 格林 / 高斯 / 斯托克斯公式 | 分离恰当微分项，补直径闭合椭圆弧后用格林公式。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=8) |
| 20 | 大题 / 12 | 中值定理、微分等式与不等式 | 定积分定义与性质、积分等式与不等式 | 先用严格单调比较两半区间积分，再利用三个零点两次应用罗尔定理。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=9) |
| 21 | 大题 / 12 | 向量组线性相关与极大无关组 | 矩阵的秩、矩阵运算与初等变换 | 证明极大无关组并求满秩分解，再以低阶乘积计算高次幂。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=4) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=9) |
| 22 | 大题 / 12 | 点估计与区间估计 | 样本与抽样分布、期望方差协方差、变量独立性、分布函数与常见分布 | 独立指数样本最小值给出无偏估计及方差，再求定数截尾似然估计。 | [原题](../frontend/public/math/exams/math1/2026.pdf#page=5) / [解析](../frontend/public/math/exams/math1/answers/2026-answer.pdf#page=10) |
