// 图解 · 动态分区分配：王道经典例——分区 100/500/200/300/600，申请 212KB。
// 首次适应选 500、最佳适应选 300、最坏适应选 600，全部由 dynAlloc() 在分区表上现算。
import { useMemo } from "react";
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

interface Frame extends VizFrame {
  policy: Policy | "intro";
}

function buildFrames(): Frame[] {
  const r = (p: Policy) => dynAlloc(INIT_PARTS, REQ, p);
  const rf = r("first");
  const rb = r("best");
  const rw = r("worst");
  return [
    {
      policy: "intro",
      phase: "问题",
      desc: `动态分区：按需划块、用完回收。空闲分区表（地址递增）：${INIT_PARTS.map((p) => p.size).join("/")} KB。进程申请 ${REQ} KB——三种算法的选择截然不同：首次适应选第 ${rf.chosen + 1} 块（${INIT_PARTS[rf.chosen]!.size}KB）、最佳适应选第 ${rb.chosen + 1} 块（${INIT_PARTS[rb.chosen]!.size}KB，最小的能放下 212 的块）、最坏适应选第 ${rw.chosen + 1} 块（${INIT_PARTS[rw.chosen]!.size}KB）。`,
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

export function DynAllocView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
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
                <p className="my-1 font-mono text-lg font-bold text-sky-600">{INIT_PARTS[r.chosen]!.size} KB → 余 {r.remain} KB</p>
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
