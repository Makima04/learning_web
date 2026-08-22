// 图解 · 哈夫曼树与编码：每轮取权值最小的两棵合并；最终帧给边标 0/1、算 WPL 和编码
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

interface HNode {
  id: number;
  w: number;
  l: HNode | null;
  r: HNode | null;
}

export interface HuffmanResult {
  root: HNode;
  wpl: number;
  codes: { w: number; code: string }[];
}

/** 哈夫曼构建（纯函数，供动画与单测）：每次取权值最小的两棵合并 */
export function buildHuffman(weights: number[]): HuffmanResult {
  let nextId = 0;
  const forest: HNode[] = weights
    .slice()
    .sort((a, b) => a - b)
    .map((w) => ({ id: nextId++, w, l: null, r: null }));

  while (forest.length > 1) {
    // 取最小的两棵（权值同则先创建的优先），保证确定性
    forest.sort((a, b) => a.w - b.w || a.id - b.id);
    const a = forest.shift()!;
    const b = forest.shift()!;
    forest.push({ id: nextId++, w: a.w + b.w, l: a, r: b });
  }
  const root = forest[0]!;

  const codes: { w: number; code: string }[] = [];
  let wpl = 0;
  const walk = (n: HNode, path: string, d: number): void => {
    if (!n.l && !n.r) {
      codes.push({ w: n.w, code: path });
      wpl += n.w * d;
      return;
    }
    walk(n.l!, path + "0", d + 1);
    walk(n.r!, path + "1", d + 1);
  };
  walk(root, "", 0);
  return { root, wpl, codes };
}

interface Nd {
  x: number;
  y: number;
  w: number;
  kind: "leaf" | "inner";
  state: "normal" | "hi" | "new";
}

interface Frame extends VizFrame {
  /** 已存在的结点（内部结点创建后才出现），位置取最终布局 */
  nodes: Map<number, Nd>;
  edges: { from: number; to: number; bit?: 0 | 1 }[];
  showBits: boolean;
}

/** 布局用最终树的中序位置，保证每一帧的森林都不会出现交叉边 */
function layoutOf(root: HNode): Map<number, { x: number; y: number }> {
  const pos = new Map<number, { x: number; y: number }>();
  let ix = 0;
  const walk = (n: HNode | null, d: number): void => {
    if (!n) return;
    walk(n.l, d + 1);
    pos.set(n.id, { x: 64 + ix * 64, y: 48 + d * 74 });
    ix += 1;
    walk(n.r, d + 1);
  };
  walk(root, 0);
  return pos;
}

function findMergeNode(n: HNode | null, a: HNode, b: HNode): HNode | null {
  if (!n) return null;
  if (n.l === a && n.r === b) return n;
  return findMergeNode(n.l, a, b) ?? findMergeNode(n.r, a, b);
}

export function buildHuffmanFrames(weights: number[]): Frame[] {
  const { root, wpl, codes } = buildHuffman(weights);
  const pos = layoutOf(root);
  const sorted = weights.slice().sort((a, b) => a - b);
  const frames: Frame[] = [];

  let nextId = 0;
  const nodes = new Map<number, Nd>();
  const edges: Frame["edges"] = [];

  const snap = (desc: string, phase: string, opts?: { hi?: number[]; newId?: number; showBits?: boolean; edges?: Frame["edges"] }) => {
    const copy = new Map<number, Nd>();
    nodes.forEach((v, k) =>
      copy.set(k, { ...v, state: opts?.hi?.includes(k) ? "hi" : opts?.newId === k ? "new" : "normal" })
    );
    frames.push({
      desc,
      phase,
      nodes: copy,
      edges: opts?.edges ?? [...edges],
      showBits: opts?.showBits ?? false,
    });
  };

  sorted.forEach((w, i) => {
    const id = i; // buildHuffman 里叶子的 id 即升序序号
    nodes.set(id, { ...pos.get(id)!, w, kind: "leaf", state: "normal" });
  });
  snap(
    `初始森林：${weights.length} 棵只有根结点的树，权值 ${sorted.join("、")}。哈夫曼树的核心策略：权值越小的结点放得越深（编码长），权值越大的越靠近根（编码短），这样带权路径长度 WPL 最小。`,
    "初始"
  );

  // 重放合并过程（与 buildHuffman 相同的确定性选取）
  const forest = sorted.map((w, i) => ({ id: i, w, node: findNodeOf(root, i)! }));
  while (forest.length > 1) {
    forest.sort((a, b) => a.w - b.w || a.id - b.id);
    const a = forest.shift()!;
    const b = forest.shift()!;
    const merged = findMergeNode(root, a.node, b.node)!;
    snap(
      `当前森林权值：${[...forest.map((f) => f.w), a.w, b.w].sort((x, y) => x - y).join("、")}。取最小的两棵：${a.w} 和 ${b.w}（同权时任取，最终 WPL 相同）。`,
      "选最小两棵",
      { hi: [a.id, b.id] }
    );
    nodes.set(merged.id, { ...pos.get(merged.id)!, w: merged.w, kind: "inner", state: "new" });
    edges.push({ from: merged.id, to: a.id }, { from: merged.id, to: b.id });
    forest.push({ id: merged.id, w: merged.w, node: merged });
    snap(
      `合并 ${a.w} + ${b.w} = ${merged.w}：新结点作双亲，两棵子树分别为左、右孩子。新树权值 ${merged.w} 放回森林，参与下一轮选取。`,
      "合并",
      { newId: merged.id }
    );
  }

  // 最终帧：给边标 0/1，汇总编码与 WPL
  const labeled = edges.map((e) => ({ ...e }));
  const labelBits = (n: HNode): void => {
    if (n.l) labeled.find((e) => e.from === n.id && e.to === n.l!.id)!.bit = 0;
    if (n.r) labeled.find((e) => e.from === n.id && e.to === n.r!.id)!.bit = 1;
    if (n.l) labelBits(n.l);
    if (n.r) labelBits(n.r);
  };
  labelBits(root);
  const byW = (arr: { w: number; code: string }[]) => [...arr].sort((x, y) => x.w - y.w);
  snap(
    `构建完成。约定左分支记 0、右分支记 1，根到叶子的路径即该字符的编码：${byW(codes)
      .map((c) => `${c.w}→${c.code}`)
      .join("，")}。WPL = ${byW(codes)
      .map((c) => `${c.w}×${c.code.length}`)
      .join(" + ")} = ${wpl}，它也等于每次合并产生的新权值之和。任何一个编码都不是另一个的前缀（前缀码），解码时不会歧义。`,
    "编码与 WPL",
    { showBits: true, edges: labeled }
  );
  return frames;
}

function findNodeOf(n: HNode | null, id: number): HNode | null {
  if (!n) return null;
  if (n.id === id) return n;
  return findNodeOf(n.l, id) ?? findNodeOf(n.r, id);
}

export function HuffmanView() {
  const frames = useMemo(() => buildHuffmanFrames([7, 5, 2, 4]), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const { codes, wpl } = useMemo(() => buildHuffman([7, 5, 2, 4]), []);

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 520 240" className="w-full">
        {fr.edges.map((e, i) => {
          const f = fr.nodes.get(e.from)!;
          const t = fr.nodes.get(e.to)!;
          if (!f || !t) return null;
          return (
            <g key={i}>
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={C.line} strokeWidth={1.6} />
              {fr.showBits && e.bit != null && (
                <text x={(f.x + t.x) / 2 + (e.bit ? 8 : -8)} y={(f.y + t.y) / 2} fontSize={12} fontWeight={700} fill={e.bit ? C.bad : C.done}>
                  {e.bit}
                </text>
              )}
            </g>
          );
        })}
        {Array.from(fr.nodes.entries()).map(([id, nd]) => {
          const fill = nd.state === "hi" ? C.warn : nd.state === "new" ? C.active : nd.kind === "leaf" ? C.node : "#cbd5e1";
          const txt = nd.state === "normal" && nd.kind === "leaf" ? C.nodeText : "#fff";
          return (
            <g key={id}>
              <circle cx={nd.x} cy={nd.y} r={19} fill={fill} stroke="#94a3b8" />
              <text x={nd.x} y={nd.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={txt}>
                {nd.w}
              </text>
            </g>
          );
        })}
      </svg>

      {fr.showBits && (
        <div className="rounded-lg border p-3 text-xs leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">编码表：</span>
          {codes
            .slice()
            .sort((a, b) => a.w - b.w)
            .map((c) => `${c.w}=${c.code}`)
            .join("　")}
          　<span className="font-medium text-foreground">WPL = {wpl}</span>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
