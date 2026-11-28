// 408 数据结构大题专用分类体系：按历年真题命题结构拆分为「算法题」与「应用题」两大类，
// 每类再按数据结构/高频考法细分专题与判别场景；王道题去重真题后按应试价值分层排序（高价值精选置顶）。
import type { Cs408HandoutMethod } from "@/data/kg/cs408HandoutMethods";
import type { BookId, KgModule } from "@/lib/kg/types";

export type DsBigGroup = "算法题" | "应用题";
export type DsBigWangdaoTier = "high" | "medium" | "low";

export interface DsBigChapter extends KgModule {
  bookId: BookId;
  bookName: string;
  group: DsBigGroup;
}

export interface DsBigSceneGuide extends Cs408HandoutMethod {
  opening: string;
}

export interface DsBigWangdaoMeta {
  sceneId: string;
  tier: DsBigWangdaoTier;
  rank: number;
}

export const DS_BIG_TIER_LABEL: Record<DsBigWangdaoTier, string> = {
  high: "高价值精选",
  medium: "基础巩固",
  low: "概念延伸",
};

interface SceneSpec {
  id: string;
  name: string;
  exams: readonly string[];
  /** 按价值从高到低排列：高价值精选 → 基础巩固 → 概念延伸（王道收录的 408 真题已在手稿层去重） */
  wangdao: {
    high?: readonly string[];
    medium?: readonly string[];
    low?: readonly string[];
  };
  guide: DsBigSceneGuide;
}

interface ChapterSpec {
  id: string;
  name: string;
  group: DsBigGroup;
  order: number;
  scenes: readonly SceneSpec[];
}

const CHAPTER_SPECS: readonly ChapterSpec[] = [
  // ==================== 一、算法题（18 真题 · 5 专题 · 12 场景） ====================
  {
    id: "ds-big-algo-array",
    name: "数组与顺序表算法",
    group: "算法题",
    order: 1,
    scenes: [
      {
        id: "ds.big.algo.array.two-pointer",
        name: "双指针、逆置与原地变换",
        exams: ["cs408-2020-q41", "cs408-2010-q42"],
        wangdao: {
          high: ["ds-big-2.2-7", "ds-big-2.2-9", "ds-big-8.6-2", "ds-big-8.3-1"],
          medium: ["ds-big-2.2-2", "ds-big-2.2-3", "ds-big-2.2-4", "ds-big-2.2-5", "ds-big-2.2-6", "ds-big-2.2-1", "ds-big-7.2-5"],
        },
        guide: {
          opening: "题目要求在数组上原地移动/删除/重排，或在多个有序数组上求公共元素/最小距离时，优先考虑双指针/三指针或三次逆置。",
          steps: [
            "写明输入数组、长度、是否已有序及空间限制（如要求原地 O(1)）。",
            "双指针题标清慢指针（写入位置）与快指针（扫描位置）的不变量；三数组题说明每次推进最小值指针为何不会漏解；循环移位拆成三次局部/整体逆置。",
            "写出完整 C/C++ 代码与关键注释，最后分别给出最坏时间复杂度与辅助空间复杂度。",
          ],
          check: "核对数组下标从 0 还是 1 开始、越界条件（i < n）以及空数组/单元素边界。",
        },
      },
      {
        id: "ds.big.algo.array.partition",
        name: "二分、分治与快排划分",
        exams: ["cs408-2016-q43", "cs408-2011-q42"],
        wangdao: {
          high: ["ds-big-8.3-2", "ds-big-8.3-3", "ds-big-7.2-6", "ds-big-2.2-8", "ds-big-8.6-3"],
          medium: ["ds-big-7.2-4"],
        },
        guide: {
          opening: "涉及有序序列 O(log n) 查找/中位数，或无序数组找第 k 小、集合均分、三色划分时，优先用二分缩半或快排 Partition 思想。",
          steps: [
            "二分/分治题写明左右端点 [low, high]、中点取法及每次舍弃哪一半（奇数/偶数长度是否保留中点）。",
            "快排划分题写清枢轴 pivot 选取、一次划分后的基准下标与目标位置（如 ⌊n/2⌋-1 或 k-1）的比较分支。",
            "给出代码实现，并说明平均时间 O(n) / O(log n) 与辅助空间 O(1)（非递归）。",
          ],
          check: "检查二分循环终止条件是否会死循环，以及划分后下标与题目 0-based / 1-based 的对应。",
        },
      },
      {
        id: "ds.big.algo.array.hash-scan",
        name: "哈希计数、投票与单趟扫描",
        exams: ["cs408-2025-q41", "cs408-2018-q41", "cs408-2013-q41"],
        wangdao: {
          medium: ["ds-big-1.2-1"],
        },
        guide: {
          opening: "求主元素、未出现最小正整数、后缀/前缀最值乘积等 O(n) 题，核心是「空间换时间（值域标记数组）」或「单趟维护极值/候选计数」。",
          steps: [
            "值域有界（如 1..n 或 |x|≤n）时开辅助标记数组并初始化为 0；若可单趟递推（如后缀最大/最小、摩尔投票），写明每步维护的状态量。",
            "写出遍历方向（从左到右或从右到左）和状态转移；摩尔投票找到候选后必须再扫一遍验证出现次数是否 > n/2。",
            "给出代码，分别说明时间复杂度 O(n) 和空间复杂度（O(n) 或 O(1)）。",
          ],
          check: "注意负数、0、超出 [1, n] 的元素如何过滤，以及全正/全负/全相同元素下的返回值。",
        },
      },
    ],
  },
  {
    id: "ds-big-algo-list",
    name: "链表算法",
    group: "算法题",
    order: 2,
    scenes: [
      {
        id: "ds.big.algo.list.pointer",
        name: "双指针定位、成环与去重",
        exams: ["cs408-2015-q41", "cs408-2012-q42", "cs408-2009-q42"],
        wangdao: {
          high: ["ds-big-2.3-15", "ds-big-2.3-14", "ds-big-2.3-5"],
          medium: ["ds-big-2.3-7", "ds-big-2.3-1", "ds-big-2.3-2", "ds-big-2.3-4"],
        },
        guide: {
          opening: "单链表找倒数第 k 个、两链表公共后缀起点、判环/环入口或按值去重时，先定「是否带头结点」，再用快慢指针或标记数组。",
          steps: [
            "画出头结点、前驱 pre 与当前指针 p；定位倒数第 k 个或公共后缀时，让长链/快指针先走差值步再同步后移。",
            "删除结点必须维护前驱 pre（先保存待删结点再 free），去重题若值域有界 |data|≤n 可开标记数组做到 O(m)。",
            "说明查找失败/空表/不足 k 个结点的返回值，并给出时间与空间复杂度。",
          ],
          check: "公共后缀比较的是结点指针地址（p == q）而非 data 相等；判环注意 fast && fast->next 非空。",
        },
      },
      {
        id: "ds.big.algo.list.reverse",
        name: "原地逆置、拆分与重排",
        exams: ["cs408-2019-q41"],
        wangdao: {
          high: ["ds-big-2.3-16", "ds-big-2.3-3", "ds-big-2.3-6"],
          medium: ["ds-big-8.4-5"],
        },
        guide: {
          opening: "单链表要求 O(1) 空间原地重排（如首尾交替、孪生和、奇偶拆分），标准三板斧：快慢指针找中点 → 后半段原地逆置 → 逐结点穿插/配对。",
          steps: [
            "用快慢指针定位前半段尾结点 mid，断链后对后半段做头插法/三指针原地逆置。",
            "按题意将前半段与逆置后的后半段交替合并（或同步扫描求最大孪生和），改指针前先保存 next。",
            "交代链表长度为奇数和偶数时的收尾处理，说明 O(n) 时间与 O(1) 辅助空间。",
          ],
          check: "确认原链表末尾置 NULL 防止成环，奇数长度时中间结点不会丢失或重复插入。",
        },
      },
      {
        id: "ds.big.algo.list.merge-doubly",
        name: "有序归并、子序列与双/循环链表",
        exams: [],
        wangdao: {
          high: ["ds-big-2.3-9", "ds-big-2.3-8", "ds-big-2.3-13"],
          medium: ["ds-big-2.3-10", "ds-big-2.3-11", "ds-big-2.3-12"],
        },
        guide: {
          opening: "双链表/循环链表维护前驱后继对称性，两个递增有序链表求交集或归并时用同步双指针推进较小者。",
          steps: [
            "有序表交集/归并：比较 pa->data 与 pb->data，小者后移；相等时尾插保留（按题意决定是否保留原结点或新建结点并释放冗余结点）。",
            "双链表移动结点时，先摘除（改前后相邻结点指针），再找目标前驱插入，共 4 条指针修改。",
            "循环链表判空/结束条件是 p != L 而非 p != NULL。",
          ],
          check: "检查是否破坏题目要求保留的原链表，以及循环链表尾结点是否仍指向头结点。",
        },
      },
    ],
  },
  {
    id: "ds-big-algo-tree",
    name: "树与二叉树算法",
    group: "算法题",
    order: 3,
    scenes: [
      {
        id: "ds.big.algo.tree.trav",
        name: "二叉树遍历、统计与表达式树",
        exams: ["cs408-2017-q41", "cs408-2014-q41"],
        wangdao: {
          high: ["ds-big-5.3-4", "ds-big-5.3-10", "ds-big-5.3-11", "ds-big-5.3-3", "ds-big-5.3-12", "ds-big-5.3-9"],
          medium: ["ds-big-5.3-13", "ds-big-5.3-8", "ds-big-5.3-7", "ds-big-5.3-5", "ds-big-5.3-6", "ds-big-5.3-14", "ds-big-5.2-5"],
        },
        guide: {
          opening: "二叉树算法题 90% 是先/中/后/层次遍历的变形：带深度参数递归（WPL、表达式树加括号）或队列按层遍历（高度、宽度、判完全二叉树）。",
          steps: [
            "确定遍历方式：自顶向下传参（如 depth）选先序；表达式树按中序输出并在非根非叶结点前后补括号；按层统计或判完全二叉树用层次遍历队列。",
            "写清递归终止条件（root == NULL 或叶结点判别）与累加/输出位置；非递归题写清栈/队列操作与层尾标记。",
            "分析时间复杂度 O(n) 与空间复杂度（递归栈高 O(h)，最坏 O(n)；层次遍历队列 O(n)）。",
          ],
          check: "表达式树注意根结点和叶结点不加括号；判完全二叉树遇到空结点后若再遇非空结点即返回 false。",
        },
      },
      {
        id: "ds.big.algo.tree.bst",
        name: "BST / AVL 判定与最值查找",
        exams: ["cs408-2026-q41", "cs408-2022-q41"],
        wangdao: {
          high: ["ds-big-7.3-10", "ds-big-7.3-5", "ds-big-7.3-7"],
          medium: ["ds-big-7.3-9", "ds-big-7.3-6", "ds-big-7.3-8"],
        },
        guide: {
          opening: "涉及二叉排序树（BST）判定、找最接近 K 的结点、第 k 小或判 AVL 时，核心武器是「中序遍历递增性（维护 prev）」或「后序自底向上传高度/上下界」。",
          steps: [
            "判 BST：中序遍历维护前驱值 prev，只要当前值 ≤ prev 即非 BST（顺序存储注意空结点 -1 及下标 2i+1、2i+2 越界判断）。",
            "找与 K 差最小或输出 ≥k 的结点：利用 BST 剪枝或中序/逆中序遍历，同步维护最优差值与结果集。",
            "判 AVL：后序递归同时返回子树高度与平衡标志；带 count 域找第 k 小按左子树结点数二分递归做到 O(h)。",
          ],
          check: "切忌只比较父结点与左右孩子而忽略整棵子树的上下界约束；顺序存储二叉树注意下标从 0 还是 1 开始。",
        },
      },
      {
        id: "ds.big.algo.tree.forest",
        name: "树与森林（孩子兄弟表示法）",
        exams: [],
        wangdao: {
          high: ["ds-big-5.4-4", "ds-big-5.4-5"],
        },
        guide: {
          opening: "孩子兄弟链表（firstchild / nextsibling）中，左指针向下走一层（+1），右指针水平走兄弟（高度不变）。",
          steps: [
            "求叶结点数：若 t->firstchild == NULL 则当前结点为叶结点，返回 1 + count(t->nextsibling)；否则递归左右之和。",
            "求树/森林深度：max(depth(t->firstchild) + 1, depth(t->nextsibling))。",
            "说明空树返回 0，时间复杂度 O(n)，空间复杂度 O(h)。",
          ],
          check: "切勿把 nextsibling 误当成下一层而错误加 1。",
        },
      },
    ],
  },
  {
    id: "ds-big-algo-graph",
    name: "图算法",
    group: "算法题",
    order: 4,
    scenes: [
      {
        id: "ds.big.algo.graph.matrix",
        name: "邻接矩阵度统计、路径与拓扑",
        exams: ["cs408-2024-q41", "cs408-2023-q41", "cs408-2021-q41"],
        wangdao: {
          high: ["ds-big-6.4-7", "ds-big-6.2-5"],
        },
        guide: {
          opening: "近年 408 最高频图算法题型！给定邻接矩阵 MGraph，直接按行/列统计入度出度（EL 路径、K 顶点）或在矩阵上做 Kahn 拓扑排序（判唯一拓扑序列）。",
          steps: [
            "先读清结构定义（numVertices、Edge[i][j] 有边标记是 1 还是权值、无向图还是有向图）。",
            "度统计题：第 i 行非零数 = 出度，第 i 列非零数 = 入度；唯一拓扑序列题：每轮扫描入度为 0 的未访问顶点，若个数 ≠ 1 则直接返回 0，否则删去其所有出边并更新邻接点入度。",
            "给出完整代码，并写明邻接矩阵下时间复杂度 O(|V|²) 与辅助空间 O(|V|) 或 O(1)。",
          ],
          check: "核对有向图行列含义（行出列入）、最终已输出顶点数是否等于 numVertices（防有环漏判）。",
        },
      },
      {
        id: "ds.big.algo.graph.traversal",
        name: "DFS / BFS 连通性、二分图与路径",
        exams: [],
        wangdao: {
          high: ["ds-big-6.3-2", "ds-big-6.3-3", "ds-big-6.3-4"],
          medium: ["ds-big-6.3-5"],
        },
        guide: {
          opening: "邻接表上的图算法重点考查 DFS/BFS 遍历变形：判连通无环（是否为树）、双色染色判二分图、判两点可达与回溯找简单路径。",
          steps: [
            "判树：一次 DFS 统计访问顶点数 Vnum 和边数 Enum，当且仅当图连通（Vnum == n）且边数满足 Enum == 2*(n-1)（无向邻接表每边计两次）时为树。",
            "判二分图：BFS/DFS 遍历时给相邻顶点染相反颜色，若遇到已染色且同色的邻接点则不可二分。",
            "邻接表下时间复杂度 O(|V|+|E|)，辅助空间 O(|V|)。",
          ],
          check: "非连通图需在外层循环遍历所有未访问顶点；回溯找所有简单路径时返回前要重置 visited[u] = 0。",
        },
      },
    ],
  },
  {
    id: "ds-big-algo-sq-heap",
    name: "栈、队列与堆算法",
    group: "算法题",
    order: 5,
    scenes: [
      {
        id: "ds.big.algo.sq",
        name: "栈、队列与优先队列代码设计",
        exams: [],
        wangdao: {
          high: ["ds-big-8.4-7", "ds-big-8.4-6", "ds-big-3.3-1", "ds-big-3.1-4", "ds-big-3.2-3"],
          medium: ["ds-big-3.2-1", "ds-big-3.1-5", "ds-big-3.2-2"],
        },
        guide: {
          opening: "栈/队列/堆的算法题重在数据结构不变式：括号配对与对称检测用栈，双栈模拟队列靠倒腾，优先队列/小根堆靠父子下标关系与上浮下滤。",
          steps: [
            "括号匹配/中心对称：入栈前半段或左括号，遇右括号/后半段依次弹栈比对，结束后确认栈空。",
            "小根堆判定/优先队列：下标从 1 开始时对 i ∈ [1, ⌊n/2⌋] 检查 A[i] ≤ A[2i] 且（若有右孩子）A[i] ≤ A[2i+1]；入队尾插上浮，出队首尾交换后下滤。",
            "写明队空/队满/栈溢出判断条件及时间、空间复杂度。",
          ],
          check: "优先队列注意数组 0-based 与 1-based 下标换算；双栈模拟队列只在 S2 空时才把 S1 全部倒入 S2。",
        },
      },
    ],
  },

  // ==================== 二、应用题（18 真题 · 5 专题 · 12 场景） ====================
  {
    id: "ds-big-app-graph",
    name: "图的应用题",
    group: "应用题",
    order: 6,
    scenes: [
      {
        id: "ds.big.app.graph.sp",
        name: "最短路径（Dijkstra / 贪心反例）",
        exams: ["cs408-2014-q42", "cs408-2009-q41"],
        wangdao: {
          high: ["ds-big-6.4-3", "ds-big-6.4-6"],
        },
        guide: {
          opening: "单源非负权最短路径用 Dijkstra 逐轮列出 dist[]、path[] 与已确定集合 S；若题目给的是「局部最近邻贪心」或问 Dijkstra 树是否 MST，需画最小反例图。",
          steps: [
            "先由题干表格/链路状态信息画出带权拓扑图，确认无向/有向及边权非负。",
            "按轮次列 Dijkstra 表：每轮选未确定顶点中 dist 最小者加入 S，松弛其所有出边并记录前驱。",
            "按小问输出最短距离、完整路径（由前驱逆推）或最小反例图与对比计算。",
          ],
          check: "区分「局部选当前点 u 的最短出边」与「Dijkstra 选距源点 s 最近的顶点」；确认不可达用 ∞ 表示。",
        },
      },
      {
        id: "ds.big.app.graph.mst",
        name: "最小生成树（Prim / Kruskal / 唯一性）",
        exams: ["cs408-2018-q42", "cs408-2017-q42"],
        wangdao: {
          high: ["ds-big-6.4-1", "ds-big-6.4-2"],
        },
        guide: {
          opening: "求带权连通图最小生成树时，Prim 按点扩展、Kruskal 按边权递增选不构成回路的边；若问 MST 唯一性，检查同权边替换及充分条件。",
          steps: [
            "严格按题目指定算法（Prim 从指定起点出发，依次列出选入的边与顶点；Kruskal 按边权升序选 n-1 条边）。",
            "列出所有可能的 MST 方案时，排查同权值候选边能否互换且保持连通无环，计算总权值。",
            "MST 唯一性结论：所有边权互不相等是充分条件；更精确条件是图中任意环上权值最大的边唯一（或切割性质下最小割边唯一）。",
          ],
          check: "确认边数恰好为 |V|-1 且连通无环；注意「有相同权值边」不代表 MST 一定不唯一。",
        },
      },
      {
        id: "ds.big.app.graph.aoe",
        name: "AOE 关键路径与拓扑排序",
        exams: ["cs408-2025-q42", "cs408-2011-q41"],
        wangdao: {
          high: ["ds-big-6.4-4", "ds-big-6.4-5", "ds-big-6.2-4"],
        },
        guide: {
          opening: "AOE 网应用题是 408 常青树：先算所有事件的最早发生时间 ve（正向取 max）和最迟发生时间 vl（逆向取 min），再求活动 e、l 与时间余量 d = l - e。",
          steps: [
            "若给的是上三角矩阵或工序表，先还原有向带权图，确认源点与汇点。",
            "按拓扑序算 ve(k) = max{ve(j) + w(j,k)}，汇点 ve 即最短工期；按逆拓扑序算 vl(j) = min{vl(k) - w(j,k)}。",
            "对每条活动 <j,k> 算 e = ve(j)、l = vl(k) - w、余量 d = l - e；d = 0 为关键活动。缩短工期须压缩所有关键路径的公共关键活动。",
          ],
          check: "若存在多条关键路径，单独压缩其中一条上的非公共活动无法缩短总工期；问「同时进行的活动」看时间区间交集。",
        },
      },
      {
        id: "ds.big.app.graph.store",
        name: "图的存储、邻接矩阵幂与生成树",
        exams: ["cs408-2015-q42"],
        wangdao: {
          high: ["ds-big-6.3-1", "ds-big-6.2-2"],
          medium: ["ds-big-6.2-1", "ds-big-6.2-3"],
          low: ["ds-big-6.1-1"],
        },
        guide: {
          opening: "围绕邻接矩阵/邻接表互转、矩阵幂 A^m 元素含义（顶点 i 到 j 长度为 m 的路径条数）以及按给定邻接表顺序画 DFS/BFS 生成树。",
          steps: [
            "写邻接矩阵先确认顶点编号从 0 还是 1 开始、无向图对称性以及带权图无边填 ∞ 还是 0。",
            "算 A^2 或解释 B^m[i][j]：代表从顶点 i 到顶点 j 长度为 m 的路径（通路）条数。",
            "由邻接表画 DFS/BFS 生成树时，严格按每个边链表中邻接点的先后顺序访问。",
          ],
          check: "核对无向图邻接矩阵是否关于主对角线对称，以及矩阵乘法每一项累加结果。",
        },
      },
    ],
  },
  {
    id: "ds-big-app-tree",
    name: "树与编码应用题",
    group: "应用题",
    order: 7,
    scenes: [
      {
        id: "ds.big.app.tree.huffman",
        name: "哈夫曼树、最优归并树与前缀编码",
        exams: ["cs408-2020-q42", "cs408-2012-q41"],
        wangdao: {
          high: ["ds-big-5.5-1"],
        },
        guide: {
          opening: "多表两两合并最少比较次数 = 哈夫曼最佳归并树（每次合并两表长度 m、n 最坏比较 m+n-1 次）；不等长前缀编码用二叉树（0 左 1 右，字符全在叶结点）存储。",
          steps: [
            "最优合并/哈夫曼树：每步选权值最小的两个结点合并，画出树形；WPL = ∑(叶权 × 路径长度)，两两归并总比较次数 = WPL - (k - 1)。",
            "前缀编码应用：说明用二叉树保存（左 0 右 1），译码从根出发按 0/1 走到叶结点输出字符并返回根。",
            "前缀特性判定：插入编码串时，路径上不能经过已有字符叶结点，且终点不能已有子树。",
          ],
          check: "区别「路径长度（边数）」与「层数（根为第 1 层）」；归并两表最坏比较次数记得减 1。",
        },
      },
      {
        id: "ds.big.app.tree.prop",
        name: "树与二叉树性质推导（k 叉树 / 完全二叉树）",
        exams: ["cs408-2016-q42"],
        wangdao: {
          high: ["ds-big-5.2-4", "ds-big-5.2-3", "ds-big-5.1-2"],
          medium: ["ds-big-5.1-1", "ds-big-5.1-3", "ds-big-5.2-1", "ds-big-5.2-2"],
        },
        guide: {
          opening: "树形计数推导题万能两方程：总结点数 n = n0 + n1 + … + nk，总边数 n - 1 = 0·n0 + 1·n1 + … + k·nk；正则 k 叉树满足 n0 = (k-1)m + 1。",
          steps: [
            "写出结点总数方程与分支数方程（总边数 = 总结点数 - 1），联立消元求叶结点数或某度数结点数。",
            "求高度 h 下的最多/最少结点数：最多为满 k 叉树 (k^h - 1)/(k - 1)；正则 k 叉树最少为每层仅 1 个分支结点，共 1 + k(h - 1) 个。",
            "完全二叉树求总数注意判断题目给的第 i 层是否为最后一层（可能满层，也可能不满层导致两种情况）。",
          ],
          check: "核对题目定义单结点树高度 h = 1 还是 0，以及编号从 1 开始还是从 0 开始。",
        },
      },
      {
        id: "ds.big.app.tree.convert",
        name: "遍历序列形态与森林-二叉树转换",
        exams: [],
        wangdao: {
          high: ["ds-big-5.4-3", "ds-big-5.4-2", "ds-big-5.4-1"],
          medium: ["ds-big-5.3-1", "ds-big-5.3-2"],
        },
        guide: {
          opening: "森林 ↔ 二叉树遵循「左孩子右兄弟」：树根之间互为右兄弟；由先序+中序还原二叉树后，断开右链即可恢复森林。",
          steps: [
            "森林转二叉树：先将每棵树按左孩子右兄弟转成二叉树，再将后一棵树的根作为前一棵树根的右孩子。",
            "二叉树转森林：反复断开根结点的右链得到各棵树的根，再将每个结点的左孩子的右链全部挂为该结点的孩子。",
            "遍历序列唯一性/形态判断：用「先序首为根、后序尾为根、中序分左右」定位结点位置。",
          ],
          check: "树的先根遍历 = 对应二叉树先序遍历；树的后根遍历 = 对应二叉树中序遍历。",
        },
      },
    ],
  },
  {
    id: "ds-big-app-search",
    name: "查找应用题",
    group: "应用题",
    order: 8,
    scenes: [
      {
        id: "ds.big.app.search.hash",
        name: "散列表构造、冲突处理与 ASL",
        exams: ["cs408-2024-q42", "cs408-2010-q41"],
        wangdao: {
          high: ["ds-big-7.5-3", "ds-big-7.5-4", "ds-big-7.5-5", "ds-big-7.5-1"],
          medium: ["ds-big-7.5-2"],
        },
        guide: {
          opening: "散列表大题必考 4 件套：确定表长与装填因子 α = n/m → 逐个插入画表（看清线性/平方/双散列/拉链法）→ 算查找成功 ASL → 算查找失败 ASL。",
          steps: [
            "逐个计算 H0 = H(key)，冲突时严格按题设探查序列（如线性 +k、平方 +k² 或 ±k²）落位，并记录每个关键字的比较次数。",
            "查找成功 ASL = (所有关键字比较次数之和) / 关键字个数 n。",
            "查找失败 ASL：分母是散列函数 H(key) 的值域大小（如 mod 7 分母为 7，不是表长 10！），对每个初始地址数到第一个空位为止的比较次数。",
          ],
          check: "开放地址法失败比较包含最后一次与空位置的比较；拉链法空指针一般不计关键字比较次数（按题设口径核对）。",
        },
      },
      {
        id: "ds.big.app.search.seq-bin",
        name: "折半查找判定树与 ASL 优化",
        exams: ["cs408-2013-q42"],
        wangdao: {
          high: ["ds-big-7.2-2", "ds-big-7.2-3"],
          medium: ["ds-big-7.2-1"],
        },
        guide: {
          opening: "折半查找判定树是一棵平衡二叉排序树（左右子树结点数差 ≤ 1）；不等概率查找要降 ASL，把高概率元素放在浅层（或顺序表按概率降序排列）。",
          steps: [
            "按 mid = ⌊(low+high)/2⌋（或题设向上取整）递归画出折半判定树，标出每个内部结点层数与外部失败结点。",
            "等概率成功 ASL = ∑(层数) / n，失败 ASL = ∑(失败结点父层数) / (n + 1)。",
            "不等概率优化：顺序查找按概率降序排列最优；链式/树形可构造最优二叉查找树或哈夫曼思想，让大概率关键字更靠近根/表头。",
          ],
          check: "确认整棵判定树取整方向一致（全向下取整则右子树结点数 ≥ 左子树）。",
        },
      },
      {
        id: "ds.big.app.search.tree",
        name: "BST、AVL 旋转与 B 树操作",
        exams: [],
        wangdao: {
          high: ["ds-big-7.3-3", "ds-big-7.4-2", "ds-big-7.4-1", "ds-big-7.3-1"],
          medium: ["ds-big-7.3-2", "ds-big-7.3-4", "ds-big-7.4-3"],
        },
        guide: {
          opening: "虽然尚未单出 408 大题，但 AVL 旋转与 B 树插入分裂/删除借调合并是选择题年年必考的核心硬骨头，极易升格为应用大题。",
          steps: [
            "AVL 插入：每次插入后沿路径回溯找最小不平衡子树，分清 LL/RR（单旋）与 LR/RL（双旋），画出旋转后形态。",
            "m 阶 B 树：非根结点关键字数 ∈ [⌈m/2⌉-1, m-1]。插入溢出时取第 ⌈m/2⌉ 个关键字上移并一分为二；删除非终端关键字先用前驱/后继替代，下溢时先向富余兄弟借，否则父关键字下移合并。",
            "由先序序列还原 BST：利用「BST 中序必为升序」即可唯一确定树形并算 ASL。",
          ],
          check: "B 树删除合并后记得检查父结点是否继续下溢（连锁合并直至根结点降高）。",
        },
      },
    ],
  },
  {
    id: "ds-big-app-sort",
    name: "排序应用题",
    group: "应用题",
    order: 9,
    scenes: [
      {
        id: "ds.big.app.sort.internal",
        name: "内部排序模拟、稳定性与 Top-K 分析",
        exams: ["cs408-2022-q42", "cs408-2021-q42"],
        wangdao: {
          high: ["ds-big-8.4-4", "ds-big-8.5-2", "ds-big-8.4-3"],
          medium: ["ds-big-8.5-1", "ds-big-8.2-2", "ds-big-8.2-1"],
          low: ["ds-big-8.6-1", "ds-big-8.4-1", "ds-big-8.4-2"],
        },
        guide: {
          opening: "近年 408 爱考「给一段排序代码做模拟/复杂度/稳定性分析」（2021）以及「大规模数据找前 k 小/大（堆与划分对比）」（2022），配合经典排序每趟手算。",
          steps: [
            "代码分析题：手推小规模输入确定每趟结果与比较次数公式（如 n(n-1)/2），通过构造含相等关键字的例子判定稳定性（看 < 还是 ≤）。",
            "海量数据 Top-K（找最小 k 个）：建大小为 k 的大根堆，后续元素小于堆顶则替换并下滤，平均时间 O(n)（最坏 O(n log k)），空间 O(k) = O(1)。",
            "基数排序（LSD）：按个位→十位→百位做「分配+收集」，关键字比较次数为 0。",
          ],
          check: "求最小 k 个数必须建「大根堆」（淘汰最大者），求最大 k 个数才建「小根堆」；m 叉堆下标公式注意 0-based 与 1-based。",
        },
      },
      {
        id: "ds.big.app.sort.external",
        name: "外部排序（置换-选择 / 败者树 / 最佳归并树）",
        exams: ["cs408-2023-q42"],
        wangdao: {
          high: ["ds-big-8.7-4", "ds-big-8.7-3", "ds-big-8.7-1", "ds-big-8.7-2"],
        },
        guide: {
          opening: "外部排序大题三大高频点：置换-选择生成不等长初始归并段、k 路败者树手算、k 路最佳归并树补虚段与读写磁盘块数计算。",
          steps: [
            "置换-选择排序：工作区容量 m，每次输出 ≥ MINIMAX 的最小记录并读入新记录；若工作区全 < MINIMAX 则当前段结束，开启新段。段长最小 m，最大 n。",
            "k 路最佳归并树：若 (初始段数 r - 1) mod (k - 1) ≠ 0，需补虚段数 u = (k - 1) - ((r - 1) mod (k - 1))，虚段权值 0 参与首轮合并。",
            "磁盘 I/O 块数 = 2 × 总块数 × (1 + 归并趟数)（或按题意区分是否含生成初始归并段的读写）；最佳归并树归并阶段总读写块数 = 2 × WPL。",
          ],
          check: "补虚段公式先算 (r - 1) % (k - 1)，余数为 0 时不补虚段；败者树叶子存当前值、内部结点存败者所在归并段号。",
        },
      },
    ],
  },
  {
    id: "ds-big-app-sq-str",
    name: "栈、队列与串应用题",
    group: "应用题",
    order: 10,
    scenes: [
      {
        id: "ds.big.app.sq",
        name: "出栈序列与循环链式队列设计",
        exams: ["cs408-2026-q42", "cs408-2019-q42"],
        wangdao: {
          high: ["ds-big-3.1-3", "ds-big-3.1-2"],
          medium: ["ds-big-3.1-1"],
        },
        guide: {
          opening: "栈应用题核心是出栈序列合法性（任意已出栈元素后面比它小的元素必逆序，即无 3-1-2 禁形）与卡特兰数；队列设计题看「空间可增且复用 + O(1) 出入队」→ 带头尾指针的循环单链表。",
          steps: [
            "出栈序列判别：逐元素检查，若大元素先出栈，则其后所有更小的元素必须严格降序；列举序列时按入栈顺序画状态分支。",
            "只增不减队列设计：选循环链式存储，设 front 与 rear 指针；队空 front == rear，队满 rear->next == front（队满时插入新结点扩容，出队只移动 front 复用结点）。",
            "按小问画出初始状态、队空/队满判别式与入队/出队指针操作过程。",
          ],
          check: "确认队列设计是否满足「初始空、入队可扩容、出队不释放结点可复用、出入队均 O(1)」全部 4 条约束。",
        },
      },
      {
        id: "ds.big.app.str",
        name: "KMP 算法与 next 数组",
        exams: [],
        wangdao: {
          high: ["ds-big-4.2-2", "ds-big-4.2-1"],
        },
        guide: {
          opening: "KMP 核心是按「最长相等前后缀长度 + 1（1-based）」手算 next 数组，失配时主串指针 i 不回溯，模式串指针 j 回退到 next[j]。",
          steps: [
            "确认下标从 1 开始（next[1]=0, next[2]=1）还是从 0 开始（next[0]=-1），逐位求最长真前后缀长度。",
            "写出 KMP 每轮对齐位置、失配下标及 j = next[j] 的跳转过程（当 j == 0 时 i++, j++）。",
            "若题目要求 nextval，再检查 P[j] == P[next[j]] 时替换为 nextval[next[j]]。",
          ],
          check: "手算完 next 数组后，用 j=3, 4 位置的前缀与后缀快速复核一遍，避免整体错位 1。",
        },
      },
    ],
  },
];

export const DS_BIG_CHAPTERS: readonly DsBigChapter[] = CHAPTER_SPECS.map(chapter => ({
  id: chapter.id,
  name: chapter.name,
  group: chapter.group,
  order: chapter.order,
  bookId: "ds",
  bookName: "数据结构",
  kps: chapter.scenes.map(scene => ({
    id: scene.id,
    name: scene.name,
    freq: scene.exams.length >= 2 ? 5 : scene.exams.length === 1 ? 4 : 3,
    bigWeight: 1,
  })),
}));

export const DS_BIG_SCENE_GUIDES: Readonly<Record<string, DsBigSceneGuide>> = Object.fromEntries(
  CHAPTER_SPECS.flatMap(chapter => chapter.scenes.map(scene => [scene.id, scene.guide]))
);

const examSceneMap = new Map<string, string>();
const wangdaoMetaMap = new Map<string, DsBigWangdaoMeta>();
const sceneToChapterMap = new Map<string, DsBigChapter>();

for (const chapterSpec of CHAPTER_SPECS) {
  const chapter = DS_BIG_CHAPTERS.find(item => item.id === chapterSpec.id)!;
  for (const scene of chapterSpec.scenes) {
    sceneToChapterMap.set(scene.id, chapter);
    for (const examId of scene.exams) {
      examSceneMap.set(examId, scene.id);
    }
    let rank = 0;
    const tiers: [DsBigWangdaoTier, readonly string[] | undefined][] = [
      ["high", scene.wangdao.high],
      ["medium", scene.wangdao.medium],
      ["low", scene.wangdao.low],
    ];
    for (const [tier, ids] of tiers) {
      for (const id of ids ?? []) {
        wangdaoMetaMap.set(id, { sceneId: scene.id, tier, rank: rank++ });
      }
    }
  }
}

const FALLBACK_KP_TO_DS_BIG_SCENE: Readonly<Record<string, string>> = {
  "ds.linear.seq": "ds.big.algo.array.two-pointer",
  "ds.linear.linked": "ds.big.algo.list.pointer",
  "ds.linear.poly": "ds.big.algo.list.reverse",
  "ds.sq.stack": "ds.big.app.sq",
  "ds.sq.queue": "ds.big.app.sq",
  "ds.sq.apply": "ds.big.algo.sq",
  "ds.str.kmp": "ds.big.app.str",
  "ds.str.match": "ds.big.app.str",
  "ds.tree.bt": "ds.big.app.tree.prop",
  "ds.tree.trav": "ds.big.algo.tree.trav",
  "ds.tree.thread": "ds.big.algo.tree.trav",
  "ds.tree.forest": "ds.big.app.tree.convert",
  "ds.tree.huffman": "ds.big.app.tree.huffman",
  "ds.tree.uf": "ds.big.app.graph.mst",
  "ds.graph.store": "ds.big.app.graph.store",
  "ds.graph.dfs-bfs": "ds.big.algo.graph.traversal",
  "ds.graph.mst": "ds.big.app.graph.mst",
  "ds.graph.sp": "ds.big.app.graph.sp",
  "ds.graph.topo": "ds.big.app.graph.aoe",
  "ds.search.seq-bin": "ds.big.app.search.seq-bin",
  "ds.search.bst": "ds.big.app.search.tree",
  "ds.search.avl": "ds.big.app.search.tree",
  "ds.search.rbt": "ds.big.app.search.tree",
  "ds.search.b": "ds.big.app.search.tree",
  "ds.search.hash": "ds.big.app.search.hash",
  "ds.sort.insert": "ds.big.app.sort.internal",
  "ds.sort.swap": "ds.big.algo.array.partition",
  "ds.sort.select": "ds.big.app.sort.internal",
  "ds.sort.merge": "ds.big.app.sort.internal",
  "ds.sort.radix": "ds.big.app.sort.internal",
  "ds.sort.compare": "ds.big.app.sort.internal",
  "ds.sort.external": "ds.big.app.sort.external",
  "ds.algo.recur": "ds.big.algo.array.partition",
  "ds.algo.greedy": "ds.big.app.tree.huffman",
  "ds.algo.dp": "ds.big.algo.array.hash-scan",
  "ds.algo.design": "ds.big.algo.array.two-pointer",
};

export const LEGACY_DS_CHAPTER_TO_BIG_CHAPTER: Readonly<Record<string, string>> = {
  "ds-linear": "ds-big-algo-list",
  "ds-stack-queue": "ds-big-app-sq-str",
  "ds-string": "ds-big-app-sq-str",
  "ds-tree": "ds-big-algo-tree",
  "ds-graph": "ds-big-app-graph",
  "ds-search": "ds-big-app-search",
  "ds-sort": "ds-big-app-sort",
  "ds-algo": "ds-big-algo-array",
};

export function isDsBigChapterId(chapterId: string | undefined): boolean {
  return Boolean(chapterId && DS_BIG_CHAPTERS.some(ch => ch.id === chapterId));
}

export function dsBigWangdaoMeta(questionId: string): DsBigWangdaoMeta | undefined {
  return wangdaoMetaMap.get(questionId);
}

export function resolveDsBigScene(questionId: string, source: "exam" | "wangdao", kpIds: readonly string[]): string {
  if (source === "exam") {
    const exact = examSceneMap.get(questionId);
    if (exact) return exact;
  } else {
    const meta = wangdaoMetaMap.get(questionId);
    if (meta) return meta.sceneId;
  }
  for (const kp of kpIds) {
    const fallback = FALLBACK_KP_TO_DS_BIG_SCENE[kp];
    if (fallback) return fallback;
  }
  return "ds.big.algo.array.two-pointer";
}

export function dsBigChapterForScene(sceneId: string): DsBigChapter | undefined {
  return sceneToChapterMap.get(sceneId);
}
