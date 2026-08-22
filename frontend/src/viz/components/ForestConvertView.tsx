// 图解 · 树/森林 ↔ 二叉树转换（孩子兄弟表示法）：左指针指第一个孩子，右指针指下一个兄弟。
// 验证关系：树的先根遍历 = 二叉树先序；树的后根遍历 = 二叉树中序。
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

/** 多叉树：孩子列表 */
export const TREE_CHILDREN: Record<string, string[]> = {
  A: ["B", "C", "D"],
  B: ["E", "F"],
  C: [],
  D: ["G"],
  E: [], F: [], G: [],
};
export const TREE_ROOT = "A";
/** 树的先根序列（父先于所有孩子） */
export const TREE_PRE = ["A", "B", "E", "F", "C", "D", "G"];
/** 树的后根序列（孩子全访问完才到父） */
export const TREE_POST = ["E", "F", "B", "C", "G", "D", "A"];

export interface BiNode {
  id: string;
  l: BiNode | null;
  r: BiNode | null;
}

/** 树 → 二叉树：左孩子右兄弟 */
export function childSibling(children: Record<string, string[]>, root: string): BiNode {
  const build = (id: string): BiNode => {
    const kids = children[id] ?? [];
    const l = kids.length ? build(kids[0]!) : null;
    let cur = l;
    for (let i = 1; i < kids.length; i++) {
      cur!.r = build(kids[i]!);
      cur = cur!.r;
    }
    return { id, l, r: null };
  };
  return build(root);
}

export const biOrders = (root: BiNode): { pre: string; in: string } => {
  const pre: string[] = [];
  const ino: string[] = [];
  const walk = (n: BiNode | null) => {
    if (!n) return;
    pre.push(n.id);
    walk(n.l);
    ino.push(n.id);
    walk(n.r);
  };
  walk(root);
  return { pre: pre.join(""), in: ino.join("") };
};

/* 原树布局（三层） */
const TREE_POS: Record<string, [number, number]> = {
  A: [150, 30], B: [60, 100], C: [150, 100], D: [240, 100],
  E: [20, 170], F: [95, 170], G: [240, 170],
};
/* 转换后二叉树布局（手工定坐标） */
const BI_POS: Record<string, [number, number]> = {
  A: [40, 30], B: [100, 90], C: [240, 150], D: [330, 210],
  E: [160, 150], F: [230, 210], G: [420, 270],
};

interface FFrame extends VizFrame {
  /** 已转换的结点（二叉树视角出现） */
  done: string[];
  /** 当前正在处理的结点 */
  cur?: string;
  view: "tree" | "both" | "bi";
}

function buildForestFrames(): FFrame[] {
  const frames: FFrame[] = [];
  const order = TREE_PRE; // 自顶向下逐结点转换
  const snap = (desc: string, phase: string, done: string[], cur?: string, view: FFrame["view"] = "both") =>
    frames.push({ desc, phase, done, cur, view });

  snap(
    "原树：A 的孩子 B、C、D；B 的孩子 E、F；D 的孩子 G。转换口诀「左孩子右兄弟」：每个结点左指针连它的第一个孩子，右指针连它的下一个兄弟。转换后根结点没有右子树（根没有兄弟）——若把森林中各树的根视为兄弟，右链就是第二、第三棵树。",
    "原树",
    [],
    undefined,
    "tree"
  );

  const childOf = (id: string): string[] => TREE_CHILDREN[id] ?? [];
  for (const id of order) {
    const kids = childOf(id);
    const done = frames.at(-1)!.done;
    snap(
      `处理 ${id}：${kids.length ? `第一个孩子 ${kids[0]} 挂到左指针` : "没有孩子，左指针空"}；兄弟关系：${(() => {
        const parent = Object.keys(TREE_CHILDREN).find((p) => TREE_CHILDREN[p]!.includes(id));
        if (!parent) return "它是根，没有兄弟，右指针空";
        const sibs = TREE_CHILDREN[parent]!;
        const i = sibs.indexOf(id);
        return i < sibs.length - 1 ? `下一个兄弟 ${sibs[i + 1]} 挂到右指针` : "它是父亲的最后一个孩子，右指针空";
      })()}。`,
      "转换",
      [...done, id],
      id
    );
  }

  const bi = childSibling(TREE_CHILDREN, TREE_ROOT);
  const { pre, in: ino } = biOrders(bi);
  snap(
    `转换完成。验证两条常考等式：树的先根遍历 ${TREE_PRE.join("")} = 二叉树先序 ${pre} ✓；树的后根遍历 ${TREE_POST.join("")} = 二叉树中序 ${ino} ✓。反过来，二叉树转回树/森林：左链是孩子、右链是兄弟，断开右链把每个右链结点挂回它「右指针所指结点的父亲」下。`,
    "完成",
    order,
    undefined,
    "bi"
  );
  return frames;
}

function TreeSvg({ done, cur }: { done: string[]; cur?: string }) {
  return (
    <svg viewBox="0 0 280 200" className="w-full">
      {Object.entries(TREE_CHILDREN).map(([p, kids]) =>
        kids.map((k) => {
          const [x1, y1] = TREE_POS[p]!;
          const [x2, y2] = TREE_POS[k]!;
          return <line key={`${p}-${k}`} x1={x1} y1={y1 + 14} x2={x2} y2={y2 - 14} stroke={C.line} strokeWidth={1.4} />;
        })
      )}
      {Object.keys(TREE_POS).map((id) => {
        const [x, y] = TREE_POS[id]!;
        const on = done.includes(id);
        return (
          <g key={id} opacity={done.length && !on ? 0.5 : 1}>
            <circle cx={x} cy={y} r={15} fill={cur === id ? C.active : on ? C.done : C.node} stroke="#94a3b8" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={cur === id || on ? "#fff" : C.nodeText}>
              {id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BiSvg({ done, cur }: { done: string[]; cur?: string }) {
  const bi = useMemo(() => childSibling(TREE_CHILDREN, TREE_ROOT), []);
  const edges: { from: string; to: string }[] = [];
  const walk = (n: BiNode | null) => {
    if (!n) return;
    if (n.l) edges.push({ from: n.id, to: n.l.id });
    if (n.r) edges.push({ from: n.id, to: n.r.id });
    walk(n.l);
    walk(n.r);
  };
  walk(bi);
  return (
    <svg viewBox="0 0 460 300" className="w-full">
      {edges.map(({ from, to }) => {
        const [x1, y1] = BI_POS[from]!;
        const [x2, y2] = BI_POS[to]!;
        return <line key={`${from}-${to}`} x1={x1} y1={y1 + 14} x2={x2} y2={y2 - 14} stroke={C.line} strokeWidth={1.4} />;
      })}
      {Object.keys(BI_POS).map((id) => {
        const [x, y] = BI_POS[id]!;
        const on = done.includes(id);
        return (
          <g key={id} opacity={done.length && !on ? 0.5 : 1}>
            <circle cx={x} cy={y} r={15} fill={cur === id ? C.active : on ? C.done : C.node} stroke="#94a3b8" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={cur === id || on ? "#fff" : C.nodeText}>
              {id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ForestConvertView() {
  const frames = useMemo(buildForestFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-4", fr.view === "both" ? "sm:grid-cols-2" : "grid-cols-1")}>
        {fr.view !== "bi" && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">原树（多叉）</p>
            <TreeSvg done={fr.done} cur={fr.cur} />
          </div>
        )}
        {fr.view !== "tree" && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">转换后的二叉树（绿 = 已转换）</p>
            <BiSvg done={fr.done} cur={fr.cur} />
          </div>
        )}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
