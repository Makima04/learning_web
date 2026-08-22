// 图解 · 平衡二叉树 AVL：插入后自底向上检查平衡因子，失衡时按 LL/RR/LR/RL 旋转
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

interface ANode {
  key: number;
  l: ANode | null;
  r: ANode | null;
  h: number;
}

/** 这组插入依次触发 RR、LL、LR、RL 四种失衡，一屏看全 */
export const AVL_SEQ = [10, 20, 30, 5, 3, 8, 25];

const H = (n: ANode | null): number => (n ? n.h : 0);
const upd = (n: ANode): void => {
  n.h = 1 + Math.max(H(n.l), H(n.r));
};
const bf = (n: ANode): number => H(n.l) - H(n.r);
const clone = (n: ANode | null): ANode | null => (n ? { ...n, l: clone(n.l), r: clone(n.r) } : null);

function rotR(y: ANode): ANode {
  const x = y.l!;
  y.l = x.r;
  x.r = y;
  upd(y);
  upd(x);
  return x;
}
function rotL(x: ANode): ANode {
  const y = x.r!;
  x.r = y.l;
  y.l = x;
  upd(x);
  upd(y);
  return y;
}

/** BST 插入（记录查找路径，结点全部是新克隆的，可安全原地修改） */
function bstInsert(root: ANode | null, key: number): { root: ANode; path: ANode[] } {
  const nn: ANode = { key, l: null, r: null, h: 1 };
  if (!root) return { root: nn, path: [nn] };
  const path: ANode[] = [];
  let cur = root;
  for (;;) {
    path.push(cur);
    if (key < cur.key) {
      if (!cur.l) {
        cur.l = nn;
        break;
      }
      cur = cur.l;
    } else {
      if (!cur.r) {
        cur.r = nn;
        break;
      }
      cur = cur.r;
    }
  }
  path.push(nn);
  return { root, path };
}

interface Frame extends VizFrame {
  root: ANode;
  pathKeys: number[];
  newKey?: number;
  warnKey?: number;
  actKeys?: number[];
  showBf: boolean;
}

export function buildAvlFrames(seq: number[]): Frame[] {
  const frames: Frame[] = [];
  let root: ANode | null = null;
  const snap = (desc: string, phase: string, tree: ANode, extra?: Partial<Frame>) =>
    frames.push({ desc, phase, root: clone(tree)!, pathKeys: [], showBf: false, ...extra });

  const intro =
    `依次插入 ${seq.join("、")}。AVL 是「每个结点左右子树高度差 ≤ 1」的 BST。每次插入后从插入点往上检查平衡因子 bf = 左子树高 − 右子树高，|bf|>1 就旋转。这组插入恰好把 RR、LL、LR、RL 四种失衡各触发一次。`;
  root = { key: seq[0]!, l: null, r: null, h: 1 };
  snap(`插入 ${seq[0]}：空树，作为根结点。${intro}`, `插入 ${seq[0]}`, root, {
    newKey: seq[0],
  });

  for (let s = 1; s < seq.length; s++) {
    const key = seq[s]!;
    const { root: r2, path } = bstInsert(clone(root), key);
    root = r2;
    snap(
      `插入 ${key}：按 BST 规则找位置（路径 ${path.map((n) => n.key).join("→")}），新结点作为叶子，高度 1。`,
      `插入 ${key}`,
      root,
      { pathKeys: path.map((n) => n.key), newKey: key }
    );
    // 自底向上更新高度并找最深失衡结点
    let rotated = false;
    for (let i = path.length - 2; i >= 0; i--) {
      const u = path[i]!;
      upd(u);
      const b = bf(u);
      if (Math.abs(b) > 1) {
        const child = b > 0 ? u.l! : u.r!;
        const childSide = b > 0 ? "左" : "右";
        const innerSide = b > 0 ? (bf(child) >= 0 ? "左" : "右") : bf(child) <= 0 ? "右" : "左";
        const caseName = b > 0 ? (bf(child) >= 0 ? "LL" : "LR") : bf(child) <= 0 ? "RR" : "RL";
        snap(
          `检查 ${u.key}：bf = ${b}，|bf|>1 失衡！新结点插在它的${childSide}孩子的${innerSide}子树里 → ${caseName} 型（第一个字母=失衡结点的方向，第二个=插入点方向）。`,
          `失衡 ${caseName}`,
          root,
          { warnKey: u.key, showBf: true, pathKeys: path.map((n) => n.key) }
        );
        // 旋转并接回父结点
        let sub: ANode;
        if (caseName === "LL") sub = rotR(u);
        else if (caseName === "RR") sub = rotL(u);
        else if (caseName === "LR") {
          u.l = rotL(u.l!);
          sub = rotR(u);
        } else {
          u.r = rotR(u.r!);
          sub = rotL(u);
        }
        const parent = path[i - 1];
        if (!parent) root = sub;
        else if (parent.l === u) parent.l = sub;
        else parent.r = sub;
        // 旋转后子树高度恢复，祖先无需再改
        for (let j = i - 1; j >= 0; j--) upd(path[j]!);
        rotated = true;
        const grandChild = caseName === "LR" || caseName === "RL" ? "（双旋：先把折线拉直成单旋情形，再做一次单旋）" : "（单旋）";
        snap(
          caseName === "LL"
            ? `LL → 右旋：${sub.key} 上提为子树根，原根 ${u.key} 变成它的右孩子${grandChild}。`
            : caseName === "RR"
              ? `RR → 左旋：${sub.key} 上提为子树根，原根 ${u.key} 变成它的左孩子${grandChild}。`
              : caseName === "LR"
                ? `LR → 先左旋后右旋：孙子 ${sub.key} 上提为子树根，${u.key} 降为右孩子${grandChild}。`
                : `RL → 先右旋后左旋：孙子 ${sub.key} 上提为子树根，${u.key} 降为左孩子${grandChild}。`,
          `旋转 ${caseName}`,
          root,
          { actKeys: [sub.key, u.key], showBf: true }
        );
        break;
      }
    }
    if (!rotated) {
      snap(
        `自底向上检查：所有结点 |bf| ≤ 1，仍是平衡树，无需旋转。`,
        `检查 ${key}`,
        root,
        { showBf: true }
      );
    }
  }
  snap(
    `插入完毕：每个结点 |bf| ≤ 1 且中序有序。n 个结点的 AVL 高度最多约 1.44·log₂n，查找稳定 O(logn)。考研重点：给插入序列问旋转类型与新树形态。`,
    "完成",
    root,
    { showBf: true }
  );
  return frames;
}

/** 导出终态做校验 */
export function avlFinalRoot(seq: number[] = AVL_SEQ): ANode {
  return buildAvlFrames(seq).at(-1)!.root;
}

/** 中序序列（校验 BST） */
export function inorderOf(n: ANode | null): number[] {
  return n ? [...inorderOf(n.l), n.key, ...inorderOf(n.r)] : [];
}
export function allBalanced(n: ANode | null): boolean {
  if (!n) return true;
  return Math.abs(bf(n)) <= 1 && n.h === 1 + Math.max(H(n.l), H(n.r)) && allBalanced(n.l) && allBalanced(n.r);
}

function layout(root: ANode) {
  const nodes: { key: number; x: number; y: number; node: ANode }[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let ix = 0;
  const walk = (n: ANode | null, d: number, px?: number, py?: number): void => {
    if (!n) return;
    walk(n.l, d + 1);
    const x = 40 + ix * 58;
    const y = 44 + d * 72;
    ix += 1;
    if (px != null && py != null) edges.push({ x1: px, y1: py, x2: x, y2: y });
    nodes.push({ key: n.key, x, y, node: n });
    walk(n.r, d + 1, x, y);
  };
  walk(root, 0);
  return { nodes, edges, width: 80 + ix * 58 };
}

export function AvlView() {
  const frames = useMemo(() => buildAvlFrames(AVL_SEQ), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const { nodes, edges, width } = layout(fr.root);

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} 260`} className="w-full">
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={C.line} strokeWidth={1.6} />
        ))}
        {nodes.map(({ key, x, y, node }) => {
          const isWarn = fr.warnKey === key;
          const isNew = fr.newKey === key;
          const onPath = fr.pathKeys.includes(key);
          const act = fr.actKeys?.includes(key);
          const fill = isWarn ? C.warn : isNew ? C.active : act ? C.done : C.node;
          const stroke = onPath ? "#0284c7" : "#94a3b8";
          return (
            <g key={key}>
              <circle cx={x} cy={y} r={20} fill={fill} stroke={stroke} strokeWidth={onPath ? 2.4 : 1.2} />
              <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={isWarn || isNew || act ? "#fff" : C.nodeText}>
                {key}
              </text>
              {fr.showBf && (
                <text
                  x={x}
                  y={y + 34}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={Math.abs(bf(node)) > 1 ? C.bad : C.text}
                >
                  bf={bf(node)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
