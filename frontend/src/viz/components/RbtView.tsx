// 图解 · 红黑树插入：插入序列 10,20,30,15,25,12,5 依次触发「叔叔红→变色」「叔叔黑→旋转」，
// 覆盖 RR 旋转、变色上递、RL 双旋。性质（根黑、红不连、黑高相等）全程成立。
import { useMemo } from "react";
import type { ReactNode } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { layoutBinary, layoutSize } from "@/viz/layout";

export interface RbN {
  v: number;
  red: boolean;
  l: RbN | null;
  r: RbN | null;
}

export const RB_SEQ = [10, 20, 30, 15, 25, 12, 5];

const clone = (n: RbN | null): RbN | null => (n ? { v: n.v, red: n.red, l: clone(n.l), r: clone(n.r) } : null);

/** 左旋（围绕 x，右孩子 y 上来） */
function rotLeft(x: RbN): RbN {
  const y = x.r!;
  x.r = y.l;
  y.l = x;
  return y;
}
function rotRight(x: RbN): RbN {
  const y = x.l!;
  x.l = y.r;
  y.r = x;
  return y;
}

/** 红黑树插入（含 fixup）。frameCb 在每个阶段回调（插入后/每步调整后）用于出帧 */
export function rbInsert(root: RbN | null, v: number, frameCb?: (root: RbN | null, note: string, phase: string, hi: number[]) => void): RbN | null {
  const n: RbN = { v, red: true, l: null, r: null };
  if (!root) {
    n.red = false;
    frameCb?.(n, `${v} 是第一个结点，染黑当根。`, "插 " + v, [v]);
    return n;
  }
  // BST 插入（红色）
  const insert = (node: RbN): RbN => {
    if (v < node.v) node.l = node.l ? insert(node.l) : n;
    else node.r = node.r ? insert(node.r) : n;
    return node;
  };
  insert(root);
  frameCb?.(root, `按 BST 规则插 ${v}（先染红——不破坏黑高）。`, "插 " + v, [v]);

  // fixup
  const parentOf = (t: RbN | null, x: RbN): RbN | null => {
    if (!t) return null;
    if (t.l === x || t.r === x) return t;
    return parentOf(t.l, x) ?? parentOf(t.r, x);
  };
  let cur = n;
  let parent = parentOf(root, cur);
  while (parent && parent.red) {
    const grand = parentOf(root, parent)!;
    const uncle = grand.l === parent ? grand.r : grand.l;
    if (uncle && uncle.red) {
      parent.red = false;
      uncle.red = false;
      grand.red = true;
      frameCb?.(root, `${v} 的父亲 ${parent.v} 红、叔叔 ${uncle.v} 也红 → 变色：父亲叔叔变黑、祖父 ${grand.v} 变红，问题上移到 ${grand.v}。`, "变色", [grand.v]);
      cur = grand;
      parent = parentOf(root, cur);
    } else {
      const isLeftChild = grand.l === parent;
      let p = parent;
      if (isLeftChild ? cur === parent.r : cur === parent.l) {
        // LR / RL：先旋成 LL / RR
        if (isLeftChild) {
          parent = rotLeft(parent)!;
          grand.l = parent;
        } else {
          parent = rotRight(parent)!;
          grand.r = parent;
        }
        cur = p; // 原 parent 变成新孩子
        frameCb?.(root, `叔叔黑且路径「拐弯」（LR/RL 型）：先绕 ${p.v} 旋直，再绕 ${grand.v} 反向单旋。`, "旋转", [parent.v, grand.v]);
        p = cur;
      }
      // LL / RR 单旋
      parent.red = false;
      grand.red = true;
      let newSub: RbN;
      if (grand.l === parent) newSub = rotRight(grand);
      else newSub = rotLeft(grand);
      // 把 newSub 接回 grand 的父结点
      const gp = parentOf(root, grand);
      if (!gp) root = newSub;
      else if (gp.l === grand) gp.l = newSub;
      else gp.r = newSub;
      frameCb?.(root, `叔叔黑、方向一致（LL/RR 型）：绕 ${grand.v} 单旋 + 变色（${parent.v} 黑、${grand.v} 红）。红黑树没有「平衡因子」，靠旋转+变色维持「最长路径 ≤ 2×最短路径」。`, "旋转", [parent.v, grand.v]);
      break;
    }
  }
  if (root!.red) {
    root!.red = false;
    frameCb?.(root, `根必须是黑色：${root!.v} 染黑。`, "根染黑", [root!.v]);
  }
  return root;
}

/** 校验红黑树三条核心性质（根黑 / 红不连 / 黑高相等），返回黑高（不一致返回 -1） */
export function rbCheck(root: RbN | null): { rootBlack: boolean; noRedRed: boolean; blackHeight: number } {
  const rootBlack = !root || !root.red;
  let noRedRed = true;
  let blackHeight = -1;
  const walk = (n: RbN | null, parentRed: boolean, blacks: number): boolean => {
    if (!n) {
      if (blackHeight === -1) blackHeight = blacks;
      return blacks === blackHeight;
    }
    if (parentRed && n.red) noRedRed = false;
    const add = n.red ? 0 : 1;
    return walk(n.l, n.red, blacks + add) && walk(n.r, n.red, blacks + add);
  };
  const equal = walk(root, false, 0);
  return { rootBlack, noRedRed, blackHeight: equal ? blackHeight : -1 };
}

export function inorderOf(root: RbN | null): number[] {
  const out: number[] = [];
  const walk = (n: RbN | null) => {
    if (!n) return;
    walk(n.l);
    out.push(n.v);
    walk(n.r);
  };
  walk(root);
  return out;
}

interface RFrame extends VizFrame {
  root: RbN | null;
  hi: number[];
}

export function buildRbFrames(): RFrame[] {
  const frames: RFrame[] = [];
  let root: RbN | null = null;
  const snap = (r: RbN | null, note: string, phase: string, hi: number[]) =>
    frames.push({ desc: note, phase, root: clone(r), hi });
  frames.push({
    desc: "红黑树是「近似平衡」的 BST：① 结点非红即黑；② 根黑；③ 红结点的孩子必黑（无连续红）；④ 任一结点到其每个叶子的路径含相同数目黑结点（黑高相同）。由 ③④ 推出最长路径 ≤ 2×最短路径，查找稳定 O(log n)。插入序列 " + RB_SEQ.join("、") + "。",
    phase: "初始",
    root: null,
    hi: [],
  });
  for (const v of RB_SEQ) root = rbInsert(root, v, snap);
  const chk = rbCheck(root);
  frames.push({
    desc: `完成：中序 ${inorderOf(root).join("、")} 有序，根黑 ✓、无连续红 ✓、黑高 = ${chk.blackHeight}（每条到空的路径黑结点数相同）✓。考试以性质与插入调整为主（删除一般不要求手推），和 AVL 对比：AVL 严格平衡、查找更快，红黑树旋转少、插入删除更省，工程（map/set）几乎都用红黑树。`,
    phase: "完成",
    root: clone(root)!,
    hi: [],
  });
  return frames;
}

const R = 15;

export function RbtView() {
  const frames = useMemo(buildRbFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const pos = useMemo(() => layoutBinary(fr.root, { xGap: 40, yGap: 56 }), [fr.root]);
  const size = useMemo(() => layoutSize(fr.root, pos, { xGap: 40, yGap: 56 }), [fr.root, pos]);

  const render = (make: (n: RbN, x: number, y: number) => ReactNode): ReactNode[] => {
    const out: ReactNode[] = [];
    const walk = (n: RbN | null) => {
      if (!n) return;
      const [x, y] = pos.get(n)!;
      out.push(make(n, x, y));
      walk(n.l);
      walk(n.r);
    };
    walk(fr.root);
    return out;
  };

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${Math.max(size.w, 240)} ${Math.max(size.h, 120)}`} className="w-full">
        {fr.root &&
          render((n, x, y) => {
            const items: ReactNode[] = [];
            for (const kid of [n.l, n.r]) {
              if (kid) {
                const [kx, ky] = pos.get(kid)!;
                items.push(
                  <line key={`e${n.v}-${kid.v}`} x1={x} y1={y + R} x2={kx} y2={ky - R} stroke={C.line} strokeWidth={1.4} />
                );
              }
            }
            return <g key={`eg${n.v}`}>{items}</g>;
          })}
        {fr.root &&
          render((n, x, y) => {
            const hi = fr.hi.includes(n.v);
            return (
              <g key={`n${n.v}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={R}
                  fill={n.red ? C.bad : "#1e293b"}
                  stroke={hi ? C.active : n.red ? "#be123c" : "#0f172a"}
                  strokeWidth={hi ? 3 : 1}
                />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
                  {n.v}
                </text>
              </g>
            );
          })}
      </svg>
      <p className="text-xs text-muted-foreground">红结点 = 刚插入/变红的；黑结点深色。旋转帧中蓝圈标记参与者。</p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
