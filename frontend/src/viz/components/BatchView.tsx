// 图解 · 多道程序设计（OS 特征之源）：两道作业 CPU 与 I/O 交错，单道串行 vs 多道并行。
// 时间轴与总耗时由 batchTimeline() 离散事件模拟现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface Job {
  name: string;
  cpu: number; // 每轮 CPU 时长
  io: number; // 每轮 I/O 时长（最后一轮为 0）
  rounds: number; // CPU/I/O 交替轮数
}

/** 两个作业：各 3 轮 CPU(2) + I/O(3)，末轮无 I/O */
export const JOBS: Job[] = [
  { name: "作业1", cpu: 2, io: 3, rounds: 3 },
  { name: "作业2", cpu: 2, io: 3, rounds: 3 },
];

export interface Seg {
  job: number; // -1 = CPU 空闲 / I/O 等待背景
  kind: "cpu" | "io" | "idle";
  start: number;
  len: number;
}

/** mode=single：内存一道，严格串行；mode=multi：CPU 与 I/O 并行（就绪队列 + I/O 排队，FCFS） */
export function batchTimeline(jobs: Job[], mode: "single" | "multi"): { segs: Seg[]; total: number } {
  const segs: Seg[] = [];
  let t = 0;
  if (mode === "single") {
    for (let j = 0; j < jobs.length; j++) {
      for (let r = 0; r < jobs[j]!.rounds; r++) {
        segs.push({ job: j, kind: "cpu", start: t, len: jobs[j]!.cpu });
        t += jobs[j]!.cpu;
        const io = r === jobs[j]!.rounds - 1 ? 0 : jobs[j]!.io;
        if (io > 0) {
          segs.push({ job: j, kind: "io", start: t, len: io });
          t += io;
        }
      }
    }
    return { segs, total: t };
  }
  // 多道：离散推进（1 单位时间片）
  const ready: number[] = [0, 1];
  const ioQueue: number[] = [];
  const round = [0, 0];
  const remainCpu = [jobs[0]!.cpu, jobs[1]!.cpu];
  const inIo = [false, false];
  const ioRemain = [0, 0];
  const doneAt = [0, 0];
  let running = -1;
  while ((round[0]! < jobs[0]!.rounds || round[1]! < jobs[1]!.rounds) && t < 200) {
    let cpuJob = -1;
    if (running >= 0 && remainCpu[running]! > 0) cpuJob = running;
    else if (ready.length > 0) cpuJob = ready.shift()!;
    const kind = (job: number): Seg["kind"] => (job === cpuJob ? "cpu" : ioQueue.includes(job) ? "io" : "idle");
    // 记录本时刻各作业状态（以 CPU 视角为主轴 + I/O 段合并）
    if (cpuJob >= 0) {
      segs.push({ job: cpuJob, kind: "cpu", start: t, len: 1 });
      remainCpu[cpuJob]!--;
      if (remainCpu[cpuJob]! === 0) {
        const j = jobs[cpuJob]!;
        if (round[cpuJob]! < j.rounds - 1) {
          ioQueue.push(cpuJob);
          inIo[cpuJob] = true;
          ioRemain[cpuJob] = j.io;
        } else {
          round[cpuJob]!++;
          doneAt[cpuJob] = t + 1;
        }
        running = -1;
      } else {
        running = cpuJob;
      }
    } else {
      segs.push({ job: -1, kind: "idle", start: t, len: 1 });
    }
    // I/O 推进
    for (const job of [...ioQueue]) {
      void kind(job);
      ioRemain[job]!--;
      if (ioRemain[job]! <= 0) {
        ioQueue.splice(ioQueue.indexOf(job), 1);
        round[job]!++;
        remainCpu[job] = jobs[job]!.cpu;
        ready.push(job);
      }
    }
    t++;
  }
  return { segs: mergeSegs(segs), total: Math.max(t, doneAt[0]!, doneAt[1]!) };
}

function mergeSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out.at(-1);
    if (last && last.job === s.job && last.kind === s.kind && last.start + last.len === s.start) last.len++;
    else out.push({ ...s });
  }
  return out;
}

interface Frame extends VizFrame {
  show: "intro" | "single" | "multi" | "compare";
}

const SINGLE = batchTimeline(JOBS, "single");
const MULTI = batchTimeline(JOBS, "multi");

function buildFrames(): Frame[] {
  const cpuBusy = MULTI.segs.filter((s) => s.kind === "cpu").reduce((a, s) => a + s.len, 0);
  return [
    {
      show: "intro",
      phase: "单道的问题",
      desc: "单道程序设计：内存一次只放一道作业，它算时 I/O 设备闲、它 I/O 时 CPU 闲。多道程序设计：内存同时放几道作业，操作系统在「一道等 I/O」时切换到另一道用 CPU——并发、共享、虚拟、异步四大特征皆源于此。看两道小作业（各 3 轮 CPU 2ms + I/O 3ms）在两种模式下的时间轴。",
    },
    {
      show: "single",
      phase: "单道串行",
      desc: `单道：作业1 全部做完（${JOBS[0]!.rounds}×(2+3)−3 = ${JOBS[0]!.rounds * 5 - 3}ms）才轮到作业2，总耗时 ${SINGLE.total}ms。期间 CPU 与设备永远只有一个在干活。`,
    },
    {
      show: "multi",
      phase: "多道并行",
      desc: `多道：作业1 启动 I/O 的瞬间，OS 把 CPU 切给作业2；作业2 也去 I/O 时，作业1 的 I/O 与作业2 的 CPU 重叠……总耗时降到 ${MULTI.total}ms。CPU 实际忙 ${cpuBusy}ms（利用率 ${(cpuBusy / MULTI.total * 100).toFixed(0)}%），两条 I/O 也互相错开。`,
    },
    {
      show: "compare",
      phase: "对比",
      desc: `单道 ${SINGLE.total}ms → 多道 ${MULTI.total}ms。并发的实现依赖「中断」：I/O 完成发中断 → 引发调度。共享：CPU、内存、设备被多道作业轮流使用；虚拟：每个作业都觉得自己独占机器；异步：作业推进不可预知（谁先做完取决于调度与 I/O 时机）。这也是「并发 ≠ 并行」的注脚：单核上只是交错推进。`,
    },
  ];
}

function Gantt({ segs, total, mode }: { segs: Seg[]; total: number; mode: "single" | "multi" }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">CPU / 设备</span>
        <div className="relative h-7 flex-1 overflow-hidden rounded border border-border bg-muted/30">
          {segs.map((s, i) => (
            <div
              key={i}
              className={cn(
                "absolute top-0 h-full border-r border-white/60 text-center text-[10px] font-bold leading-7 text-white",
                s.kind === "cpu" ? "bg-emerald-500" : s.kind === "io" ? "bg-sky-400" : "bg-muted"
              )}
              style={{ left: `${(s.start / total) * 100}%`, width: `${(s.len / total) * 100}%` }}
            >
              {s.kind === "cpu" ? `J${s.job + 1}算` : s.kind === "io" ? `J${s.job + 1}I/O` : ""}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between pl-26 text-[10px] text-muted-foreground">
        <span>0</span>
        <span>{mode === "single" ? `总 ${SINGLE.total}ms（CPU 与 I/O 严格串行）` : `总 ${MULTI.total}ms`}</span>
      </div>
    </div>
  );
}

export function BatchView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "single" && <Gantt segs={SINGLE.segs} total={SINGLE.total} mode="single" />}
      {fr.show === "multi" && <Gantt segs={MULTI.segs} total={MULTI.total} mode="multi" />}
      {fr.show === "compare" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">单道总耗时</p>
            <p className="font-mono text-lg font-bold text-amber-600">{SINGLE.total} ms</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">多道总耗时</p>
            <p className="font-mono text-lg font-bold text-emerald-600">{MULTI.total} ms</p>
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
