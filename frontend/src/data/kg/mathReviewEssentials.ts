// 复合考点的常用分支公式，作为例题前的知识索引；不能省略相应适用条件。
import { text as t, math as m } from "./mathReviewBuilder";
import type { ReviewBlock } from "@/lib/kg/knowledgeReview";

export const MATH_REVIEW_ESSENTIALS: Readonly<Record<string, ReviewBlock[]>> = {
  "calc.d1.rules": [m`x=x(t),\ y=y(t):\quad\frac{dy}{dx}=\frac{y'}{x'},\quad\frac{d^2y}{dx^2}=\frac{y''x'-y'x''}{(x')^3}\quad(x'\ne0)`],
  "calc.d1.lhopital": [m`\sin x=x-\frac{x^3}{6}+o(x^3),\quad\ln(1+x)=x-\frac{x^2}{2}+o(x^2)`, t("复合泰勒展开要把内层量也按同一阶数展开；只在对应展开点附近使用。")],
  "calc.i1.tech": [t("有理函数：先用多项式除法化为真分式，再按实线性因子和不可约二次因子拆分；重因子逐阶列项。三角有理式可考虑 t=tan(x/2)，但需分区间检查变换。")],
  "calc.i1.app": [m`V_{\rm shell}=2\pi\int_a^b r(x)h(x)dx,\quad L=\int_a^b\sqrt{1+[f'(x)]^2}\,dx`, t("薄壳法中 r 为到轴的非负距离，h 为壳高；弧长公式用于分段光滑图形。")],
  "calc.m.partial": [m`z=f(u(x,y),v(x,y)):\quad z_x=f_u u_x+f_v v_x`, t("二阶复合偏导要再次对所有依赖变量求导；不能把随 x 变化的 fᵤ、fᵥ 当作常数。")],
  "calc.ode.1st": [t("可分离型：y′=f(x)g(y)，对 g(y)≠0 的解分离，另查 g(y)=0 的常值解。齐次型：令 y=ux，得到 y′=u+xu′，再分离。伯努利型：y′+Py=Qyⁿ，可在非零解上令 z=y¹⁻ⁿ 化为线性。")],
  "calc.ode.2nd": [t("两个不同实根 r₁、r₂：C₁eʳ¹ˣ+C₂eʳ²ˣ；重实根 r：(C₁+C₂x)eʳˣ；复根 α±iβ：eᵅˣ(C₁cosβx+C₂sinβx)。非齐次特解按右端的指数、多项式和三角结构试探，并检查共振。")],
  "calc.series.num": [t("正项级数的比值或根值极限存在时，小于 1 则收敛，大于 1 则发散；等于 1 不判定。交错级数应先查绝对收敛，再查绝对值通项是否最终单调趋零。")],
  "la.mat.inv": [m`\begin{pmatrix}A&0\\0&D\end{pmatrix}^{-1}=\begin{pmatrix}A^{-1}&0\\0&D^{-1}\end{pmatrix}`, t("该分块公式要求 A、D 分别可逆；一般分块矩阵不能逐块取逆。伴随矩阵在秩为 n、n−1、低于 n−1 时的秩分别为 n、1、0（n≥2）。")],
  "la.eig.diag": [m`A=P\Lambda P^{-1}\Rightarrow A^k=P\Lambda^kP^{-1}`, t("实对称矩阵的不同特征值对应的特征向量正交；重特征空间内还需做正交规范化，才能得到 QᵀAQ=Λ。")],
  "prob.rv.dist": [m`X\sim B(n,p):\ P(X=k)=\binom{n}{k}p^k(1-p)^{n-k}`, m`X\sim\operatorname{Pois}(\lambda):\ P(X=k)=e^{-\lambda}\lambda^k/k!`, m`X\sim\operatorname{Exp}(\lambda):\ f(x)=\lambda e^{-\lambda x}\ (x>0),\quad\lambda>0`, m`X\sim N(\mu,\sigma^2):\quad\frac{X-\mu}{\sigma}\sim N(0,1)\quad(\sigma>0)`],
  "prob.num.ex": [m`\operatorname{Cov}(X,Y)=E(XY)-E(X)E(Y),\quad\rho=\frac{\operatorname{Cov}(X,Y)}{\sqrt{D(X)D(Y)}}`, t("相关系数要求两个方差都有限且为正；独立时乘积的期望可分解，非独立时一般不行。")],
  "prob.stat.sample": [m`U\sim\chi^2(m),\ V\sim\chi^2(n),\ U\perp V\Rightarrow\frac{U/m}{V/n}\sim F(m,n)`, t("用样本均值中心化的离差平方和自由度为 n−1；已知总体均值时，用总体均值中心化则自由度为 n。")],
  "prob.stat.est": [m`\hat\mu_{\rm ML}=\bar X,\quad\hat\sigma^2_{\rm ML}=\frac1n\sum(X_i-\bar X)^2\quad(\text{正态模型})`, t("最大似然方差估计与分母为 n−1 的无偏样本方差不同。方差已知时，均值区间使用标准正态分位点；正态总体方差的区间由卡方枢轴量反解，反解时留意分母大小。")],
  "prob.stat.hyp": [t("备择 μ>μ₀ 使用右尾，μ<μ₀ 使用左尾，μ≠μ₀ 使用双尾。方差未知的正态单样本均值检验改用 t(n−1)；正态方差检验使用卡方统计量，不应继续套均值的 Z 公式。")],
};
