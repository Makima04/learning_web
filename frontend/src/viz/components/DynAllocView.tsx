// 图解 · 动态分区：① 王道例 100/500/200/300/600 申请 212KB（首次/最佳/最坏）；
// ② 2017 选择 25 回收合并 + 最佳适应按大小重排；③ 2024 选择 27 伙伴系统（只合并等大空闲块）。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface Part {
  size: number;
  used: string | null; // 占用者（null = 空闲）
}

/** 王道例：当前空闲分区（地址递增） */
export const INIT_PARTS: Part[] = [
  { size: 100, used: null },
  { size: 500, used: null },
  { size: 200, used: null },
  { size: 300, used: null },
  { size: 600, used: null },
];
export const REQ = 212;

export type Policy = "first" | "best" | "worst";

export interface AllocResult {
  policy: Policy;
  chosen: number; // 选中的分区下标；-1 = 失败
  remain: number; // 分配后剩余（0 = 全部分配）
  leftOvers: number[]; // 各空闲分区剩余大小（顺序对应）
}

/** 三种策略各跑一遍（每次都从初始分区表开始） */
export function dynAlloc(parts: Part[], req: number, policy: Policy): AllocResult {
  const freeIdx = parts.map((p, i) => (p.used ? -1 : i)).filter((i) => i >= 0);
  const free = freeIdx.map((i) => parts[i]!.size);
  let pick = -1;
  if (policy === "first") pick = freeIdx.find((_, k) => free[k]! >= req) ?? -1;
  if (policy === "best") {
    let best = -1;
    freeIdx.forEach((idx, k) => {
      if (free[k]! >= req && (best < 0 || free[k]! < free[best]!)) best = k;
    });
    pick = best >= 0 ? freeIdx[best]! : -1;
  }
  if (policy === "worst") {
    let worst = -1;
    freeIdx.forEach((idx, k) => {
      if (free[k]! >= req && (worst < 0 || free[k]! > free[worst]!)) worst = k;
    });
    pick = worst >= 0 ? freeIdx[worst]! : -1;
  }
  const leftOvers = parts.map((p, i) => (p.used ? -1 : i === pick ? p.size - req : p.size));
  return { policy, chosen: pick, remain: pick >= 0 ? parts[pick]!.size - req : -1, leftOvers };
}

export const POLICIES: { key: Policy; name: string; desc: string }[] = [
  { key: "first", name: "首次适应", desc: "从低地址顺序找第一个够大的 → 简单、高址留下大块" },
  { key: "best", name: "最佳适应", desc: "找最小的够用块 → 剩余碎片太小无法利用" },
  { key: "worst", name: "最坏适应", desc: "找最大块分 → 剩下的仍较大可用，但大块很快耗尽" },
];

/* ---------- 2017 选择 25：回收合并 + 最佳适应重排 ---------- */

/** start 单位 K，size 单位 KB */
export interface FreeBlock {
  start: number;
  size: number;
}

/** 2017 题：当前空闲分区（题目表序，非地址序） */
export const COAL_INIT: FreeBlock[] = [
  { start: 20, size: 40 },
  { start: 500, size: 80 },
  { start: 1000, size: 100 },
  { start: 200, size: 200 },
];
/** 回收：(60K, 140KB)，与 20K/40KB、200K/200KB 都相邻 */
export const COAL_REC: FreeBlock = { start: 60, size: 140 };

/** 插入 rec，与相邻（start+size === next.start）的合并，返回按 start 升序。不改入参。 */
export function coalesce(blocks: FreeBlock[], rec: FreeBlock): FreeBlock[] {
  const all = [...blocks, rec]
    .map((b) => ({ start: b.start, size: b.size }))
    .sort((a, b) => a.start - b.start || a.size - b.size);
  const out: FreeBlock[] = [];
  for (const b of all) {
    const last = out[out.length - 1];
    if (last && last.start + last.size === b.start) last.size += b.size;
    else out.push(b);
  }
  return out;
}

/** 最佳适应：按 size 升序，size 相同按 start 升序。不改入参。 */
export function sortBestFit(blocks: FreeBlock[]): FreeBlock[] {
  return [...blocks].map((b) => ({ start: b.start, size: b.size })).sort((a, b) => a.size - b.size || a.start - b.start);
}

/* ---------- 2024 选择 27：伙伴系统 ---------- */

export interface BuddyBlock {
  start: number;
  size: number;
  used: boolean;
}

export const BUDDY_TOTAL = 1024; // 1MB = 1024KB
export const BUDDY_REQ = 128;

/** 向上取 2 的幂（伙伴分配的实际块长） */
function ceilPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * 从 total 开始，大于 req 就对半拆，直到得到 req 大小的块。
 * splits 记录每次拆出的伙伴大小（从大到小）。total/req 均为 2 的幂。
 */
export function buddyAlloc(total: number, req: number): { splits: number[]; block: number } {
  const need = ceilPow2(req);
  const splits: number[] = [];
  let cur = total;
  while (cur > need) {
    cur = Math.floor(cur / 2);
    splits.push(cur);
  }
  return { splits, block: cur };
}

/**
 * 回收一块：伙伴也空闲则合并成 2*blockSize，否则留下 blockSize。
 * 第二参沿用题面「buddyFree」——是否与等大伙伴相邻且空闲。
 */
export function buddyFree(blockSize: number, buddyFree: boolean): { merged: number } | { leftover: number } {
  return buddyFree ? { merged: blockSize * 2 } : { leftover: blockSize };
}

/**
 * 从一块 total 的空闲区出发：依次申请 allocs（向上取 2 的幂、拆左半），
 * 再释放 frees（先按起始地址匹配占用块，找不到则按大小取地址最小的占用块），
 * 回收时只与等大空闲伙伴合并（地址 = start XOR size）。
 */
export function buddySim(total: number, allocs: number[], frees: number[]): { blocks: BuddyBlock[] } {
  const blocks: BuddyBlock[] = [{ start: 0, size: total, used: false }];
  const sort = () => blocks.sort((a, b) => a.start - b.start);

  const splitUntil = (b: BuddyBlock, need: number) => {
    while (b.size > need) {
      const half = Math.floor(b.size / 2);
      b.size = half;
      blocks.push({ start: b.start + half, size: half, used: false });
    }
  };

  for (const req of allocs) {
    const need = ceilPow2(req);
    const cand = blocks
      .filter((b) => !b.used && b.size >= need)
      .sort((a, b) => a.size - b.size || a.start - b.start)[0];
    if (!cand) continue;
    splitUntil(cand, need);
    cand.used = true;
  }

  const mergeBuddies = (b: BuddyBlock) => {
    while (true) {
      const buddyStart = b.start ^ b.size;
      const i = blocks.findIndex((x) => x !== b && !x.used && x.start === buddyStart && x.size === b.size);
      if (i < 0) break;
      const buddy = blocks[i]!;
      blocks.splice(i, 1);
      b.start = Math.min(b.start, buddy.start);
      b.size *= 2;
    }
  };

  for (const v of frees) {
    const b = blocks.find((x) => x.used && x.start === v) ?? blocks.find((x) => x.used && x.size === v);
    if (!b) continue;
    b.used = false;
    mergeBuddies(b);
  }

  sort();
  return { blocks: blocks.map((b) => ({ start: b.start, size: b.size, used: b.used })) };
}

/* ---------- 适应算法（王道例，行为保持原样） ---------- */

interface AllocFrame extends VizFrame {
  policy: Policy | "intro";
}

function buildAllocFrames(): AllocFrame[] {
  const r = (p: Policy) => dynAlloc(INIT_PARTS, REQ, p);
  const rf = r("first");
  const rb = r("best");
  const rw = r("worst");
  return [
    {
      policy: "intro",
      phase: "问题",
      desc: `动态分区：按需划块、用完回收。空闲分区表（地址递增）：${INIT_PARTS.map((p) => p.size).join("/")} KB。进程申请 ${REQ} KB——三种算法的选择截然不同：首次适应选第 ${rf.chosen + 1} 块（${INIT_PARTS[rf.chosen]!.size}KB）、最佳适应选第 ${rb.chosen + 1} 块（${INIT_PARTS[rb.chosen]!.size}KB，最小的能放下 212 的块）、最坏适应选第 ${rw.chosen + 1} 块（${INIT_PARTS[rw.chosen]!.size}KB）。2019 选择 32：最容易产生内存碎片的是最佳适应。`,
    },
    { policy: "first", phase: "首次适应", desc: `从表头顺序找，${INIT_PARTS.slice(0, rf.chosen).map((p) => p.size).join("、") || "第一块"}…都不够，第一个 ≥ ${REQ} 的是 ${INIT_PARTS[rf.chosen]!.size}KB → 分配它，剩余 ${rf.remain}KB 留在表中（仍空闲）。低地址小碎片被反复利用，高地址保住大块。开销小、性能好，最常用。` },
    { policy: "best", phase: "最佳适应", desc: `扫描全部空闲块，选「最小的 ≥ ${REQ}」= ${INIT_PARTS[rb.chosen]!.size}KB → 剩余 ${rb.remain}KB——一个 88KB 的边角料，大进程用不上、小进程又未必刚好需要，产生大量难以利用的碎片（外部碎片）。名字叫「最佳」，整体效果通常不是最佳。` },
    { policy: "worst", phase: "最坏适应", desc: `选最大的 ${INIT_PARTS[rw.chosen]!.size}KB → 剩余 ${rw.remain}KB 依然是较大的可用块，碎片问题缓解；但最大块消耗得快，后来者（如 500KB 进程）可能无块可分。三种策略没有绝对赢家——空间碎片与分配速度之间的权衡。碎片解决法：紧凑（compaction，移动拼接，需重定位支持）。` },
  ];
}

function Bar({ parts, chosen }: { parts: Part[]; chosen: number }) {
  const total = parts.reduce((s, p) => s + p.size, 0);
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded border border-border">
        {parts.map((p, i) => {
          const isPick = i === chosen;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center justify-center border-r text-[11px] font-bold last:border-r-0",
                isPick ? "text-white" : "bg-muted/50 text-muted-foreground"
              )}
              style={{ width: `${(p.size / total) * 100}%`, background: isPick ? "#0ea5e9" : undefined }}
            >
              {p.size}
            </div>
          );
        })}
      </div>
      {chosen >= 0 && (
        <div className="relative h-6">
          <div
            className="absolute top-0 h-6 rounded bg-emerald-600 text-center text-[11px] font-bold leading-6 text-white"
            style={{
              left: `${(parts.slice(0, chosen).reduce((s, p) => s + p.size, 0) / total) * 100}%`,
              width: `${(REQ / total) * 100}%`,
            }}
          >
            分配 {REQ}
          </div>
          <div
            className="absolute top-0 h-6 rounded bg-amber-400 text-center text-[11px] font-bold leading-6 text-amber-900"
            style={{
              left: `${((parts.slice(0, chosen).reduce((s, p) => s + p.size, 0) + REQ) / total) * 100}%`,
              width: `${((parts[chosen]!.size - REQ) / total) * 100}%`,
            }}
          >
            余 {parts[chosen]!.size - REQ}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">宽度按容量比例 · 蓝块 = 本次选中分区</p>
    </div>
  );
}

function AllocDemo() {
  const frames = useMemo(buildAllocFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const cur = fr.policy === "intro" ? null : dynAlloc(INIT_PARTS, REQ, fr.policy);

  return (
    <div className="space-y-4">
      {fr.policy === "intro" && (
        <div className="flex flex-wrap gap-3">
          {POLICIES.map((po) => {
            const r = dynAlloc(INIT_PARTS, REQ, po.key);
            return (
              <div key={po.key} className="flex-1 rounded-xl border p-3">
                <p className="text-sm font-semibold">{po.name}</p>
                <p className="my-1 font-mono text-lg font-bold text-sky-600">
                  {INIT_PARTS[r.chosen]!.size} KB → 余 {r.remain} KB
                </p>
                <p className="text-[11px] text-muted-foreground">{po.desc}</p>
              </div>
            );
          })}
        </div>
      )}
      {cur && <Bar parts={INIT_PARTS} chosen={cur.chosen} />}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}

/* ---------- 回收合并（2017） ---------- */

type ZoneKind = "free" | "rec" | "merged" | "used";

interface ZoneSeg {
  start: number;
  size: number;
  kind: ZoneKind;
}

interface CoalFrame extends VizFrame {
  zone: ZoneSeg[];
  others: FreeBlock[];
  chain: FreeBlock[] | null;
  hi: number[];
  nFree: number;
}

function fmtBlk(b: FreeBlock): string {
  return `(${b.start}K, ${b.size}KB)`;
}

function buildCoalFrames(): CoalFrame[] {
  const rec = COAL_REC;
  const byAddr = [...COAL_INIT].sort((a, b) => a.start - b.start);
  const others = byAddr.filter((b) => b.start >= 500);
  const merged = coalesce(COAL_INIT, rec);
  const sorted = sortBestFit(merged);
  const leftMerged = coalesce([{ start: 20, size: 40 }], rec)[0]!; // 先并左邻 → 20K/180KB
  const zoneInit: ZoneSeg[] = [
    { start: 20, size: 40, kind: "free" },
    { start: 60, size: 140, kind: "used" },
    { start: 200, size: 200, kind: "free" },
  ];

  return [
    {
      phase: "2017·选择 25",
      desc: `最佳适应：每次分配/回收后按大小升序重排空闲链。当前空闲 ${byAddr.map(fmtBlk).join("、")}。回收 ${fmtBlk(rec)}。先看会不会和邻居拼起来，再看链头是谁——别被「按地址排序」带跑。`,
      zone: zoneInit,
      others,
      chain: null,
      hi: [],
      nFree: COAL_INIT.length,
    },
    {
      phase: "插入回收块",
      desc: `回收块起始 60K：左边空闲 20K 大小 40KB，20+40=60，刚好顶上；右边 60+140=200，又顶上 200K 的 200KB 空闲。地址相邻（不是「差不多靠近」）才能合并。先把 ${fmtBlk(rec)} 插进空闲链。`,
      zone: [
        { start: 20, size: 40, kind: "free" },
        { start: 60, size: 140, kind: "rec" },
        { start: 200, size: 200, kind: "free" },
      ],
      others,
      chain: null,
      hi: [20, 60, 200],
      nFree: COAL_INIT.length + 1,
    },
    {
      phase: "左邻合并",
      desc: `20K/40KB 与 60K/140KB 相邻 → 并成 ${fmtBlk(leftMerged)}。为什么先并左边？因为低地址那块的尾正好是回收块的头。此时右边 200K 仍在，下一块还要并。`,
      zone: [
        { start: 20, size: 180, kind: "merged" },
        { start: 200, size: 200, kind: "free" },
      ],
      others,
      chain: null,
      hi: [20, 200],
      nFree: 4,
    },
    {
      phase: "右邻再并",
      desc: `${fmtBlk(leftMerged)} 的尾 20+180=200，与 200K/200KB 相邻 → 三段并成 ${fmtBlk(merged[0]!)}。空闲块数：原来 4 块 + 回收 1 块 − 合并掉 2 块 = ${merged.length} 块。另两块 ${others.map(fmtBlk).join("、")} 离得远，不动。`,
      zone: [{ start: 20, size: 380, kind: "merged" }],
      others,
      chain: null,
      hi: [20],
      nFree: merged.length,
    },
    {
      phase: "最佳适应重排",
      desc: `合并后按地址是 ${merged.map(fmtBlk).join("、")}。最佳适应要按大小升序重排：${sorted.map(fmtBlk).join(" → ")}。链头是最小块 ${fmtBlk(sorted[0]!)}——不是最低地址。易错点：按地址排序会误选「3、20K、380KB」。`,
      zone: [{ start: 20, size: 380, kind: "free" }],
      others,
      chain: sorted,
      hi: [sorted[0]!.start],
      nFree: merged.length,
    },
    {
      phase: "答案",
      desc: `空闲分区 ${merged.length} 个，链第一个起始 ${sorted[0]!.start}K、大小 ${sorted[0]!.size}KB。2017 选择 25 选 B（3、500K、80KB）。不合并会得到 5 块；只并一边会得到 4 块——都是干扰项。`,
      zone: [{ start: 20, size: 380, kind: "merged" }],
      others,
      chain: sorted,
      hi: [sorted[0]!.start],
      nFree: merged.length,
    },
  ];
}

const ZONE_CLS: Record<ZoneKind, string> = {
  free: "bg-amber-400 text-amber-950",
  rec: "bg-sky-500 text-white",
  merged: "bg-emerald-600 text-white",
  used: "bg-muted/70 text-muted-foreground",
};

function ZoneBar({ zone, hi }: { zone: ZoneSeg[]; hi: number[] }) {
  const total = zone.reduce((s, z) => s + z.size, 0) || 1;
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">合并现场 20K–400K（三段将并成 380KB）</p>
      <div className="flex h-12 overflow-hidden rounded border border-border">
        {zone.map((z, i) => {
          const on = hi.includes(z.start) || z.kind === "rec" || z.kind === "merged";
          return (
            <div
              key={`${z.start}-${i}`}
              className={cn(
                "flex flex-col items-center justify-center border-r text-[10px] font-bold last:border-r-0",
                on && z.kind === "free" ? "bg-sky-500 text-white" : ZONE_CLS[z.kind]
              )}
              style={{ width: `${(z.size / total) * 100}%` }}
            >
              <span>
                {z.start}K · {z.size}KB
              </span>
              <span className="font-medium opacity-80">
                {z.kind === "rec" ? "回收" : z.kind === "merged" ? "已合并" : z.kind === "used" ? "占用" : "空闲"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FreeCards({ blocks, hi, title }: { blocks: FreeBlock[]; hi: number[]; title: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {blocks.map((b) => {
          const on = hi.includes(b.start);
          return (
            <div
              key={b.start}
              className={cn(
                "min-w-[7rem] rounded-lg border px-3 py-2 font-mono text-xs",
                on ? "border-sky-500 bg-sky-500 text-white" : "border-border bg-muted/40"
              )}
            >
              <div className="text-[10px] opacity-80">起始 {b.start}K</div>
              <div className="text-sm font-bold">{b.size} KB</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoalDemo() {
  const frames = useMemo(buildCoalFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const head = fr.chain?.[0];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">2017 选择 25 · 回收 (60K, 140KB) 后空闲链的数量与链头</p>
      <ZoneBar zone={fr.zone} hi={fr.hi} />
      <FreeCards blocks={fr.others} hi={fr.hi} title="远处两块（不参与本次合并）" />
      {fr.chain && (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">最佳适应空闲链（大小升序，链头 = 最小块）</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-sky-600">头</span>
            {fr.chain.map((b, i) => (
              <div key={b.start} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <div
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-xs font-bold",
                    i === 0 ? "border-sky-500 bg-sky-500 text-white" : "border-border bg-muted/40"
                  )}
                >
                  {b.start}K / {b.size}KB
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-md border bg-muted/40 px-2 py-1">空闲分区 {fr.nFree} 个</span>
        {head && (
          <span className="rounded-md border border-emerald-600/40 bg-emerald-500/15 px-2 py-1 font-mono font-bold text-emerald-700">
            链头 {head.start}K · {head.size}KB
          </span>
        )}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}

/* ---------- 伙伴系统（2024） ---------- */

interface BuddyFrame extends VizFrame {
  blocks: BuddyBlock[];
  hi: number[];
  showContrast: boolean;
  splits: number[];
  freeNote: string | null;
}

function buddySplitTrace(total: number, req: number): BuddyBlock[][] {
  const { splits } = buddyAlloc(total, req);
  const trace: BuddyBlock[][] = [[{ start: 0, size: total, used: false }]];
  let curStart = 0;
  let curSize = total;
  for (const half of splits) {
    const last = trace[trace.length - 1]!;
    const next: BuddyBlock[] = [];
    for (const b of last) {
      if (b.start === curStart && b.size === curSize) {
        next.push({ start: curStart, size: half, used: false });
        next.push({ start: curStart + half, size: half, used: false });
      } else {
        next.push({ start: b.start, size: b.size, used: b.used });
      }
    }
    trace.push(next);
    curSize = half;
  }
  return trace;
}

function buildBuddyFrames(): BuddyFrame[] {
  const total = BUDDY_TOTAL;
  const req = BUDDY_REQ;
  const { splits, block } = buddyAlloc(total, req);
  const trace = buddySplitTrace(total, req);
  const afterAlloc = buddySim(total, [req], []).blocks;
  const afterFree = buddySim(total, [req], [0]).blocks;
  const oneMerge = buddyFree(block, true);
  const noMerge = buddyFree(block, false);
  const dynMerged = coalesce(
    afterAlloc.filter((b) => !b.used && b.start !== 128).map((b) => ({ start: b.start, size: b.size })),
    { start: 128, size: 128 }
  );
  const dynSize = dynMerged[0]?.size ?? 0;
  const mergedTo = "merged" in oneMerge ? oneMerge.merged : block;
  const leftover = "leftover" in noMerge ? noMerge.leftover : block;

  return [
    {
      phase: "2024·选择 27",
      desc: `408：「每次回收分区时仅合并大小相等的空闲分区」= 伙伴算法。动态分区（首次/最佳/最坏）回收时只要地址相邻就合并，不管大小。下面用 ${total}KB（1MB）申请 ${req}KB 走一遍拆分与回收。`,
      blocks: trace[0]!,
      hi: [],
      showContrast: false,
      splits: [],
      freeNote: null,
    },
    {
      phase: "拆 1024→512+512",
      desc: `${total} > ${req}，对半拆出一对 ${splits[0]}KB 伙伴。伙伴地址 = 起始 XOR 大小：0 XOR ${splits[0]} = ${splits[0]}。为什么必须是 2 的幂？这样每个块都有唯一等大伙伴，合并判断只要看那一块在不在空闲。`,
      blocks: trace[1]!,
      hi: [0, splits[0]!],
      showContrast: false,
      splits: splits.slice(0, 1),
      freeNote: null,
    },
    {
      phase: "再拆 512→256+256",
      desc: `左边 ${splits[0]}KB 仍大于 ${req}，继续拆成两个 ${splits[1]}KB。右边那个 ${splits[0]}KB 原样留着——伙伴系统的空闲链按大小分桶，大块不会被这次小请求打碎。`,
      blocks: trace[2]!,
      hi: [0, splits[1]!],
      showContrast: false,
      splits: splits.slice(0, 2),
      freeNote: null,
    },
    {
      phase: `拆出 ${req} 并分配`,
      desc: `再拆 ${splits[1]} → ${splits[2]}+${splits[2]}，得到 ${block}KB，分走起始 0 的那块（绿）。留下空闲：${afterAlloc
        .filter((b) => !b.used)
        .map((b) => `${b.size}KB@${b.start}`)
        .join("、")}。拆出的伙伴依次是 ${splits.join("/")}KB。`,
      blocks: afterAlloc,
      hi: [0],
      showContrast: false,
      splits,
      freeNote: null,
    },
    {
      phase: "对比：相邻≠能合并",
      desc: `空闲 ${req}、${splits[1]}、${splits[0]} 地址连成一片。动态分区会把它们并成 ${dynSize}KB（相邻就合并、不论大小）。伙伴不行：${req} 的伙伴是已被占用的那块 ${req}，和旁边 ${splits[1]} 大小不等，不能合。这就是 2024 题的判据。`,
      blocks: afterAlloc,
      hi: [128, 256, 512],
      showContrast: true,
      splits,
      freeNote: `动态分区会并成 ${dynSize}KB；伙伴保持 ${req}/${splits[1]}/${splits[0]}`,
    },
    {
      phase: "回收：等大才并",
      desc: `现在释放起始 0 的 ${block}KB。它的伙伴（0 XOR ${block} = ${block}）也是空闲 ${block}KB → ${"merged" in oneMerge ? `合成 ${mergedTo}KB` : `留下 ${leftover}KB`}。若伙伴正被占用，就只能留下 ${leftover}KB，即使旁边有更大的空闲块。`,
      blocks: [
        { start: 0, size: mergedTo, used: false },
        { start: mergedTo, size: mergedTo, used: false },
        { start: mergedTo * 2, size: mergedTo * 2, used: false },
      ],
      hi: [0, mergedTo],
      showContrast: false,
      splits,
      freeNote: `buddyFree(${block}, true) → 合并为 ${mergedTo}KB`,
    },
    {
      phase: "答案",
      desc: `伙伴继续向上：${mergedTo} 的伙伴也空闲 → 512，再并回 ${afterFree[0]?.size ?? total}KB。首次/最佳/最坏适应回收时合并的是「地址相邻」的空闲区；只有伙伴算法限制为「大小相等的一对」。2024 选择 27 选 A 伙伴算法。`,
      blocks: afterFree,
      hi: [0],
      showContrast: false,
      splits,
      freeNote: null,
    },
  ];
}

function BuddyBar({ blocks, hi }: { blocks: BuddyBlock[]; hi: number[] }) {
  const total = blocks.reduce((s, b) => s + b.size, 0) || 1;
  return (
    <div>
      <div className="flex h-12 overflow-hidden rounded border border-border">
        {blocks.map((b, i) => {
          const on = hi.includes(b.start);
          return (
            <div
              key={`${b.start}-${i}`}
              className={cn(
                "flex flex-col items-center justify-center border-r text-[10px] font-bold last:border-r-0",
                b.used
                  ? "bg-emerald-600 text-white"
                  : on
                    ? "bg-sky-500 text-white"
                    : "bg-amber-400 text-amber-950"
              )}
              style={{ width: `${(b.size / total) * 100}%` }}
            >
              <span>{b.size}KB</span>
              <span className="font-medium opacity-80">{b.used ? "已分" : "空闲"} @{b.start}</span>
            </div>
          );
        })}
      </div>
      <div className="relative mt-0.5 h-4">
        {blocks.map((b) => (
          <span
            key={b.start}
            className="absolute text-[10px] tabular-nums text-muted-foreground"
            style={{ left: `${(b.start / total) * 100}%` }}
          >
            {b.start}
          </span>
        ))}
        <span className="absolute right-0 text-[10px] tabular-nums text-muted-foreground">{total}</span>
      </div>
    </div>
  );
}

function BuddyDemo() {
  const frames = useMemo(buildBuddyFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const { splits, block } = buddyAlloc(BUDDY_TOTAL, BUDDY_REQ);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        2024 选择 27 · 总空间 {BUDDY_TOTAL}KB，申请 {BUDDY_REQ}KB（伙伴大小 {splits.join("/")} → 块 {block}）
      </p>
      <BuddyBar blocks={fr.blocks} hi={fr.hi} />
      {fr.splits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">已拆出伙伴</span>
          {fr.splits.map((s) => (
            <span key={s} className="rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 font-mono font-bold text-sky-700">
              {s}KB
            </span>
          ))}
        </div>
      )}
      {fr.showContrast && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
            <p className="text-xs font-semibold text-rose-600">伙伴系统 · 不能合</p>
            <p className="mt-1 font-mono text-sm">
              {BUDDY_REQ}+256 <span className="font-bold">✗</span> 大小不等
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">只合并等大空闲伙伴（地址 XOR 大小）</p>
          </div>
          <div className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-3">
            <p className="text-xs font-semibold text-emerald-700">动态分区 · 相邻即合</p>
            <p className="mt-1 font-mono text-sm">
              {BUDDY_REQ}+256+512 = 896KB
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">首次/最佳/最坏适应回收都这样</p>
          </div>
        </div>
      )}
      {fr.freeNote && <p className="text-[11px] font-medium text-sky-700">{fr.freeNote}</p>}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}

/* ---------- 总览：三 tab，切走即重挂载播放器 ---------- */

type Mode = "适应算法" | "回收合并" | "伙伴系统";

export function DynAllocView() {
  const [mode, setMode] = useState<Mode>("适应算法");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["适应算法", "回收合并", "伙伴系统"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === "适应算法" ? (
        <AllocDemo key={mode} />
      ) : mode === "回收合并" ? (
        <CoalDemo key={mode} />
      ) : (
        <BuddyDemo key={mode} />
      )}
    </div>
  );
}
