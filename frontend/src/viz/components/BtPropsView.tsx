// 图解 · 二叉树性质：n₀ = n₂ + 1 当场数出来；完全二叉树按层编号后 i/2i/2i+1 的下标关系；
// 深度 h 与结点数的上下界（⌈log₂(n+1)⌉ ≤ h ≤ n）。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

// A(B(D,E),C(F(·,G)))：n₀=3, n₁=2, n₂=2 —— 3 = 2+1 ✓
const NODES: Record<string, { l: string | null; r: string | null; x: number; y: number }> = {
  A: { l: "B", r: "C", x: 180, y: 28 },
  B: { l: "D", r: "E", x: 100, y: 96 },
  C: { l: "F", r: null, x: 260, y: 96 },
  D: { l: null, r: null, x: 55, y: 164 },
  E: { l: null, r: null, x: 145, y: 164 },
  F: { l: null, r: "G", x: 225, y: 164 },
  G: { l: null, r: null, x: 305, y: 164 },
};
export const ROOT = "A";

/** 数出 n0（叶）/n1（度1）/n2（度2） */
export function degreeCounts(): { n0: number; n1: number; n2: number } {
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;
  for (const nd of Object.values(NODES)) {
    const d = (nd.l ? 1 : 0) + (nd.r ? 1 : 0);
    if (d === 0) n0++;
    else if (d === 1) n1++;
    else n2++;
  }
  return { n0, n1, n2 };
}

interface PFrame extends VizFrame {
  mark: Record<string, "leaf" | "d1" | "d2">;
  hi?: string[];
}

function buildPropFrames(): PFrame[] {
  const frames: PFrame[] = [];
  const mark: Record<string, "leaf" | "d1" | "d2"> = {};
  const snap = (desc: string, phase: string, hi: string[] = []) =>
    frames.push({ desc, phase, mark: { ...mark }, hi });

  const { n0, n1, n2 } = degreeCounts();
  snap(
    "这棵 7 结点的二叉树：A(B(D,E),C(F(·,G)))。四条常考性质：① 非空二叉树上叶子数 n₀ = 度为 2 的结点数 n₂ + 1；② 第 i 层最多 2^(i-1) 个结点；③ 深度为 h 的二叉树最多 2^h - 1 个结点；④ 具有 n 个结点的完全二叉树深度为 ⌈log₂(n+1)⌉。下面把 ① 当场数出来。",
    "初始"
  );
  const leaves = Object.keys(NODES).filter((id) => {
    const nd = NODES[id]!;
    return !nd.l && !nd.r;
  });
  for (const id of leaves) {
    mark[id] = "leaf";
    snap(`数叶子（度 0）：${id} 没有孩子 → n₀ 计数。目前 n₀=${Object.values(mark).filter((v) => v === "leaf").length}。`, "数 n₀", [id]);
  }
  for (const id of Object.keys(NODES)) {
    const nd = NODES[id]!;
    const d = (nd.l ? 1 : 0) + (nd.r ? 1 : 0);
    if (d === 1) {
      mark[id] = "d1";
      snap(`数度 1 结点：${id} 只有${nd.l ? "左" : "右"}一个孩子 → n₁ 计数。注意 n₁ 的个数与 n₀=n₂+1 这条等式无关。`, "数 n₁", [id]);
    }
  }
  for (const id of Object.keys(NODES)) {
    const nd = NODES[id]!;
    if (nd.l && nd.r) {
      mark[id] = "d2";
      snap(`数度 2 结点：${id} 左右孩子都在 → n₂ 计数。`, "数 n₂", [id]);
    }
  }
  snap(
    `数完：n₀=${n0}，n₁=${n1}，n₂=${n2}。验证 n₀ = n₂ + 1：${n0} = ${n2} + 1 ✓。推导（选择题要会）：总结点 n = n₀+n₁+n₂；边数 = 总度数 = n₁+2n₂ = n-1（每个结点除根外恰有一条入边）。联立即得。`,
    "性质①验证"
  );
  snap(
    "再看性质④：完全二叉树按层从 1 编号，结点 i 的双亲是 ⌊i/2⌋，左孩子 2i、右孩子 2i+1（越界即不存在）——顺序存储不用指针的原因。n=7 时深度 h=⌈log₂8⌉=3；完全二叉树 h 的下界取满 2^(h-1) ≤ n ≤ 2^h -1 反解。常考陷阱：n 个结点的二叉树深度最小是 ⌈log₂(n+1)⌉（完全二叉树），最大是 n（单支树）。",
    "编号与深度",
    []
  );
  return frames;
}

const FILL: Record<"leaf" | "d1" | "d2", string> = {
  leaf: C.done,
  d1: C.warn,
  d2: C.active,
};

export function BtPropsView() {
  const frames = useMemo(buildPropFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 360 200" className="w-full sm:w-[70%]">
        {Object.entries(NODES).map(([id, nd]) => {
          const kids = [nd.l, nd.r].filter(Boolean) as string[];
          return kids.map((k) => {
            const t = NODES[k]!;
            return <line key={`${id}-${k}`} x1={nd.x} y1={nd.y + 16} x2={t.x} y2={t.y - 16} stroke={C.line} strokeWidth={1.4} />;
          });
        })}
        {Object.entries(NODES).map(([id, nd]) => {
          const m = fr.mark[id];
          return (
            <g key={id}>
              <circle cx={nd.x} cy={nd.y} r={17} fill={m ? FILL[m] : C.node} stroke="#94a3b8" />
              <text x={nd.x} y={nd.y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={m ? "#fff" : C.nodeText}>
                {id}
              </text>
              {fr.hi?.includes(id) && (
                <circle cx={nd.x} cy={nd.y} r={22} fill="none" stroke={C.bad} strokeWidth={1.6} />
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-muted-foreground">
        颜色：绿 = 叶（n₀），黄 = 度 1（n₁），蓝 = 度 2（n₂）。G 是 F 的右孩子（F 度 1）。
      </p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
