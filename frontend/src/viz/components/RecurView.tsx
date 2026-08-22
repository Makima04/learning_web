// 图解 · 递归与分治：fib(4) 的调用树 + 递归工作栈。分解→解决→合并；
// 顺带看到重复子问题（fib(2) 被算两遍）——引出记忆化/DP。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

/** 调用树结点 */
interface FNode {
  n: number; // fib 参数
  x: number;
  y: number;
  depth: number;
  ret?: number; // 已返回的值
  l: FNode | null;
  r: FNode | null;
}

// 手工布局：fib(4) 树共 9 个结点（key = 参数:第几次出现）
const POS: Record<string, [number, number]> = {
  "4:0": [230, 26],
  "3:0": [140, 88], "2:1": [330, 88],
  "2:0": [80, 150], "1:1": [220, 150], "1:2": [290, 150], "0:1": [380, 150],
  "1:0": [40, 212], "0:0": [130, 212],
};

export interface FibEvent {
  kind: "call" | "ret";
  n: number;
  /** 同参数的第几次出现（区分 fib(2) 的两棵子树） */
  which: number;
  value?: number; // ret 时的值
}

/** fib 调用轨迹（含重复子问题统计） */
export function fibEvents(n: number): { events: FibEvent[]; value: number; calls: number; dupCounts: Record<number, number> } {
  const events: FibEvent[] = [];
  const seen: Record<number, number> = {};
  let calls = 0;
  const go = (k: number): number => {
    seen[k] = (seen[k] ?? 0) + 1;
    const which = seen[k]! - 1;
    calls++;
    events.push({ kind: "call", n: k, which });
    const v = k <= 1 ? k : go(k - 1) + go(k - 2);
    events.push({ kind: "ret", n: k, which, value: v });
    return v;
  };
  const value = go(n);
  return { events, value, calls, dupCounts: seen };
}

interface RVFrame extends VizFrame {
  /** 每个结点状态 */
  states: Record<string, "calling" | "done" | "idle">;
  rets: Record<string, number>;
  stack: string[];
  cur: string | null;
}

function buildRecurFrames(): RVFrame[] {
  const frames: RVFrame[] = [];
  const { events, value, dupCounts } = fibEvents(4);
  const states: Record<string, "calling" | "done" | "idle"> = {};
  const rets: Record<string, number> = {};
  const stack: string[] = [];
  const snap = (desc: string, phase: string, cur: string | null) =>
    frames.push({ desc, phase, states: { ...states }, rets: { ...rets }, stack: [...stack], cur });

  snap(
    "求 fib(4)（fib(0)=0, fib(1)=1, fib(n)=fib(n-1)+fib(n-2)）。递归 = 分治：把 fib(4) 分解成 fib(3)+fib(2)，逐层下钻到 fib(0)/fib(1) 直接得解，再一层层「合并」回来。系统用「递归工作栈」记住每层算到哪：调用时压栈帧，返回时弹出。",
    "初始",
    null
  );
  for (const ev of events) {
    const key = `${ev.n}:${ev.which}`;
    if (ev.kind === "call") {
      states[key] = "calling";
      stack.push(`fib(${ev.n})`);
      snap(
        ev.n <= 1
          ? `调用 fib(${ev.n})：边界条件，直接返回 ${ev.n}（递归必须有出口，否则栈溢出）。`
          : `调用 fib(${ev.n})：分解为 fib(${ev.n - 1}) 与 fib(${ev.n - 2})——先算左边。栈深 ${stack.length}（递归需要的栈空间 = 树深 × 每帧大小，这是「递归空间 O(深度)」的直观来源）。`,
        "调用",
        key
      );
    } else {
      states[key] = "done";
      rets[key] = ev.value!;
      stack.pop();
      snap(
        `fib(${ev.which > 0 ? `${ev.n}（第 ${ev.which + 1} 次）` : ev.n}) = ${ev.value}${ev.n <= 1 ? "" : `（左 ${ev.n - 1} + 右 ${ev.n - 2} 合并）`}，弹栈返回给上一层。${dupCounts[ev.n]! > 1 ? `注意 fib(${ev.n}) 整个过程被算了 ${dupCounts[ev.n]} 遍——重复子问题！` : ""}`,
        "返回",
        key
      );
    }
  }
  snap(
    `fib(4) = ${value}，总调用 ${Object.values(dupCounts).reduce((a, b) => a + b, 0)} 次（公式 2·fib(n+1)−1）。优化思路：① 记忆化——算过的 fib 存表，重复子问题只算一次，O(n)；② 改迭代自底向上。分治框架（分解/解决/合并）同样适用于归并排序、快排（见各自演示），大题写递归先写出口、再写分解与合并。`,
    "完成",
    null
  );
  return frames;
}

const label = (n: number) => `fib(${n})`;

export function RecurView() {
  const frames = useMemo(buildRecurFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const edgePairs: [string, string][] = [
    ["4:0", "3:0"], ["4:0", "2:1"],
    ["3:0", "2:0"], ["3:0", "1:1"],
    ["2:0", "1:0"], ["2:0", "0:0"],
    ["2:1", "1:2"], ["2:1", "0:1"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <svg viewBox="0 0 460 240" className="w-full lg:w-[62%]">
          {edgePairs.map(([a, b]) => {
            const [x1, y1] = POS[a]!;
            const [x2, y2] = POS[b]!;
            return <line key={`${a}-${b}`} x1={x1} y1={y1 + 15} x2={x2} y2={y2 - 15} stroke={C.line} strokeWidth={1.3} />;
          })}
          {Object.entries(POS).map(([key, [x, y]]) => {
            const st = fr.states[key] ?? "idle";
            const n = Number(key.split(":")[0]);
            return (
              <g key={key} opacity={st === "idle" ? 0.45 : 1}>
                <circle
                  cx={x}
                  cy={y}
                  r={16}
                  fill={st === "calling" ? C.active : st === "done" ? C.done : C.node}
                  stroke={fr.cur === key ? C.bad : "#94a3b8"}
                  strokeWidth={fr.cur === key ? 2.4 : 1}
                />
                <text x={x} y={y + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={st === "idle" ? C.nodeText : "#fff"}>
                  {label(n).replace("fib", "f")}
                </text>
                {fr.rets[key] !== undefined && (
                  <text x={x + 18} y={y - 10} fontSize={11} fontWeight={700} fill="#047857">
                    ={fr.rets[key]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">递归工作栈（顶在上）</p>
          <div className="flex min-h-[100px] w-32 flex-col-reverse gap-1 rounded-lg border border-dashed p-1.5">
            {fr.stack.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">空</p>}
            {fr.stack.map((s, i) => (
              <span
                key={i}
                className="grid h-7 place-items-center rounded-md font-mono text-xs font-bold text-white"
                style={{ background: i === fr.stack.length - 1 ? C.active : "#64748b" }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
