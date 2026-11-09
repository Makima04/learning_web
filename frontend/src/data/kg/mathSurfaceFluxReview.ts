// 第二类曲面积分：自编例题覆盖投影、补面、参数化与奇点，演算可交叉核对。
import type { KnowledgeReview, ReviewBlock } from "@/lib/kg/knowledgeReview";
import { text as t, math as m, step as s } from "./mathReviewBuilder";

const paraboloid: ReviewBlock[] = [
  t("求上侧通量；可切换路线对照两种解法。"),
  m`\Sigma:z=1-x^2-y^2,\quad z\ge0,\qquad F=(x,y,z+1)`,
  m`I=\iint_\Sigma x\,dy\,dz+y\,dz\,dx+(z+1)\,dx\,dy`,
];

export const MATH_SURFACE_FLUX_REVIEW: KnowledgeReview = {
  kpId: "calc.m.surf2",
  title: "第二类曲面积分",
  description: "投影、补面、参数化与挖洞：公式速查＋完整推导。",
  opening: "先定面侧、查奇点，再比较直接投影与补面高斯的计算量。",
  scope: "例题为自编；投影与补面对照同一题，配套练习按考点和题型匹配。",
  defaultRouteId: "gauss",
  knowledge: [
    t("① 定向与投影：n 为单位法向量，换侧整体变号。"),
    m`\begin{aligned}
      F&=(P,Q,R),\qquad I_{-\Sigma}=-I_\Sigma,\\
      I_\Sigma&=\iint_\Sigma P\,dy\,dz+Q\,dz\,dx+R\,dx\,dy
      =\iint_\Sigma F\cdot n\,dS.
    \end{aligned}`,
    m`\begin{aligned}
      z=g(x,y),\ \text{上侧}:\quad
      n&=\frac{(-g_x,-g_y,1)}{\sqrt{1+g_x^2+g_y^2}},\\
      dS&=\sqrt{1+g_x^2+g_y^2}\,dx\,dy,\\
      n\,dS&=(-g_x,-g_y,1)\,dx\,dy.
    \end{aligned}`,
    m`\boxed{I_{\text{上}}=\iint_D[-Pg_x-Qg_y+R]_{z=g(x,y)}\,dx\,dy}`,
    t("根号已抵消，不再乘面积因子；P、Q、R 均代入曲面方程。"),
    t("② 高斯与补面：边界分片光滑，F 在实体及其邻域内为 C¹，均取外侧。"),
    m`\operatorname{div}F=P_x+Q_y+R_z,\qquad
      \Phi_{\partial V}=\iiint_V\operatorname{div}F\,dV`,
    m`\partial V=\Sigma\cup S\quad\Longrightarrow\quad
      \boxed{\Phi_\Sigma=\iiint_V\operatorname{div}F\,dV-\Phi_S}`,
    m`S:z=c,\qquad\Phi_S=\begin{cases}
      \displaystyle\iint_D R(x,y,c)\,dx\,dy,&\text{上盖},\\[4pt]
      \displaystyle-\iint_D R(x,y,c)\,dx\,dy,&\text{下底}.
    \end{cases}`,
    t("③ 参数化：叉积按指定面侧取向，无需单位化。"),
    m`\boxed{I=\iint_D F(r(u,v))\cdot(r_u\times r_v)\,du\,dv}`,
    t("④ 选法速查"),
    {
      type: "table",
      headers: ["题目结构", "优先尝试", "检查"],
      rows: [
        ["显式面、投影简单", "直接投影", "面侧、代入"],
        ["闭面、散度简单", "高斯", "内部无奇点"],
        ["开面、易补平面", "补面高斯", "补面通量与符号"],
        ["柱面、旋转面", "换投影或参数化", "叉积方向"],
        ["内部有奇点", "挖洞后用高斯", "内边界朝洞里"],
      ],
    },
    t("奇偶性检查点乘后的被积函数；有奇点不能只看散度。"),
  ],
  routes: [
    {
      id: "projection",
      title: "投影与参数化",
      cue: "先写有向面积元，再做普通二重积分",
      lessons: [
        {
          id: "paraboloid-projection",
          label: "抛物面直接投影（自编）",
          prompt: paraboloid,
          signals: ["z 能显式表示", "上侧", "投影为圆盘"],
          recognition: "显式面直接投影；圆盘上的径向函数改用极坐标。",
          showWorkingByDefault: true,
          steps: [
            s("确定投影", "投影是圆盘，不是圆周。",
              m`z\ge0\ \Longrightarrow\ D:\ x^2+y^2\le1,\qquad g=1-x^2-y^2`),
            s("写有向面积元", "上侧要求第三分量为正。",
              m`g_x=-2x,\quad g_y=-2y`,
              m`n\,dS=(-g_x,-g_y,1)\,dx\,dy=(2x,2y,1)\,dx\,dy`),
            s("代入、点乘", "三个分量都代入，再合并。",
              m`F(x,y,g)=(x,y,2-x^2-y^2)`,
              m`F\cdot n\,dS=(2x^2+2y^2+2-x^2-y^2)\,dx\,dy`,
              m`I=\iint_D(2+x^2+y^2)\,dx\,dy`),
            s("极坐标积分", "面积元含雅可比 r。",
              m`\begin{aligned}
                I&=\int_0^{2\pi}\!d\theta\int_0^1(2+r^2)r\,dr\\
                 &=2\pi\left[r^2+\frac{r^4}{4}\right]_0^1=\boxed{\frac{5\pi}{2}}.
              \end{aligned}`),
          ],
          checkpoint: "三个分量都代入；不再乘根号。下侧通量为 −5π/2。",
          techniques: [
            { title: "为什么 x、y 项不能用对称性删掉？", content: [
              t("先点乘，再判断奇偶性："),
              m`x\,dy\,dz+y\,dz\,dx\ \longmapsto\ (2x^2+2y^2)\,dx\,dy`,
            ] },
            { title: "什么时候比高斯更省事？", content: [
              t("本题投影只需一个径向积分，步骤比补面更少。"),
            ] },
            { title: "换投影面：循环记忆", content: [
              m`x=g(y,z),\quad n_x>0:\qquad n\,dS=(1,-g_y,-g_z)\,dy\,dz`,
              m`y=g(z,x),\quad n_y>0:\qquad n\,dS=(-g_x,1,-g_z)\,dz\,dx`,
              t("反侧整体变号；仅有 R 项时，上侧直接积分 R(x,y,g)。"),
            ] },
          ],
          references: [],
          selfCheck: {
            question: "本题的 x dydz 与 y dzdx 两项，能因 x、y 是奇函数而删掉吗？",
            options: ["不能，投影后对应 2x² 与 2y²", "能，单位圆盘关于两轴对称"],
            correctIndex: 0,
            explanation: "点乘后是 2x²、2y²，均为偶函数。",
          },
        },
        {
          id: "cylinder-parameter",
          label: "柱面侧面参数化（自编）",
          prompt: [t("求侧面外向通量，不含底面。"),
            m`\Sigma:x^2+y^2=a^2,\quad0\le z\le h,\quad a,h>0,\qquad F=(x,y,z)`],
          signals: ["柱面侧面", "外侧", "向 xy 平面投影退化"],
          recognition: "向 xy 平面投影退化为圆周；改用周向角与高度参数化。",
          showWorkingByDefault: true,
          steps: [
            s("设参数", "参数域为矩形。",
              m`r(\theta,z)=(a\cos\theta,a\sin\theta,z),\quad0\le\theta\le2\pi,\ 0\le z\le h`),
            s("叉乘定向", "叉积径向向外；顺序不能交换。",
              m`r_\theta=(-a\sin\theta,a\cos\theta,0),\qquad r_z=(0,0,1)`,
              m`r_\theta\times r_z=(a\cos\theta,a\sin\theta,0)`),
            s("点乘", "法向的 z 分量为零。",
              m`F(r)\cdot(r_\theta\times r_z)=a^2\cos^2\theta+a^2\sin^2\theta=a^2`),
            s("积分并核对", "叉积已含面积因子；再用补面法核对。",
              m`I=\int_0^{2\pi}\!d\theta\int_0^h a^2\,dz=2\pi a^2h`,
              m`\begin{aligned}
                \Phi_{\partial V}&=3\pi a^2h,\quad\Phi_{\text{顶}}=\pi a^2h,\quad\Phi_{\text{底}}=0,\\
                I&=\Phi_{\partial V}-\Phi_{\text{顶}}-\Phi_{\text{底}}=2\pi a^2h.
              \end{aligned}`),
          ],
          checkpoint: "叉积已包含定向和面积因子，不再乘 a；本题只求侧面。",
          techniques: [
            { title: "隐式面怎样确定正负侧？", content: [
              t("梯度非零时为法向；外侧结合区域判断。本题："),
              m`H=x^2+y^2-a^2,\qquad\nabla H=(2x,2y,0)`,
              m`(r_\theta\times r_z)\cdot\nabla H=2a^2>0\quad\Longrightarrow\quad\text{向外}`,
            ] },
          ],
          references: [],
          selfCheck: {
            question: "如果把叉积换成 r_z×r_θ，算出的通量是什么？",
            options: ["仍为 2πa²h", "变为 −2πa²h，对应内侧"],
            correctIndex: 1,
            explanation: "交换叉积顺序，法向反向，通量变号。",
          },
        },
      ],
    },
    {
      id: "gauss",
      title: "补面与高斯",
      cue: "散度好算，还要算清补面贡献",
      lessons: [
        {
          id: "paraboloid-cap",
          label: "同一抛物面补面（自编）",
          prompt: paraboloid,
          signals: ["开曲面", "边界在 z=0", "散度为常数", "补面贡献不为零"],
          recognition: "补 z=0 圆盘；原面向上、底面向下，均为实体外侧。",
          showWorkingByDefault: true,
          steps: [
            s("补面、定向", "实体在底面与抛物面之间。",
              m`V:\ x^2+y^2\le1,\quad0\le z\le1-x^2-y^2`,
              m`S:\ z=0,\ x^2+y^2\le1,\qquad n_S=(0,0,-1)`),
            s("列高斯等式", "场处处光滑，两面均取外侧。",
              m`\operatorname{div}F=1+1+1=3`,
              m`I+\Phi_S=\iiint_V3\,dV,\qquad I=\iiint_V3\,dV-\Phi_S`),
            s("计算闭面通量", "柱坐标下按 z、r、θ 依次积分。",
              m`\begin{aligned}
                \Phi_{\partial V}&=3\int_0^{2\pi}\!d\theta\int_0^1\!r\,dr\int_0^{1-r^2}\!dz\\
                  &=6\pi\int_0^1(r-r^3)\,dr=\frac{3\pi}{2}.
              \end{aligned}`),
            s("计算底面通量", "底面向下，只取 −R(x,y,0)。",
              m`\Phi_S=\iint_D -(0+1)\,dx\,dy=-\pi`),
            s("闭面减底面", "减去带符号的 −π。",
              m`I=\Phi_{\partial V}-\Phi_S=\frac{3\pi}{2}-(-\pi)=\boxed{\frac{5\pi}{2}}`),
          ],
          checkpoint: "底面通量为 −π，应减去 −π；改取原面下侧时整体变号。",
          techniques: [
            { title: "补面为什么不一定为零？", content: [
              t("平面 z=0 不代表法向分量为零："),
              m`R(x,y,0)=1,\qquad F\cdot n_S=-1,\qquad\Phi_S=-\pi\ne0`,
            ] },
            { title: "变式：把 R 改成 z+c", content: [
              t("闭面通量不变，底面通量随 c 改变。"),
              m`F=(x,y,z+c),\qquad\operatorname{div}F=3`,
              m`\Phi_S=-c\pi,\qquad I=\frac{3\pi}{2}-(-c\pi)=\frac{3\pi}{2}+c\pi`,
              t("c=0 时底面通量为零；c=1 回到原题。"),
            ] },
            { title: "这题两种方法该选哪种？", content: [
              t("本题投影更短；原场复杂而散度简单时，优先比较补面法。"),
            ] },
          ],
          references: [],
          selfCheck: {
            question: "保持原题曲面与场不变，只把面侧改为下侧，通量是多少？",
            options: ["−5π/2", "−3π/2，闭面通量变号即可"],
            correctIndex: 0,
            explanation: "原面通量 5π/2 整体变号，不能漏算补面。",
          },
        },
        {
          id: "ellipsoid-closed",
          label: "闭椭球面用散度（自编）",
          prompt: [t("求闭椭球面的外向通量。"),
            m`\Sigma:\ x^2+\frac{y^2}{4}+\frac{z^2}{9}=1,\qquad F=(x,2y,3z)`],
          signals: ["闭曲面外侧", "场处处光滑", "散度为常数"],
          recognition: "闭面、场光滑、散度为常数，直接高斯。",
          showWorkingByDefault: true,
          steps: [
            s("检查条件、求散度", "闭面外侧；场在实体及其邻域内为 C¹。",
              m`\operatorname{div}F=1+2+3=6`),
            s("用高斯", "只需求实体体积。",
              m`I=\iiint_V6\,dV=6\operatorname{Vol}(V)`),
            s("换元求体积", "半轴为 1、2、3；缩放为单位球体。",
              m`x=u,\quad y=2v,\quad z=3w,\qquad |J|=6`,
              m`\operatorname{Vol}(V)=1\cdot2\cdot3\cdot\frac{4\pi}{3}=8\pi`),
            s("代回", "内侧取相反数。",
              m`I=6\cdot8\pi=48\pi`),
          ],
          checkpoint: "分母是半轴的平方；高斯乘实体体积，光滑性须覆盖内部。",
          techniques: [
            { title: "散度为零，什么时候闭面通量才为零？", content: [
              t("F 在实体及邻域内为 C¹ 时："),
              m`\operatorname{div}F\equiv0\quad\Longrightarrow\quad\Phi_{\partial V}=0`,
              t("内部有奇点时，不能直接作此推断。"),
            ] },
          ],
          references: [],
          selfCheck: {
            question: "若把闭椭球面改成上半椭球面，能直接照用 6×上半椭球体积吗？",
            options: ["能，散度没变", "需先补底面并检查其通量"],
            correctIndex: 1,
            explanation: "先补底面；本题在 z=0 时 R=3z=0，底面通量才为零。",
          },
        },
      ],
    },
    {
      id: "singularity",
      title: "奇点与挖洞",
      cue: "散度为零，也可能有非零通量",
      lessons: [
        {
          id: "radial-field",
          label: "反平方场的奇点（自编）",
          prompt: [t("求球面外向通量；奇点在球内。"),
            m`\Sigma:x^2+y^2+z^2=a^2,\quad a>0,\qquad F=\frac{(x,y,z)}{(x^2+y^2+z^2)^{3/2}}`],
          signals: ["分母在原点为零", "奇点位于实体内部", "非奇点处散度为零"],
          recognition: "球面点乘最短；若用高斯，先挖去原点邻域。",
          showWorkingByDefault: true,
          steps: [
            s("查奇点与散度", "F 在原点无定义，不能直接对整个球体用高斯。",
              m`\rho=\sqrt{x^2+y^2+z^2}`,
              m`\operatorname{div}F=\frac{3}{\rho^3}-\frac{3\rho^2}{\rho^5}=0\quad(\rho>0)`),
            s("直接点乘", "场与外法向同向。",
              m`n=\frac{(x,y,z)}a,\qquad F\cdot n=\frac1{a^2}`,
              m`I=\frac1{a^2}\cdot4\pi a^2=\boxed{4\pi}`),
            s("挖球，取剩余球壳", "0<ε<a；内边界的外法向朝原点。",
              m`V_\varepsilon:\ \varepsilon\le\rho\le a,\qquad n_{\rm inner}=-\frac{(x,y,z)}\varepsilon`),
            s("计算内边界通量", "场强与面积的 ε² 抵消，洞口贡献不能丢。",
              m`\Phi_{\rm inner}=-\frac1{\varepsilon^2}\cdot4\pi\varepsilon^2=-4\pi`,
              m`I+\Phi_{\rm inner}=\iiint_{V_\varepsilon}0\,dV=0
                \quad\Longrightarrow\quad I=4\pi`),
          ],
          checkpoint: "散度为零仅对 ρ>0 成立；内边界朝洞里，通量为 −4π。",
          techniques: [
            { title: "换成非球面的闭曲面怎么办？", content: [
              t("对光滑闭曲面的外侧，按奇点位置分类；在面上时另行判断："),
              m`\Phi_\Sigma=\begin{cases}4\pi,&0\in\operatorname{int}V,\\0,&0\notin\overline V.\end{cases}`,
            ] },
            { title: "变式：再加一个处处光滑的场", content: [
              t("利用线性性，奇异部分与光滑部分分开计算。"),
              m`F=\frac{(x,y,z)}{\rho^3}+(x,y,z),\qquad\Sigma:\rho=a`,
              m`I=4\pi+3\cdot\frac{4\pi a^3}{3}=4\pi+4\pi a^3`,
            ] },
          ],
          references: [],
          selfCheck: {
            question: "挖去半径 ε 的小球后，内边界对剩余球壳的外向通量是多少？",
            options: ["趋于 0，因为小球面积趋于 0", "−4π，因为法向朝洞里且场按 1/ε² 增长"],
            correctIndex: 1,
            explanation: "内边界通量为 (−1/ε²)×4πε²=−4π。",
          },
        },
      ],
    },
  ],
};
