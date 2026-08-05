// 408 知识图谱（三级：书 → 模块 → 考点）
// freq / bigWeight 为大纲先验；导出时由 index.ts 用 cs408ExamStats（真题 LLM 标注）校准。
import type { KgBook } from "@/lib/kg/types";

export const CS408_BOOKS: KgBook[] = [
  {
    id: "ds",
    name: "数据结构",
    subject: "cs408",
    order: 1,
    modules: [
      {
        id: "ds-linear",
        name: "线性表",
        order: 1,
        kps: [
          { id: "ds.linear.seq", name: "顺序表与操作复杂度", freq: 3, bigWeight: 0.2, tags: ["基础"] },
          { id: "ds.linear.linked", name: "单链表/双链表/循环链表", freq: 4, bigWeight: 0.45, tags: ["基础"] },
          { id: "ds.linear.poly", name: "链表应用（多项式/合并/逆置）", freq: 3, bigWeight: 0.55, prereqs: ["ds.linear.linked"] },
        ],
      },
      {
        id: "ds-stack-queue",
        name: "栈、队列与数组",
        order: 2,
        kps: [
          { id: "ds.sq.stack", name: "栈与表达式求值/括号匹配", freq: 4, bigWeight: 0.4 },
          { id: "ds.sq.queue", name: "循环队列与双端队列", freq: 3, bigWeight: 0.3 },
          { id: "ds.sq.apply", name: "栈队列综合应用", freq: 3, bigWeight: 0.5, prereqs: ["ds.sq.stack", "ds.sq.queue"] },
        ],
      },
      {
        id: "ds-string",
        name: "串",
        order: 3,
        kps: [
          { id: "ds.str.kmp", name: "KMP 与 next 数组", freq: 3, bigWeight: 0.35 },
          { id: "ds.str.match", name: "串匹配暴力与改进", freq: 2, bigWeight: 0.2, prereqs: ["ds.str.kmp"] },
        ],
      },
      {
        id: "ds-tree",
        name: "树与二叉树",
        order: 4,
        kps: [
          { id: "ds.tree.bt", name: "二叉树性质与存储", freq: 5, bigWeight: 0.5 },
          { id: "ds.tree.trav", name: "遍历（递归/非递归/层次）", freq: 5, bigWeight: 0.7, prereqs: ["ds.tree.bt"] },
          { id: "ds.tree.thread", name: "线索二叉树", freq: 2, bigWeight: 0.25, prereqs: ["ds.tree.trav"] },
          { id: "ds.tree.forest", name: "树/森林与二叉树转换", freq: 3, bigWeight: 0.35, prereqs: ["ds.tree.bt"] },
          { id: "ds.tree.huffman", name: "哈夫曼树与编码", freq: 4, bigWeight: 0.45, prereqs: ["ds.tree.bt"] },
          { id: "ds.tree.uf", name: "并查集", freq: 3, bigWeight: 0.4 },
        ],
      },
      {
        id: "ds-graph",
        name: "图",
        order: 5,
        kps: [
          { id: "ds.graph.store", name: "邻接矩阵/邻接表", freq: 4, bigWeight: 0.35 },
          { id: "ds.graph.dfs-bfs", name: "DFS/BFS 与应用", freq: 5, bigWeight: 0.65, prereqs: ["ds.graph.store"] },
          { id: "ds.graph.mst", name: "最小生成树（Prim/Kruskal）", freq: 4, bigWeight: 0.55, prereqs: ["ds.graph.store", "ds.tree.uf"] },
          { id: "ds.graph.sp", name: "最短路径（Dijkstra/Floyd）", freq: 4, bigWeight: 0.6, prereqs: ["ds.graph.store"] },
          { id: "ds.graph.topo", name: "拓扑排序与关键路径", freq: 4, bigWeight: 0.55, prereqs: ["ds.graph.dfs-bfs"] },
        ],
      },
      {
        id: "ds-search",
        name: "查找",
        order: 6,
        kps: [
          { id: "ds.search.seq-bin", name: "顺序/折半查找", freq: 3, bigWeight: 0.2 },
          { id: "ds.search.bst", name: "二叉排序树", freq: 4, bigWeight: 0.45 },
          { id: "ds.search.avl", name: "平衡二叉树 AVL", freq: 4, bigWeight: 0.5, prereqs: ["ds.search.bst"] },
          { id: "ds.search.rbt", name: "红黑树要点", freq: 3, bigWeight: 0.35, prereqs: ["ds.search.bst"] },
          { id: "ds.search.b", name: "B 树 / B+ 树", freq: 4, bigWeight: 0.5 },
          { id: "ds.search.hash", name: "散列查找与冲突处理", freq: 4, bigWeight: 0.45 },
        ],
      },
      {
        id: "ds-sort",
        name: "排序",
        order: 7,
        kps: [
          { id: "ds.sort.insert", name: "插入类排序", freq: 3, bigWeight: 0.25 },
          { id: "ds.sort.swap", name: "交换类（冒泡/快排）", freq: 5, bigWeight: 0.55 },
          { id: "ds.sort.select", name: "选择类（简单选择/堆排）", freq: 4, bigWeight: 0.5 },
          { id: "ds.sort.merge", name: "归并排序", freq: 4, bigWeight: 0.45 },
          { id: "ds.sort.radix", name: "基数排序", freq: 2, bigWeight: 0.2 },
          { id: "ds.sort.compare", name: "排序稳定性与复杂度对比", freq: 5, bigWeight: 0.4 },
          { id: "ds.sort.external", name: "外部排序要点", freq: 2, bigWeight: 0.25 },
        ],
      },
      {
        id: "ds-algo",
        name: "算法设计综合",
        order: 8,
        kps: [
          { id: "ds.algo.recur", name: "递归与分治", freq: 4, bigWeight: 0.55 },
          { id: "ds.algo.greedy", name: "贪心", freq: 3, bigWeight: 0.4 },
          { id: "ds.algo.dp", name: "动态规划（408 尺度）", freq: 3, bigWeight: 0.5 },
          { id: "ds.algo.design", name: "综合题算法设计与复杂度", freq: 5, bigWeight: 0.85, prereqs: ["ds.algo.recur"] },
        ],
      },
    ],
  },
  {
    id: "co",
    name: "计算机组成原理",
    subject: "cs408",
    order: 2,
    modules: [
      {
        id: "co-intro",
        name: "计算机系统概述",
        order: 1,
        kps: [
          { id: "co.intro.hier", name: "层次结构与冯·诺依曼", freq: 3, bigWeight: 0.15 },
          { id: "co.intro.perf", name: "性能指标（CPI/MIPS/主频）", freq: 4, bigWeight: 0.25 },
        ],
      },
      {
        id: "co-data",
        name: "数据的表示与运算",
        order: 2,
        kps: [
          { id: "co.data.int", name: "定点数原反补移码", freq: 5, bigWeight: 0.45 },
          { id: "co.data.float", name: "IEEE754 浮点表示与运算", freq: 5, bigWeight: 0.7 },
          { id: "co.data.alu", name: "ALU 与加减乘除实现", freq: 4, bigWeight: 0.55, prereqs: ["co.data.int"] },
          { id: "co.data.check", name: "校验码（奇偶/CRC/海明）", freq: 3, bigWeight: 0.3 },
        ],
      },
      {
        id: "co-mem",
        name: "存储系统",
        order: 3,
        kps: [
          { id: "co.mem.hier", name: "存储层次与局部性", freq: 4, bigWeight: 0.3 },
          { id: "co.mem.sram-dram", name: "SRAM/DRAM 与芯片扩展", freq: 4, bigWeight: 0.5 },
          { id: "co.mem.cache", name: "Cache 映射/替换/写策略", freq: 5, bigWeight: 0.8, prereqs: ["co.mem.hier"] },
          { id: "co.mem.virt", name: "虚拟存储器与 TLB", freq: 5, bigWeight: 0.75, prereqs: ["co.mem.cache"] },
        ],
      },
      {
        id: "co-isa",
        name: "指令系统",
        order: 4,
        kps: [
          { id: "co.isa.format", name: "指令格式与寻址方式", freq: 5, bigWeight: 0.55 },
          { id: "co.isa.ciscrisc", name: "CISC/RISC", freq: 3, bigWeight: 0.2 },
        ],
      },
      {
        id: "co-cpu",
        name: "中央处理器",
        order: 5,
        kps: [
          { id: "co.cpu.datapath", name: "数据通路与控制器", freq: 4, bigWeight: 0.55 },
          { id: "co.cpu.pipeline", name: "流水线原理与冒险", freq: 5, bigWeight: 0.85, prereqs: ["co.cpu.datapath"] },
          { id: "co.cpu.hardsoft", name: "硬布线/微程序控制器", freq: 3, bigWeight: 0.35 },
        ],
      },
      {
        id: "co-bus",
        name: "总线",
        order: 6,
        kps: [
          { id: "co.bus.arb", name: "总线仲裁与定时", freq: 3, bigWeight: 0.25 },
          { id: "co.bus.perf", name: "总线性能指标", freq: 3, bigWeight: 0.2 },
        ],
      },
      {
        id: "co-io",
        name: "输入输出系统",
        order: 7,
        kps: [
          { id: "co.io.query", name: "程序查询与中断", freq: 4, bigWeight: 0.45 },
          { id: "co.io.dma", name: "DMA", freq: 4, bigWeight: 0.5, prereqs: ["co.io.query"] },
          { id: "co.io.channel", name: "通道方式要点", freq: 2, bigWeight: 0.2 },
        ],
      },
    ],
  },
  {
    id: "os",
    name: "操作系统",
    subject: "cs408",
    order: 3,
    modules: [
      {
        id: "os-intro",
        name: "OS 概述",
        order: 1,
        kps: [
          { id: "os.intro.feat", name: "特征/功能/运行环境", freq: 3, bigWeight: 0.15 },
          { id: "os.intro.int", name: "中断与系统调用", freq: 4, bigWeight: 0.3 },
        ],
      },
      {
        id: "os-process",
        name: "进程管理",
        order: 2,
        kps: [
          { id: "os.proc.pcb", name: "进程与 PCB/线程", freq: 5, bigWeight: 0.4 },
          { id: "os.proc.sched", name: "调度算法（FCFS/SJF/RR/多级反馈）", freq: 5, bigWeight: 0.7 },
          { id: "os.proc.sync", name: "同步互斥与信号量/管程", freq: 5, bigWeight: 0.85, prereqs: ["os.proc.pcb"] },
          { id: "os.proc.classic", name: "经典同步问题", freq: 5, bigWeight: 0.8, prereqs: ["os.proc.sync"] },
          { id: "os.proc.deadlock", name: "死锁（条件/避免/银行家/检测）", freq: 5, bigWeight: 0.75 },
        ],
      },
      {
        id: "os-mem",
        name: "内存管理",
        order: 3,
        kps: [
          { id: "os.mem.alloc", name: "连续分配与动态分区", freq: 3, bigWeight: 0.3 },
          { id: "os.mem.page", name: "分页/分段/段页", freq: 5, bigWeight: 0.65 },
          { id: "os.mem.virt", name: "虚拟内存与页面置换", freq: 5, bigWeight: 0.8, prereqs: ["os.mem.page"] },
          { id: "os.mem.thrash", name: "抖动与工作集", freq: 3, bigWeight: 0.35, prereqs: ["os.mem.virt"] },
        ],
      },
      {
        id: "os-file",
        name: "文件管理",
        order: 4,
        kps: [
          { id: "os.file.struct", name: "文件逻辑/物理结构", freq: 4, bigWeight: 0.4 },
          { id: "os.file.dir", name: "目录结构与文件共享", freq: 3, bigWeight: 0.3 },
          { id: "os.file.alloc", name: "磁盘分配（连续/链接/索引）", freq: 4, bigWeight: 0.45 },
          { id: "os.file.fs", name: "文件系统实现与空闲管理", freq: 3, bigWeight: 0.4 },
        ],
      },
      {
        id: "os-io",
        name: "I/O 管理",
        order: 5,
        kps: [
          { id: "os.io.hw", name: "I/O 控制方式", freq: 3, bigWeight: 0.25 },
          { id: "os.io.spool", name: "缓冲与 SPOOLing", freq: 3, bigWeight: 0.3 },
          { id: "os.io.disk", name: "磁盘调度", freq: 4, bigWeight: 0.45 },
        ],
      },
    ],
  },
  {
    id: "cn",
    name: "计算机网络",
    subject: "cs408",
    order: 4,
    modules: [
      {
        id: "cn-intro",
        name: "体系结构与概述",
        order: 1,
        kps: [
          { id: "cn.intro.layer", name: "OSI/TCP-IP 分层与封装", freq: 4, bigWeight: 0.25 },
          { id: "cn.intro.perf", name: "时延/带宽/吞吐量", freq: 3, bigWeight: 0.2 },
        ],
      },
      {
        id: "cn-phy",
        name: "物理层",
        order: 2,
        kps: [
          { id: "cn.phy.coding", name: "编码与调制", freq: 2, bigWeight: 0.15 },
          { id: "cn.phy.media", name: "传输介质与交换", freq: 2, bigWeight: 0.15 },
        ],
      },
      {
        id: "cn-dll",
        name: "数据链路层",
        order: 3,
        kps: [
          { id: "cn.dll.framing", name: "成帧/差错/流量控制", freq: 4, bigWeight: 0.4 },
          { id: "cn.dll.mac", name: "CSMA/CD/CA 与 MAC", freq: 4, bigWeight: 0.45 },
          { id: "cn.dll.eth", name: "以太网与交换机", freq: 4, bigWeight: 0.4 },
          { id: "cn.dll.ppp", name: "PPP", freq: 2, bigWeight: 0.15 },
        ],
      },
      {
        id: "cn-net",
        name: "网络层",
        order: 4,
        kps: [
          { id: "cn.net.ip", name: "IP 地址/子网/CIDR", freq: 5, bigWeight: 0.65 },
          { id: "cn.net.route", name: "路由算法与协议（RIP/OSPF/BGP）", freq: 5, bigWeight: 0.7, prereqs: ["cn.net.ip"] },
          { id: "cn.net.icmp", name: "ICMP/ARP", freq: 3, bigWeight: 0.3 },
          { id: "cn.net.ipv6", name: "IPv6 要点", freq: 3, bigWeight: 0.25 },
        ],
      },
      {
        id: "cn-trans",
        name: "传输层",
        order: 5,
        kps: [
          { id: "cn.trans.udp", name: "UDP", freq: 3, bigWeight: 0.25 },
          { id: "cn.trans.tcp", name: "TCP 连接/可靠/流量控制", freq: 5, bigWeight: 0.75 },
          { id: "cn.trans.cong", name: "TCP 拥塞控制", freq: 5, bigWeight: 0.8, prereqs: ["cn.trans.tcp"] },
        ],
      },
      {
        id: "cn-app",
        name: "应用层",
        order: 6,
        kps: [
          { id: "cn.app.dns", name: "DNS", freq: 4, bigWeight: 0.35 },
          { id: "cn.app.http", name: "HTTP/HTTPS/邮件", freq: 4, bigWeight: 0.4 },
          { id: "cn.app.other", name: "FTP/DHCP 等", freq: 2, bigWeight: 0.2 },
        ],
      },
    ],
  },
];
