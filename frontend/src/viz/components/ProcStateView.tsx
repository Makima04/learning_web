// 图解 · 进程五状态模型与 PCB/线程：事件序列推动状态机走位，
// 状态由 procWalk() 现算；末尾展示「进程=资源单位、线程=调度单位」。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export type PState = "create" | "ready" | "run" | "block" | "exit";

export const STATE_NAME: Record<PState, string> = {
  create: "创建",
  ready: "就绪",
  run: "运行",
  block: "阻塞",
  exit: "终止",
};

/** 事件序列：进程从创建到退出的一次完整旅程 */
export const EVENTS: { ev: string; from: PState; to: PState; note: string }[] = [
  { ev: "创建（fork）", from: "create", to: "ready", note: "分配 PCB、装入内存、进就绪队列——万事俱备只差 CPU" },
  { ev: "被调度（选中）", from: "ready", to: "run", note: "调度程序把 CPU 分给它：就绪→运行是「被动」事件，由 OS 决定" },
  { ev: "时间片到 / 抢占", from: "run", to: "ready", note: "用完时间片被拿下 CPU：运行→就绪，不是「阻塞」，它随时还能跑" },
  { ev: "再次调度", from: "ready", to: "run", note: "重新获得 CPU" },
  { ev: "请求 I/O（wait）", from: "run", to: "block", note: "主动请求未就绪的资源：运行→阻塞是进程「自愿」的等待事件" },
  { ev: "I/O 完成（中断）", from: "block", to: "ready", note: "等的事件发生了：阻塞→就绪（不是直接运行！还得排队等 CPU）" },
  { ev: "调度", from: "ready", to: "run", note: "第三次获得 CPU" },
  { ev: "exit", from: "run", to: "exit", note: "正常退出：回收资源、撤销 PCB。终止只从运行态进入" },
];

/** 走完事件序列，返回每步后的状态（测试断言终点与经过次数） */
export function procWalk(): { states: PState[]; runs: number; blocks: number } {
  let cur: PState = "create";
  const states: PState[] = [cur];
  let runs = 0;
  let blocks = 0;
  for (const e of EVENTS) {
    cur = e.to;
    if (cur === "run") runs++;
    if (cur === "block") blocks++;
    states.push(cur);
  }
  return { states, runs, blocks };
}

interface Frame extends VizFrame {
  step: number; // -1 = 五状态全景；0..EVENTS-1 事件；99 = 线程
}

const POS: Record<PState, [number, number]> = {
  create: [30, 90],
  ready: [160, 40],
  run: [310, 40],
  block: [310, 150],
  exit: [460, 90],
};

function buildFrames(): Frame[] {
  const w = procWalk();
  const frames: Frame[] = [
    {
      step: -1,
      phase: "五状态模型",
      desc: "进程五状态：创建、就绪（只差 CPU）、运行（占用 CPU，单核同时只有一个）、阻塞（等 I/O 或资源，给它 CPU 也没用）、终止。两条易混边：「运行→就绪」是被剥夺时间片（还能跑）；「运行→阻塞」是主动等事件（CPU 给它也白搭）。「阻塞→就绪」由中断唤醒，不能直达运行。右下事件序列将走完全程。",
    },
  ];
  EVENTS.forEach((e, i) => {
    frames.push({
      step: i,
      phase: e.ev,
      desc: `${e.note}。当前状态：${STATE_NAME[e.from]} → ${STATE_NAME[e.to]}。`,
    });
  });
  frames.push({
    step: 99,
    phase: "进程 vs 线程",
    desc: `整段旅程共被调度运行 ${w.runs} 次、阻塞 ${w.blocks} 次，最终终止。PCB 是进程存在的唯一标志（状态、PC、寄存器、内存、打开文件、调度信息）。引入线程后：进程是「资源分配」单位（地址空间、文件），线程是「调度执行」单位（有独立栈/寄存器/PC）；同进程内线程切换不换地址空间（开销小），一个线程阻塞，同进程其他线程仍可运行；线程间共享代码/数据/文件，各私有栈与寄存器。`,
  });
  return frames;
}

export function ProcStateView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const walk = procWalk();
  // 当前帧对应的“已走过”事件数（-1 全景 → 0 条边；事件 i → i+1 条）
  const walked = fr.step === -1 ? 0 : fr.step === 99 ? EVENTS.length : fr.step + 1;
  const curState = walk.states[Math.min(walked, walk.states.length - 1)]!;
  const isThread = fr.step === 99;

  const edgeOn = (from: PState, to: PState) =>
    EVENTS.slice(0, walked).some((e, i) => e.from === from && e.to === to && i < walked);

  return (
    <div className="space-y-4">
      {!isThread && (
        <svg viewBox="0 0 540 210" className="w-full">
          {EVENTS.map((e, i) => {
            const [x1, y1] = POS[e.from];
            const [x2, y2] = POS[e.to];
            if (!x1 || !x2) return null;
            const on = i < walked;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 + (e.from === "run" && e.to === "block" ? 10 : -12);
            return (
              <g key={i} opacity={on ? 1 : 0.35}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? C.active : C.line} strokeWidth={on ? 2.2 : 1.2} />
                <text x={mx} y={my} textAnchor="middle" fontSize={9} fill={on ? "#0369a1" : C.text}>
                  {e.ev}
                </text>
              </g>
            );
          })}
          {(Object.keys(POS) as PState[]).map((s) => {
            const [x, y] = POS[s]!;
            const active = curState === s && !isThread;
            return (
              <g key={s}>
                <circle cx={x} cy={y} r={22} fill={active ? C.active : s === "run" ? C.node : C.node} stroke={active ? C.active : "#94a3b8"} strokeWidth={active ? 2.5 : 1} />
                <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={active ? "#fff" : C.nodeText}>
                  {STATE_NAME[s]}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {isThread && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="mb-2 text-sm font-semibold">进程（资源单位）</p>
            <div className="mx-auto w-fit rounded-lg border-2 border-sky-400 p-2">
              <div className="mb-1 text-center text-[11px] text-muted-foreground">共享：代码·数据·文件·地址空间</div>
              <div className="flex gap-2">
                {["线程1 线程2", "线程2"].map((t, i) => (
                  <div key={i} className="rounded border border-emerald-400 bg-emerald-500/10 px-2 py-1 text-[11px]">
                    {t}
                    <div className="text-[10px] text-muted-foreground">私有：栈·寄存器·PC</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border p-3 text-xs leading-6">
            <p className="mb-1 text-sm font-semibold">要点</p>
            · 线程切换不切地址空间 → 开销小<br />
            · 单线程阻塞拖累整个进程；多线程不受累<br />
            · 线程间通信免内核（共享变量 + 同步）<br />
            · 内核级线程才能并行到多核；用户级线程内核不可见
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
