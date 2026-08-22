// 图解 · Dijkstra：单源最短路（有向带权图）。选点 → 松弛 → 表格同步更新，终态给最短路径树
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

const VS = ["A", "B", "C", "D", "E"] as const;
type K = (typeof VS)[number];

const POS: Record<K, [number, number]> = {
  A: [80, 120],
  B: [270, 56],
  C: [220, 214],
  D: [390, 150],
  E: [420, 290],
};

/** 有向带权边 */
const EDGES: [K, K, number][] = [
  ["A", "B", 4],
  ["A", "C", 1],
  ["C", "B", 2],
  ["C", "D", 9],
  ["B", "D", 5],
  ["D", "E", 6],
];

const OUT: Record<K, K[]> = {
  A: ["B", "C"],
  C: ["B", "D"],
  B: ["D"],
  D: ["E"],
  E: [],
};

export type Dist = Record<K, number>;

/** Dijkstra 距离（纯函数，供动画与单测） */
export function dijkstraDist(src: K = "A"): Dist {
  const dist: Dist = { A: Infinity, B: Infinity, C: Infinity, D: Infinity, E: Infinity };
  const done = new Set<K>();
  dist[src] = 0;
  while (done.size < VS.length) {
    let u: K | null = null;
    for (const v of VS) if (!done.has(v) && (u == null || dist[v] < dist[u])) u = v;
    if (u == null || dist[u] === Infinity) break;
    done.add(u);
    for (const v of OUT[u]) {
      const w = EDGES.find((e) => e[0] === u && e[1] === v)![2];
      if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
    }
  }
  return dist;
}

interface Frame extends VizFrame {
  dist: Dist;
  pre: Partial<Record<K, K>>;
  done: K[];
  cur?: K;
  edgeHi?: [K, K];
  updated?: K;
}

export function buildDijkstraFrames(): Frame[] {
  const frames: Frame[] = [];
  const dist: Dist = { A: 0, B: Infinity, C: Infinity, D: Infinity, E: Infinity };
  const pre: Partial<Record<K, K>> = {};
  const done: K[] = [];
  const fmt = (v: number) => (v === Infinity ? "∞" : String(v));
  const snap = (desc: string, phase: string, extra?: Partial<Frame>) =>
    frames.push({ desc, phase, dist: { ...dist }, pre: { ...pre }, done: [...done], ...extra });

  snap(
    `求 A 到各点的最短路。Dijkstra 是贪心：维护 dist[]（当前最短距离估计）与已确定集合。初始 dist[A]=0，其余 ∞，还没有任何点确定。只适用于权值非负的图——负权边会破坏「已确定点的 dist 不再变」这一贪心前提。`,
    "初始化"
  );
  while (done.length < VS.length) {
    let u: K | null = null;
    for (const v of VS) {
      if (!done.includes(v) && (u == null || dist[v] < dist[u])) u = v;
    }
    const pick = u!;
    done.push(pick);
    snap(
      `在未确定的点中选 dist 最小的：${pick}（${fmt(dist[pick])}），将其加入已确定集合。贪心依据：别的路径都要先经过其它点，而那些点的 dist 已经 ≥ 它，所以 ${fmt(dist[pick])} 就是最终最短距离。`,
      "选点",
      { cur: pick }
    );
    for (const v of OUT[pick]) {
      const w = EDGES.find((e) => e[0] === pick && e[1] === v)![2];
      const nd = dist[pick] + w;
      if (nd < dist[v]) {
        const old = fmt(dist[v]);
        dist[v] = nd;
        pre[v] = pick;
        snap(
          `松弛边 ${pick}→${v}（权 ${w}）：dist[${pick}] + ${w} = ${nd} < ${old}，更新 dist[${v}] = ${nd}，前驱记为 ${pick}。若算出来更大则不动。`,
          "松弛",
          { cur: pick, edgeHi: [pick, v], updated: v }
        );
      } else {
        snap(
          `松弛边 ${pick}→${v}（权 ${w}）：dist[${pick}] + ${w} = ${nd} ≥ ${fmt(dist[v])}，不更新。`,
          "松弛",
          { cur: pick, edgeHi: [pick, v] }
        );
      }
    }
  }
  const pathOf = (v: K): string => {
    const seq: K[] = [v];
    let cur = v;
    while (pre[cur]) {
      cur = pre[cur]!;
      seq.unshift(cur);
    }
    return seq.join("→");
  };
  snap(
    `全部确定。沿前驱回溯即得路径：${VS.filter((v) => v !== "A")
      .map((v) => `A到${v}：${pathOf(v)}（${dist[v]}）`)
      .join("；")}。复杂度 O(n²)（邻接矩阵），选点用堆可到 O((n+e)logn)。对比 Floyd：求每一对顶点间的最短路，O(n³)，三重循环 dp[k][i][j]。`,
    "完成",
    {}
  );
  return frames;
}

export function DijkstraView() {
  const frames = useMemo(buildDijkstraFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const fmt = (v: number) => (v === Infinity ? "∞" : String(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <svg viewBox="0 0 500 330" className="w-full lg:w-[58%]">
          <defs>
            <marker id="dj-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={C.line} />
            </marker>
            <marker id="dj-arrow-hi" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={C.warn} />
            </marker>
          </defs>
          {EDGES.map(([a, b, w]) => {
            const hi = !!fr.edgeHi && fr.edgeHi[0] === a && fr.edgeHi[1] === b;
            const inTree = fr.done.length === VS.length && fr.pre[b] === a;
            const [x1, y1] = POS[a];
            const [x2, y2] = POS[b];
            // 缩到圆边
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            const sx = x1 + (dx / len) * 24;
            const sy = y1 + (dy / len) * 24;
            const ex = x2 - (dx / len) * 26;
            const ey = y2 - (dy / len) * 26;
            const stroke = hi ? C.warn : inTree ? C.done : C.line;
            return (
              <g key={`${a}${b}`}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={ex}
                  y2={ey}
                  stroke={stroke}
                  strokeWidth={hi ? 3.4 : inTree ? 3 : 1.8}
                  markerEnd={hi ? "url(#dj-arrow-hi)" : "url(#dj-arrow)"}
                />
                <circle cx={(sx + ex) / 2 + (dy / len) * 10} cy={(sy + ey) / 2 - (dx / len) * 10} r={10} fill="#f8fafc" stroke={stroke} />
                <text x={(sx + ex) / 2 + (dy / len) * 10} y={(sy + ey) / 2 - (dx / len) * 10 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.nodeText}>
                  {w}
                </text>
              </g>
            );
          })}
          {VS.map((k) => {
            const [x, y] = POS[k];
            const isDone = fr.done.includes(k);
            const cur = fr.cur === k;
            const fill = cur ? C.active : isDone ? C.done : C.node;
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={22} fill={fill} stroke="#94a3b8" />
                <text x={x} y={y + 6} textAnchor="middle" fontSize={16} fontWeight={700} fill={cur || isDone ? "#fff" : C.nodeText}>
                  {k}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex-1 space-y-2 overflow-x-auto">
          <table className="w-full min-w-[300px] border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="border p-1.5 text-muted-foreground">dist</th>
                {VS.map((v) => (
                  <th
                    key={v}
                    className={cn("border p-1.5 font-mono", fr.cur === v && "bg-primary/15 text-primary", fr.updated === v && "bg-amber-100 dark:bg-amber-950")}
                  >
                    {v}
                    {fr.done.includes(v) && <span className="ml-0.5 text-emerald-600">✓</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-1.5 text-muted-foreground">距离</td>
                {VS.map((v) => (
                  <td key={v} className={cn("border p-1.5 font-mono font-bold", fr.updated === v && "bg-amber-100 dark:bg-amber-950")}>
                    {fmt(fr.dist[v])}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border p-1.5 text-muted-foreground">前驱</td>
                {VS.map((v) => (
                  <td key={v} className="border p-1.5 font-mono">
                    {fr.pre[v] ?? "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-xs leading-6 text-muted-foreground">
            ✓ = 已确定（dist 不再变）。考试手推就是维护这张表：每轮圈出最小的未确定 dist，再用它的出边做松弛。
          </p>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
