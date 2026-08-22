// 图解 · 顺序表：按序号随机访问 O(1) vs 插入/删除要成片挪元素 O(n)——这是顺序表 vs 链表的核心取舍
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";

export const SQ_INIT = [12, 25, 33, 48, 56];
const CAP = 8;

interface SFrame extends VizFrame {
  cells: CellItem[];
  len: number;
}

/** 顺序表插入：pos 为 1-based 位序 */
export function seqInsert(arr: number[], pos: number, v: number): number[] {
  const a = [...arr];
  for (let i = a.length; i >= pos; i--) a[i] = a[i - 1]!;
  a[pos - 1] = v;
  return a;
}

/** 顺序表删除：pos 为 1-based 位序，返回新表与被删值 */
export function seqDelete(arr: number[], pos: number): { next: number[]; removed: number } {
  const removed = arr[pos - 1]!;
  const a = [...arr];
  for (let i = pos - 1; i < a.length - 1; i++) a[i] = a[i + 1]!;
  a.length = arr.length - 1;
  return { next: a, removed };
}

function cell(a: number[], len: number, hi: number[] = [], warn: number[] = [], dim = len): CellItem[] {
  return Array.from({ length: CAP }, (_, i) => {
    const idx = i + 1;
    const filled = idx <= len;
    return {
      label: idx,
      v: filled ? a[i]! : "—",
      state: hi.includes(idx) ? "hi" : warn.includes(idx) ? "warn" : !filled || idx > dim ? "dim" : "normal",
    } satisfies CellItem;
  });
}

export function buildSeqListFrames(init: number[]): SFrame[] {
  const frames: SFrame[] = [];
  let a = [...init];
  let len = a.length;
  const snap = (desc: string, phase: string, hi: number[] = [], warn: number[] = []) =>
    frames.push({ desc, phase, cells: cell(a, len, hi, warn), len });

  snap(
    `顺序表：一段连续存储 + 长度 len=${len}（容量 ${CAP}）。它最值钱的能力是「按位序随机访问」：a[i] 的地址 = 首地址 + (i-1)×元素大小，一步算出来，O(1)。`,
    "顺序表"
  );
  snap(
    `取第 3 个元素：地址直接算出 a[3] = ${a[2]!}，一次访存拿到，与表长无关。而「按值找 48」只能从头挨个比（这里比 4 次），O(n)。二分查找之所以要求顺序存储，就是吃这个 O(1) 定位。`,
    "随机访问",
    [3]
  );

  // 插入 30 到位序 3
  snap(`要在位序 3 插入 30，得先给它腾位置——从最后一个元素起依次右移。合法插入位序是 1..len+1。`, "插入", [], [3]);
  for (let i = len; i >= 3; i--) {
    snap(
      `第 ${i} 个元素 ${a[i - 1]!} 右移到第 ${i + 1} 个位置。注意必须从尾部往前挪：从前往后会把还没搬的元素覆盖掉。`,
      "插入·移动",
      [i, i + 1]
    );
  }
  a = seqInsert(a, 3, 30);
  len++;
  snap(`腾出位序 3，放入 30，len=${len}。移动了 ${init.length - 3 + 1} 个元素：平均 n/2 次，最坏 n 次，O(n)。`, "插入完成", [3]);

  // 删除位序 2（值 25）
  snap(`删除位序 2（值 25）：该位置空出来，后面元素依次左移补上。`, "删除", [], [2]);
  for (let i = 3; i <= len; i++) {
    snap(
      `第 ${i} 个元素 ${a[i - 1]!} 左移到第 ${i - 1} 个位置。删除同样平均移动 n/2 个元素。`,
      "删除·移动",
      [i, i - 1]
    );
  }
  const del = seqDelete(a, 2);
  a = del.next;
  len--;
  snap(
    `删除完成：${a.join("、")}，len=${len}。总结：顺序表按位序存取 O(1)（链表要顺着走 O(n)），插入/删除 O(n)（链表找到位置后只改指针 O(1)）。大题常用「下标从 0 还是 1 开始」埋坑，读题时圈出来。`,
    "删除完成",
    [2]
  );
  return frames;
}

export function SeqListView() {
  const frames = useMemo(() => buildSeqListFrames(SQ_INIT), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">下标从 1 开始；灰色为空闲容量</p>
      <Cells items={fr.cells} w="w-12" />
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
