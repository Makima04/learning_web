// 图解 · 归并排序：二路归并，「分」递归拆半、「治」两两合并；合并时相等先取左半 → 稳定。
// 数据含两个 49（角标 ₁₆），合并全程不换相对顺序——与快排/堆排演示形成对照。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, sub, type CellItem } from "@/viz/player";

export interface MItem {
  v: number;
  o: number;
}
export const MG_ARR = [49, 38, 65, 97, 76, 49, 13, 27]; // 49₁ 在第 1 位、49₂ 在第 6 位
const isDup = (v: number) => MG_ARR.filter((x) => x === v).length > 1;
const name = (it: MItem) => (isDup(it.v) ? `${it.v}${sub(it.o)}` : `${it.v}`);

interface MGFrame extends VizFrame {
  items: MItem[];
  lo: number;
  mid: number;
  hi: number;
  /** 双指针位置（合并中） */
  i?: number;
  j?: number;
  aux?: MItem[];
}

/** 归并排序（帧记录版，2 路自顶向下） */
export function mergeSortFrames(input: number[]): MGFrame[] {
  const frames: MGFrame[] = [];
  let items = input.map((v, k) => ({ v, o: k + 1 }));
  const snap = (desc: string, phase: string, lo: number, mid: number, hi: number, extra?: Partial<MGFrame>) =>
    frames.push({ desc, phase, lo, mid, hi, items: items.map((x) => ({ ...x })), ...extra });

  snap(
    `待排 ${items.map(name).join("、")}。归并排序：递归拆半到单个元素（自然有序），再两两合并——合并两个有序段 O(段长)，共 ⌈log₂n⌉ 趟，总时间稳定 O(nlogn)，空间 O(n)（辅助数组）。`,
    "初始",
    0,
    -1,
    items.length - 1
  );
  // 自底向上按宽度 1,2,4 合并（与递归版的合并顺序一致，帧更整齐）
  for (let w = 1; w < items.length; w *= 2) {
    snap(`宽度 ${w} 的相邻两段合并（每段已内部有序）：`, `趟宽 ${w}`, 0, -1, items.length - 1);
    for (let lo = 0; lo < items.length; lo += 2 * w) {
      const mid = Math.min(lo + w - 1, items.length - 1);
      const hi = Math.min(lo + 2 * w - 1, items.length - 1);
      if (mid >= hi) break;
      snap(`合并 [${lo + 1}..${mid + 1}]（${items.slice(lo, mid + 1).map(name).join("、")}）与 [${mid + 2}..${hi + 1}]（${items.slice(mid + 1, hi + 1).map(name).join("、")}）`, "合并", lo, mid, hi);
      const A = items.slice(lo, mid + 1);
      const B = items.slice(mid + 1, hi + 1);
      const out: MItem[] = [];
      let i = 0;
      let j = 0;
      while (i < A.length && j < B.length) {
        const takeLeft = A[i]!.v <= B[j]!.v;
        snap(
          `比较两段当前头：${name(A[i]!)} ${takeLeft ? "≤" : ">"} ${name(B[j]!)} → 取${takeLeft ? "左" : "右"}段。${A[i]!.v === B[j]!.v ? "相等先取左半——相对顺序保住（稳定的全部秘密就在这个 ≤）。" : ""}`,
          "比较",
          lo,
          mid,
          hi,
          { i: lo + i, j: mid + 1 + j, aux: [...out] }
        );
        out.push(takeLeft ? A[i++]! : B[j++]!);
      }
      while (i < A.length) out.push(A[i++]!);
      while (j < B.length) out.push(B[j++]!);
      items = [...items.slice(0, lo), ...out, ...items.slice(hi + 1)];
      snap(`合并完成：[${lo + 1}..${hi + 1}] = ${out.map(name).join("、")}（更大的段诞生）。`, "段就绪", lo, mid, hi);
    }
  }
  const dups = items.filter((x) => isDup(x.v)).map((x) => String(x.o));
  snap(
    `完成：${items.map(name).join("、")}。角标顺序 ${dups.join("、")}（初始 1、6）——相等先取左半 ⇒ 归并稳定 ✓。对比：时间同为 O(nlogn) 的快排/堆排都不稳定、堆排还有 O(1) 空间的优势。n≥2 时比较次数 ≤ n⌈log₂n⌉；归并也是外排的基础（外排演示里再见到它）。`,
    "完成",
    0,
    -1,
    items.length - 1
  );
  return frames;
}

export function mergeSorted(input: number[]): number[] {
  return mergeSortFrames(input).at(-1)!.items.map((x) => x.v);
}

const toCells = (fr: MGFrame): CellItem[] =>
  fr.items.map((it, k) => {
    const inMerge = k >= fr.lo && k <= fr.hi;
    const isPtr = fr.i === k || fr.j === k;
    return {
      label: k + 1,
      tag: isDup(it.v) ? String(it.o) : undefined,
      v: it.v,
      state: isPtr ? "warn" : inMerge ? "hi" : "normal",
    };
  });

export function MergeSortView() {
  const frames = useMemo(() => mergeSortFrames(MG_ARR), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">黄 = 本轮合并区间，黄底加边 = 两段各自的队头指针</p>
      <Cells items={toCells(fr)} w="w-12" />
      {fr.aux && fr.aux.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">输出缓冲区（已合并部分）</p>
          <Cells items={fr.aux.map((it) => ({ v: it.v, tag: isDup(it.v) ? String(it.o) : undefined, state: "done" as const }))} w="w-12" />
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
