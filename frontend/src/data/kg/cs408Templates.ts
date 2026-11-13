// 408 大题考法模板：与数学题型模板同构（条件→目标 的短名 + 识别 + 标准路线）。
// 数据结构算法设计题（ds.algo.design）按「设计方法」细分（方案 B），跨结构归类；
// 应用题及其余科目按知识点下的考法 facet 动态归纳，name 取考法中文名。
// 成员关系由题目 facets 与模板 facets 交集判定，与图谱/错题共用同一套账号同步证据。
import type { WangdaoItem } from "@/lib/kg/wangdao408";

export interface Cs408Template {
  id: string;
  kpId: string;
  name: string;
  recognize: string;
  route: string;
  facets: string[];
}

const ALGO = "ds.algo.design";
const t = (suffix: string, name: string, recognize: string, route: string): Cs408Template =>
  ({ id: `${ALGO}::${suffix}`, kpId: ALGO, name, recognize, route, facets: [`${ALGO}::${suffix}`] });

/** 算法设计题考法（方案 B）：按设计方法归类，每类对应一批跨结构的王道算法题。 */
export const CS408_ALGO_TEMPLATES: Cs408Template[] = [
  t("扫描筛选与计数", "扫描筛选与计数",
    "顺序表/数组上按条件删除、筛选、计数、找主元素或缺失值，常要求 O(n) 时间、O(1) 空间。",
    "一趟扫描维护候选/计数/标记；删除用覆盖或双指针原地整理；主元素用摩尔投票，最小正整数用下标标记，绝对值去重用辅助标记数组。"),
  t("逆置重排与循环移动", "逆置重排与循环移动",
    "要求逆置、循环左移/右移、两段互换、按对称位置重排，限制辅助空间 O(1)。",
    "逆置用首尾双指针对换或三次逆置；循环移动先整体逆置再分段逆置；链表重排先找中点、逆置后半、再交替合并；孪生和逆置后半后同步遍历。"),
  t("多指针与有序序列", "多指针与有序序列",
    "多个有序序列/数组的合并、交集、公共元素、最小距离、中位数，或行列有序矩阵查找。",
    "各序列设指针，按大小关系推进较小者；交集/公共同步推进；最小距离维护当前最值并推进最小者；行列有序矩阵从右上角起按大小走。"),
  t("划分与第k选择", "划分与第 k 选择",
    "按规则把序列分成两部分（奇偶/颜色/集合划分），或求第 k 小、top-k，要求尽量高效。",
    "借鉴快排 partition 双指针交换；第 k 小用快速选择平均 O(n)；top-k 用容量 k 的堆；集合划分排序后贪心分配使个数差最小、和差最大。"),
  t("分治递推与复杂度分析", "分治递推与复杂度分析",
    "两序列中位数等可分治的选择问题、后缀/前缀递推求值，或分析程序段时间复杂度。",
    "分治每轮排除一半候选；递推维护后缀最值/累积量一趟完成；复杂度看循环嵌套层数与基本操作执行次数，注意循环变量与 n 的关系。"),
  t("链表指针操作", "链表指针操作",
    "单/双/循环链表上删除、查找、判环、倒数第 k、公共结点、对称、按频度调整等指针操作。",
    "善用前驱与快慢双指针；判环快慢指针相遇；倒数第 k 先走 k 步再同步；公共结点先对齐长度再同步；删除注意断链与释放，循环链表注意收尾。"),
  t("递归与遍历框架", "递归与遍历框架",
    "二叉树/树/森林上求高度、宽度、结点数、祖先、LCA、子树交换、WPL、表达式树、相似判定等。",
    "选先/中/后序或层序框架，递归返回子树信息；LCA 后序回传；WPL 带深度累加；层序用队列求宽度；表达式树中序输出并按需加括号。"),
  t("栈与队列应用", "栈与队列应用",
    "用栈/队列判定合法性、中心对称、括号匹配，或共享栈、两栈模拟队列、优先队列等结构设计。",
    "合法性/对称用栈匹配；共享栈两端相向增长；两栈模拟队列在出队时倒腾元素；优先队列用堆保证入队出队 O(log n)。"),
  t("图遍历与判定", "图遍历与判定",
    "图上二分判定、是否为树、路径存在/所有路径、存储转换、拓扑排序与唯一拓扑、EL 路径等。",
    "DFS/BFS 框架加状态标记；二分用染色冲突判定；树判定看连通且边数=n−1；所有路径用 DFS 回溯；拓扑用入度队列或 DFS，唯一拓扑看每步是否仅一个入度 0 顶点。"),
  t("查找与排序算法实现", "查找与排序算法实现",
    "实现折半查找、BST/AVL 判定与第 k 小、堆判定、链表选择排序、有序段合并等具体算法。",
    "折半注意边界与递归终止；BST 判定用中序递增或上下界递归；AVL 递归求高判平衡；堆按完全树父子关系校验；有序段合并用双指针归并。"),
];

const ALGO_BY_ID = new Map(CS408_ALGO_TEMPLATES.map((tpl) => [tpl.id, tpl]));

/** 应用题/其余科目：从题池 facet 动态归纳考法模板，name 取考法中文名。 */
function templatesFromPool(kpId: string, pool: WangdaoItem[]): Cs408Template[] {
  const facets = [...new Set(pool.flatMap((q) => q.facets ?? []).filter((f) => f.startsWith(`${kpId}::`)))].sort();
  return facets.map((facet) => ({ id: facet, kpId, name: facet.split("::")[1], recognize: "", route: "", facets: [facet] }));
}

export function cs408TemplatesForKp(kpId: string, pool: WangdaoItem[]): Cs408Template[] {
  if (kpId === ALGO) return CS408_ALGO_TEMPLATES;
  return templatesFromPool(kpId, pool);
}

export function cs408TemplateName(id: string): string {
  return ALGO_BY_ID.get(id)?.name ?? id.split("::")[1] ?? id;
}