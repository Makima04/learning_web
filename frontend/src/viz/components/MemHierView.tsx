// 图解 · 存储层次与局部性：金字塔「寄存器→Cache→主存→辅存」靠局部性粘合。
// 演示：同一 4×4 矩阵求和，按行扫描 vs 按列扫描，在 2 行直接映射 Cache（块=2 个元素）上命中率天差地别——数字全部由模拟现算。
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const N = 4; // 4×4 矩阵
export const BLOCK = 2; // 每块 2 个元素
export const LINES = 2; // 直接映射 2 行

export interface ScanLog {
  addr: number;
  block: number;
  line: number;
  hit: boolean;
}

export interface ScanResult {
  hits: number;
  misses: number;
  log: ScanLog[];
}

/** addr(i,j) = 4i+j；块号 = addr>>1；行号 = 块号 mod 2（直接映射） */
export function localityScan(order: "row" | "col"): ScanResult {
  const cache: Map<number, number> = new Map(); // 行号 → 块号
  const log: ScanLog[] = [];
  let hits = 0;
  const visit = (i: number, j: number) => {
    const addr = N * i + j;
    const block = addr / BLOCK | 0;
    const line = block % LINES;
    const hit = cache.get(line) === block;
    if (!hit) cache.set(line, block);
    else hits++;
    log.push({ addr, block, line, hit });
  };
  if (order === "row") for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) visit(i, j);
  else for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) visit(i, j);
  return { hits, misses: log.length - hits, log };
}

interface Frame extends VizFrame {
  step: number; // -1 = 开场；0..15 访问序号；16 = 小结
  visited: [number, number][]; // 已访问的 (i,j)
  cur?: [number, number];
  hit?: boolean;
  lineBlock: (number | null)[]; // 每行装的块号
  hits: number;
  misses: number;
}

function buildFrames(order: "row" | "col"): Frame[] {
  const r = localityScan(order);
  const lineBlock: (number | null)[] = new Array(LINES).fill(null);
  const visited: [number, number][] = [];
  const pos = (k: number): [number, number] =>
    order === "row" ? [k / N | 0, k % N] : [k % N, k / N | 0];
  const frames: Frame[] = [
    {
      step: -1,
      phase: "设置",
      desc: `把 4×4 矩阵各元素求和。存储系统：主存 16 个元素；Cache 只有 ${LINES} 行、每块 ${BLOCK} 个相邻元素、直接映射（块号 mod ${LINES} 定行）。下面逐个访问矩阵元素，看两种循环顺序的命中情况——访问次序：${order === "row" ? "先行后列（a[i][j]，j 内层）" : "先列后行（a[i][j]，i 内层）"}。`,
      visited: [], lineBlock: [...lineBlock], hits: 0, misses: 0,
    },
  ];
  r.log.forEach((e, k) => {
    const [i, j] = pos(k);
    if (!e.hit) lineBlock[e.line] = e.block;
    visited.push([i, j]);
    frames.push({
      step: k,
      phase: `访问 a[${i}][${j}]`,
      desc: `元素 a[${i}][${j}] → 主存地址 ${e.addr}，属第 ${e.block} 块 → 映射到 Cache 第 ${e.line} 行。${e.hit ? `该行正放着第 ${e.block} 块 → 命中！CPU 直接从 Cache 取，不用访主存。` : `该行放的是别的块（或空）→ 缺失，把第 ${e.block} 块（${BLOCK} 个元素）调入。${order === "col" ? "注意：块里的邻居元素（按列走根本访问不到）白白占了 Cache。" : "块里另一个元素马上就要访问——空间局部性变现。"}`}`,
      visited: [...visited],
      cur: [i, j],
      hit: e.hit,
      lineBlock: [...lineBlock],
      hits: r.log.slice(0, k + 1).filter((x) => x.hit).length,
      misses: r.log.slice(0, k + 1).filter((x) => !x.hit).length,
    });
  });
  const rate = ((r.hits / r.log.length) * 100).toFixed(0);
  frames.push({
    step: r.log.length,
    phase: "结果",
    desc:
      order === "row"
        ? `按行扫描：${r.hits} 命中 / ${r.misses} 缺失，命中率 ${rate}%。相邻元素在同一块里，访问第 1 个时把第 2 个也带进了 Cache（空间局部性）。若把块调大，命中率还能涨。`
        : `按列扫描：${r.hits} 命中 / ${r.misses} 缺失，命中率 ${rate}%。同列元素地址相隔 4，既用不上块内邻居，还全打到同一 Cache 行互相踢（冲突缺失）——前半程第 1 行完全闲置。同一程序、同一 Cache，仅仅换了循环顺序。`,
    visited: [...visited],
    lineBlock: [...lineBlock],
    hits: r.hits,
    misses: r.misses,
  });
  return frames;
}

const LEVELS = [
  { name: "寄存器", cap: "≈几百 B", speed: "0.3 ns 级", note: "编译器分配" },
  { name: "Cache", cap: "KB～MB", speed: "1～10 ns", note: "硬件管理，对程序员透明" },
  { name: "主存", cap: "GB 级", speed: "100 ns 级", note: "操作系统 + 硬件（虚拟地址）" },
  { name: "辅存", cap: "TB 级", speed: "ms 级", note: "文件系统管理" },
];

export function MemHierView() {
  const [order, setOrder] = useState<"row" | "col">("row");
  const frames = useMemo(() => buildFrames(order), [order]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const visitedSet = new Set(fr.visited.map(([i, j]) => `${i},${j}`));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {([["row", "按行扫描（j 内层）"], ["col", "按列扫描（i 内层）"]] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => { setOrder(m); }}
            className={cn(
              "rounded-md border px-3 py-1 text-xs",
              order === m ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5" style={{ width: 232 }}>
            {Array.from({ length: N * N }, (_, k) => {
              const [i, j] = [k / N | 0, k % N];
              const isCur = fr.cur?.[0] === i && fr.cur?.[1] === j;
              const seen = visitedSet.has(`${i},${j}`);
              return (
                <div
                  key={k}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-md border font-mono text-xs",
                    isCur ? "border-sky-500 bg-sky-500 font-bold text-white" : seen ? "border-emerald-500/50 bg-emerald-500/15" : "border-border bg-muted/30"
                  )}
                >
                  {String(N * i + j).padStart(2, "0")}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">格内为主存地址（a[i][j] = 4i+j）· 绿 = 已访问，蓝 = 当前</p>
        </div>
        <div className="flex-1 space-y-2">
          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold">Cache（{LINES} 行 × 每块 {BLOCK} 元素，直接映射）</span>
              <span className="font-mono">
                命中 <b className={cn(fr.hit && "text-emerald-600")}>{fr.hits}</b> / 缺失 <b className={cn(fr.hit === false && "text-rose-500")}>{fr.misses}</b>
              </span>
            </div>
            <div className="space-y-1.5">
              {fr.lineBlock.map((blk, ln) => (
                <div key={ln} className="flex items-center gap-2">
                  <span className="w-14 text-[11px] text-muted-foreground">行 {ln}（{ln === 0 ? "偶数块" : "奇数块"}）</span>
                  {blk == null ? (
                    <span className="rounded border border-dashed px-3 py-1 text-[11px] text-muted-foreground">空</span>
                  ) : (
                    <div className="flex gap-1">
                      {[blk * BLOCK, blk * BLOCK + 1].map((addr) => (
                        <span key={addr} className="rounded border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px]">
                          {String(addr).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-medium">层次</th>
                <th className="font-medium">容量</th>
                <th className="font-medium">速度</th>
                <th className="text-left font-medium">由谁管理</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l, i) => (
                <tr key={l.name} className={cn("border-t", i === 1 && "bg-sky-500/5")}>
                  <td className="py-1 font-semibold">{l.name}</td>
                  <td className="text-center font-mono">{l.cap}</td>
                  <td className="text-center font-mono">{l.speed}</td>
                  <td className="text-left">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
