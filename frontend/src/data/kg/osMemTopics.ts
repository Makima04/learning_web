// 408 操作系统·内存管理：按真题题型细分类（2012–2026，44 题）
// 图谱考点仍是 os.mem.{alloc,page,virt,thrash} 四级；本表只给图解页展示「这道题练的是哪一招」。

export type OsMemTopicId =
  | "alloc-fit"
  | "alloc-coalesce"
  | "alloc-buddy"
  | "page-split"
  | "page-multilevel"
  | "page-ptbr"
  | "page-share"
  | "page-bitmap"
  | "page-seg"
  | "virt-replace"
  | "virt-clock"
  | "virt-fault"
  | "virt-eat"
  | "virt-concept"
  | "thrash-ws"
  | "thrash-rate";

export type OsMemKpId = "os.mem.alloc" | "os.mem.page" | "os.mem.virt" | "os.mem.thrash";

export type OsMemGroupId = "alloc" | "paging" | "virt" | "thrash";

export interface OsMemGroup {
  id: OsMemGroupId;
  kpId: OsMemKpId;
  name: string;
  blurb: string;
}

/** 大类：题集入口。小类见 OS_MEM_TOPICS。 */
export const OS_MEM_GROUPS: OsMemGroup[] = [
  { id: "alloc", kpId: "os.mem.alloc", name: "连续分配", blurb: "适应算法、回收合并、伙伴系统" },
  { id: "paging", kpId: "os.mem.page", name: "分页与分段", blurb: "多级页表、PTBR、共享、分段、位图" },
  { id: "virt", kpId: "os.mem.virt", name: "虚拟内存与置换", blurb: "LRU/CLOCK、缺页、EAT、虚存概念" },
  { id: "thrash", kpId: "os.mem.thrash", name: "工作集与抖动", blurb: "工作集窗口、缺页率与分配策略" },
];

export interface OsMemTopic {
  id: OsMemTopicId;
  /** 挂在哪个图谱考点下（图解页入口） */
  kpId: OsMemKpId;
  name: string;
  /** 这一招在图解里对应的 tab / 模式（给学习者对上动画） */
  vizHint: string;
}

export interface OsMemExamRef {
  year: number;
  n: number;
  kind: "mcq" | "big";
  topic: OsMemTopicId;
  /** 一句话：这题在考什么 */
  hook: string;
}

export const OS_MEM_TOPICS: OsMemTopic[] = [
  { id: "alloc-fit", kpId: "os.mem.alloc", name: "首次/最佳/最坏适应", vizHint: "适应算法" },
  { id: "alloc-coalesce", kpId: "os.mem.alloc", name: "回收合并与空闲链重排", vizHint: "回收合并" },
  { id: "alloc-buddy", kpId: "os.mem.alloc", name: "伙伴系统", vizHint: "伙伴系统" },
  { id: "page-split", kpId: "os.mem.page", name: "一维地址拆页号/偏移", vizHint: "分页" },
  { id: "page-multilevel", kpId: "os.mem.page", name: "多级页表与表项物理地址", vizHint: "二级页表 / 三级页表" },
  { id: "page-ptbr", kpId: "os.mem.page", name: "页表基址寄存器（物理）", vizHint: "二级页表" },
  { id: "page-share", kpId: "os.mem.page", name: "页/段共享", vizHint: "分段" },
  { id: "page-bitmap", kpId: "os.mem.page", name: "位图管理空闲页框", vizHint: "分页" },
  { id: "page-seg", kpId: "os.mem.page", name: "分段翻译与越界", vizHint: "分段" },
  { id: "virt-replace", kpId: "os.mem.virt", name: "FIFO/LRU/OPT 与 Belady", vizHint: "FIFO / LRU / OPT" },
  { id: "virt-clock", kpId: "os.mem.virt", name: "CLOCK / 改进 CLOCK", vizHint: "CLOCK / 改进CLOCK" },
  { id: "virt-fault", kpId: "os.mem.virt", name: "缺页处理流程", vizHint: "本页置换表 + 抖动页「缺页率因素」" },
  { id: "virt-eat", kpId: "os.mem.virt", name: "有效访存时间", vizHint: "抖动页「缺页率因素」" },
  { id: "virt-concept", kpId: "os.mem.virt", name: "虚存容量/权限/mmap", vizHint: "概念题，无单独动画" },
  { id: "thrash-ws", kpId: "os.mem.thrash", name: "工作集窗口", vizHint: "408 时刻 t" },
  { id: "thrash-rate", kpId: "os.mem.thrash", name: "缺页率与抖动", vizHint: "抖动曲线 / 缺页率因素" },
];

/** 2012–2026 全部 os.mem.* 真题（含交叉标注）。一道题只归一个主类。 */
export const OS_MEM_EXAMS: OsMemExamRef[] = [
  { year: 2012, n: 25, kind: "mcq", topic: "virt-concept", hook: "虚存必须基于非连续分配，容量受地址结构+外存限制" },
  { year: 2012, n: 45, kind: "big", topic: "virt-clock", hook: "周期扫描驻留集、空闲链回收，类 Clock/工作集" },
  { year: 2013, n: 30, kind: "mcq", topic: "virt-fault", hook: "缺页可置换、可分配内存，不是越界" },
  { year: 2013, n: 46, kind: "big", topic: "page-multilevel", hook: "一级页表大小 + 二级 10+10+12 拆地址 + 页表项物理地址" },
  { year: 2014, n: 28, kind: "mcq", topic: "virt-eat", hook: "加快虚实转换：加大 TLB、页表常驻；加大 swap 无用" },
  { year: 2014, n: 30, kind: "mcq", topic: "virt-replace", hook: "只有 FIFO 可能 Belady 异常" },
  { year: 2014, n: 32, kind: "mcq", topic: "page-multilevel", hook: "多级页表优点是减少页表所占连续内存" },
  { year: 2014, n: 45, kind: "big", topic: "virt-eat", hook: "页式虚存 × Cache/TLB：缺页、读盘、TLB 次数" },
  { year: 2015, n: 27, kind: "mcq", topic: "virt-replace", hook: "4 帧 LRU 手算下一页淘汰谁" },
  { year: 2015, n: 30, kind: "mcq", topic: "thrash-rate", hook: "固定分配不能配全局置换" },
  { year: 2015, n: 46, kind: "big", topic: "page-multilevel", hook: "二级页表：页数、页目录+页表占几页、一次指令碰几张二级表" },
  { year: 2016, n: 26, kind: "mcq", topic: "virt-clock", hook: "改进 CLOCK 淘汰序 (0,0)→(0,1)→(1,0)→(1,1)" },
  { year: 2016, n: 28, kind: "mcq", topic: "page-seg", hook: "段号 2 偏移 400 ≥ 段长 300 → 越界" },
  { year: 2016, n: 29, kind: "mcq", topic: "thrash-ws", hook: "窗口 w=6，求时刻 t 的工作集" },
  { year: 2016, n: 45, kind: "big", topic: "virt-eat", hook: "VA/TLB/Cache 字段位数；缺页代价 ≫ Cache 缺失；页用回写" },
  { year: 2017, n: 25, kind: "mcq", topic: "alloc-coalesce", hook: "最佳适应回收：相邻合并再按大小重排" },
  { year: 2017, n: 45, kind: "big", topic: "page-multilevel", hook: "二级页表：指令占几页、页目录/页表第几项" },
  { year: 2018, n: 45, kind: "big", topic: "page-multilevel", hook: "拼 VA；PDBR 是物理地址；改进 CLOCK 要 A/M 位" },
  { year: 2019, n: 14, kind: "mcq", topic: "virt-fault", hook: "缺页处理后从故障指令重执行，不是下一条" },
  { year: 2019, n: 28, kind: "mcq", topic: "page-share", hook: "共享段在各进程中段号不必相同" },
  { year: 2019, n: 29, kind: "mcq", topic: "virt-replace", hook: "4 帧局部 LRU，问置换次数（空帧填入不算）" },
  { year: 2019, n: 31, kind: "mcq", topic: "page-multilevel", hook: "VA 2050 1225H → 目录号 081H、页号 101H" },
  { year: 2019, n: 32, kind: "mcq", topic: "alloc-fit", hook: "最佳适应最易产生难以利用的外部碎片" },
  { year: 2019, n: 46, kind: "big", topic: "page-split", hook: "页 4KB 判断两条指令是否同页；顺带 Cache 组号" },
  { year: 2020, n: 28, kind: "mcq", topic: "virt-eat", hook: "EAT 含缺页率、磁盘、访存、缺页处理 CPU 时间" },
  { year: 2020, n: 46, kind: "big", topic: "page-multilevel", hook: "a[1][2] 的 VA/目录项/页表项物理地址；行列局部性" },
  { year: 2021, n: 28, kind: "mcq", topic: "virt-clock", hook: "改进 CLOCK + 存在位：先判断缺页再拼物理地址" },
  { year: 2021, n: 29, kind: "mcq", topic: "page-ptbr", hook: "页表基址寄存器 = 当前进程一级页表起始物理地址" },
  { year: 2022, n: 29, kind: "mcq", topic: "virt-fault", hook: "缺页处理不一定淘汰（还有空闲帧）" },
  { year: 2022, n: 30, kind: "mcq", topic: "thrash-rate", hook: "页缓冲队列长度不影响缺页率" },
  { year: 2023, n: 25, kind: "mcq", topic: "page-bitmap", hook: "16GB/4KB 页，位图 512KB" },
  { year: 2023, n: 28, kind: "mcq", topic: "virt-concept", hook: "虚存大小由地址结构决定，不是内存+硬盘" },
  { year: 2023, n: 30, kind: "mcq", topic: "page-share", hook: "共享页：页号不必同，页框号应同" },
  { year: 2024, n: 25, kind: "mcq", topic: "page-ptbr", hook: "进程切换要更新页表基址寄存器（硬件改 PC/栈基址）" },
  { year: 2024, n: 27, kind: "mcq", topic: "alloc-buddy", hook: "回收时只合并大小相等的空闲分区 = 伙伴" },
  { year: 2024, n: 45, kind: "big", topic: "page-multilevel", hook: "缺页后更新页表项的虚/实地址与页框号" },
  { year: 2025, n: 26, kind: "mcq", topic: "virt-replace", hook: "3 帧 LRU，0/1/2 已在内存，数缺页处理次数" },
  { year: 2025, n: 27, kind: "mcq", topic: "virt-concept", hook: "最少页框数看指令寻址方式（一条指令最多碰几页）" },
  { year: 2025, n: 30, kind: "mcq", topic: "virt-concept", hook: "mmap：映射到虚址、可 IPC、页↔磁盘块；不是映到物理地址" },
  { year: 2025, n: 46, kind: "big", topic: "virt-concept", hook: "进程虚址布局：PCB/代码/堆/栈各在哪" },
  { year: 2026, n: 24, kind: "mcq", topic: "virt-fault", hook: "地址转换由 MMU；缺页/异常由 OS 处理" },
  { year: 2026, n: 28, kind: "mcq", topic: "page-multilevel", hook: "64 位三级 9+9+9+12，L3 满映射占 256K 页框" },
  { year: 2026, n: 29, kind: "mcq", topic: "thrash-rate", hook: "TLB+工作集+页缓冲队列降 EAT；多级页表不降" },
  { year: 2026, n: 30, kind: "mcq", topic: "page-share", hook: "共享文件页：两进程虚址可不同，物理地址相同" },
];

const TOPIC_MAP = new Map(OS_MEM_TOPICS.map((t) => [t.id, t]));
const GROUP_MAP = new Map(OS_MEM_GROUPS.map((g) => [g.id, g]));
const GROUP_BY_KP = new Map(OS_MEM_GROUPS.map((g) => [g.kpId, g]));
const EXAM_MAP = new Map(OS_MEM_EXAMS.map((e) => [`${e.year}-${e.n}`, e]));

export function osMemTopic(id: OsMemTopicId): OsMemTopic | undefined {
  return TOPIC_MAP.get(id);
}

export function osMemGroup(id: string): OsMemGroup | undefined {
  return GROUP_MAP.get(id as OsMemGroupId);
}

export function osMemGroupForKp(kpId: string): OsMemGroup | undefined {
  return GROUP_BY_KP.get(kpId as OsMemKpId);
}

export function osMemGroupForTopic(topicId: OsMemTopicId): OsMemGroup | undefined {
  const t = TOPIC_MAP.get(topicId);
  return t ? GROUP_BY_KP.get(t.kpId) : undefined;
}

export function osMemExamKey(year: number, n: number): string {
  return `${year}-${n}`;
}

export function parseOsMemExamKey(raw: string | null | undefined): { year: number; n: number } | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return { year: Number(m[1]), n: Number(m[2]) };
}

export function osMemExamLookup(year: number, n: number): OsMemExamRef | undefined {
  return EXAM_MAP.get(osMemExamKey(year, n));
}

export function osMemExamsForKp(kpId: string): OsMemExamRef[] {
  const ids = new Set(OS_MEM_TOPICS.filter((t) => t.kpId === kpId).map((t) => t.id));
  return OS_MEM_EXAMS.filter((e) => ids.has(e.topic));
}

export function osMemTopicsForKp(kpId: string): OsMemTopic[] {
  return OS_MEM_TOPICS.filter((t) => t.kpId === kpId);
}

export function osMemTopicsForGroup(groupId: OsMemGroupId): OsMemTopic[] {
  const g = GROUP_MAP.get(groupId);
  if (!g) return [];
  return OS_MEM_TOPICS.filter((t) => t.kpId === g.kpId);
}

/** 408 卷序：年升序，同年按题号。group=all 或省略即全 44 题。 */
export function osMemExamsInOrder(groupId?: OsMemGroupId | "all", topicId?: OsMemTopicId): OsMemExamRef[] {
  let list = OS_MEM_EXAMS;
  if (groupId && groupId !== "all") {
    const g = GROUP_MAP.get(groupId);
    if (g) list = list.filter((e) => TOPIC_MAP.get(e.topic)?.kpId === g.kpId);
  }
  if (topicId) list = list.filter((e) => e.topic === topicId);
  return [...list].sort((a, b) => a.year - b.year || a.n - b.n);
}

export function osMemYears(): number[] {
  return [...new Set(OS_MEM_EXAMS.map((e) => e.year))].sort((a, b) => a - b);
}

export function osMemSetPath(opts?: {
  group?: OsMemGroupId | "all";
  mode?: "proof" | "browse";
  q?: string;
  topic?: OsMemTopicId;
}): string {
  const group = opts?.group ?? "";
  const base = group ? `/kg/exams/os-mem/${group}` : "/kg/exams/os-mem";
  const q = new URLSearchParams();
  if (opts?.mode === "proof") q.set("mode", "proof");
  if (opts?.q) q.set("q", opts.q);
  if (opts?.topic) q.set("topic", opts.topic);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}
