// 图解 · 折半查找：mid = ⌊(low+high)/2⌋，每比较一次区间折半。
// 成功查 14 比较 4 次；失败查 50 也是 4 次；13 个元素的判定树 ASL = 41/13。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";
import { cn } from "@/lib/utils";

export const BS_ARR = [7, 14, 18, 21, 23, 29, 31, 35, 38, 42, 46, 49, 52];

export interface BinStep {
  lo: number;
  hi: number;
  mid: number;
  cmp: "lt" | "gt" | "eq";
}

/** 折半查找本体：返回比较轨迹（含成功/失败） */
export function binSearchSteps(arr: number[], key: number): { steps: BinStep[]; found: boolean } {
  const steps: BinStep[] = [];
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cmp = arr[mid]! < key ? "lt" : arr[mid]! > key ? "gt" : "eq";
    steps.push({ lo, hi, mid, cmp });
    if (cmp === "eq") return { steps, found: true };
    if (cmp === "lt") lo = mid + 1;
    else hi = mid - 1;
  }
  return { steps, found: false };
}

/** 成功查找的平均查找长度：对每个元素跑一遍取平均 */
export function aslSuccess(arr: number[]): number {
  const total = arr.reduce((s, k) => s + binSearchSteps(arr, k).steps.length, 0);
  return total / arr.length;
}

interface BFrame extends VizFrame {
  cells: CellItem[];
  lo: number;
  hi: number;
  mid: number | null;
}

function buildBinFrames(arr: number[], key: number, label: string): BFrame[] {
  const frames: BFrame[] = [];
  const { steps, found } = binSearchSteps(arr, key);
  const mk = (lo: number, hi: number, mid: number | null, lastOk?: boolean): CellItem[] =>
    arr.map((v, i) => {
      if (lastOk && v === key) return { label: i + 1, v, state: "done" as const };
      const outside = i < lo || i > hi;
      const isMid = mid === i;
      return {
        label: i + 1,
        v,
        state: isMid ? "hi" : outside ? "dim" : "normal",
      };
    });

  frames.push({
    desc: `有序表长 ${arr.length}。折半查找要求顺序存储 + 有序。mid = ⌊(low+high)/2⌋（王道约定下取整）：比 mid 大砍左半，比 mid 小砍右半。要查 ${label}。`,
    phase: "初始",
    cells: mk(0, arr.length - 1, null),
    lo: 0,
    hi: arr.length - 1,
    mid: null,
  });
  steps.forEach((st, i) => {
    const m = arr[st.mid]!;
    frames.push({
      desc:
        st.cmp === "eq"
          ? `第 ${i + 1} 次比较：mid 位置（${st.mid + 1}）的 ${m} = ${key}，查找成功！共比较 ${steps.length} 次。`
          : `${key} ${st.cmp === "gt" ? ">" : "<"} ${m}（第 ${st.mid + 1} 位），砍掉 mid 及其${st.cmp === "gt" ? "左" : "右"}侧，区间缩为 [${st.lo + 1}, ${st.hi + 1}]。每比较一次区间约折半，log₂${arr.length} ≈ ${Math.ceil(Math.log2(arr.length + 1))} 次内必出结果。`,
      phase: st.cmp === "eq" ? "成功" : `第 ${i + 1} 次`,
      cells: mk(st.lo, st.hi, st.mid),
      lo: st.lo,
      hi: st.hi,
      mid: st.mid,
    });
  });
  if (!found) {
    const last = steps.at(-1)!;
    frames.push({
      desc: `low > high（区间已空），查找失败，共比较 ${steps.length} 次。失败位置对应判定树的一个外部结点（n+1 个叶子），失败 ASL 也能照树算。`,
      phase: "失败",
      cells: mk(last.lo, last.hi, null),
      lo: last.lo,
      hi: last.hi,
      mid: null,
    });
  }
  return frames;
}

export function BinSearchView() {
  const frames = useMemo(() => {
    const a = buildBinFrames(BS_ARR, 14, "14（成功）");
    const b = buildBinFrames(BS_ARR, 50, "50（失败）");
    const asl = aslSuccess(BS_ARR);
    return [
      ...a,
      {
        ...b[0]!,
        desc: `接着看失败情形：查 50（不在表中）。失败时走完判定树一条根到叶的路径。顺带算成功 ASL：判定树 4 层，第 1 层 1 个、第 2 层 2 个、第 3 层 4 个、第 4 层 6 个结点，ASL = (1×1+2×2+3×4+4×6)/13 = ${asl.toFixed(2)}（41/13）——比顺序查找的 (n+1)/2 ≈ 7 小得多。`,
        phase: "失败例",
      },
      ...b.slice(1),
    ];
  }, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const asl = aslSuccess(BS_ARR);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          下标 1..{BS_ARR.length}；蓝色 = mid，灰色 = 已砍掉的区间（low={fr.lo + 1}，high={fr.hi + 1}）
        </p>
        <Cells items={fr.cells} w="w-12" />
      </div>
      <div className={cn("rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground")}>
        本表 13 个元素的成功 ASL = {asl.toFixed(2)}（41/13）；折半查找判定树就是一棵 BST/平衡树，n 个元素树高 ⌈log₂(n+1)⌉。
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
