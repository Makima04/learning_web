// 王道 408 做题本分类：图谱模块 = 大类，题干知识点 = 小类；选择 / 大题分开。
import { findKp } from "@/data/kg";
import {
  EXAM_GROUPS,
  examGroup,
  examTopic,
  type ExamGroup,
  type ExamTopic,
} from "@/data/kg/examTaxonomy";
import { OS_MEM_TOPICS, osMemTopic, type OsMemTopicId } from "@/data/kg/osMemTopics";
import type { WangdaoItem, WangdaoKind } from "@/lib/kg/wangdao408";
import type { BookId } from "@/lib/kg/types";

/** 王道小节默认考点（不看小节标题，避免「线索二叉树」污染整节遍历题） */
const SECTION_KP: Record<string, string> = {
  "ds:1.2": "ds.algo.design",
  "ds:2.1": "ds.linear.seq",
  "ds:2.2": "ds.linear.seq",
  "ds:2.3": "ds.linear.linked",
  "ds:3.1": "ds.sq.stack",
  "ds:3.2": "ds.sq.queue",
  "ds:3.3": "ds.sq.apply",
  "ds:3.4": "ds.sq.apply",
  "ds:4.2": "ds.str.kmp",
  "ds:5.1": "ds.tree.bt",
  "ds:5.2": "ds.tree.bt",
  "ds:5.3": "ds.tree.trav",
  "ds:5.4": "ds.tree.forest",
  "ds:5.5": "ds.tree.huffman",
  "ds:6.1": "ds.graph.store",
  "ds:6.2": "ds.graph.store",
  "ds:6.3": "ds.graph.dfs-bfs",
  "ds:6.4": "ds.graph.sp",
  "ds:7.2": "ds.search.seq-bin",
  "ds:7.3": "ds.search.bst",
  "ds:7.4": "ds.search.b",
  "ds:7.5": "ds.search.hash",
  "ds:8.1": "ds.sort.compare",
  "ds:8.2": "ds.sort.insert",
  "ds:8.3": "ds.sort.swap",
  "ds:8.4": "ds.sort.select",
  "ds:8.5": "ds.sort.merge",
  "ds:8.6": "ds.sort.compare",
  "ds:8.7": "ds.sort.external",
  "co:1.1": "co.intro.hier",
  "co:1.2": "co.intro.hier",
  "co:1.3": "co.intro.perf",
  "co:2.1": "co.data.int",
  "co:2.2": "co.data.alu",
  "co:2.3": "co.data.float",
  "co:3.1": "co.mem.hier",
  "co:3.2": "co.mem.sram-dram",
  "co:3.3": "co.mem.sram-dram",
  "co:3.4": "co.mem.hier",
  "co:3.5": "co.mem.cache",
  "co:3.6": "co.mem.virt",
  "co:4.1": "co.isa.format",
  "co:4.2": "co.isa.format",
  "co:4.3": "co.isa.format",
  "co:4.4": "co.isa.ciscrisc",
  "co:5.1": "co.cpu.datapath",
  "co:5.2": "co.cpu.datapath",
  "co:5.3": "co.cpu.datapath",
  "co:5.4": "co.cpu.hardsoft",
  "co:5.5": "co.io.query",
  "co:5.6": "co.cpu.pipeline",
  "co:5.7": "co.cpu.pipeline",
  "co:6.1": "co.bus.arb",
  "co:6.2": "co.bus.arb",
  "co:7.1": "co.io.query",
  "co:7.2": "co.io.query",
  "co:7.3": "co.io.query",
  "os:1.1": "os.intro.feat",
  "os:1.2": "os.intro.feat",
  "os:1.3": "os.intro.int",
  "os:1.6": "os.intro.feat",
  "os:2.1": "os.proc.pcb",
  "os:2.2": "os.proc.sched",
  "os:2.3": "os.proc.sync",
  "os:2.4": "os.proc.deadlock",
  "os:3.1": "os.mem.page",
  "os:3.2": "os.mem.virt",
  "os:4.1": "os.file.struct",
  "os:4.2": "os.file.dir",
  "os:4.3": "os.file.fs",
  "os:5.1": "os.io.hw",
  "os:5.2": "os.io.spool",
  "os:5.3": "os.io.disk",
  "cn:1.1": "cn.intro.perf",
  "cn:1.2": "cn.intro.layer",
  "cn:2.1": "cn.phy.coding",
  "cn:2.2": "cn.phy.media",
  "cn:2.3": "cn.phy.media",
  "cn:3.1": "cn.dll.framing",
  "cn:3.2": "cn.dll.framing",
  "cn:3.3": "cn.dll.framing",
  "cn:3.4": "cn.dll.framing",
  "cn:3.5": "cn.dll.mac",
  "cn:3.6": "cn.dll.eth",
  "cn:3.7": "cn.dll.ppp",
  "cn:3.8": "cn.dll.eth",
  "cn:4.1": "cn.net.ip",
  "cn:4.2": "cn.net.ip",
  "cn:4.3": "cn.net.ipv6",
  "cn:4.4": "cn.net.route",
  "cn:4.5": "cn.net.ip",
  "cn:4.6": "cn.net.ip",
  "cn:4.7": "cn.net.route",
  "cn:5.1": "cn.trans.tcp",
  "cn:5.2": "cn.trans.udp",
  "cn:5.3": "cn.trans.tcp",
  "cn:6.1": "cn.app.other",
  "cn:6.2": "cn.app.dns",
  "cn:6.3": "cn.app.other",
  "cn:6.4": "cn.app.http",
  "cn:6.5": "cn.app.http",
};

const KEYWORD_RULES: Record<string, { kws: string[]; kp: string }[]> = {
  "ds:2.3": [{ kws: ["多项式", "逆置", "合并", "两个链表", "两条链"], kp: "ds.linear.poly" }],
  "ds:4.2": [
    { kws: ["next", "KMP", "kmp"], kp: "ds.str.kmp" },
    { kws: ["BF", "暴力", "简单匹配"], kp: "ds.str.match" },
  ],
  "ds:5.3": [{ kws: ["线索"], kp: "ds.tree.thread" }],
  "ds:5.5": [
    { kws: ["并查", "等价类", "Union", "Find"], kp: "ds.tree.uf" },
    { kws: ["哈夫曼", "Huffman", "WPL", "前缀", "编码"], kp: "ds.tree.huffman" },
  ],
  "ds:6.4": [
    { kws: ["Prim", "Kruskal", "最小生成", "MST", "最经济"], kp: "ds.graph.mst" },
    { kws: ["拓扑", "AOE", "关键路径", "关键活动", "AOV"], kp: "ds.graph.topo" },
    { kws: ["Dijkstra", "Floyd", "最短"], kp: "ds.graph.sp" },
  ],
  "ds:7.3": [
    { kws: ["红黑"], kp: "ds.search.rbt" },
    { kws: ["AVL", "平衡"], kp: "ds.search.avl" },
  ],
  "ds:8.5": [
    { kws: ["基数"], kp: "ds.sort.radix" },
    { kws: ["归并"], kp: "ds.sort.merge" },
  ],
  "os:2.3": [{ kws: ["哲学家", "读者", "写者", "生产者", "消费者"], kp: "os.proc.classic" }],
  "os:3.1": [
    { kws: ["首次适应", "最佳适应", "最坏适应", "伙伴", "连续分配", "分区"], kp: "os.mem.alloc" },
    { kws: ["分页", "分段", "页表", "段表", "段页"], kp: "os.mem.page" },
  ],
  "os:3.2": [{ kws: ["抖动", "工作集"], kp: "os.mem.thrash" }],
  "os:4.3": [{ kws: ["FAT", "索引", "链接", "连续分配", "空闲", "成组"], kp: "os.file.alloc" }],
  "co:2.1": [{ kws: ["海明", "CRC", "奇偶", "校验"], kp: "co.data.check" }],
  "co:6.1": [{ kws: ["带宽", "吞吐", "总线周期"], kp: "co.bus.perf" }],
  "co:7.3": [
    { kws: ["DMA", "dma"], kp: "co.io.dma" },
    { kws: ["通道"], kp: "co.io.channel" },
  ],
  "cn:3.5": [{ kws: ["CSMA", "冲突", "退避", "MAC"], kp: "cn.dll.mac" }],
  "cn:3.6": [
    { kws: ["CSMA", "冲突", "退避"], kp: "cn.dll.mac" },
    { kws: ["交换", "以太网", "VLAN", "网桥"], kp: "cn.dll.eth" },
  ],
  "cn:4.2": [{ kws: ["ARP", "ICMP"], kp: "cn.net.icmp" }],
  "cn:5.3": [
    { kws: ["拥塞", "慢开始", "慢启动", "快重传", "快恢复", "cwnd", "ssthresh"], kp: "cn.trans.cong" },
  ],
};

const OS_MEM_STEM: { re: RegExp; id: OsMemTopicId }[] = [
  { re: /伙伴/, id: "alloc-buddy" },
  { re: /首次适应|最佳适应|最坏适应/, id: "alloc-fit" },
  { re: /回收|空闲链|合并分区/, id: "alloc-coalesce" },
  { re: /二级页表|三级页表|多级页表|页目录/, id: "page-multilevel" },
  { re: /页表基址|PTBR|PDBR/, id: "page-ptbr" },
  { re: /共享页|共享段/, id: "page-share" },
  { re: /位图/, id: "page-bitmap" },
  { re: /段表|分段.*越界|越界/, id: "page-seg" },
  { re: /CLOCK|改进.?Clock|访问位.*修改位/i, id: "virt-clock" },
  { re: /Belady|FIFO|LRU|OPT|最佳置换/, id: "virt-replace" },
  { re: /有效访存|EAT/, id: "virt-eat" },
  { re: /工作集/, id: "thrash-ws" },
  { re: /抖动|缺页率/, id: "thrash-rate" },
  { re: /缺页/, id: "virt-fault" },
];

export const WD_INTRO_GROUP: ExamGroup = {
  id: "ds-intro",
  bookId: "ds",
  bookName: "数据结构",
  name: "绪论与基本概念",
  blurb: "逻辑结构、存储结构、基本概念",
};

export const WD_GROUPS: ExamGroup[] = [WD_INTRO_GROUP, ...EXAM_GROUPS];

const INTRO_TOPIC: ExamTopic = {
  id: "ds-intro-basic",
  groupId: "ds-intro",
  name: "基本概念",
  kpId: "ds.linear.seq",
};

const GROUP_MAP = new Map(WD_GROUPS.map((g) => [g.id, g]));
const BOOK_ORDER: Record<string, number> = { ds: 1, co: 2, os: 3, cn: 4 };

export interface WdClass {
  item: WangdaoItem;
  group: ExamGroup;
  topic: ExamTopic;
  kind: WangdaoKind;
  isExam: boolean;
}

export function wdKindOf(item: WangdaoItem): WangdaoKind {
  return item.kind === "big" ? "big" : "mcq";
}

export function wdKindLabel(kind: WangdaoKind | string): string {
  return kind === "big" ? "大题" : "选择";
}

function stemHay(item: WangdaoItem): string {
  const opts = item.options ? Object.values(item.options).join(" ") : "";
  return `${item.stem || ""} ${opts}`.toLowerCase();
}

export function wdAssignKp(item: WangdaoItem): string | null {
  const key = `${item.book}:${item.section}`;
  const hay = stemHay(item);
  for (const rule of KEYWORD_RULES[key] ?? []) {
    if (rule.kws.some((k) => hay.includes(k.toLowerCase()))) return rule.kp;
  }
  if (SECTION_KP[key]) return SECTION_KP[key];
  return item.kp_ids?.[0] || null;
}

function topicForKp(kpId: string, item: WangdaoItem): ExamTopic {
  if (kpId.startsWith("os.mem.")) {
    const hay = `${item.stem || ""} ${item.options ? Object.values(item.options).join(" ") : ""}`;
    for (const rule of OS_MEM_STEM) {
      if (rule.re.test(hay)) {
        const t = osMemTopic(rule.id);
        if (t) return { id: t.id, groupId: "os-mem", name: t.name, kpId: t.kpId };
      }
    }
  }
  const found = findKp(kpId);
  if (found) {
    return { id: found.kp.id, groupId: found.module.id, name: found.kp.name, kpId: found.kp.id };
  }
  return examTopic(kpId) ?? { id: kpId, groupId: WD_INTRO_GROUP.id, name: kpId, kpId };
}

export function wdClassOf(item: WangdaoItem): WdClass {
  const kpId = wdAssignKp(item);
  const kind = wdKindOf(item);
  const isExam = typeof item.year === "number" && item.year > 0;
  if (!kpId) {
    return { item, group: WD_INTRO_GROUP, topic: INTRO_TOPIC, kind, isExam };
  }
  const topic = topicForKp(kpId, item);
  const group = GROUP_MAP.get(topic.groupId) ?? examGroup(topic.groupId) ?? WD_INTRO_GROUP;
  return { item, group, topic, kind, isExam };
}

export function wdGroup(id: string): ExamGroup | undefined {
  return GROUP_MAP.get(id);
}

export function wdGroupsByBook(): { bookId: BookId; bookName: string; groups: ExamGroup[] }[] {
  const out: { bookId: BookId; bookName: string; groups: ExamGroup[] }[] = [];
  for (const g of WD_GROUPS) {
    const last = out[out.length - 1];
    if (!last || last.bookId !== g.bookId) {
      out.push({ bookId: g.bookId, bookName: g.bookName, groups: [g] });
    } else {
      last.groups.push(g);
    }
  }
  return out;
}

function sectionKey(sec: string): number[] {
  return sec.split(".").map((p) => Number(p) || 0);
}

/** 王道做题本顺序：科 → 小节 → 题号（同科内选择/大题已由 kind 滤开） */
export function wdCompare(a: WangdaoItem, b: WangdaoItem): number {
  const ba = BOOK_ORDER[a.book] ?? 99;
  const bb = BOOK_ORDER[b.book] ?? 99;
  if (ba !== bb) return ba - bb;
  const pa = a.pdf_page ?? 9999;
  const pb = b.pdf_page ?? 9999;
  if (pa !== pb) return pa - pb;
  const sa = sectionKey(a.section);
  const sb = sectionKey(b.section);
  const n = Math.max(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    const d = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (d) return d;
  }
  return a.qno - b.qno;
}

export function wdItemsInOrder(
  items: WangdaoItem[],
  opts?: { group?: string | "all"; kind?: WangdaoKind; topic?: string; examOnly?: boolean }
): WangdaoItem[] {
  let list = items;
  if (opts?.kind) list = list.filter((q) => wdKindOf(q) === opts.kind);
  if (opts?.examOnly) list = list.filter((q) => typeof q.year === "number" && q.year > 0);
  if (opts?.group && opts.group !== "all") {
    list = list.filter((q) => wdClassOf(q).group.id === opts.group);
  }
  if (opts?.topic) {
    list = list.filter((q) => wdClassOf(q).topic.id === opts.topic);
  }
  return [...list].sort(wdCompare);
}

export function wdTopicsFor(
  items: WangdaoItem[],
  groupId: string,
  kind?: WangdaoKind
): ExamTopic[] {
  const used = new Map<string, ExamTopic>();
  for (const q of wdItemsInOrder(items, { group: groupId, kind })) {
    const t = wdClassOf(q).topic;
    if (!used.has(t.id)) used.set(t.id, t);
  }
  const order = new Map<string, number>(
    groupId === "os-mem" ? OS_MEM_TOPICS.map((t, i) => [t.id, i]) : []
  );
  return [...used.values()].sort((a, b) => (order.get(a.id) ?? 100) - (order.get(b.id) ?? 100));
}

export function wdCounts(
  items: WangdaoItem[],
  groupId?: string | "all"
): { total: number; mcq: number; big: number; exam: number } {
  const list = wdItemsInOrder(items, { group: groupId ?? "all" });
  let mcq = 0;
  let big = 0;
  let exam = 0;
  for (const q of list) {
    if (wdKindOf(q) === "big") big++;
    else mcq++;
    if (typeof q.year === "number" && q.year > 0) exam++;
  }
  return { total: list.length, mcq, big, exam };
}

export function wdSetPath(opts?: {
  group?: string | "all";
  kind?: WangdaoKind;
  mode?: "proof" | "browse";
  q?: string;
  topic?: string;
  examOnly?: boolean;
}): string {
  const group = opts?.group ?? "";
  const base = group ? `/kg/wd/${group}` : "/kg/wd";
  const q = new URLSearchParams();
  if (opts?.kind) q.set("kind", opts.kind);
  if (opts?.mode === "proof") q.set("mode", "proof");
  if (opts?.q) q.set("q", opts.q);
  if (opts?.topic) q.set("topic", opts.topic);
  if (opts?.examOnly) q.set("exam", "1");
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}
