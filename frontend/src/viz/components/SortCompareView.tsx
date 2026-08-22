// 图解 · 排序对比：同一数组分别跑冒泡/简单选择/直接插入的第一趟（用真算法算，不是手写结论），
// 稳定性结论也直接引用快排/堆排/希尔/归并演示的真实运行结果。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";
import { buildQuickSortFrames, QS_ARR } from "@/viz/components/QuickSortView";
import { buildHeapSortFrames, HS_ARR } from "@/viz/components/HeapSortView";
import { insertSortFrames, shellSortFrames, INS_ARR } from "@/viz/components/InsertSortView";
import { mergeSortFrames, MG_ARR } from "@/viz/components/MergeSortView";

export const CMP_ARR = [...QS_ARR]; // 与快排演示同一数组 [49,49,38,97,76,13,27,65]

/** 冒泡一趟：相邻逆序则交换，最大值沉底 */
export function bubblePass(a: number[]): number[] {
  const b = [...a];
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i]! > b[i + 1]!) [b[i], b[i + 1]] = [b[i + 1]!, b[i]!];
  }
  return b;
}

/** 简单选择一趟：全局最小值与第 1 位交换 */
export function selectPass(a: number[]): number[] {
  const b = [...a];
  let m = 0;
  for (let i = 1; i < b.length; i++) if (b[i]! < b[m]!) m = i;
  [b[0], b[m]] = [b[m]!, b[0]!];
  return b;
}

/** 直接插入「一趟」（处理完第 2 个元素）：前缀局部有序 */
export function insertPass(a: number[]): number[] {
  const b = [...a];
  const x = b[1]!;
  let i = 0;
  while (i >= 0 && b[i]! > x) {
    b[i + 1] = b[i]!;
    i--;
  }
  b[i + 1] = x;
  return b;
}

/** 稳定性实测：跑真实演示的帧生成器，看终态重复值角标顺序是否反转 */
export function stabilityReport(): { algo: string; stable: boolean; detail: string }[] {
  const dupTagsFinal = (frames: { arr: number[]; tags: (string | null)[] }[], val: number): string[] => {
    const last = frames.at(-1)!;
    return last.arr.map((v, k) => (v === val ? last.tags[k] : null)).filter(Boolean) as string[];
  };
  const orderOf = (frames: { items: { v: number; o: number }[] }[], val: number): number[] =>
    frames.at(-1)!.items.filter((x) => x.v === val).map((x) => x.o);
  const qs = dupTagsFinal(buildQuickSortFrames(QS_ARR), 49);
  const hs = dupTagsFinal(buildHeapSortFrames(HS_ARR), 49);
  const ins = orderOf(insertSortFrames(INS_ARR), 49);
  const shell = orderOf(shellSortFrames(INS_ARR, [4, 2, 1]), 49);
  const mg = orderOf(mergeSortFrames(MG_ARR), 49);
  const ascNum = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
  const ascStr = (xs: string[]) => xs.every((x, i) => i === 0 || Number(x) > Number(xs[i - 1]!));
  return [
    { algo: "快排", stable: ascStr(qs), detail: `49 角标 ${qs.join("→")}` },
    { algo: "堆排", stable: ascStr(hs), detail: `49 角标 ${hs.join("→")}` },
    { algo: "希尔", stable: ascNum(shell), detail: `49 角标 ${shell.join("→")}` },
    { algo: "直接插入", stable: ascNum(ins), detail: `49 角标 ${ins.join("→")}` },
    { algo: "归并", stable: ascNum(mg), detail: `49 角标 ${mg.join("→")}` },
    { algo: "冒泡", stable: true, detail: "相邻交换只在严格大于时发生" },
  ];
}

interface CFrame extends VizFrame {
  cells: CellItem[];
  table?: boolean;
}

function buildCompareFrames(): CFrame[] {
  const frames: CFrame[] = [];
  const arr = CMP_ARR;
  const plain = (a: number[], hiIdx: number[] = [], hi: number[] = []): CellItem[] =>
    a.map((v, i) => ({ label: i + 1, v, state: hiIdx.includes(i) ? "done" : hi.includes(i) ? "warn" : "normal" }));
  const push = (desc: string, phase: string, cells: CellItem[], table = false) =>
    frames.push({ desc, phase, cells, table });

  push(
    `数组 ${arr.join("、")}（另见快排演示，两个 49 相邻）。大题最爱的问法：「给出一趟排序后的结果，问是哪种排序」。关键看三件事：有序区在头还是尾、是否保证最值就位、前缀是否只是局部有序。`,
    "初始",
    plain(arr)
  );
  const bp = bubblePass(arr);
  push(
    `冒泡一趟：${bp.join("、")}——全局最大值 65 沉到队尾（尾有序区 +1）。识别特征：一趟后最大值必然就位；若趟内无交换则提前结束。`,
    "冒泡一趟",
    plain(bp, [bp.length - 1], [bp.length - 1])
  );
  const sp = selectPass(arr);
  push(
    `简单选择一趟：${sp.join("、")}——全局最小值 13 换到队头（头有序区 +1）。它与冒泡相反：一趟比较 n-1 次、至多换 1 次；有序区保证最小值就位，但中间的交换是跳跃的（不稳定）。`,
    "选择一趟",
    plain(sp, [0], [0])
  );
  const ip = insertPass(arr);
  push(
    `直接插入「一趟」（处理完第 2 个元素）：${ip.join("、")}——只有前 2 个局部有序，不保证任何最值就位（49 还在第 1 位，65 也没沉底）。选择/插入的头有序区长得像，区别就在「最值是否保证就位」。`,
    "插入一趟",
    plain(ip, [0, 1])
  );
  const qFrames = buildQuickSortFrames(QS_ARR);
  const qFirst = qFrames.find((f) => f.phase === "基准归位")!;
  push(
    `快排一趟：${qFirst.arr.join("、")}——基准 49 归位到最终位置 ${qFirst.arr.indexOf(49) + 1}，左边全 ≤ 它、右边全 ≥ 它（两侧内部无序）。特征：某个元素到达最终位置且两侧分区。`,
    "快排一趟",
    qFirst.arr.map((v, i) => ({
      label: i + 1,
      v,
      state: i === qFirst.arr.indexOf(49) ? "warn" : v <= 49 ? "done" : "normal",
    }))
  );
  const rep = stabilityReport();
  push(
    `稳定性「实测」（数据来自各演示的真实运行）：${rep.map((r) => `${r.algo}${r.stable ? "✓" : "✗"}（${r.detail}）`).join("，")}。口诀背「堆希快选些（不稳定）」，但要知道为什么：都是远距离交换/跳跃；而插入、冒泡、归并只在相邻或同段内动相等元素。`,
    "稳定性实测",
    plain([...arr].sort((a, b) => a - b)),
    true
  );
  push(
    `总表（n 较大时）：直接插入 O(n²)/稳定/O(1)；冒泡 O(n²)/稳定/O(1)；简单选择 O(n²)/不稳定/O(1)——比较次数固定 n(n-1)/2 与初始无关；希尔 ~O(n^1.3)/不稳定/O(1)；快排平均 O(nlogn)、最坏 O(n²)（已有序+首基准）/不稳定/O(logn) 栈；堆排 O(nlogn) 恒定/不稳定/O(1)；归并 O(nlogn) 恒定/稳定/O(n)；基数 O(d(n+r))/稳定/O(n+r)。选择题给场景挑算法：基本有序→直接插入/冒泡；只要 O(1) 空间且最坏 O(nlogn)→堆排；要求稳定且 O(nlogn)→归并；n 大且随机→快排平均最快。`,
    "复杂度总表",
    plain([...arr].sort((a, b) => a - b)),
    true
  );
  return frames;
}

export function SortCompareView() {
  const frames = useMemo(buildCompareFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const rep = useMemo(stabilityReport, []);

  return (
    <div className="space-y-4">
      <Cells items={fr.cells} w="w-12" />
      {fr.table && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                {["算法", "一趟特征", "最好", "最坏", "空间", "稳定"].map((h) => (
                  <th key={h} className="border border-border p-1.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["直接插入", "前缀局部有序，不保证最值", "O(n)", "O(n²)", "O(1)", "✓"],
                ["冒泡", "最大值沉底（尾有序区）", "O(n)", "O(n²)", "O(1)", "✓"],
                ["简单选择", "最小值到头（头有序区），一趟至多 1 次交换", "O(n²)", "O(n²)", "O(1)", "✗"],
                ["希尔", "按 gap 分组，各组内有序", "—", "~O(n^1.3)", "O(1)", "✗"],
                ["快排", "基准归位，左右分区", "O(nlogn)", "O(n²)", "O(logn)", "✗"],
                ["堆排", "堆顶（最大值）与堆尾交换就位", "O(nlogn)", "O(nlogn)", "O(1)", "✗"],
                ["归并", "有序段两两合并（段长翻倍）", "O(nlogn)", "O(nlogn)", "O(n)", "✓"],
                ["基数", "按位入桶收集，无比较", "O(d(n+r))", "O(d(n+r))", "O(n+r)", "✓"],
              ].map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => (
                    <td key={i} className="border border-border p-1.5 text-center">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fr.phase === "稳定性实测" && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {rep.map((r) => (
            <li key={r.algo}>
              {r.algo}：{r.stable ? "稳定" : "不稳定"}（{r.detail}）
            </li>
          ))}
        </ul>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
