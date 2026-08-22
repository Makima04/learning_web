// 图解 · 线索二叉树：n 个结点的二叉链表有 n+1 个空指针，正好用来存中序前驱/后继（线索）。
// 中序序列 D B E G A C F，逐结点穿线，虚线箭头就是「线索」。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

interface TNode {
  id: string;
  x: number;
  y: number;
  l: string | null; // 左孩子或左线索目标（无则 null 表示尚空）
  r: string | null;
  lTag: 0 | 1;
  rTag: 0 | 1;
  hasLChild: boolean;
  hasRChild: boolean;
}

// 与遍历演示同一棵树：A(B(D,E(·,G)),C(F,·))，中序 D B E G A C F
const POS: Record<string, [number, number]> = {
  D: [50, 120], B: [130, 78], E: [210, 120], G: [290, 162],
  A: [250, 36], C: [370, 78], F: [450, 120],
};
const CHILDREN: Record<string, [string | null, string | null]> = {
  A: ["B", "C"], B: ["D", "E"], C: ["F", null],
  D: [null, null], E: [null, "G"], F: [null, null], G: [null, null],
};
export const INORDER = ["D", "B", "E", "G", "A", "C", "F"];

/** 中序穿线：给每个结点算出（前驱, 后继） */
export function inorderThreads(): Record<string, { pred: string | null; succ: string | null }> {
  const map: Record<string, { pred: string | null; succ: string | null }> = {};
  INORDER.forEach((id, i) => {
    map[id] = { pred: i > 0 ? INORDER[i - 1]! : null, succ: i < INORDER.length - 1 ? INORDER[i + 1]! : null };
  });
  return map;
}

interface TFrame extends VizFrame {
  nodes: Record<string, TNode>;
  hi?: string;
}

function cloneNodes(): Record<string, TNode> {
  const nodes: Record<string, TNode> = {};
  for (const id of Object.keys(POS)) {
    const [l, r] = CHILDREN[id]!;
    nodes[id] = {
      id, x: POS[id]![0], y: POS[id]![1],
      l, r, lTag: 0, rTag: 0, hasLChild: l != null, hasRChild: r != null,
    };
  }
  return nodes;
}

function buildThreadFrames(): TFrame[] {
  const frames: TFrame[] = [];
  const nodes = cloneNodes();
  const threads = inorderThreads();
  const snap = (desc: string, phase: string, hi?: string) =>
    frames.push({ desc, phase, hi, nodes: JSON.parse(JSON.stringify(nodes)) as Record<string, TNode> });

  snap(
    "还是遍历演示里那棵树（A(B(D,E(·,G)),C(F,·))）。n=7 个结点的二叉链表共 2n=14 个指针，实际只用了 n-1=6 根（孩子指针），剩下 n+1=8 根空着。线索二叉树：空的左指针改存「中序前驱」，空的右指针改存「中序后继」，配 ltag/rtag 标记 0=孩子 1=线索。",
    "初始"
  );

  INORDER.forEach((id, i) => {
    const nd = nodes[id]!;
    const { pred, succ } = threads[id]!;
    const acts: string[] = [];
    if (!nd.hasLChild && pred) {
      nd.l = pred;
      nd.lTag = 1;
      acts.push(`没有左孩子，左指针穿上「前驱 ${pred}」`);
    }
    if (!nd.hasRChild && succ) {
      nd.r = succ;
      nd.rTag = 1;
      acts.push(`没有右孩子，右指针穿上「后继 ${succ}」`);
    }
    snap(
      `中序走到第 ${i + 1} 个结点 ${id}（${INORDER.slice(0, i + 1).join(" ")}）。${acts.length ? acts.join("；") + "。" : "两个孩子都在，只更新前驱指针，不穿线。"}`,
      "穿线",
      id
    );
  });

  snap(
    "线索化完成。此后不用栈、不用递归就能找中序后继：rtag=1 右指针直接就是后继；rtag=0 则后继 = 右子树最左下结点。中序第一个结点 D 没有前驱、最后一个 F 没有后继，它们的空线索通常指到头结点（王道版多画一个头结点把双向环闭起来）。",
    "完成"
  );
  return frames;
}

export function ThreadTreeView() {
  const frames = useMemo(buildThreadFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  // 先从帧数据收集线索/孩子边，再统一渲染 path
  const paths: { d: string; color: string; dash?: string; key: string }[] = [];
  for (const nd of Object.values(fr.nodes)) {
    for (const [toId, tag] of [
      [nd.l, nd.lTag],
      [nd.r, nd.rTag],
    ] as [string | null, 0 | 1][]) {
      if (!toId) continue;
      const t = fr.nodes[toId];
      if (!t) continue;
      const isThread = tag === 1;
      const [x2, y2] = [t.x, t.y];
      const up = y2 < nd.y;
      const color = isThread ? C.bad : C.line;
      const dash = isThread ? "4 4" : undefined;
      // 孩子边走直线；线索用弯弧（绕开结点）
      const d = isThread
        ? `M${nd.x},${nd.y + (up ? -14 : 14)} Q${(nd.x + x2) / 2 + (up ? -24 : 24)},${(nd.y + y2) / 2} ${x2},${y2 + (up ? 14 : -14)}`
        : `M${nd.x},${nd.y} L${x2},${y2}`;
      paths.push({ d, color, dash, key: `${nd.id}-${toId}-${tag}` });
    }
  }

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 500 200" className="w-full">
        <defs>
          <marker id="tt-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={C.bad} />
          </marker>
        </defs>
        {paths.map((pa) => (
          <path
            key={pa.key}
            d={pa.d}
            fill="none"
            stroke={pa.color}
            strokeWidth={pa.dash ? 1.6 : 1.4}
            strokeDasharray={pa.dash}
            markerEnd={pa.dash ? "url(#tt-red)" : undefined}
          />
        ))}
        {Object.values(fr.nodes).map((nd) => {
          const hi = fr.hi === nd.id;
          return (
            <g key={nd.id}>
              <circle cx={nd.x} cy={nd.y} r={18} fill={hi ? C.active : C.node} stroke="#94a3b8" />
              <text x={nd.x} y={nd.y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={hi ? "#fff" : C.nodeText}>
                {nd.id}
              </text>
              {/* tag 标记：左上 ltag、右上 rtag */}
              <text x={nd.x - 16} y={nd.y - 20} fontSize={9} fontWeight={700} fill={nd.lTag ? C.bad : C.text}>
                {nd.lTag}
              </text>
              <text x={nd.x + 10} y={nd.y - 20} fontSize={9} fontWeight={700} fill={nd.rTag ? C.bad : C.text}>
                {nd.rTag}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-muted-foreground">结点两上角的数字是 ltag / rtag：0 = 指针是孩子，1 = 指针是线索（红色虚线）</p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
