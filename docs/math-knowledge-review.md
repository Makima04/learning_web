# 数学知识复习模板

已覆盖现有数学图谱全部 73 个考点：高等数学 41、线性代数 17、概率论与数理统计 15。
原「求极值与最值」真题教案保留，其余 72 个考点各有概念公式、自编方法例题、演算步骤、易错检查与即时自测。
2026-11 考点去重：微分等式/不等式证明并入中值定理、不定积分计算并入积分技巧；格林/高斯/斯托克斯作为第二类曲线/曲面积分的模板，`calc.m.formula` 收窄为「散度、旋度与保守场」。
覆盖单位是当前图谱考点，不声称一份例题穷尽该考点的所有出题变化。

## 入口与导航

- 复习性价比的行动卡、考点排行行内「知识复习」、考点详情抽屉。
- 总入口 `/review-priority/knowledge`：按三科筛选、按考点或章节名称搜索；没有真题主标签记录的先修考点也能进入。
- 复习性价比页顶部「数学知识模板 · 73 个考点」（随图谱动态统计），行动卡「知识模板」，直接作答按钮明确标为「直接练题」。
- 知识图谱全部数学考点页的「看解题路线」。
- 独立路由 `/review-priority/knowledge/calc.m.ext`，沿用复习性价比分区的高亮与导航记忆。
- `route=free|constraint|region` 选择路线；`route=free&example=degenerate` 直达二阶判别失效真题。浏览器前进、后退与刷新保留选择。
- 从排行进入时携带 `kind`、`order`，返回时恢复该考点、分科及这两个筛选。
- 从知识复习或排行进入「考点与全部练习」时，用 `returnTo` 携带完整来源 URL。题集页返回来源，保留路线、例题与筛选，刷新及旧链接跳转后仍有效；没有来源则沿用原图谱层级。

## 内容结构

识别信号 → 解题路线 → 收尾检查为阅读主线；演算默认展开、可手动收起，具体技巧按需展开。可遮住路线尝试回忆，并用短判断题检验理解。

极值原教案继续使用逐题核对的原题与变化引用。其余方法例题明确标为「自编」，不伪造真题题干或题号。
新增配套题根据现有目录中的同考点、同题型匹配，按真题、李林 880、张宇 1000 排序；每个来源最多两题，教辅优先强化题。
同考点匹配不声称同解法；没有匹配时显示空状态，不跨题型静默补入大题。

- 无约束极值：2020 年第 15 题；另用 2023 年第 18 题解释二阶判别失效。
- 等式约束最值：2021 年第 19 题。
- 区域最值：2024 年第 18 题，完整处理内部、边界与顶点。

真题原卷、解析按现有题库元数据的 PDF 页码跳转。教辅题按 ID 按需补全题干，用现有 `PracticeQuestionCard` 直接练习。

## 实现与扩展

- `frontend/src/lib/kg/knowledgeReview.ts` 定义文字、公式、表格、步骤、技巧及原题引用的通用结构；轻量入口元数据与正文分离。
- `frontend/src/data/kg/mathExtremaReview.ts` 保存人工核对的教学内容，不修改自动生成的题库或考频数据。
- `mathCalculusReview.ts`、`mathLinearReview.ts`、`mathProbabilityReview.ts` 分科保存自编教学内容；`mathReviewEssentials.ts` 补充复合考点的常用分支公式，`mathKnowledgeReviews.ts` 统一注册。
- `mathReviewBuilder.ts` 统一结构并原样保存 TeX；入口元数据只依赖轻量图谱，完整教案仍只在知识路由加载。
- `frontend/src/pages/KnowledgeReviewPage.tsx` 负责通用布局、URL 选择、回忆、自测及配套作答。
- `MathFormula` 使用本地打包的 KaTeX 与字体，内容和配色跟随现有主题；公式滚动仅限自身。
- 新增主题时按同一结构整理内容、注册入口和正文，并校验来源 ID、题型与题组。

## 学习数据

回忆遮挡、演算展开和即时自测为当前阅读交互，不生成掌握记录。教辅评分、备注、收藏复用现有图谱与错题集，登录时经 `syncQueue` 入队；页面进入调用 `syncAccountData`，先推 pending 再拉服务端快照。没有新增本地独占的学习进度。

## 验证

`knowledgeReview.test.ts` 检查引用真题存在、PDF 与题图可用、教辅为正确来源的综合／强化大题、来源优先级、公式严格排版和深链回退。
`mathKnowledgeReviews.test.ts` 检查 73 个考点全覆盖、全部概念/演算公式严格排版、例题与自测完整、三种题型引用存在且匹配考点和来源。

## 条件核对参考

内容为自编，不转载教材段落。向量积分的定向与正则性条件参考 [Lamar University — Stokes 定理](https://tutorial.math.lamar.edu/classes/calcIII/stokestheorem.aspx)；线性代数知识体系参考 [MIT 18.06](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/)。
正态样本的卡方、t 分布及独立性前提核对 [Penn State STAT 414 第 26 课](https://online.stat.psu.edu/stat414/Lesson26) 与 [SFU 正态样本讲义](https://www.sfu.ca/~lockhart/richard/801/01_1/lectures/normal_samples/web.html)。

## 教材体系版（2026-11-09）

- `mathTextbookKnowledge.ts` 补入 74 个数学考点的公式、条件与符号说明，第二类曲面积分继续采用独立教案；全部例题默认显示演算。
- `cs408TextbookReview.ts` 新增 92 个 408 考点。算法用代码与状态表，计算用公式代入，概念用对照表，不把机制说明硬改成公式。
- 知识总入口支持数学／408 切换与分科搜索；复习性价比行动卡、排行、抽屉和图谱考点页都支持进入。
- 408 配套题按真题→王道匹配，同考点同题型，保留账号同步与原有作答写路径。
- `reviewTextbooks.ts` 保存体系参考书目；来源边界见 `knowledge-review-references.md`，不把体系参考宣称为官方指定或逐页原文核验。
- `textbookReviews.test.ts` 覆盖所有 167 个入口、公式严格排版、代码／表格、默认展开与 408 引用匹配。
