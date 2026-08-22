// 图解 · 二叉树遍历：先/中/后序（递归栈）与层次（队列），同一棵树四种顺序对照
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

interface TNode {
  key: string;
  l?: TNode;
  r?: TNode;
}

/** 示例树：A(B(D, E(∅,G)), C(F, ∅)) —— 不对称，四种遍历结果差异明显 */
export const TREE: TNode = {
  key: "A",
  l: { key: "B", l: { key: "D" }, r: { key: "E", r: { key: "G" } } },
  r: { key: "C", l: { key: "F" } },
};

export const POS: Record<string, [number, number]> = {
  A: [280, 42],
  B: [160, 118],
  C: [400, 118],
  D: [100, 194],
  E: [240, 194],
  F: [340, 194],
  G: [310, 262],
};

type Order = "pre" | "in" | "post" | "level";

export const ORDER_NAMES: Record<Order, string> = {
  pre: "先序（根左右）",
  in: "中序（左根右）",
  post: "后序（左右根）",
  level: "层次（队列）",
};

interface Frame extends VizFrame {
  order: Order;
  visited: string[];
  current: string | null;
  /** 递归栈：根到当前结点的路径；层次：队列内容 */
  stack: string[];
  stackLabel: string;
}

const RULES: Record<Order, string> = {
  pre: "先序：访问根 → 递归左子树 → 递归右子树。第一个访问的必是根，最后一个必是最右下的结点。",
  in: "中序：递归左子树 → 访问根 → 递归右子树。对 BST 来说中序序列就是升序。",
  post: "后序：递归左子树 → 递归右子树 → 访问根。根必是最后一个；可用于「先给后序+中序还原树」类题。",
  level: "层次：借助队列，出队一个结点就访问它，并把它的孩子从左到右入队。树的广度优先。",
};

/** 三种递归遍历的帧：每次访问一个结点一帧，栈 = 根到当前结点的路径 */
export function buildRecFrames(order: Exclude<Order, "level">): Frame[] {
  const frames: Frame[] = [];
  const visited: string[] = [];
  const path: string[] = [];
  const rule = order === "pre" ? "根→左→右" : order === "in" ? "左→根→右" : "左→右→根";
  frames.push({
    order,
    desc: RULES[order],
    visited: [],
    current: null,
    stack: [],
    stackLabel: "递归栈",
    phase: "规则",
  });
  const visit = (n: TNode, why: string) => {
    visited.push(n.key);
    frames.push({
      order,
      desc: `访问 ${n.key}（${why}）。递归栈（根→当前）：${[...path].join(" → ")}。已输出：${visited.join("")}`,
      visited: [...visited],
      current: n.key,
      stack: [...path],
      stackLabel: "递归栈",
      phase: "访问",
    });
  };
  const go = (n?: TNode): void => {
    if (!n) return;
    path.push(n.key);
    if (order === "pre") visit(n, "根");
    go(n.l);
    if (order === "in") visit(n, "在左子树之后、右子树之前");
    go(n.r);
    if (order === "post") visit(n, "在左右子树都完成后");
    path.pop();
  };
  go(TREE);
  frames.push({
    order,
    desc: `${ORDER_NAMES[order]}序列：${visited.join(" → ")}。对照：先序 A 开头、后序 A 结尾、中序可由「左根右」逐层展开验证。`,
    visited: [...visited],
    current: null,
    stack: [],
    stackLabel: "递归栈",
    phase: "完成",
  });
  return frames;
}

export function buildLevelFrames(): Frame[] {
  const frames: Frame[] = [];
  const visited: string[] = [];
  const q: TNode[] = [TREE];
  frames.push({
    order: "level",
    desc: RULES.level,
    visited: [],
    current: null,
    stack: ["A"],
    stackLabel: "队列",
    phase: "规则",
  });
  while (q.length) {
    const n = q.shift()!;
    visited.push(n.key);
    if (n.l) q.push(n.l);
    if (n.r) q.push(n.r);
    frames.push({
      order: "level",
      desc: `${n.key} 出队并访问${n.l || n.r ? `，其孩子${[n.l?.key, n.r?.key].filter(Boolean).join("、")}入队（左先右后）` : "（无孩子入队）"}。队列：${q.map((x) => x.key).join("→") || "空"}。已输出：${visited.join("")}`,
      visited: [...visited],
      current: n.key,
      stack: q.map((x) => x.key),
      stackLabel: "队列",
      phase: "访问",
    });
  }
  frames.push({
    order: "level",
    desc: `层次序列：${visited.join(" → ")}。队列先进先出，同一层从左到右走完才轮到下一层。`,
    visited: [...visited],
    current: null,
    stack: [],
    stackLabel: "队列",
    phase: "完成",
  });
  return frames;
}

export function traversalOrders(): Record<Order, string> {
  return {
    pre: buildRecFrames("pre").at(-1)!.visited.join(""),
    in: buildRecFrames("in").at(-1)!.visited.join(""),
    post: buildRecFrames("post").at(-1)!.visited.join(""),
    level: buildLevelFrames().at(-1)!.visited.join(""),
  };
}

function TreeSvg({ fr }: { fr: Frame }) {
  const edges: [string, string][] = [
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["B", "E"],
    ["E", "G"],
    ["C", "F"],
  ];
  return (
    <svg viewBox="0 0 500 300" className="w-full">
      {edges.map(([a, b]) => {
        const [x1, y1] = POS[a];
        const [x2, y2] = POS[b];
        return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth={1.5} />;
      })}
      {Object.keys(POS).map((key) => {
        const [x, y] = POS[key];
        const vi = fr.visited.indexOf(key);
        const cur = fr.current === key;
        const fill = cur ? C.active : vi >= 0 ? C.done : C.node;
        const txt = cur || vi >= 0 ? "#fff" : C.nodeText;
        return (
          <g key={key}>
            <circle cx={x} cy={y} r={21} fill={fill} stroke="#94a3b8" />
            <text x={x} y={y + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill={txt}>
              {key}
            </text>
            {vi >= 0 && (
              <>
                <circle cx={x + 17} cy={y - 15} r={10} fill={cur ? "#fff" : C.active} />
                <text
                  x={x + 17}
                  y={y - 11}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={cur ? C.active : "#fff"}
                >
                  {vi + 1}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function TreeTravView() {
  const [order, setOrder] = useState<Order>("pre");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ORDER_NAMES) as Order[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOrder(o)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              order === o ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {ORDER_NAMES[o]}
          </button>
        ))}
      </div>
      <TreeTravDemo key={order} order={order} />
    </div>
  );
}

function TreeTravDemo({ order }: { order: Order }) {
  const frames = useMemo(
    () => (order === "level" ? buildLevelFrames() : buildRecFrames(order)),
    [order]
  );
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-[62%]">
          <TreeSvg fr={fr} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{fr.stackLabel}</p>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
              {fr.stack.length === 0 && <span className="text-xs text-muted-foreground">空</span>}
              {fr.stack.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-xs font-bold",
                    i === fr.stack.length - 1 ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">输出序列</p>
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
