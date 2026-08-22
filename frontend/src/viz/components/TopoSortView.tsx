// 图解 · 拓扑排序（AOV 网，删入度 0 点法）+ 关键路径（AOE 网，ve/vl 双表）。
// 拓扑序列不唯一；关键活动 e=l，决定了工程最短工期。
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface DEdge {
  a: string;
  b: string;
  w: number;
}
/** AOE 网（DAG）：V1 是源点，V6 是汇点；关键路径唯一：V1→V3→V4→V6，长 8 */
export const AOE: DEdge[] = [
  { a: "1", b: "2", w: 3 }, { a: "1", b: "3", w: 2 },
  { a: "2", b: "4", w: 2 }, { a: "3", b: "4", w: 4 }, { a: "3", b: "5", w: 3 },
  { a: "4", b: "6", w: 2 }, { a: "5", b: "6", w: 2 },
];
export const AOV_NODES = ["1", "2", "3", "4", "5", "6"];
const POS: Record<string, [number, number]> = {
  "1": [40, 110], "2": [150, 45], "3": [150, 175], "4": [270, 45], "5": [270, 175], "6": [380, 110],
};

/** 拓扑排序：反复取入度 0 的顶点（编号小者优先），删其出边 */
export function topoFrames(): { frames: TFrame[]; order: string[] } {
  const frames: TFrame[] = [];
  const indeg: Record<string, number> = {};
  AOV_NODES.forEach((v) => (indeg[v] = 0));
  for (const e of AOE) indeg[e.b]!++;
  const removed = new Set<string>();
  const order: string[] = [];
  const snap = (desc: string, phase: string, cur?: string) =>
    frames.push({ desc, phase, cur, removed: new Set(removed), indeg: { ...indeg }, order: [...order] });

  snap("AOV 网用有向边表达活动间的先后约束（边 = 先修关系）。拓扑排序：反复挑「入度 0」（没有前驱）的顶点输出，再删掉它的所有出边（后继入度减 1）。若中途没有入度 0 的点但顶点没取完 → 有环，拓扑序列不存在——这是判 DAG 的标准方法。", "初始");
  while (removed.size < AOV_NODES.length) {
    const cands = AOV_NODES.filter((v) => !removed.has(v) && indeg[v] === 0);
    const cur = cands[0]!;
    order.push(cur);
    snap(`当前入度表里为 0 的：${cands.join("、")}。取编号最小的 ${cur} 输出，删它的出边（后继入度 -1）。序列不唯一——比较类大题常问「下列哪个不可能是拓扑序列」。`, "取点", cur);
    removed.add(cur);
    for (const e of AOE) if (e.a === cur) indeg[e.b]!--;
  }
  snap(`拓扑序列：${order.join("→")}（全长 ${order.length}）。注意删边只是逻辑操作，实际用入度数组不断减，不真改图。`, "完成");
  return { frames, order };
}

export interface CriticalResult {
  ve: Record<string, number>;
  vl: Record<string, number>;
  /** 关键活动（e = l） */
  crit: DEdge[];
  length: number;
  topo: string[];
}

/** 关键路径：按拓扑序求 ve（事件最早），逆序求 vl（事件最迟），活动 e/l 相等者为关键活动 */
export function criticalPath(): CriticalResult {
  const { order } = topoFrames();
  const ve: Record<string, number> = {};
  const vl: Record<string, number> = {};
  for (const v of order) {
    ve[v] = Math.max(0, ...AOE.filter((e) => e.b === v).map((e) => ve[e.a]! + e.w));
  }
  const last = order.at(-1)!;
  const total = ve[last]!;
  for (const v of [...order].reverse()) {
    const outs = AOE.filter((e) => e.a === v);
    vl[v] = outs.length ? Math.min(...outs.map((e) => vl[e.b]! - e.w)) : total;
  }
  const crit = AOE.filter((e) => ve[e.a]! === vl[e.b]! - e.w);
  return { ve, vl, crit, length: total, topo: order };
}

interface TFrame extends VizFrame {
  cur?: string;
  removed: Set<string>;
  indeg: Record<string, number>;
  order: string[];
}
interface CFrame extends VizFrame {
  ve: Record<string, number>;
  vl: Record<string, number>;
  crit: DEdge[];
  hiNode?: string;
}

function buildCriticalFrames(): CFrame[] {
  const frames: CFrame[] = [];
  const { ve, vl, crit, length, topo } = criticalPath();
  const veP: Record<string, number> = {};
  const vlP: Record<string, number> = {};
  const snap = (desc: string, phase: string, hiNode?: string) =>
    frames.push({ desc, phase, ve: { ...veP }, vl: { ...vlP }, crit: [], hiNode });

  snap("AOE 网的边是活动（带权 = 工期），顶点是事件。关键路径四步：① 按拓扑序求每个事件的最早开始 ve（所有入边完成的最晚时刻）；② 按逆拓扑序求最迟开始 vl（不拖累总工期的下限）；③ 活动的最早 e = 起点 ve；④ 活动的最迟 l = 终点 vl − 权。e = l 的活动没有机动时间，是关键活动。", "初始");
  for (const v of topo) {
    veP[v] = ve[v]!;
    const ins = AOE.filter((e) => e.b === v);
    snap(
      ins.length
        ? `ve(${v}) = max{ ${ins.map((e) => `ve(${e.a})+${e.w} = ${ve[e.a]! + e.w}`).join(", ")} } = ${ve[v]}（事件必须等最慢的前驱）。`
        : `ve(${v}) = 0：源点，没有前驱。`,
      "求 ve",
      v
    );
  }
  for (const v of [...topo].reverse()) {
    vlP[v] = vl[v]!;
    const outs = AOE.filter((e) => e.a === v);
    snap(
      outs.length
        ? `vl(${v}) = min{ ${outs.map((e) => `vl(${e.b})−${e.w} = ${vl[e.b]! - e.w}`).join(", ")} } = ${vl[v]}（再晚就会推迟后继）。汇点 vl = ve = ${length}。`
        : `vl(${v}) = ve(${v}) = ${length}：汇点不能晚于总工期。`,
      "求 vl",
      v
    );
  }
  frames.push({
    desc: `逐活动算 e 与 l（e=ve[起点]，l=vl[终点]−权）：关键活动是 ${crit.map((e) => `${e.a}→${e.b}`).join("、")}（它们的 e=l，一秒不能拖）。串起来：${crit.map((e) => e.a).concat(crit.at(-1)!.b).join("→")}，总工期 ${length}。缩短工期必须砍关键活动；关键路径可能不止一条——只砍其中一条未必有效。`,
    phase: "完成",
    ve: { ...veP },
    vl: { ...vlP },
    crit: crit.map((e) => ({ ...e })),
  });
  return frames;
}

function NetSvg({ removed, cur, crit, stage }: { removed?: Set<string>; cur?: string; crit?: DEdge[]; stage: "topo" | "crit" }) {
  const critKeys = new Set((crit ?? []).map((e) => `${e.a}-${e.b}`));
  return (
    <svg viewBox="0 0 420 220" className="w-full">
      <defs>
        <marker id="tp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill={C.line} />
        </marker>
        <marker id="tp-arrow-g" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill={C.done} />
        </marker>
      </defs>
      {AOE.map((e) => {
        const [x1, y1] = POS[e.a]!;
        const [x2, y2] = POS[e.b]!;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const sx = x1 + (dx / len) * 18;
        const sy = y1 + (dy / len) * 18;
        const ex = x2 - (dx / len) * 20;
        const ey = y2 - (dy / len) * 20;
        const isCrit = stage === "crit" && critKeys.has(`${e.a}-${e.b}`);
        const gone = removed?.has(e.a);
        return (
          <g key={`${e.a}-${e.b}`} opacity={gone ? 0.25 : 1}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={isCrit ? C.done : C.line} strokeWidth={isCrit ? 3 : 1.4} markerEnd={isCrit ? "url(#tp-arrow-g)" : "url(#tp-arrow)"} />
            <text x={(sx + ex) / 2 + 6} y={(sy + ey) / 2 - 4} fontSize={10} fontWeight={700} fill={isCrit ? "#047857" : C.text}>
              {e.w}
            </text>
          </g>
        );
      })}
      {AOV_NODES.map((v) => {
        const [x, y] = POS[v]!;
        const gone = removed?.has(v);
        const isCur = cur === v;
        return (
          <g key={v} opacity={gone && !isCur ? 0.4 : 1}>
            <circle cx={x} cy={y} r={17} fill={isCur ? C.active : gone ? C.done : C.node} stroke="#94a3b8" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={isCur || gone ? "#fff" : C.nodeText}>
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Mode = "拓扑排序" | "关键路径";

export function TopoSortView() {
  const [mode, setMode] = useState<Mode>("拓扑排序");
  const topo = useMemo(() => topoFrames(), []);
  const critFrames = useMemo(() => buildCriticalFrames(), []);
  const frames: (TFrame | CFrame)[] = mode === "拓扑排序" ? topo.frames : critFrames;
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const isT = mode === "拓扑排序";
  const tf = fr as TFrame;
  const cf = fr as CFrame;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["拓扑排序", "关键路径"] as Mode[]).map((m) => (
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
      <NetSvg
        stage={isT ? "topo" : "crit"}
        removed={isT ? tf.removed : undefined}
        cur={isT ? tf.cur : cf.hiNode}
        crit={isT ? undefined : cf.crit}
      />
      {isT && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">入度表</p>
          <div className="flex flex-wrap gap-1.5">
            {AOV_NODES.map((v) => (
              <div key={v} className={cn("w-11 overflow-hidden rounded-md border border-border text-center", tf.cur === v && "border-sky-500")}>
                <div className="bg-muted text-[10px] text-muted-foreground">V{v}</div>
                <div className={cn("py-0.5 font-mono text-sm font-bold", tf.indeg[v] === 0 && !tf.removed.has(v) ? "text-emerald-600" : "")}>
                  {tf.indeg[v]}
                </div>
              </div>
            ))}
            <div className="ml-3 self-center text-xs text-muted-foreground">已输出：{tf.order.join(" ") || "—"}</div>
          </div>
        </div>
      )}
      {!isT && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">事件双表（ve 最早 / vl 最迟；相等的事件在关键路径上）</p>
          <div className="flex flex-wrap gap-1.5">
            {AOV_NODES.map((v) => (
              <div key={v} className={cn("w-16 overflow-hidden rounded-md border border-border text-center", cf.hiNode === v && "border-sky-500")}>
                <div className="bg-muted text-[10px] text-muted-foreground">V{v}</div>
                <div className="py-0.5 font-mono text-xs font-bold">
                  {cf.ve[v] ?? "·"} / {cf.vl[v] ?? "·"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
