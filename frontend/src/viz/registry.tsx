// 可视化注册表：新增演示只需在这里登记，图解页与模块页的入口自动出现
import type { ComponentType } from "react";
import { LinkedListView } from "@/viz/components/LinkedListView";
import { CircularQueueView } from "@/viz/components/CircularQueueView";
import { StackEvalView } from "@/viz/components/StackEvalView";
import { KmpView } from "@/viz/components/KmpView";
import { TreeTravView } from "@/viz/components/TreeTravView";
import { HuffmanView } from "@/viz/components/HuffmanView";
import { GraphScanView } from "@/viz/components/GraphScanView";
import { DijkstraView } from "@/viz/components/DijkstraView";
import { AvlView } from "@/viz/components/AvlView";
import { QuickSortView } from "@/viz/components/QuickSortView";
import { HeapSortView } from "@/viz/components/HeapSortView";
import { SeqListView } from "@/viz/components/SeqListView";
import { PolyMergeView } from "@/viz/components/PolyMergeView";
import { StackApplyView } from "@/viz/components/StackApplyView";
import { BfMatchView } from "@/viz/components/BfMatchView";
import { BtPropsView } from "@/viz/components/BtPropsView";
import { ThreadTreeView } from "@/viz/components/ThreadTreeView";
import { ForestConvertView } from "@/viz/components/ForestConvertView";
import { UnionFindView } from "@/viz/components/UnionFindView";
import { GraphStoreView } from "@/viz/components/GraphStoreView";
import { MstView } from "@/viz/components/MstView";
import { TopoSortView } from "@/viz/components/TopoSortView";
import { BinSearchView } from "@/viz/components/BinSearchView";
import { BstView } from "@/viz/components/BstView";
import { RbtView } from "@/viz/components/RbtView";
import { BTreeView } from "@/viz/components/BTreeView";
import { HashView } from "@/viz/components/HashView";
import { InsertSortView } from "@/viz/components/InsertSortView";
import { MergeSortView } from "@/viz/components/MergeSortView";
import { RadixSortView } from "@/viz/components/RadixSortView";
import { SortCompareView } from "@/viz/components/SortCompareView";
import { ExternalSortView } from "@/viz/components/ExternalSortView";
import { RecurView } from "@/viz/components/RecurView";
import { GreedyView } from "@/viz/components/GreedyView";
import { DpView } from "@/viz/components/DpView";
import { DesignView } from "@/viz/components/DesignView";
import { HierView } from "@/viz/components/HierView";
import { PerfView } from "@/viz/components/PerfView";
import { IntCodeView } from "@/viz/components/IntCodeView";
import { FloatView } from "@/viz/components/FloatView";
import { AluView } from "@/viz/components/AluView";
import { CheckCodeView } from "@/viz/components/CheckCodeView";
import { MemHierView } from "@/viz/components/MemHierView";
import { ChipView } from "@/viz/components/ChipView";
import { CacheView } from "@/viz/components/CacheView";
import { VirtMemView } from "@/viz/components/VirtMemView";
import { IsaView } from "@/viz/components/IsaView";
import { CiscRiscView } from "@/viz/components/CiscRiscView";
import { DatapathView } from "@/viz/components/DatapathView";
import { PipelineView } from "@/viz/components/PipelineView";
import { MicroView } from "@/viz/components/MicroView";
import { BusArbView } from "@/viz/components/BusArbView";
import { BusPerfView } from "@/viz/components/BusPerfView";
import { IoIntrView } from "@/viz/components/IoIntrView";
import { DmaView } from "@/viz/components/DmaView";
import { ChannelView } from "@/viz/components/ChannelView";
import { BatchView } from "@/viz/components/BatchView";
import { TrapView } from "@/viz/components/TrapView";
import { ProcStateView } from "@/viz/components/ProcStateView";
import { SchedView } from "@/viz/components/SchedView";
import { PvView } from "@/viz/components/PvView";
import { RwView } from "@/viz/components/RwView";
import { BankerView } from "@/viz/components/BankerView";
import { DynAllocView } from "@/viz/components/DynAllocView";
import { PagingView } from "@/viz/components/PagingView";
import { PageReplaceView } from "@/viz/components/PageReplaceView";
import { ThrashView } from "@/viz/components/ThrashView";
import { FileStructView } from "@/viz/components/FileStructView";
import { DirView } from "@/viz/components/DirView";
import { InodeView } from "@/viz/components/InodeView";
import { FreeSpaceView } from "@/viz/components/FreeSpaceView";
import { IoLayerView } from "@/viz/components/IoLayerView";
import { BufferView } from "@/viz/components/BufferView";
import { DiskSchedView } from "@/viz/components/DiskSchedView";
import { EncapView } from "@/viz/components/EncapView";
import { DelayView } from "@/viz/components/DelayView";
import { CodingView } from "@/viz/components/CodingView";
import { SwitchView } from "@/viz/components/SwitchView";
import { SlidingView } from "@/viz/components/SlidingView";
import { CsmaView } from "@/viz/components/CsmaView";
import { SwitchLearnView } from "@/viz/components/SwitchLearnView";
import { PppView } from "@/viz/components/PppView";
import { IpView } from "@/viz/components/IpView";
import { DvView } from "@/viz/components/DvView";
import { ArpView } from "@/viz/components/ArpView";
import { Ipv6View } from "@/viz/components/Ipv6View";
import { UdpView } from "@/viz/components/UdpView";
import { TcpView } from "@/viz/components/TcpView";
import { CongView } from "@/viz/components/CongView";
import { DnsView } from "@/viz/components/DnsView";
import { HttpView } from "@/viz/components/HttpView";
import { DhcpView } from "@/viz/components/DhcpView";

export interface VizEntry {
  /** 考点 id（lib/kg/types 的 KnowledgePoint.id） */
  kpId: string;
  Component: ComponentType;
}

/** 按图谱模块顺序排列：92 个考点全覆盖 */
export const VIZ_ENTRIES: VizEntry[] = [
  // ── 数据结构 ──
  // 线性表
  { kpId: "ds.linear.seq", Component: SeqListView },
  { kpId: "ds.linear.linked", Component: LinkedListView },
  { kpId: "ds.linear.poly", Component: PolyMergeView },
  // 栈、队列与数组
  { kpId: "ds.sq.stack", Component: StackEvalView },
  { kpId: "ds.sq.queue", Component: CircularQueueView },
  { kpId: "ds.sq.apply", Component: StackApplyView },
  // 串
  { kpId: "ds.str.match", Component: BfMatchView },
  { kpId: "ds.str.kmp", Component: KmpView },
  // 树与二叉树
  { kpId: "ds.tree.bt", Component: BtPropsView },
  { kpId: "ds.tree.trav", Component: TreeTravView },
  { kpId: "ds.tree.thread", Component: ThreadTreeView },
  { kpId: "ds.tree.forest", Component: ForestConvertView },
  { kpId: "ds.tree.huffman", Component: HuffmanView },
  { kpId: "ds.tree.uf", Component: UnionFindView },
  // 图
  { kpId: "ds.graph.store", Component: GraphStoreView },
  { kpId: "ds.graph.dfs-bfs", Component: GraphScanView },
  { kpId: "ds.graph.mst", Component: MstView },
  { kpId: "ds.graph.sp", Component: DijkstraView },
  { kpId: "ds.graph.topo", Component: TopoSortView },
  // 查找
  { kpId: "ds.search.seq-bin", Component: BinSearchView },
  { kpId: "ds.search.bst", Component: BstView },
  { kpId: "ds.search.avl", Component: AvlView },
  { kpId: "ds.search.rbt", Component: RbtView },
  { kpId: "ds.search.b", Component: BTreeView },
  { kpId: "ds.search.hash", Component: HashView },
  // 排序
  { kpId: "ds.sort.insert", Component: InsertSortView },
  { kpId: "ds.sort.swap", Component: QuickSortView },
  { kpId: "ds.sort.select", Component: HeapSortView },
  { kpId: "ds.sort.merge", Component: MergeSortView },
  { kpId: "ds.sort.radix", Component: RadixSortView },
  { kpId: "ds.sort.compare", Component: SortCompareView },
  { kpId: "ds.sort.external", Component: ExternalSortView },
  // 算法设计综合
  { kpId: "ds.algo.recur", Component: RecurView },
  { kpId: "ds.algo.greedy", Component: GreedyView },
  { kpId: "ds.algo.dp", Component: DpView },
  { kpId: "ds.algo.design", Component: DesignView },
  // ── 计算机组成原理 ──
  // 计算机系统概述
  { kpId: "co.intro.hier", Component: HierView },
  { kpId: "co.intro.perf", Component: PerfView },
  // 数据的表示与运算
  { kpId: "co.data.int", Component: IntCodeView },
  { kpId: "co.data.float", Component: FloatView },
  { kpId: "co.data.alu", Component: AluView },
  { kpId: "co.data.check", Component: CheckCodeView },
  // 存储系统
  { kpId: "co.mem.hier", Component: MemHierView },
  { kpId: "co.mem.sram-dram", Component: ChipView },
  { kpId: "co.mem.cache", Component: CacheView },
  { kpId: "co.mem.virt", Component: VirtMemView },
  // 指令系统
  { kpId: "co.isa.format", Component: IsaView },
  { kpId: "co.isa.ciscrisc", Component: CiscRiscView },
  // 中央处理器
  { kpId: "co.cpu.datapath", Component: DatapathView },
  { kpId: "co.cpu.pipeline", Component: PipelineView },
  { kpId: "co.cpu.hardsoft", Component: MicroView },
  // 总线
  { kpId: "co.bus.arb", Component: BusArbView },
  { kpId: "co.bus.perf", Component: BusPerfView },
  // 输入输出系统
  { kpId: "co.io.query", Component: IoIntrView },
  { kpId: "co.io.dma", Component: DmaView },
  { kpId: "co.io.channel", Component: ChannelView },
  // ── 操作系统 ──
  // OS 概述
  { kpId: "os.intro.feat", Component: BatchView },
  { kpId: "os.intro.int", Component: TrapView },
  // 进程管理
  { kpId: "os.proc.pcb", Component: ProcStateView },
  { kpId: "os.proc.sched", Component: SchedView },
  { kpId: "os.proc.sync", Component: PvView },
  { kpId: "os.proc.classic", Component: RwView },
  { kpId: "os.proc.deadlock", Component: BankerView },
  // 内存管理
  { kpId: "os.mem.alloc", Component: DynAllocView },
  { kpId: "os.mem.page", Component: PagingView },
  { kpId: "os.mem.virt", Component: PageReplaceView },
  { kpId: "os.mem.thrash", Component: ThrashView },
  // 文件管理
  { kpId: "os.file.struct", Component: FileStructView },
  { kpId: "os.file.dir", Component: DirView },
  { kpId: "os.file.alloc", Component: InodeView },
  { kpId: "os.file.fs", Component: FreeSpaceView },
  // I/O 管理
  { kpId: "os.io.hw", Component: IoLayerView },
  { kpId: "os.io.spool", Component: BufferView },
  { kpId: "os.io.disk", Component: DiskSchedView },
  // ── 计算机网络 ──
  // 体系结构与概述
  { kpId: "cn.intro.layer", Component: EncapView },
  { kpId: "cn.intro.perf", Component: DelayView },
  // 物理层
  { kpId: "cn.phy.coding", Component: CodingView },
  { kpId: "cn.phy.media", Component: SwitchView },
  // 数据链路层
  { kpId: "cn.dll.framing", Component: SlidingView },
  { kpId: "cn.dll.mac", Component: CsmaView },
  { kpId: "cn.dll.eth", Component: SwitchLearnView },
  { kpId: "cn.dll.ppp", Component: PppView },
  // 网络层
  { kpId: "cn.net.ip", Component: IpView },
  { kpId: "cn.net.route", Component: DvView },
  { kpId: "cn.net.icmp", Component: ArpView },
  { kpId: "cn.net.ipv6", Component: Ipv6View },
  // 传输层
  { kpId: "cn.trans.udp", Component: UdpView },
  { kpId: "cn.trans.tcp", Component: TcpView },
  { kpId: "cn.trans.cong", Component: CongView },
  // 应用层
  { kpId: "cn.app.dns", Component: DnsView },
  { kpId: "cn.app.http", Component: HttpView },
  { kpId: "cn.app.other", Component: DhcpView },
];

const MAP = new Map(VIZ_ENTRIES.map((e) => [e.kpId, e]));

/** 该考点是否有演示（模块页按钮显隐用） */
export function vizFor(kpId: string): VizEntry | undefined {
  return MAP.get(kpId);
}

export function vizKpIds(): string[] {
  return VIZ_ENTRIES.map((e) => e.kpId);
}
