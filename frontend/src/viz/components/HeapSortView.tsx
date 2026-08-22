// 图解 · 堆排序：完全二叉树 ↔ 数组双视角。先自底向上建大顶堆，再「堆顶换堆尾 + 下沉」逐个就位。
// 数据刻意含两个 49（标 ₁/₂）：演示堆排的不稳定性（远距离交换 49₂ 先被甩到后面）。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const HS_ARR = [97, 49, 65, 76, 27, 38, 49, 13];

interface Item {
  v: number;
  o: number; // 初始位置（1-based），重复值做角标
}

interface HFrame extends VizFrame {
  arr: number[];
  /** 与 arr 对齐的原始下标（仅重复值非空） */
  tags: (string | null)[];
  heapSize: number;
  hi: number[]; // 1-based 高亮
}

const tagChar = (o: string): string => (o === "1" ? "₁" : o === "2" ? "₂" : o === "7" ? "₇" : o);

/** 重复值的原始下标才需要角标 */
function tagOf(items: Item[], k: number): string | null {
  const v = items[k]!.v;
  return items.filter((x) => x.v === v).length > 1 ? String(items[k]!.o) : null;
}

export function buildHeapSortFrames(input: number[]): HFrame[] {
  const items: Item[] = input.map((v, k) => ({ v, o: k + 1 }));
  const isDup = (v: number): boolean => input.filter((x) => x === v).length > 1;
  const fmt = (it: Item): string => (isDup(it.v) ? `${it.v}${tagChar(String(it.o))}` : String(it.v));
  const frames: HFrame[] = [];
  let heapSize = input.length;
  const snap = (desc: string, phase: string, hi: number[] = []) =>
    frames.push({
      desc,
      phase,
      arr: items.map((x) => x.v),
      tags: items.map((_, k) => tagOf(items, k)),
      heapSize,
      hi,
    });

  snap(
    `待排序列 ${items.map((x) => fmt(x)).join("、")}（下标 1..n，对应完全二叉树：i 的孩子是 2i、2i+1，双亲是 ⌊i/2⌋）。两个 49 用角标 ₁、₂ 标出原始身份。堆排序两步走：① 自底向上建大顶堆；② 反复「堆顶 ↔ 堆尾交换、堆规模减 1、堆顶下沉」。`,
    "开始"
  );

  const sift = (i0: number, size: number): void => {
    let i = i0;
    for (;;) {
      const l = 2 * i;
      const r = 2 * i + 1;
      if (l > size) {
        snap(`结点 ${i}（${fmt(items[i - 1]!)}）是叶子，下沉结束。`, "下沉", [i]);
        return;
      }
      let m = l;
      if (r <= size && items[r - 1]!.v > items[l - 1]!.v) m = r;
      if (items[m - 1]!.v > items[i - 1]!.v) {
        snap(
          `结点 ${i}（${fmt(items[i - 1]!)}）与较大的孩子 ${m}（${fmt(items[m - 1]!)}）比较：孩子更大，交换（大顶堆要求双亲 ≥ 孩子）。`,
          "下沉",
          [i, m]
        );
        [items[i - 1], items[m - 1]] = [items[m - 1]!, items[i - 1]!];
        snap(`交换完成，继续检查落下的结点 ${m}。`, "下沉", [m]);
        i = m;
      } else {
        snap(`结点 ${i}（${fmt(items[i - 1]!)}）≥ 最大孩子 ${fmt(items[m - 1]!)}，满足堆性质，下沉结束。`, "下沉", [i]);
        return;
      }
    }
  };

  for (let i = Math.floor(input.length / 2); i >= 1; i--) {
    snap(
      i === Math.floor(input.length / 2)
        ? `建堆：从最后一个分支结点 ${i}（⌊n/2⌋ = ${Math.floor(input.length / 2)}）开始，向前逐结点「下沉」调整。叶子本来满足堆性质，不用管。`
        : `处理分支结点 ${i}（${fmt(items[i - 1]!)}）。`,
      "建堆",
      [i]
    );
    sift(i, heapSize);
  }
  snap(
    `大顶堆建成：${items.map((x) => fmt(x)).join("、")}。堆顶 a[1] = ${fmt(items[0]!)} 是全局最大值。建堆过程 O(n)（自底向上），比逐个插入建堆 O(nlogn) 划算。`,
    "建堆完成"
  );

  while (heapSize > 1) {
    const tailWasDup = tagOf(items, heapSize - 1) != null;
    snap(
      `堆顶 ${fmt(items[0]!)}（当前最大）与堆尾 a[${heapSize}]（${fmt(items[heapSize - 1]!)}）交换，${fmt(items[0]!)} 就位。${tailWasDup ? "注意角标：被甩到堆尾的是哪个 49。" : ""}`,
      "交换",
      [1, heapSize]
    );
    [items[0], items[heapSize - 1]] = [items[heapSize - 1]!, items[0]!];
    heapSize--;
    snap(`堆规模缩为 ${heapSize}（绿色部分已排好，不再参与）。新堆顶 ${fmt(items[0]!)} 需要下沉恢复堆性质。`, "缩堆", [1]);
    sift(1, heapSize);
  }
  const finalItems = [...items];
  const dupTags = finalItems
    .map((x, k) => (isDup(x.v) ? String(x.o) : null))
    .filter(Boolean);
  const unstable =
    dupTags.length >= 2 &&
    (() => {
      for (const v of new Set(finalItems.filter((x) => isDup(x.v)).map((x) => x.v))) {
        const os = finalItems.filter((x) => x.v === v).map((x) => x.o);
        for (let k = 1; k < os.length; k++) if (os[k]! < os[k - 1]!) return true;
      }
      return false;
    })();
  snap(
    `完成：${finalItems.map((x) => fmt(x)).join("、")}（升序）。${unstable ? "看结果：排序正确，但 49₁ 排到了 49₂ 前面——初始顺序是 49₂（第 2 位）在前、49₁（第 7 位）在后。「堆顶 ↔ 堆尾」是相距很远的两个元素交换，容易跨过相等元素，所以堆排不稳定" : "本例相等元素顺序未被打乱"}。要点：时间最好/最坏/平均都是 O(nlogn)；空间 O(1)（原地）；不稳定。常考：建堆过程画树、插入/删除后调整、top-K 问题（K 大用小顶堆）。`,
    "完成"
  );
  return frames;
}

export function heapSorted(input: number[]): number[] {
  return buildHeapSortFrames(input).at(-1)!.arr;
}

function treeLayout(n: number) {
  const pos: Record<number, [number, number]> = {};
  for (let i = 1; i <= n; i++) {
    const d = Math.floor(Math.log2(i));
    const p = i - 2 ** d;
    pos[i] = [((p + 0.5) * 480) / 2 ** d, 36 + d * 66];
  }
  return pos;
}

export function HeapSortView() {
  const frames = useMemo(() => buildHeapSortFrames(HS_ARR), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const pos = useMemo(() => treeLayout(HS_ARR.length), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <svg viewBox="0 0 480 250" className="w-full lg:w-[58%]">
          {HS_ARR.map((_, k) => {
            const i = k + 1;
            const par = Math.floor(i / 2);
            if (par < 1) return null;
            const [x1, y1] = pos[par]!;
            const [x2, y2] = pos[i]!;
            const inHeap = i <= fr.heapSize;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth={1.4} opacity={inHeap ? 1 : 0.3} />
            );
          })}
          {HS_ARR.map((_, k) => {
            const i = k + 1;
            const [x, y] = pos[i]!;
            const v = fr.arr[k]!;
            const tag = fr.tags[k];
            const inHeap = i <= fr.heapSize;
            const hi = fr.hi.includes(i);
            const fill = hi ? C.warn : inHeap ? C.node : C.done;
            return (
              <g key={i} opacity={inHeap ? 1 : 0.75}>
                <circle cx={x} cy={y} r={20} fill={fill} stroke="#94a3b8" />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={hi ? "#fff" : C.nodeText}>
                  {v}
                </text>
                {tag && (
                  <text x={x + 15} y={y - 12} fontSize={9} fontWeight={700} fill={hi ? "#fff" : inHeap ? "#0284c7" : "#065f46"}>
                    {tagChar(tag)}
                  </text>
                )}
                <text x={x + 22} y={y - 14} fontSize={10} fill={C.text}>
                  {i}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">数组视角（绿色 = 已就位，堆外）</p>
          <div className="flex flex-wrap gap-1.5">
            {fr.arr.map((v, k) => {
              const i = k + 1;
              const inHeap = i <= fr.heapSize;
              const hi = fr.hi.includes(i);
              return (
                <div
                  key={k}
                  className={cn(
                    "w-12 overflow-hidden rounded-md border text-center",
                    hi ? "border-amber-500 bg-amber-500" : inHeap ? "border-border" : "border-emerald-600 bg-emerald-600"
                  )}
                >
                  <div className={cn("text-[10px]", hi ? "text-white/80" : inHeap ? "bg-muted text-muted-foreground" : "text-white/80")}>
                    {i}
                    {fr.tags[k] ? tagChar(fr.tags[k]!) : ""}
                  </div>
                  <div className={cn("py-0.5 font-mono text-sm font-bold", hi ? "text-white" : inHeap ? "" : "text-white")}>{v}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            堆 ≠ 有序：大顶堆只保证「双亲 ≥ 孩子」，兄弟之间无约束。完全二叉树顺序存储没有指针，下标计算就是「地址」。
          </p>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
