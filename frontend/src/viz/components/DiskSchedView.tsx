// 图解 · 磁盘调度：王道经典请求 {98,183,37,122,14,124,65,67}，当前磁头 53（柱面 0~199）。
// FCFS 640 / SSTF 236 / SCAN(LOOK) 299 / C-SCAN 153 全部由 diskSchedule() 现算，帧只画磁头轨迹。
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const CYL = 200; // 柱面 0..199
export const START = 53;
export const REQS = [98, 183, 37, 122, 14, 124, 65, 67];

export type DiskPolicy = "fcfs" | "sstf" | "scan" | "cscan";

export interface DiskResult {
  order: number[]; // 服务顺序
  moves: number; // 总移动道数
  path: number[]; // 磁头轨迹（含起点）
}

/** 四种调度算法。SCAN/LOOK 向大道方向；C-SCAN 跳回不计寻道 */
export function diskSchedule(reqs: number[], start: number, policy: DiskPolicy): DiskResult {
  if (policy === "fcfs") {
    const path = [start, ...reqs];
    const moves = path.slice(1).reduce((s, v, i) => s + Math.abs(v - path[i]!), 0);
    return { order: [...reqs], moves, path };
  }
  if (policy === "sstf") {
    let cur = start;
    const left = [...reqs];
    const order: number[] = [];
    while (left.length) {
      left.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
      const nxt = left.shift()!;
      order.push(nxt);
      cur = nxt;
    }
    const path = [start, ...order];
    return { order, moves: path.slice(1).reduce((s, v, i) => s + Math.abs(v - path[i]!), 0), path };
  }
  const ups = reqs.filter((r) => r >= start).sort((a, b) => a - b);
  const downs = reqs.filter((r) => r < start).sort((a, b) => b - a);
  if (policy === "scan") {
    // LOOK：到大请求即折返
    const order = [...ups, ...downs];
    const path = [start, ...order];
    return { order, moves: path.slice(1).reduce((s, v, i) => s + Math.abs(v - path[i]!), 0), path };
  }
  // C-SCAN（循环扫描，LOOK 变体）：向大扫完跳回最小请求继续向大
  const upsAll = [...reqs].sort((a, b) => a - b);
  const up = upsAll.filter((r) => r >= start);
  const wrap = upsAll.filter((r) => r < start).sort((a, b) => a - b);
  const order = [...up, ...wrap];
  const path = [start, ...order];
  // 服务移动：向大段 + 跳回（不计）+ 尾段
  const moves =
    (up.length ? up.at(-1)! - start : 0) +
    (wrap.length ? wrap.at(-1)! - wrap[0]! : 0) +
    (up.length && wrap.length ? 0 : 0);
  return { order, moves, path };
}

const NAMES: Record<DiskPolicy, string> = {
  fcfs: "FCFS 先来先服务",
  sstf: "SSTF 最短寻道",
  scan: "SCAN 电梯（LOOK）",
  cscan: "C-SCAN 循环扫描",
};

interface Frame extends VizFrame {
  policy: DiskPolicy;
  step: number; // 轨迹下标（0 = 起点）
}

function buildFrames(policy: DiskPolicy): Frame[] {
  const r = diskSchedule(REQS, START, policy);
  return r.path.map((cyl, i) => ({
    policy,
    step: i,
    phase: i === 0 ? NAMES[policy] : `第 ${i} 站：${r.order[i - 1]}`,
    desc:
      i === 0
        ? `磁头停在 ${START} 号柱面。等待请求：${REQS.join("、")}。${policy === "fcfs" ? "FCFS 按到达顺序服务——磁头来回横跳，公平但对机械不友好。" : policy === "sstf" ? "SSTF 每次挑离当前最近的请求，局部最优但可能饿死远处请求（磁道响应方差大）。" : policy === "scan" ? "SCAN 像电梯：沿一个方向扫到底（LOOK 到最远请求即折返），再折返扫另一方向——对两端公平。" : "C-SCAN 单向服务：只向大方向扫，到头跳回最小端再来——各柱面等待时间更均匀。"}`
        : `访问 ${r.order[i - 1]} 号柱面（${i === r.path.length - 1 ? "最后一站" : `累计移动 ${Math.abs(cyl - START)} 道（相对起点）`}）。${i === r.path.length - 1 ? `服务顺序 ${r.order.join("→")}，总寻道 ${r.moves} 道。${policy === "cscan" ? "（跳回段不计寻道）" : ""}` : ""}`,
  }));
}

function Axis({ path, step }: { path: number[]; step: number }) {
  const x = (cyl: number) => 30 + (cyl / (CYL - 1)) * 440;
  const cur = path[step]!;
  return (
    <svg viewBox="0 0 500 130" className="w-full">
      <line x1={30} y1={90} x2={470} y2={90} stroke="#94a3b8" strokeWidth={1.5} />
      {[0, 50, 100, 150, 199].map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={86} x2={x(t)} y2={94} stroke="#94a3b8" />
          <text x={x(t)} y={106} textAnchor="middle" fontSize={9} fill={C.text}>{t}</text>
        </g>
      ))}
      {/* 轨迹折线 */}
      <path
        d={path.slice(0, step + 1).map((cyl, i) => `${i === 0 ? "M" : "L"}${x(cyl)},${i === 0 ? 90 : 40 + Math.min(i, 5) * 8}`).join(" ")}
        fill="none"
        stroke={C.active}
        strokeWidth={1.8}
      />
      {/* 请求点 */}
      {REQS.map((req) => {
        const served = path.slice(1, step + 1).includes(req);
        return (
          <circle key={req} cx={x(req)} cy={90} r={5} fill={served ? C.done : "#fff"} stroke={served ? C.done : "#94a3b8"} strokeWidth={1.5} />
        );
      })}
      {/* 当前磁头 */}
      <polygon points={`${x(cur) - 7},24 ${x(cur) + 7},24 ${x(cur)},36`} fill={C.bad} />
      <text x={x(cur)} y={18} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.bad}>{cur}</text>
    </svg>
  );
}

export function DiskSchedView() {
  const [policy, setPolicy] = useState<DiskPolicy>("sstf");
  const frames = useMemo(() => buildFrames(policy), [policy]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const r = diskSchedule(REQS, START, policy);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(NAMES) as DiskPolicy[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPolicy(k)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs",
              policy === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {NAMES[k]}
          </button>
        ))}
        <span className="ml-auto rounded bg-muted px-2 py-1 text-xs font-mono">总寻道：{r.moves} 道</span>
      </div>
      <Axis path={r.path} step={fr.step} />
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
