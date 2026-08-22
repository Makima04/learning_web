// 图解 · 二叉排序树 BST：左 < 根 < 右，中序有序。插入走查找路径；删除按孩子数分三种情况，
// 两个孩子的用「中序直接前驱（左子树最右下）」顶替。
import { useMemo } from "react";
import type { ReactNode } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { layoutBinary, layoutSize } from "@/viz/layout";

export interface BstN {
  v: number;
  l: BstN | null;
  r: BstN | null;
}

export const BST_SEQ = [50, 30, 70, 20, 40, 60, 80];

/** BST 插入（新结点必是叶子） */
export function bstInsert(root: BstN | null, v: number): BstN {
  if (!root) return { v, l: null, r: null };
  if (v < root.v) root.l = bstInsert(root.l, v);
  else if (v > root.v) root.r = bstInsert(root.r, v);
  return root;
}

/** 中序序列 */
export function inorderOf(root: BstN | null): number[] {
  const out: number[] = [];
  const walk = (n: BstN | null) => {
    if (!n) return;
    walk(n.l);
    out.push(n.v);
    walk(n.r);
  };
  walk(root);
  return out;
}

/** BST 删除：叶子直接删；单孩子顶上；两个孩子用中序直接前驱（左子树最右下）替换值再删前驱 */
export function bstDelete(root: BstN | null, key: number): BstN | null {
  if (!root) return null;
  if (key < root.v) {
    root.l = bstDelete(root.l, key);
    return root;
  }
  if (key > root.v) {
    root.r = bstDelete(root.r, key);
    return root;
  }
  // 找到了
  if (!root.l && !root.r) return null;
  if (!root.l) return root.r;
  if (!root.r) return root.l;
  // 两个孩子：找左子树最右下（直接前驱）
  let prev = root.l;
  while (prev!.r) prev = prev!.r;
  root.v = prev!.v;
  root.l = bstDelete(root.l, prev!.v);
  return root;
}

interface BFrame extends VizFrame {
  root: BstN | null;
  hi: number[];
  path?: number[];
}

const clone = (n: BstN | null): BstN | null => (n ? { v: n.v, l: clone(n.l), r: clone(n.r) } : null);

function buildBstFrames(): BFrame[] {
  const frames: BFrame[] = [];
  let root: BstN | null = null;
  const snap = (desc: string, phase: string, hi: number[] = [], path?: number[]) =>
    frames.push({ desc, phase, root: clone(root), hi, path });

  snap("BST 定义：任意结点，左子树所有值 < 它 < 右子树所有值 ⇒ 中序遍历严格递增（判定/大题常考）。插入序列 " + BST_SEQ.join("、") + "，逐个插入。", "初始");
  for (const v of BST_SEQ) {
    const path: number[] = [];
    let cur = root;
    while (cur) {
      path.push(cur.v);
      cur = v < cur.v ? cur.l : v > cur.v ? cur.r : cur;
      if (cur && cur.v === v) break;
    }
    root = bstInsert(root, v);
    snap(
      `插 ${v}：从根比较走「小于向左、大于向右」，新结点一定落在叶子位置（沿 ${path.join("→")} 找空位）。同一组关键字按不同顺序插入，得到的 BST 可能不同；中序序列却相同。`,
      `插 ${v}`,
      [v],
      path
    );
  }
  snap(`7 个结点插完，中序 ${inorderOf(root).join("、")} 严格递增 ✓。查 35：50→30→40→左空，查找失败——BST 查找就是二叉判定树，ASL 与树形有关，越平衡越接近 log n。`, "查找", [40], [50, 30, 40]);

  // 删除 30（两个孩子）
  const leftMax = (() => {
    let n = root!.l;
    while (n!.r) n = n!.r;
    return n!.v;
  })();
  snap(
    `删除 30：它有两个孩子（20、40）。做法：找 30 的中序直接前驱——左子树最右下结点 ${leftMax}，把它的值抄上来，再在左子树里删掉 ${leftMax}（它是右链末端的单孩子/叶子情形，好删）。也可以对称地用直接后继（右子树最左下），答案不唯一但都要保持中序有序。`,
    "删除·两孩子",
    [30, leftMax]
  );
  root = bstDelete(root, 30);
  snap(
    `删除完成，中序 ${inorderOf(root).join("、")} 依旧严格递增 ✓（少了 30）。三种删除：叶子直接删；单孩子让孩子顶上；两个孩子用前驱/后继替换。最坏情况（输入有序）BST 退化为单链，查找 O(n)——于是有了 AVL/红黑树。`,
    "删除完成",
    [40]
  );
  return frames;
}

const R = 16;

export function BstView() {
  const frames = useMemo(buildBstFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const pos = useMemo(() => layoutBinary(fr.root, { xGap: 44, yGap: 56 }), [fr.root]);
  const size = useMemo(() => layoutSize(fr.root, pos, { xGap: 44, yGap: 56 }), [fr.root, pos]);

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${Math.max(size.w, 240)} ${size.h}`} className="w-full">
        {(() => {
          const edges: ReactNode[] = [];
          const walk = (n: BstN | null) => {
            if (!n) return;
            const [x, y] = pos.get(n)!;
            for (const kid of [n.l, n.r]) {
              if (kid) {
                const [kx, ky] = pos.get(kid)!;
                edges.push(
                  <line key={`${n.v}-${kid.v}`} x1={x} y1={y + R} x2={kx} y2={ky - R} stroke={C.line} strokeWidth={1.4} />
                );
              }
            }
            walk(n.l);
            walk(n.r);
          };
          walk(fr.root);
          return edges;
        })()}
        {(() => {
          const nodes: ReactNode[] = [];
          const walk = (n: BstN | null) => {
            if (!n) return;
            const [x, y] = pos.get(n)!;
            const hi = fr.hi.includes(n.v);
            nodes.push(
              <g key={n.v}>
                <circle cx={x} cy={y} r={R} fill={hi ? C.active : C.node} stroke="#94a3b8" />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={hi ? "#fff" : C.nodeText}>
                  {n.v}
                </text>
              </g>
            );
            walk(n.l);
            walk(n.r);
          };
          walk(fr.root);
          return nodes;
        })()}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
