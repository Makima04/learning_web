// 图解 · 基数排序（LSD 最低位优先）：不比较关键字，按位分配-收集。
// 两位数先按个位入桶再串起，再按十位——两轮即有序。稳定（桶内保序进、保序出）。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";
import { cn } from "@/lib/utils";

export const RD_ARR = [53, 27, 36, 15, 73, 28, 49];

interface RFrame extends VizFrame {
  arr: number[];
  buckets: number[][];
  hiVal: number | null;
  /** 收集后的展示 */
  collected: boolean;
}

/** 基数排序一轮：按第 digit 位（0=个位）分配到 0..9 桶再顺序收集 */
export function radixPass(arr: number[], digit: number): { buckets: number[][]; collectedArr: number[] } {
  const buckets: number[][] = Array.from({ length: 10 }, () => []);
  for (const x of arr) {
    const d = Math.floor(x / 10 ** digit) % 10;
    buckets[d]!.push(x);
  }
  const collectedArr = buckets.flat();
  return { buckets, collectedArr };
}

/** 全程（多位数逐位） */
export function radixSort(arr: number[]): number[] {
  let cur = [...arr];
  const maxD = Math.max(...arr).toString().length;
  for (let d = 0; d < maxD; d++) cur = radixPass(cur, d).collectedArr;
  return cur;
}

function buildRadixFrames(): RFrame[] {
  const frames: RFrame[] = [];
  const empty = Array.from({ length: 10 }, () => []);
  let arr = [...RD_ARR];
  const snap = (desc: string, phase: string, buckets: number[][], hiVal: number | null = null, collected = false) =>
    frames.push({ desc, phase, buckets: buckets.map((b) => [...b]), hiVal, collected, arr: [...arr] });

  snap(
    `待排 ${arr.join("、")}（都是两位数）。基数排序不做任何「关键字比较」，按位来：第 1 轮按个位数字把每个数挂进 0..9 号桶，然后从 0 号桶到 9 号桶依序串回；第 2 轮按十位再来一遍。d 位 d 轮，每轮 O(n+10)。`,
    "初始",
    empty
  );
  const maxD = Math.max(...RD_ARR).toString().length;
  for (let d = 0; d < maxD; d++) {
    const digitName = d === 0 ? "个位" : d === 1 ? "十位" : `第 ${d + 1} 位`;
    const buckets: number[][] = Array.from({ length: 10 }, () => []);
    for (const x of arr) {
      const dv = Math.floor(x / 10 ** d) % 10;
      buckets[dv]!.push(x);
      snap(
        `${x} 的${digitName}是 ${dv} → 进 ${dv} 号桶（尾插，先进在前——桶内保持进来的顺序，这是基数排序稳定的原因）。`,
        `${digitName}分配`,
        buckets,
        x
      );
    }
    const out = buckets.flat();
    snap(
      `收集：从 0 号桶到 9 号桶、每桶从队头到队尾依次倒出 → ${out.join("、")}。${d === 0 ? "此时按个位看已有序；十位还没管，下一轮处理。" : "十位也排完，整体有序。"}`,
      `${digitName}收集`,
      buckets.map(() => []),
      null,
      true
    );
    arr = out;
    snap(`当前序列：${arr.join("、")}。`, "轮完成", empty);
  }
  snap(
    `完成：${arr.join("、")} ✓。基数排序时间 O(d×(n+r))（r=基数 10），空间 O(n+r)，稳定。适合关键字位数少、取值范围整的场合（整数、定长字符串）。它不是「基于比较」的排序，因此不受 O(nlogn) 下界约束——这是选择题爱考的理论点。`,
    "完成",
    empty
  );
  return frames;
}

export function RadixSortView() {
  const frames = useMemo(buildRadixFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  const cells: CellItem[] = fr.arr.map((v) => ({
    v,
    state: fr.collected ? "done" : v === fr.hiVal ? "hi" : "normal",
  }));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">当前序列</p>
        <Cells items={cells} w="w-12" />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">0..9 号桶（黄 = 刚进入的数）</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {fr.buckets.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-4 text-center font-mono text-xs font-bold text-muted-foreground">{i}</span>
              {b.length === 0 ? (
                <span className="text-xs text-muted-foreground/50">·</span>
              ) : (
                b.map((x, k) => (
                  <span
                    key={k}
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-xs font-bold",
                      fr.hiVal === x && k === b.length - 1
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-border bg-sky-500/15"
                    )}
                  >
                    {x}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
