// 图解 · 处理机调度：FCFS / SJF（非抢占）/ RR（q=2）三模式同数据对比。
// 甘特图逐段推进，周转时间表实时结算：SJF 平均周转最短、RR 响应最快但周转吃亏。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface Proc {
  name: string;
  arrive: number;
  burst: number;
}
export const PROCS: Proc[] = [
  { name: "P1", arrive: 0, burst: 7 },
  { name: "P2", arrive: 2, burst: 4 },
  { name: "P3", arrive: 4, burst: 1 },
  { name: "P4", arrive: 5, burst: 4 },
];
export const RR_Q = 2;

export interface Seg {
  p: number; // 进程下标
  start: number;
  end: number;
}
export interface SchedResult {
  segments: Seg[];
  completion: number[];
  tt: number[];
  avgTT: number;
}

/** FCFS：按到达顺序 */
export function fcfs(procs: Proc[]): SchedResult {
  const segments: Seg[] = [];
  let t = 0;
  const completion: number[] = [];
  procs.forEach((p, i) => {
    const start = Math.max(t, p.arrive);
    segments.push({ p: i, start, end: start + p.burst });
    t = start + p.burst;
    completion[i] = t;
  });
  const tt = completion.map((c, i) => c - procs[i]!.arrive);
  return { segments, completion, tt, avgTT: tt.reduce((a, b) => a + b, 0) / tt.length };
}

/** SJF 非抢占：每次在「已到达」里选最短作业 */
export function sjf(procs: Proc[]): SchedResult {
  const segments: Seg[] = [];
  const completion: number[] = Array.from({ length: procs.length }, () => 0);
  const done = new Set<number>();
  let t = 0;
  while (done.size < procs.length) {
    const cands = procs
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => !done.has(i) && p.arrive <= t);
    if (cands.length === 0) {
      t = Math.min(...procs.filter((_, i) => !done.has(i)).map((p) => p.arrive));
      continue;
    }
    cands.sort((a, b) => a.p.burst - b.p.burst || a.p.arrive - b.p.arrive || a.i - b.i);
    const { p, i } = cands[0]!;
    segments.push({ p: i, start: t, end: t + p.burst });
    t += p.burst;
    completion[i] = t;
    done.add(i);
  }
  const tt = completion.map((c, i) => c - procs[i]!.arrive);
  return { segments, completion, tt, avgTT: tt.reduce((a, b) => a + b, 0) / tt.length };
}

/** RR：q 时间片；新到达者先入队，被抢占者排队尾 */
export function rr(procs: Proc[], q: number): SchedResult {
  const remaining = procs.map((p) => p.burst);
  const segments: Seg[] = [];
  const completion: number[] = Array.from({ length: procs.length }, () => 0);
  const queue: number[] = [0];
  let t = procs[0]!.arrive;
  let arrived = 1;
  let done = 0;
  while (done < procs.length) {
    if (queue.length === 0) {
      // 空转：等下一个到达
      t = Math.max(t, procs[arrived]?.arrive ?? t);
      while (arrived < procs.length && procs[arrived]!.arrive <= t) queue.push(arrived++);
      continue;
    }
    const cur = queue.shift()!;
    const run = Math.min(q, remaining[cur]!);
    // 期间新到达的先排队
    while (arrived < procs.length && procs[arrived]!.arrive <= t + run) queue.push(arrived++);
    segments.push({ p: cur, start: t, end: t + run });
    t += run;
    remaining[cur]! -= run;
    if (remaining[cur] === 0) {
      completion[cur] = t;
      done++;
    } else {
      queue.push(cur);
    }
  }
  const tt = completion.map((c, i) => c - procs[i]!.arrive);
  return { segments, completion, tt, avgTT: tt.reduce((a, b) => a + b, 0) / tt.length };
}

type Mode = "FCFS" | "SJF" | "RR";
const COLORS = ["bg-sky-500", "bg-emerald-600", "bg-amber-500", "bg-violet-500"];

function buildSchedFrames(mode: Mode): { frames: SFrame[]; result: SchedResult } {
  const result = mode === "FCFS" ? fcfs(PROCS) : mode === "SJF" ? sjf(PROCS) : rr(PROCS, RR_Q);
  const total = Math.max(...result.completion);
  const frames: SFrame[] = [];
  const snap = (desc: string, phase: string, upto: number) => frames.push({ desc, phase, upto, mode });

  snap(
    `四个进程（到达/服务）：${PROCS.map((p) => `${p.name}(${p.arrive}/${p.burst})`).join("、")}。甘特图逐段推进。周转时间 = 完成 − 到达；带权周转 = 周转 / 服务。`,
    "初始",
    0
  );
  result.segments.forEach((seg, i) => {
    snap(
      `${PROCS[seg.p]!.name} 运行 [${seg.start}, ${seg.end})${mode === "RR" ? `（时间片 ${RR_Q}，用完未完就去队尾）` : mode === "SJF" ? "（当前已到达的最短作业）" : "（先来先服务，长作业会挡住后来的短作业）"}。`,
      `${PROCS[seg.p]!.name} ${seg.start}–${seg.end}`,
      i + 1
    );
  });
  snap(
    `完成。${mode === "FCFS" ? "FCFS 对短作业不利（P3 只跑 1 却等到 12）" : mode === "SJF" ? "SJF 平均周转最短，但长作业可能饿死，且突发短作业时要等当前作业跑完（这是非抢占版）" : `RR 响应最快（人人 q=${RR_Q} 就上机），但上下文切换开销与周转时间变差`}。平均周转：FCFS ${fcfs(PROCS).avgTT.toFixed(2)}、SJF ${sjf(PROCS).avgTT.toFixed(2)}、RR ${rr(PROCS, RR_Q).avgTT.toFixed(2)}。多级反馈队列 = 多个 q 递增的 RR 队列，兼顾响应与吞吐，是通用 OS 的默认。`,
    "完成",
    result.segments.length
  );
  return { frames, result };
}

interface SFrame extends VizFrame {
  upto: number;
  mode: Mode;
}

export function SchedView() {
  const [mode, setMode] = useState<Mode>("FCFS");
  const { frames, result } = useMemo(() => buildSchedFrames(mode), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const total = Math.max(...result.completion);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["FCFS", "SJF", "RR"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "RR" ? `RR (q=${RR_Q})` : m}
          </button>
        ))}
      </div>
      {/* 甘特图 */}
      <div className="space-y-1">
        <div className="relative h-9 w-full overflow-hidden rounded-lg border border-border">
          {result.segments.map((seg, i) => (
            <div
              key={i}
              className={cn(
                "absolute top-0 flex h-full items-center justify-center text-xs font-bold text-white transition-opacity",
                COLORS[seg.p % COLORS.length]!,
                i >= fr.upto && "opacity-15"
              )}
              style={{
                left: `${(seg.start / total) * 100}%`,
                width: `${((seg.end - seg.start) / total) * 100}%`,
              }}
            >
              {PROCS[seg.p]!.name}
            </div>
          ))}
        </div>
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          {Array.from({ length: total / 2 + 1 }, (_, i) => i * 2).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
      {/* 结算表 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-xs">
          <thead>
            <tr className="bg-muted/50">
              {["进程", "到达", "服务", "完成", "周转", "带权周转"].map((h) => (
                <th key={h} className="border border-border p-1.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROCS.map((p, i) => (
              <tr key={p.name}>
                <td className="border border-border p-1.5">{p.name}</td>
                <td className="border border-border p-1.5">{p.arrive}</td>
                <td className="border border-border p-1.5">{p.burst}</td>
                <td className={cn("border border-border p-1.5", result.completion[i]! <= (result.segments[fr.upto - 1]?.end ?? -1) && "bg-emerald-500/15")}>
                  {result.completion[i]}
                </td>
                <td className="border border-border p-1.5">{result.tt[i]}</td>
                <td className="border border-border p-1.5">{(result.tt[i]! / p.burst).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-bold">
              <td className="border border-border p-1.5" colSpan={4}>平均</td>
              <td className="border border-border p-1.5">{result.avgTT.toFixed(2)}</td>
              <td className="border border-border p-1.5">
                {(result.tt.reduce((s, t, i) => s + t! / PROCS[i]!.burst, 0) / PROCS.length).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
