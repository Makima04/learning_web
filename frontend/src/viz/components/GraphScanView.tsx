// 图解 · DFS/BFS：同一张邻接表（按字母序访问），DFS 看递归栈与回溯，BFS 看队列
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

type Mode = "dfs" | "bfs";

const NODES = ["A", "B", "C", "D", "E", "F"] as const;
type K = (typeof NODES)[number];

const POS: Record<K, [number, number]> = {
  A: [150, 56],
  B: [64, 158],
  C: [238, 158],
  D: [104, 258],
  E: [316, 258],
  F: [210, 348],
};

/** 无向图，邻接表按字母序 */
const ADJ: Record<K, K[]> = {
  A: ["B", "C"],
  B: ["A", "D"],
  C: ["A", "D", "E"],
  D: ["B", "C", "F"],
  E: ["C", "F"],
  F: ["D", "E"],
};

interface Frame extends VizFrame {
  mode: Mode;
  visited: string[];
  current: K | null;
  /** 本次经过的边 */
  edge?: [K, K];
  box: string[];
  boxLabel: string;
}

export function dfsOrder(start: K = "A"): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const go = (u: K): void => {
    seen.add(u);
    out.push(u);
    for (const v of ADJ[u]) if (!seen.has(v)) go(v);
  };
  go(start);
  return out;
}

export function bfsOrder(start: K = "A"): string[] {
  const out: string[] = [];
  const seen = new Set<string>([start]);
  const q: K[] = [start];
  while (q.length) {
    const u = q.shift()!;
    out.push(u);
    for (const v of ADJ[u]) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
    }
  }
  return out;
}

export function buildDfsFrames(): Frame[] {
  const frames: Frame[] = [];
  const visited: string[] = [];
  const seen = new Set<string>();
  const stack: K[] = [];
  frames.push({
    mode: "dfs",
    desc: "深度优先：沿一条路走到底（访问未访问的邻接点，选邻接表里第一个未访问的），走不动了再回溯。这里用邻接表按字母序选邻居，考试手推时务必先写出每点的邻接序列。",
    visited: [],
    current: null,
    box: [],
    boxLabel: "递归栈",
    phase: "规则",
  });
  const go = (u: K, from: K | null): void => {
    seen.add(u);
    visited.push(u);
    stack.push(u);
    frames.push({
      mode: "dfs",
      desc:
        from == null
          ? `从起点 A 开始：访问 A，它的邻居 [B, C] 待考察。`
          : `在 ${from} 的邻接表里找到第一个未访问的邻居 ${u}：访问 ${u}（边 ${from}-${u}）。递归栈：${stack.join("→")}。`,
      visited: [...visited],
      current: u,
      edge: from == null ? undefined : [from, u],
      box: [...stack],
      boxLabel: "递归栈",
      phase: "访问",
    });
    for (const v of ADJ[u]) {
      if (!seen.has(v)) go(v, u);
      else if (v !== from) {
        frames.push({
          mode: "dfs",
          desc: `${u} 的邻居 ${v} 已访问过，跳过（图有环，DFS 必须判重，否则死循环）。`,
          visited: [...visited],
          current: u,
          edge: [u, v],
          box: [...stack],
          boxLabel: "递归栈",
          phase: "跳过",
        });
      }
    }
    stack.pop();
    frames.push({
      mode: "dfs",
      desc: `${u} 的邻接表走完了，回溯：${u} 出栈${stack.length ? `，回到栈顶 ${stack[stack.length - 1]}` : "，栈空"}。`,
      visited: [...visited],
      current: stack.length ? stack[stack.length - 1] : null,
      box: [...stack],
      boxLabel: "递归栈",
      phase: "回溯",
    });
  };
  go("A", null);
  frames.push({
    mode: "dfs",
    desc: `DFS 序列：${visited.join(" → ")}（邻接表顺序不同结果可能不同，但「一条道走到黑 + 回溯」不变）。时间复杂度：邻接表 O(n+e)，邻接矩阵 O(n²)。`,
    visited: [...visited],
    current: null,
    box: [],
    boxLabel: "递归栈",
    phase: "完成",
  });
  return frames;
}

export function buildBfsFrames(): Frame[] {
  const frames: Frame[] = [];
  const visited: string[] = [];
  const seen = new Set<string>(["A"]);
  const q: K[] = ["A"];
  frames.push({
    mode: "bfs",
    desc: "广度优先：队列实现。起点入队时即标记「已访问」，之后每步：出队 → 访问 → 未访问的邻居依次入队并标记。",
    visited: [],
    current: null,
    box: ["A"],
    boxLabel: "队列",
    phase: "规则",
  });
  while (q.length) {
    const u = q.shift()!;
    visited.push(u);
    const news: K[] = [];
    for (const v of ADJ[u]) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
        news.push(v);
      }
    }
    frames.push({
      mode: "bfs",
      desc: `${u} 出队并访问${news.length ? `，未访问邻居 ${news.join("、")} 入队并标记` : "，无新邻居入队"}。队列：${q.join("→") || "空"}。已访问：${visited.join("")}`,
      visited: [...visited],
      current: u,
      edge: news.length ? [u, news[0]] : undefined,
      box: [...q],
      boxLabel: "队列",
      phase: "访问",
    });
  }
  frames.push({
    mode: "bfs",
    desc: `BFS 序列：${visited.join(" → ")}。按「层」扩散：A｜B C｜D E｜F。BFS 可求无权图单源最短路；空间复杂度最坏 O(n)。`,
    visited: [...visited],
    current: null,
    box: [],
    boxLabel: "队列",
    phase: "完成",
  });
  return frames;
}

export function GraphScanView() {
  const [mode, setMode] = useState<Mode>("dfs");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ["dfs", "DFS 深度优先"],
            ["bfs", "BFS 广度优先"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <GraphScanDemo key={mode} mode={mode} />
    </div>
  );
}

function GraphScanDemo({ mode }: { mode: Mode }) {
  const frames = useMemo(() => (mode === "dfs" ? buildDfsFrames() : buildBfsFrames()), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const isEdgeHi = (a: K, b: K) =>
    !!fr.edge && ((fr.edge[0] === a && fr.edge[1] === b) || (fr.edge[0] === b && fr.edge[1] === a));
  const edges: [K, K][] = [
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["C", "D"],
    ["C", "E"],
    ["D", "F"],
    ["E", "F"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <svg viewBox="0 0 380 390" className="w-full lg:w-[44%]">
          {edges.map(([a, b]) => {
            const [x1, y1] = POS[a];
            const [x2, y2] = POS[b];
            const hi = isEdgeHi(a, b);
            return (
              <line
                key={a + b}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={hi ? C.warn : C.line}
                strokeWidth={hi ? 4 : 1.8}
              />
            );
          })}
          {NODES.map((k) => {
            const [x, y] = POS[k];
            const vi = fr.visited.indexOf(k);
            const cur = fr.current === k;
            const fill = cur ? C.active : vi >= 0 ? C.done : C.node;
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={22} fill={fill} stroke="#94a3b8" strokeWidth={1.2} />
                <text x={x} y={y + 6} textAnchor="middle" fontSize={16} fontWeight={700} fill={cur || vi >= 0 ? "#fff" : C.nodeText}>
                  {k}
                </text>
                {vi >= 0 && (
                  <>
                    <circle cx={x + 18} cy={y - 16} r={10} fill={cur ? "#fff" : C.active} />
                    <text x={x + 18} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={cur ? C.active : "#fff"}>
                      {vi + 1}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {fr.boxLabel}
              {fr.mode === "dfs" ? "（右为栈顶）" : "（左为先出）"}
            </p>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
              {fr.box.length === 0 && <span className="text-xs text-muted-foreground">空</span>}
              {fr.box.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-mono text-xs font-bold",
                    fr.mode === "dfs" && i === fr.box.length - 1
                      ? "bg-sky-500 text-white"
                      : fr.mode === "bfs" && i === 0
                        ? "bg-sky-500 text-white"
                        : "bg-muted"
                  )}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">访问序列</p>
            <div className="flex flex-wrap gap-1">
              {fr.visited.map((v, i) => (
                <span
                  key={i}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-md font-mono text-sm font-bold",
                    i === fr.visited.length - 1 ? "bg-emerald-600 text-white" : "bg-muted"
                  )}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
