// 图解 · 距离向量路由（RIP 思想）：每个结点只和邻居交换「到各目的的距离表」，
// Bellman-Ford 一轮轮收敛（好消息传得快）；末尾解释 count-to-infinity（坏消息传得慢）。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const DV_NODES = ["A", "B", "C", "D"];
export const DV_EDGES: [string, string, number][] = [
  ["A", "B", 1], ["B", "C", 2], ["A", "C", 5], ["C", "D", 1],
];
const INF = 99;
const POS: Record<string, [number, number]> = {
  A: [60, 40], B: [230, 40], C: [230, 150], D: [400, 150],
};

const link = (a: string, b: string): number | null =>
  DV_EDGES.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2] ?? null;

/** 距离向量迭代：返回每轮的矩阵（初值 + 每轮同步更新），直到收敛 */
export function dvRounds(): { rounds: Record<string, Record<string, number>>[]; convergedAt: number } {
  const init = (): Record<string, Record<string, number>> => {
    const m: Record<string, Record<string, number>> = {};
    for (const x of DV_NODES) {
      m[x] = {};
      for (const y of DV_NODES) {
        m[x]![y] = x === y ? 0 : (link(x, y) ?? INF);
      }
    }
    return m;
  };
  const rounds: Record<string, Record<string, number>>[] = [init()];
  for (let it = 0; it < 10; it++) {
    const prev = rounds.at(-1)!;
    const cur: Record<string, Record<string, number>> = {};
    for (const x of DV_NODES) {
      cur[x] = {};
      for (const y of DV_NODES) {
        if (x === y) {
          cur[x]![y] = 0;
          continue;
        }
        let best = prev[x]![y]!;
        for (const nb of DV_NODES) {
          const c = link(x, nb);
          if (c !== null && c + prev[nb]![y]! < best) best = c + prev[nb]![y]!;
        }
        cur[x]![y] = best;
      }
    }
    rounds.push(cur);
    if (JSON.stringify(cur) === JSON.stringify(prev)) break;
  }
  const last = rounds.at(-1)!;
  const convergedAt = rounds.findIndex((r, i) => i > 0 && JSON.stringify(r) === JSON.stringify(last));
  return { rounds, convergedAt };
}

interface DvFrame extends VizFrame {
  round: number;
  /** 本轮变化的表项 */
  changed: string[];
}

function buildDvFrames(): DvFrame[] {
  const frames: DvFrame[] = [];
  const { rounds, convergedAt } = dvRounds();
  const push = (desc: string, phase: string, round: number, changed: string[]) =>
    frames.push({ desc, phase, round, changed });

  push(
    "拓扑：A—B(1)、B—C(2)、A—C(5)、C—D(1)。距离向量路由（RIP 的思想）：每个结点维护「到所有目的地的距离」表，周期性地只与直连邻居交换整张表，用收到的表按 Bellman-Ford 更新：D(x,y) = min over 邻居 n { c(x,n) + D(n,y) }。RIP 以跳数为度量（上限 16 = ∞），坏消息传得慢。",
    "初始",
    0,
    []
  );
  rounds.forEach((mat, i) => {
    if (i === 0) return;
    const prev = rounds[i - 1]!;
    const changed: string[] = [];
    for (const x of DV_NODES) {
      for (const y of DV_NODES) {
        if (mat[x]![y]! !== prev[x]![y]!) changed.push(`${x}→${y}`);
      }
    }
    const notable = changed
      .map((c) => {
        const [x, y] = c.split("→");
        return `${x} 到 ${y}：${prev[x!]![y!] === INF ? "∞" : prev[x!]![y!]} → ${mat[x!]![y!]}`;
      })
      .join("，");
    push(
      changed.length
        ? `第 ${i} 轮同步交换（所有结点同时把表发给邻居，再按 min(c+D) 更新）：${notable}。好消息（更短路径）一轮传一跳，收敛很快。`
        : `第 ${i} 轮：与上一轮完全相同 —— 收敛（第 ${convergedAt} 轮起稳定）。最终 A 经 B 到 C 只要 3（不走直连的 5），到 D 4。`,
      changed.length ? `第 ${i} 轮` : "收敛",
      i,
      changed
    );
  });
  push(
    "坏消息（count-to-infinity）：若 C—D 断开，C 把到 D 的距离清成 ∞ 后问邻居 B「你到 D 多远？」B 答 3——可 B 的 3 本来就是经 C 绕过去的！C 信了：D(C,D) = c(C,B) + 3 = 5；下一轮 B 发现 C 变 5，也跟着改 6；再一轮 C 改 8……两人互相「借鉴」过时信息，距离一轮轮往上爬，直到 16（RIP 的 ∞）才死心。对策：水平分割（对某邻居隐藏「从它那里学来的路由」）、毒性逆转（主动告知 ∞）、触发更新。链路状态协议（OSPF）让每台路由器拿到全图各自跑 Dijkstra（见数据结构 Dijkstra 演示），没有这个问题。",
    "完成",
    rounds.length - 1,
    []
  );
  return frames;
}

export function DvView() {
  const frames = useMemo(buildDvFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const mat = dvRounds().rounds[fr.round]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <svg viewBox="0 0 460 200" className="w-full lg:w-[48%]">
          {DV_EDGES.map(([a, b, w]) => {
            const [x1, y1] = POS[a]!;
            const [x2, y2] = POS[b]!;
            return (
              <g key={`${a}${b}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth={1.6} />
                <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 4} fontSize={11} fontWeight={700} fill={C.text}>
                  {w}
                </text>
              </g>
            );
          })}
          {DV_NODES.map((n) => {
            const [x, y] = POS[n]!;
            return (
              <g key={n}>
                <circle cx={x} cy={y} r={16} fill={C.node} stroke="#94a3b8" />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.nodeText}>
                  {n}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-1 overflow-x-auto">
          <p className="text-xs text-muted-foreground">距离表（行 = 从谁出发，绿 = 本轮变化）</p>
          <table className="border-collapse text-center font-mono text-xs">
            <thead>
              <tr>
                <th className="p-1" />
                {DV_NODES.map((n) => (
                  <th key={n} className="w-9 p-1 text-muted-foreground">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DV_NODES.map((x) => (
                <tr key={x}>
                  <th className="p-1 text-muted-foreground">{x}</th>
                  {DV_NODES.map((y) => {
                    const v = mat[x]![y]!;
                    const ch = fr.changed.includes(`${x}→${y}`);
                    return (
                      <td key={y} className={cn("border border-border p-1", ch && "bg-emerald-500/25 font-bold")}>
                        {v === INF ? "∞" : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
