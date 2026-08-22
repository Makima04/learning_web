// 图解 · 并查集：parent 数组表达森林，「合并 = 根挂根，查找 = 顺指针爬到根」。
// 先演示按输入顺序合并长出深链，再看路径压缩如何把它拍扁——Kruskal 判连通全靠它。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

const N = 8;
/** 合并序列：先两两成 4 棵树，再连环合并成一棵深树 */
export const UF_UNIONS: [number, number][] = [
  [1, 2], [3, 4], [5, 6], [7, 8],
  [1, 3], [5, 7], [2, 6],
];
/** 演示路径压缩的查询 */
export const UF_FIND = 8;

/** 并查集本体：支持带帧记录的 union / 压缩 find */
export function ufRun(n: number, unions: [number, number][], findX: number) {
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const depth = (x: number): number => {
    let d = 0;
    let cur = x;
    while (parent[cur] !== cur) {
      cur = parent[cur]!;
      d++;
    }
    return d;
  };
  for (const [a, b] of unions) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  const beforeDepth = depth(findX);
  // 路径压缩：沿途结点直接挂根
  const path: number[] = [];
  let cur = findX;
  while (parent[cur] !== cur) {
    path.push(cur);
    cur = parent[cur]!;
  }
  const root = cur;
  for (const x of path) parent[x] = root;
  return { parent, root: find(findX), beforeDepth, afterDepth: depth(findX), path };
}

interface UFrame extends VizFrame {
  parent: number[]; // 1..n
  hi?: number[];
  links: [number, number][]; // child → parent
}

function linksOf(parent: number[]): [number, number][] {
  const l: [number, number][] = [];
  for (let i = 1; i <= N; i++) if (parent[i] !== i) l.push([i, parent[i]!]);
  return l;
}

function buildUfFrames(): UFrame[] {
  const frames: UFrame[] = [];
  const parent = Array.from({ length: N + 1 }, (_, i) => i);
  const snap = (desc: string, phase: string, hi: number[] = []) =>
    frames.push({ desc, phase, hi, parent: [...parent], links: linksOf(parent) });

  snap(
    `并查集 = parent 数组表达的森林：parent[i] = i 表示 i 自己是根。初始 1..${N} 各自成单结点树。两个核心操作：Find(x) 顺指针爬到根（根的 parent 是自己），Union(a,b) 把一棵树的根挂到另一棵树的根上。`,
    "初始"
  );

  const find = (x: number): { root: number; path: number[] } => {
    const path: number[] = [];
    let cur = x;
    while (parent[cur] !== cur) {
      path.push(cur);
      cur = parent[cur]!;
    }
    return { root: cur, path };
  };
  UF_UNIONS.forEach(([a, b], i) => {
    const fa = find(a);
    const fb = find(b);
    if (i < 4) {
      parent[fb.root] = fa.root;
      snap(
        `Union(${a},${b})：Find(${a})=${fa.root}（自己就是根），Find(${b})=${fb.root}，把 ${fb.root} 挂到 ${fa.root} 下。两两合并成 4 棵「二叉小树」：{1,2} {3,4} {5,6} {7,8}。`,
        "合并",
        [fa.root, fb.root]
      );
    } else {
      parent[fb.root] = fa.root;
      snap(
        `Union(${a},${b})：Find(${a}) 沿 ${fa.path.join("→")}（或直接）到根 ${fa.root}，Find(${b}) 到根 ${fb.root}，根 ${fb.root} 挂到 ${fa.root}。注意挂的是「根」，不是 a、b 本身——挂错结点会丢整棵子树。`,
        "合并",
        [fa.root, fb.root]
      );
    }
  });

  const d8 = (() => {
    let d = 0;
    let cur: number = UF_FIND;
    while (parent[cur] !== cur) {
      cur = parent[cur]!;
      d++;
    }
    return d;
  })();
  snap(
    `7 次合并后全体成一棵树，根是 1。按输入顺序「谁先来谁当爹」，Find(${UF_FIND}) 要爬 ${d8} 层（${(() => {
      const p: number[] = [];
      let cur: number = UF_FIND;
      while (parent[cur] !== cur) {
        p.push(cur);
        cur = parent[cur]!;
      }
      return p.join("→");
    })()}）。树越深查找越慢，最坏 O(n)。`,
    "树太深",
    [UF_FIND]
  );

  // 路径压缩
  const path: number[] = [];
  let cur: number = UF_FIND;
  while (parent[cur] !== cur) {
    path.push(cur);
    cur = parent[cur]!;
  }
  const root = cur;
  for (const x of path) parent[x] = root;
  snap(
    `Find(${UF_FIND}) 顺指针 ${[...path, root].join("→")} 找到根 ${root} 后做「路径压缩」：把沿途结点全部直接挂到根上。再查 ${UF_FIND} 只需 1 步。配合「按秩/按大小合并」，单次操作均摊 O(α(n))，α 是反阿克曼函数，工程上当常数。`,
    "路径压缩",
    path
  );

  const res = ufRun(N, UF_UNIONS, UF_FIND);
  snap(
    `最终：所有元素同根（连通分量为 1）。并查集不存边、只答「是否连通」，是 Kruskal 加边前判环、判「这条边两端是否已同属一棵树」的标准工具（Kruskal 演示里会再遇到它）。压缩后再查 ${UF_FIND} 只要 1 步（压缩前要爬 ${res.beforeDepth} 层）。`,
    "完成",
    []
  );
  return frames;
}

/** 布局：8 个结点按最终形态手工摆位，帧间用 links 重画父子边 */
const POS: Record<number, [number, number]> = {
  1: [230, 30], 2: [120, 100], 3: [230, 100], 4: [230, 170],
  5: [340, 100], 6: [340, 170], 7: [430, 170], 8: [430, 240],
};

export function UnionFindView() {
  const frames = useMemo(buildUfFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <svg viewBox="0 0 560 270" className="w-full lg:w-[55%]">
          {fr.links.map(([child, par]) => {
            const [x1, y1] = POS[child]!;
            const [x2, y2] = POS[par]!;
            return <line key={`${child}-${par}-${fr.parent[child]}`} x1={x1} y1={y1 - 16} x2={x2} y2={y2 + 16} stroke={C.line} strokeWidth={1.4} />;
          })}
          {Array.from({ length: N }, (_, i) => i + 1).map((i) => {
            const [x, y] = POS[i]!;
            const hi = fr.hi?.includes(i);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={17} fill={hi ? C.active : fr.parent[i] === i ? C.done : C.node} stroke="#94a3b8" />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={hi || fr.parent[i] === i ? "#fff" : C.nodeText}>
                  {i}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">parent 数组（绿色 = 根，parent[i]=i）</p>
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: N }, (_, i) => i + 1).map((i) => (
              <div key={i} className="overflow-hidden rounded-md border border-border text-center">
                <div className="bg-muted text-[10px] text-muted-foreground">{i}</div>
                <div className={fr.hi?.includes(i) ? "py-0.5 font-mono text-sm font-bold text-sky-600" : "py-0.5 font-mono text-sm font-bold"}>
                  {fr.parent[i]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
