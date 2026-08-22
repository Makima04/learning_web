// 图解 · 外部排序：磁盘上 K 路归并。8 个初始归并段、2 路归并要 3 趟；
// 增大 K（败者树支持多路）或减少段数（置换-选择生成更长初始段）都能减趟数。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

/** 8 个初始归并段（各自内部已有序） */
export const EXT_RUNS: number[][] = [
  [12, 20], [8, 15], [30, 49], [4, 9], [25, 36], [17, 42], [55, 80], [11, 60],
];

/** K 路归并的趟数结构：r 个段每趟并成 ⌈r/k⌉ 个，返回每趟段数序列 [r, ⌈r/k⌉, …, 1] */
export function mergeLevels(r: number, k: number): number[] {
  const levels = [r];
  while (levels.at(-1)! > 1) levels.push(Math.ceil(levels.at(-1)! / k));
  return levels;
}

interface EFrame extends VizFrame {
  /** 本帧的归并段集合（交替配色） */
  runs: number[][];
  k: number;
  merging: [number, number] | null;
}

function buildExtFrames(): EFrame[] {
  const frames: EFrame[] = [];
  let runs = EXT_RUNS.map((r) => [...r]);
  const snap = (desc: string, phase: string, merging: [number, number] | null = null) =>
    frames.push({ desc, phase, runs: runs.map((r) => [...r]), k: 2, merging });

  snap(
    `外排场景：数据量大到内存放不下，先分段读入——每段装满内存缓冲区后内部排序，写回磁盘，得到 ${runs.length} 个初始归并段（每段内部有序，段内两个数用同色显示）。之后不断「K 路归并」直到一段。取 K=2：每趟两两合并，段数减半。`,
    "初始"
  );
  let pass = 1;
  while (runs.length > 1) {
    snap(`第 ${pass} 趟（2 路归并）：相邻两段读入内存合并（每次比较两段各自的队头，小者输出；内存只需 2 个输入缓冲 + 1 个输出缓冲）。`, `第 ${pass} 趟`);
    const next: number[][] = [];
    for (let i = 0; i < runs.length; i += 2) {
      if (i + 1 >= runs.length) {
        next.push(runs[i]!);
        continue;
      }
      snap(`合并段 ${i + 1} 与段 ${i + 2}（队头比较、小的先出，归并本体见归并排序演示）→ 一段长 ${runs[i]!.length + runs[i + 1]!.length} 的有序段。`, "合并", [i, i + 1]);
      const merged: number[] = [];
      let a = 0;
      let b = 0;
      const A = runs[i]!;
      const B = runs[i + 1]!;
      while (a < A.length && b < B.length) merged.push(A[a]! <= B[b]! ? A[a++]! : B[b++]!);
      while (a < A.length) merged.push(A[a++]!);
      while (b < B.length) merged.push(B[b++]!);
      next.push(merged);
    }
    runs = next;
    pass++;
  }
  snap(
    `完成：一段长 ${runs[0]!.length} 的有序文件。趟数 S = ⌈log₂${EXT_RUNS.length}⌉ = 3，每趟所有块都要读写一次磁盘——外排代价主要在 I/O，优化全在「减趟数」：① 增大 K：K=4 时 ${mergeLevels(EXT_RUNS.length, 4).length - 1} 趟（多路归并用败者树，每次选最小只要 ⌈log₂K⌉ 次比较，缓冲区要多开 K 个）；② 增大初始段长（置换-选择排序，平均段长 2×内存容量）让段数 r 翻倍减少。二者常配合使用。`,
    "完成"
  );
  return frames;
}

const RUN_COLORS = ["bg-sky-500/25", "bg-emerald-500/25", "bg-amber-500/25", "bg-violet-500/25", "bg-rose-500/25"];

export function ExternalSortView() {
  const frames = useMemo(buildExtFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">磁盘上的归并段（同色 = 同一段；黄框 = 正在合并的两段）</p>
      <div className="flex flex-wrap gap-2">
        {fr.runs.map((run, i) => {
          const merging = fr.merging && (fr.merging[0] === i || fr.merging[1] === i);
          return (
            <div
              key={i}
              className={cn(
                "flex gap-0.5 rounded-lg border p-1",
                merging ? "border-amber-500 bg-amber-500/10" : "border-border"
              )}
            >
              {run.map((x, j) => (
                <span
                  key={j}
                  className={cn("w-8 rounded py-0.5 text-center font-mono text-xs font-bold", RUN_COLORS[i % RUN_COLORS.length]!)}
                >
                  {x}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
        趟数公式：S = ⌈log<sub>K</sub>r⌉（r = 初始段数，K = 归并路数）。r=8、K=2 → 3 趟；K=4 → 2 趟；r=4、K=4 → 1 趟。
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
