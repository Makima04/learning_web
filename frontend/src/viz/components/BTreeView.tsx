// 图解 · B 树（3 阶 / 2-3 树）插入：结点关键字溢出（= m-1 个上限）就「中位关键字上移分裂」，
// 根分裂时树长高——B 树永远平衡（所有叶子同层）。B+ 树的差异写在结尾。
import { useMemo } from "react";
import type { ReactNode } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export interface BtN {
  keys: number[];
  kids: BtN[];
}

export const BT_M = 3;
export const BT_SEQ = [20, 30, 10, 40, 50, 25, 28];

const clone = (n: BtN): BtN => ({ keys: [...n.keys], kids: n.kids.map(clone) });

/** B 树插入（含分裂上移），frameCb 记录每个阶段 */
export function bTreeInsert(root: BtN | null, v: number, m: number, frameCb?: (root: BtN | null, note: string, phase: string) => void): BtN {
  if (!root) {
    const n: BtN = { keys: [v], kids: [] };
    frameCb?.(n, `插 ${v}：空树，根结点直接放一个关键字。`, `插 ${v}`);
    return n;
  }
  // 叶子定位
  const path: BtN[] = [];
  let cur: BtN | null = root;
  while (cur) {
    path.push(cur);
    if (cur.kids.length === 0) break;
    let i = 0;
    while (i < cur.keys.length && v > cur.keys[i]!) i++;
    cur = cur.kids[i]!;
  }
  const leaf = path.at(-1)!;
  let i = 0;
  while (i < leaf.keys.length && v > leaf.keys[i]!) i++;
  leaf.keys.splice(i, 0, v);
  frameCb?.(root, `插 ${v}：一路「小于走左、大于走右」定位到叶子 ${leaf.keys.join(",")}（B 树所有叶子同层），按序插进叶子。`, `插 ${v}`);

  // 自底向上分裂（内部结点分裂时，孩子随关键字一分为二：k 个关键字 k+1 棵子树按中位切开）
  let node: BtN = leaf;
  let idx = path.length - 1;
  while (node.keys.length > m - 1) {
    const mid = Math.floor(m / 2); // 3 阶取第 2 个（中位）
    const up = node.keys[mid]!;
    const right: BtN = {
      keys: node.keys.slice(mid + 1),
      kids: node.kids.slice(mid + 1),
    };
    node.keys = node.keys.slice(0, mid);
    node.kids = node.kids.slice(0, mid + 1);
    if (idx === 0) {
      // 根分裂：新根，树长高
      const newRoot: BtN = { keys: [up], kids: [node, right] };
      frameCb?.(newRoot, `结点 ${[up, ...node.keys, ...right.keys].sort((a, b) => a - b).join(",")} 装满 ${m - 1} 个关键字仍超载 → 分裂：中位 ${up} 上移建新根，左右各留一半。根分裂是 B 树唯一长高的方式（往上长，不像 BST 往下长）。`, "根分裂");
      return newRoot;
    }
    const parent = path[idx - 1]!;
    let j = 0;
    while (j < parent.keys.length && up > parent.keys[j]!) j++;
    // 上移关键字插到 j，原结点仍在其左侧（kids[j]），新右结点插到 j+1
    parent.keys.splice(j, 0, up);
    parent.kids.splice(j + 1, 0, right);
    frameCb?.(root, `叶子上移：中位 ${up} 插入父结点，右侧关键字独立成新结点挂在它右边。若父结点也因此超载，继续向上分裂（本例就会一路裂到根）。`, "分裂上移");
    node = parent;
    idx--;
  }
  return root;
}

/** B 树中序遍历（应严格递增） */
export function bTreeInorder(n: BtN | null): number[] {
  const out: number[] = [];
  const walk = (t: BtN | null) => {
    if (!t) return;
    if (!t.kids.length) {
      out.push(...t.keys);
      return;
    }
    t.keys.forEach((k, i) => {
      walk(t.kids[i]!);
      out.push(k);
    });
    walk(t.kids.at(-1)!);
  };
  walk(n);
  return out;
}

interface BtFrame extends VizFrame {
  root: BtN | null;
  hiKeys: number[];
}

export function buildBTreeFrames(m: number, seq: number[]): BtFrame[] {
  const frames: BtFrame[] = [];
  let root: BtN | null = null;
  const snap = (r: BtN | null, note: string, phase: string) =>
    frames.push({ desc: note, phase, root: r ? clone(r) : null, hiKeys: [] });
  frames.push({
    desc: `m=${m} 阶 B 树：每个结点最多 ${m - 1} 个关键字、${m} 棵子树；根至少 1 个关键字，非根非叶结点至少 ⌈m/2⌉−1 = ${Math.ceil(m / 2) - 1} 个。所有叶子在同一层（绝对平衡）。插入永远发生在叶子，超载就从底往上分裂。序列 ${seq.join("、")}。`,
    phase: "初始",
    root: null,
    hiKeys: [],
  });
  for (const v of seq) root = bTreeInsert(root, v, m, snap);
  const final = bTreeInorder(root);
  frames.push({
    desc: `完成：中序遍历 ${final.join("、")} 严格递增 ✓。对比 B+ 树（大题爱考差异）：① B+ 树非叶结点只放索引（关键字会在叶子重复出现），B 树关键字全树唯一；② B+ 树叶子用链表串成一串（范围查找顺链扫），B 树不串；③ B+ 树更矮胖，磁盘 IO 更少——数据库索引多用 B+ 树。`,
    phase: "完成",
    root: clone(root!),
    hiKeys: [],
  });
  return frames;
}

/** 布局：叶子按序占 x，内部结点取孩子中点 */
function layoutBt(root: BtN): { pos: Map<BtN, [number, number]>; w: number; h: number } {
  const pos = new Map<BtN, [number, number]>();
  const depthOf = (n: BtN): number => (n.kids.length ? 1 + Math.max(...n.kids.map(depthOf)) : 0);
  const H = depthOf(root);
  let leafIdx = 0;
  const walk = (n: BtN, d: number): number => {
    if (!n.kids.length) {
      const x = 40 + leafIdx * 110;
      leafIdx++;
      pos.set(n, [x, 30 + (H - d) * 74]);
      return x;
    }
    const xs = n.kids.map((k) => walk(k, d + 1));
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    pos.set(n, [x, 30 + (H - d) * 74]);
    return x;
  };
  walk(root, 0);
  return { pos, w: 80 + leafIdx * 110, h: 30 + (H + 1) * 74 };
}

function nodeW(n: BtN): number {
  return n.keys.length * 30 + 16;
}

export function BTreeView() {
  const frames = useMemo(() => buildBTreeFrames(BT_M, BT_SEQ), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const lay = useMemo(() => (fr.root ? layoutBt(fr.root) : null), [fr.root]);

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${lay?.w ?? 240} ${lay?.h ?? 110}`} className="w-full">
        {lay &&
          fr.root &&
          (() => {
            const out: ReactNode[] = [];
            const walk = (n: BtN) => {
              const [x, y] = lay.pos.get(n)!;
              n.kids.forEach((k) => {
                const [kx, ky] = lay.pos.get(k)!;
                out.push(
                  <line key={`e${x}-${y}-${kx}`} x1={x} y1={y + 17} x2={kx} y2={ky - 17} stroke={C.line} strokeWidth={1.3} />
                );
                walk(k);
              });
            };
            walk(fr.root!);
            const walk2 = (n: BtN) => {
              const [x, y] = lay.pos.get(n)!;
              const w = nodeW(n);
              out.push(
                <g key={`n${x}-${y}`}>
                  <rect x={x - w / 2} y={y - 16} width={w} height={32} rx={6} fill={C.node} stroke="#94a3b8" />
                  {n.keys.map((k, i) => (
                    <text key={k} x={x - w / 2 + 8 + i * 30} y={y + 5} fontSize={13} fontWeight={700} fill={C.nodeText}>
                      {k}
                    </text>
                  ))}
                </g>
              );
              n.kids.forEach(walk2);
            };
            walk2(fr.root!);
            return out;
          })()}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
