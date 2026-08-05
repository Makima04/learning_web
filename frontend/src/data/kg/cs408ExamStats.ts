// 由 scripts/gen_cs408_frontend.py 自动生成，勿手改。
// 数据源：papers/cs408/*.json（LLM 标注 kps）
export interface Cs408KpExamStat {
  count: number;
  yearSpan: number;
  asBigPrimary: number;
  approxPoints: number;
  /** 校准后的考频 1–5 */
  freq: number;
  /** 校准后的大题权重 0–1 */
  bigWeight: number;
}

export const CS408_EXAM_PAPER_COUNT = 15;
export const CS408_EXAM_YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

export const CS408_KP_STATS: Record<string, Cs408KpExamStat> = {
  "co.data.int": { count: 35, yearSpan: 15, asBigPrimary: 0, approxPoints: 165, freq: 5, bigWeight: 0.25 },
  "cn.net.ip": { count: 32, yearSpan: 15, asBigPrimary: 3, approxPoints: 135, freq: 5, bigWeight: 0.7 },
  "co.io.query": { count: 31, yearSpan: 15, asBigPrimary: 2, approxPoints: 75, freq: 5, bigWeight: 0.55 },
  "co.isa.format": { count: 29, yearSpan: 14, asBigPrimary: 7, approxPoints: 168, freq: 5, bigWeight: 0.8 },
  "ds.algo.design": { count: 27, yearSpan: 15, asBigPrimary: 8, approxPoints: 257, freq: 5, bigWeight: 0.9 },
  "os.intro.int": { count: 27, yearSpan: 14, asBigPrimary: 1, approxPoints: 80, freq: 5, bigWeight: 0.45 },
  "os.mem.virt": { count: 27, yearSpan: 14, asBigPrimary: 3, approxPoints: 102, freq: 5, bigWeight: 0.7 },
  "os.proc.sync": { count: 25, yearSpan: 14, asBigPrimary: 9, approxPoints: 113, freq: 5, bigWeight: 0.9 },
  "cn.trans.tcp": { count: 22, yearSpan: 13, asBigPrimary: 4, approxPoints: 79, freq: 5, bigWeight: 0.7 },
  "os.mem.page": { count: 22, yearSpan: 15, asBigPrimary: 7, approxPoints: 82, freq: 5, bigWeight: 0.8 },
  "ds.tree.bt": { count: 21, yearSpan: 10, asBigPrimary: 1, approxPoints: 91, freq: 4, bigWeight: 0.45 },
  "os.proc.pcb": { count: 21, yearSpan: 12, asBigPrimary: 1, approxPoints: 58, freq: 4, bigWeight: 0.45 },
  "co.intro.perf": { count: 20, yearSpan: 13, asBigPrimary: 2, approxPoints: 78, freq: 5, bigWeight: 0.55 },
  "co.mem.cache": { count: 20, yearSpan: 14, asBigPrimary: 4, approxPoints: 129, freq: 5, bigWeight: 0.7 },
  "os.proc.sched": { count: 20, yearSpan: 14, asBigPrimary: 2, approxPoints: 55, freq: 5, bigWeight: 0.55 },
  "os.file.fs": { count: 19, yearSpan: 12, asBigPrimary: 1, approxPoints: 50, freq: 4, bigWeight: 0.45 },
  "co.mem.virt": { count: 18, yearSpan: 13, asBigPrimary: 1, approxPoints: 111, freq: 5, bigWeight: 0.45 },
  "co.cpu.datapath": { count: 17, yearSpan: 12, asBigPrimary: 4, approxPoints: 135, freq: 4, bigWeight: 0.7 },
  "cn.intro.perf": { count: 16, yearSpan: 11, asBigPrimary: 0, approxPoints: 60, freq: 4, bigWeight: 0.25 },
  "co.cpu.pipeline": { count: 16, yearSpan: 12, asBigPrimary: 2, approxPoints: 52, freq: 4, bigWeight: 0.55 },
  "ds.graph.store": { count: 16, yearSpan: 12, asBigPrimary: 3, approxPoints: 91, freq: 4, bigWeight: 0.7 },
  "ds.linear.seq": { count: 15, yearSpan: 10, asBigPrimary: 0, approxPoints: 90, freq: 4, bigWeight: 0.25 },
  "ds.tree.huffman": { count: 15, yearSpan: 13, asBigPrimary: 2, approxPoints: 57, freq: 5, bigWeight: 0.55 },
  "co.mem.sram-dram": { count: 14, yearSpan: 11, asBigPrimary: 0, approxPoints: 50, freq: 4, bigWeight: 0.2 },
  "ds.tree.trav": { count: 14, yearSpan: 10, asBigPrimary: 0, approxPoints: 63, freq: 4, bigWeight: 0.2 },
  "cn.dll.eth": { count: 13, yearSpan: 12, asBigPrimary: 0, approxPoints: 54, freq: 4, bigWeight: 0.2 },
  "cn.dll.framing": { count: 13, yearSpan: 11, asBigPrimary: 2, approxPoints: 40, freq: 4, bigWeight: 0.55 },
  "cn.dll.mac": { count: 13, yearSpan: 13, asBigPrimary: 1, approxPoints: 33, freq: 5, bigWeight: 0.45 },
  "cn.net.route": { count: 13, yearSpan: 10, asBigPrimary: 3, approxPoints: 54, freq: 4, bigWeight: 0.7 },
  "co.bus.perf": { count: 13, yearSpan: 12, asBigPrimary: 0, approxPoints: 33, freq: 4, bigWeight: 0.2 },
  "co.data.float": { count: 13, yearSpan: 13, asBigPrimary: 1, approxPoints: 37, freq: 5, bigWeight: 0.45 },
  "co.io.dma": { count: 13, yearSpan: 10, asBigPrimary: 2, approxPoints: 52, freq: 4, bigWeight: 0.55 },
  "ds.graph.topo": { count: 13, yearSpan: 11, asBigPrimary: 2, approxPoints: 45, freq: 4, bigWeight: 0.55 },
  "os.file.alloc": { count: 13, yearSpan: 10, asBigPrimary: 5, approxPoints: 59, freq: 4, bigWeight: 0.8 },
  "os.intro.feat": { count: 13, yearSpan: 11, asBigPrimary: 1, approxPoints: 32, freq: 4, bigWeight: 0.45 },
  "co.data.alu": { count: 12, yearSpan: 10, asBigPrimary: 2, approxPoints: 114, freq: 4, bigWeight: 0.55 },
  "ds.linear.linked": { count: 12, yearSpan: 10, asBigPrimary: 3, approxPoints: 67, freq: 4, bigWeight: 0.7 },
  "ds.sort.compare": { count: 12, yearSpan: 10, asBigPrimary: 1, approxPoints: 30, freq: 4, bigWeight: 0.45 },
  "cn.app.http": { count: 11, yearSpan: 10, asBigPrimary: 0, approxPoints: 22, freq: 4, bigWeight: 0.2 },
  "cn.intro.layer": { count: 11, yearSpan: 9, asBigPrimary: 0, approxPoints: 29, freq: 3, bigWeight: 0.2 },
  "cn.phy.coding": { count: 11, yearSpan: 10, asBigPrimary: 0, approxPoints: 22, freq: 4, bigWeight: 0.2 },
  "ds.search.b": { count: 11, yearSpan: 11, asBigPrimary: 0, approxPoints: 22, freq: 4, bigWeight: 0.2 },
  "ds.sq.stack": { count: 11, yearSpan: 10, asBigPrimary: 1, approxPoints: 30, freq: 4, bigWeight: 0.45 },
  "os.file.dir": { count: 11, yearSpan: 10, asBigPrimary: 0, approxPoints: 40, freq: 4, bigWeight: 0.2 },
  "os.io.hw": { count: 11, yearSpan: 8, asBigPrimary: 0, approxPoints: 28, freq: 3, bigWeight: 0.2 },
  "os.proc.deadlock": { count: 10, yearSpan: 10, asBigPrimary: 0, approxPoints: 20, freq: 4, bigWeight: 0.2 },
  "cn.trans.cong": { count: 9, yearSpan: 9, asBigPrimary: 0, approxPoints: 39, freq: 3, bigWeight: 0.2 },
  "cn.trans.udp": { count: 9, yearSpan: 6, asBigPrimary: 0, approxPoints: 18, freq: 3, bigWeight: 0.2 },
  "ds.sort.insert": { count: 9, yearSpan: 9, asBigPrimary: 0, approxPoints: 18, freq: 3, bigWeight: 0.2 },
  "ds.sort.select": { count: 9, yearSpan: 8, asBigPrimary: 1, approxPoints: 26, freq: 3, bigWeight: 0.45 },
  "co.intro.hier": { count: 8, yearSpan: 7, asBigPrimary: 0, approxPoints: 16, freq: 3, bigWeight: 0.2 },
  "ds.graph.dfs-bfs": { count: 8, yearSpan: 8, asBigPrimary: 0, approxPoints: 16, freq: 3, bigWeight: 0.2 },
  "os.file.struct": { count: 8, yearSpan: 8, asBigPrimary: 0, approxPoints: 50, freq: 3, bigWeight: 0.2 },
  "co.bus.arb": { count: 7, yearSpan: 7, asBigPrimary: 0, approxPoints: 20, freq: 3, bigWeight: 0.2 },
  "ds.search.bst": { count: 7, yearSpan: 7, asBigPrimary: 1, approxPoints: 36, freq: 3, bigWeight: 0.45 },
  "ds.search.hash": { count: 7, yearSpan: 7, asBigPrimary: 1, approxPoints: 22, freq: 3, bigWeight: 0.45 },
  "ds.search.seq-bin": { count: 7, yearSpan: 7, asBigPrimary: 1, approxPoints: 22, freq: 3, bigWeight: 0.45 },
  "ds.sort.swap": { count: 7, yearSpan: 7, asBigPrimary: 0, approxPoints: 27, freq: 3, bigWeight: 0.2 },
  "ds.tree.forest": { count: 7, yearSpan: 7, asBigPrimary: 0, approxPoints: 14, freq: 3, bigWeight: 0.2 },
  "os.io.disk": { count: 7, yearSpan: 7, asBigPrimary: 0, approxPoints: 19, freq: 3, bigWeight: 0.2 },
  "os.proc.classic": { count: 7, yearSpan: 7, asBigPrimary: 2, approxPoints: 56, freq: 3, bigWeight: 0.55 },
  "cn.app.other": { count: 6, yearSpan: 6, asBigPrimary: 1, approxPoints: 33, freq: 3, bigWeight: 0.45 },
  "cn.net.icmp": { count: 6, yearSpan: 5, asBigPrimary: 0, approxPoints: 26, freq: 2, bigWeight: 0.2 },
  "co.cpu.hardsoft": { count: 6, yearSpan: 6, asBigPrimary: 0, approxPoints: 25, freq: 3, bigWeight: 0.2 },
  "co.mem.hier": { count: 6, yearSpan: 6, asBigPrimary: 0, approxPoints: 24, freq: 3, bigWeight: 0.2 },
  "ds.graph.mst": { count: 6, yearSpan: 6, asBigPrimary: 2, approxPoints: 28, freq: 3, bigWeight: 0.55 },
  "ds.search.avl": { count: 6, yearSpan: 6, asBigPrimary: 0, approxPoints: 12, freq: 3, bigWeight: 0.2 },
  "ds.sort.merge": { count: 6, yearSpan: 5, asBigPrimary: 0, approxPoints: 20, freq: 2, bigWeight: 0.2 },
  "cn.phy.media": { count: 5, yearSpan: 5, asBigPrimary: 0, approxPoints: 10, freq: 2, bigWeight: 0.2 },
  "ds.algo.greedy": { count: 5, yearSpan: 4, asBigPrimary: 0, approxPoints: 35, freq: 2, bigWeight: 0.2 },
  "ds.graph.sp": { count: 5, yearSpan: 5, asBigPrimary: 1, approxPoints: 18, freq: 2, bigWeight: 0.45 },
  "ds.sort.external": { count: 5, yearSpan: 5, asBigPrimary: 1, approxPoints: 18, freq: 2, bigWeight: 0.45 },
  "ds.sq.queue": { count: 5, yearSpan: 5, asBigPrimary: 1, approxPoints: 18, freq: 2, bigWeight: 0.45 },
  "os.io.spool": { count: 5, yearSpan: 5, asBigPrimary: 0, approxPoints: 10, freq: 2, bigWeight: 0.2 },
  "cn.app.dns": { count: 4, yearSpan: 4, asBigPrimary: 1, approxPoints: 15, freq: 2, bigWeight: 0.45 },
  "ds.sort.radix": { count: 4, yearSpan: 4, asBigPrimary: 0, approxPoints: 8, freq: 2, bigWeight: 0.15 },
  "ds.sq.apply": { count: 4, yearSpan: 4, asBigPrimary: 0, approxPoints: 16, freq: 2, bigWeight: 0.15 },
  "co.isa.ciscrisc": { count: 3, yearSpan: 3, asBigPrimary: 1, approxPoints: 14, freq: 2, bigWeight: 0.45 },
  "ds.algo.recur": { count: 3, yearSpan: 3, asBigPrimary: 0, approxPoints: 6, freq: 2, bigWeight: 0.15 },
  "ds.str.kmp": { count: 3, yearSpan: 3, asBigPrimary: 0, approxPoints: 6, freq: 2, bigWeight: 0.15 },
  "os.mem.alloc": { count: 3, yearSpan: 3, asBigPrimary: 0, approxPoints: 6, freq: 2, bigWeight: 0.15 },
  "os.mem.thrash": { count: 3, yearSpan: 3, asBigPrimary: 0, approxPoints: 6, freq: 2, bigWeight: 0.15 },
  "ds.tree.thread": { count: 2, yearSpan: 2, asBigPrimary: 0, approxPoints: 4, freq: 1, bigWeight: 0.15 },
  "cn.dll.ppp": { count: 1, yearSpan: 1, asBigPrimary: 0, approxPoints: 2, freq: 1, bigWeight: 0.15 },
  "cn.net.ipv6": { count: 1, yearSpan: 1, asBigPrimary: 0, approxPoints: 2, freq: 1, bigWeight: 0.15 },
  "co.data.check": { count: 1, yearSpan: 1, asBigPrimary: 0, approxPoints: 2, freq: 1, bigWeight: 0.15 },
  "ds.algo.dp": { count: 1, yearSpan: 1, asBigPrimary: 0, approxPoints: 13, freq: 1, bigWeight: 0.15 },
  "ds.linear.poly": { count: 1, yearSpan: 1, asBigPrimary: 0, approxPoints: 2, freq: 1, bigWeight: 0.15 },
};

/** 按实测考频覆盖图谱先验 freq / bigWeight */
export function applyCs408ExamStats<T extends { id: string; freq: number; bigWeight: number }>(kp: T): T {
  const s = CS408_KP_STATS[kp.id];
  if (!s) return kp;
  return { ...kp, freq: s.freq, bigWeight: s.bigWeight };
}
