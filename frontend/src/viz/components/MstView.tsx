// 图解 · 最小生成树：Prim「加点」与 Kruskal「加边」在同一张图上各跑一遍，两法殊途同归（权 15）。
// Kruskal 的判环正是并查集（见并查集演示）。
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface WEdge {
  a: string;
  b: string;
  w: number;
}
/** 王道经典无向带权图 */
export const MST_EDGES: WEdge[] = [
  { a: "A", b: "B", w: 6 }, { a: "A", b: "C", w: 1 }, { a: "A", b: "D", w: 5 },
  { a: "B", b: "C", w: 5 }, { a: "B", b: "E", w: 3 }, { a: "C", b: "D", w: 5 },
  { a: "C", b: "E", w: 6 }, { a: "C", b: "F", w: 4 }, { a: "D", b: "F", w: 2 },
  { a: "E", b: "F", w: 6 },
];
const VTX = ["A", "B", "C", "D", "E", "F"];
const POS: Record<string, [number, number]> = {
  A: [60, 110], B: [170, 30], C: [190, 130], D: [110, 200], E: [330, 90], F: [280, 190],
};

const key = (e: WEdge) => [e.a, e.b].sort().join("-");

/** Prim：从 start 起，每轮把「树外顶点经树的最短边」对应的顶点拉进来 */
export function primFrames(start: string): { frames: MFrame[]; total: number } {
  const frames: MFrame[] = [];
  const inTree = new Set<string>([start]);
  const tree: WEdge[] = [];
  const snap = (desc: string, phase: string, cand?: { v: string; via: string; w: number }) =>
    frames.push({ desc, phase, tree: tree.map((e) => ({ ...e })), inTree: new Set(inTree), cand });

  snap(
    `Prim 从顶点 ${start} 开始：维护「已在树中的顶点集」，每轮考察所有跨树内/树外的边，把最短的一条（连同它的树外顶点）收进树。适合稠密图 O(n²)。`,
    "初始"
  );
  while (inTree.size < VTX.length) {
    let best: { v: string; via: string; w: number } | null = null;
    for (const e of MST_EDGES) {
      const inA = inTree.has(e.a);
      const inB = inTree.has(e.b);
      if (inA === inB) continue; // 要么都在树里，要么都不在
      const v = inA ? e.b : e.a;
      const via = inA ? e.a : e.b;
      if (!best || e.w < best.w) best = { v, via, w: e.w };
    }
    if (!best) break;
    snap(
      `跨边里最短的是 ${best.via}—${best.v}（权 ${best.w}）：把顶点 ${best.v} 加进树（「加点法」）。若出现并列，任取其一，MST 总权不变。`,
      "选边",
      best
    );
    tree.push({ a: best.via, b: best.v, w: best.w });
    inTree.add(best.v);
  }
  const total = tree.reduce((s, e) => s + e.w, 0);
  snap(
    `生成树长满 6 个顶点、5 条边，总权 ${total}。Prim 每一步树始终连通且无环，像「滚雪球」。贪心正确性的直觉：切分定理——横跨树内/外的边里最小的那条一定属于某棵 MST。`,
    "完成"
  );
  return { frames, total };
}

/** Kruskal：边按权排序，能用并查集判环就收，n-1 条收满为止 */
export function kruskalFrames(): { frames: MFrame[]; total: number } {
  const frames: MFrame[] = [];
  const parent: Record<string, string> = {};
  VTX.forEach((v) => (parent[v] = v));
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const tree: WEdge[] = [];
  const rejected: WEdge[] = [];
  const sorted = [...MST_EDGES].sort((x, y) => x.w - y.w || (key(x) < key(y) ? -1 : 1));
  const snap = (desc: string, phase: string, trying?: WEdge) =>
    frames.push({ desc, phase, tree: tree.map((e) => ({ ...e })), inTree: new Set<string>(), trying, rejected: rejected.map((e) => ({ ...e })) });

  snap(
    "Kruskal 先把 10 条边按权排序：1(A-C), 2(D-F), 3(B-E), 4(C-F), 5(A-D/B-C/C-D), 6(…)，然后从小到大尝试；收边前用并查集检查两端是否已连通（会成环就跳过）。适合稀疏图 O(e·α)。",
    "初始"
  );
  for (const e of sorted) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) {
      rejected.push(e);
      snap(`试 ${e.a}—${e.b}（权 ${e.w}）：两端已在同一连通块，加入会成环，跳过。`, "弃边", e);
    } else {
      parent[ra] = rb;
      tree.push(e);
      snap(`试 ${e.a}—${e.b}（权 ${e.w}）：两端不连通，收入生成树（已 ${tree.length} 条，收满 ${VTX.length - 1} 条即停）。`, "收边", e);
    }
    if (tree.length === VTX.length - 1) break;
  }
  const total = tree.reduce((s, e) => s + e.w, 0);
  snap(
    `MST 完成：${tree.map((e) => `${e.a}${e.b}`).join("、")}，总权 ${total}，与 Prim 一致。两个算法都得不到唯一的树时（有并列权），总权仍唯一。大题套路：手画 MST + 求最小权，或问「按 Prim 从某点开始第 k 条选中的边」。`,
    "完成"
  );
  return { frames, total };
}

interface MFrame extends VizFrame {
  tree: WEdge[];
  inTree: Set<string>;
  cand?: { v: string; via: string; w: number };
  trying?: WEdge;
  rejected?: WEdge[];
}

function GraphSvg({ fr }: { fr: MFrame }) {
  const treeKeys = new Set(fr.tree.map(key));
  const rejKeys = new Set((fr.rejected ?? []).map(key));
  const tryingKey = fr.trying ? key(fr.trying) : null;
  return (
    <svg viewBox="0 0 390 230" className="w-full sm:w-[70%]">
      {MST_EDGES.map((e) => {
        const [x1, y1] = POS[e.a]!;
        const [x2, y2] = POS[e.b]!;
        const k = key(e);
        const isTree = treeKeys.has(k);
        const isTrying = tryingKey === k;
        const isRej = rejKeys.has(k);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={k}>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isTree ? C.done : isTrying ? C.bad : isRej ? "#e2b8bf" : C.line}
              strokeWidth={isTree ? 3 : isTrying ? 2.4 : 1.2}
              opacity={isRej ? 0.6 : 1}
            />
            <text x={mx} y={my - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={isTree ? "#047857" : C.text}>
              {e.w}
            </text>
          </g>
        );
      })}
      {VTX.map((v) => {
        const [x, y] = POS[v]!;
        const inT = fr.inTree.size ? fr.inTree.has(v) : fr.tree.some((e) => e.a === v || e.b === v);
        return (
          <g key={v}>
            <circle cx={x} cy={y} r={16} fill={inT ? C.done : C.node} stroke="#94a3b8" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={inT ? "#fff" : C.nodeText}>
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Mode = "Prim" | "Kruskal";

export function MstView() {
  const [mode, setMode] = useState<Mode>("Prim");
  const prim = useMemo(() => primFrames("A"), []);
  const kru = useMemo(() => kruskalFrames(), []);
  const frames = mode === "Prim" ? prim.frames : kru.frames;
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["Prim", "Kruskal"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "Prim" ? "Prim 加点法" : "Kruskal 加边法"}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          绿边 = 生成树；红边 = 当前考察（Kruskal 粉边 = 已弃）
        </span>
      </div>
      <GraphSvg fr={fr} />
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
