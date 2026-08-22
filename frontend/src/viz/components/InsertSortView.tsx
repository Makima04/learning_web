// 图解 · 插入类排序：直接插入（稳定）vs 希尔（不稳定）。
// 同一组数据 [49₂,49₁,38,27,30,97,76,65]：直接插入保住 49 的相对顺序；希尔在 gap=4 一趟里
// 30 越过 49₂ 挪到表头，49₂ 被顶到 49₁ 后面——跨组跳跃打乱相等元素，稳定性对比当场可见。
import { useMemo, useState } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, sub, type CellItem } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface SItem {
  v: number;
  o: number; // 初始 1-based 位置（重复值角标）
}
export const INS_ARR = [49, 49, 38, 27, 30, 97, 76, 65]; // 49₂ 在第 1 位，49₁ 在第 2 位
const mkItems = (arr: number[]): SItem[] => arr.map((v, k) => ({ v, o: k + 1 }));
const isDup = (arr: number[], v: number) => arr.filter((x) => x === v).length > 1;
const name = (arr: number[], it: SItem) => (isDup(arr, it.v) ? `${it.v}${sub(it.o)}` : `${it.v}`);

interface IFrame extends VizFrame {
  items: SItem[];
  /** 已有序前缀长度（插入类的不变式） */
  sortedLen: number;
  hi: number[];
  cmp?: [number, number];
}

const toCells = (fr: IFrame, dupBase: number[]): CellItem[] =>
  fr.items.map((it, k) => ({
    label: k + 1,
    tag: isDup(dupBase, it.v) ? String(it.o) : undefined,
    v: it.v,
    state:
      fr.cmp && (fr.cmp[0] === k || fr.cmp[1] === k)
        ? "warn"
        : fr.hi.includes(k)
          ? "hi"
          : k < fr.sortedLen
            ? "done"
            : "normal",
  }));

/** 直接插入排序（帧记录版）。相等不前移 → 稳定 */
export function insertSortFrames(input: number[]): IFrame[] {
  const items = mkItems(input);
  const frames: IFrame[] = [];
  const snap = (desc: string, phase: string, sortedLen: number, hi: number[] = [], cmp?: [number, number]) =>
    frames.push({ desc, phase, sortedLen, hi, cmp, items: items.map((x) => ({ ...x })) });

  snap(
    `待排 ${items.map((x) => name(input, x)).join("、")}。直接插入：把第 1 个元素视为有序表，每次把下一个元素「扑克牌式」插进去。不变式：前 sortedLen 个永远有序。`,
    "初始",
    1
  );
  for (let k = 1; k < items.length; k++) {
    const x = { ...items[k]! };
    snap(`取第 ${k + 1} 个元素 ${name(input, x)}，向前找插入位置（边比较边后移）。`, `第 ${k} 趟`, k, [k], [k - 1, k]);
    let i = k - 1;
    while (i >= 0 && items[i]!.v > x.v) {
      items[i + 1] = items[i]!;
      snap(
        `${items[i]!.v} > ${name(input, x)}，${name(input, items[i]!)} 后移一格。`,
        `第 ${k} 趟`,
        k,
        [i, i + 1],
        [i, i + 1]
      );
      i--;
    }
    items[i + 1] = x;
    snap(
      `${i >= 0 ? `${name(input, items[i]!)} ≤ ${name(input, x)}，插在它后面` : "前面全比它大，插到表头"}。前 ${k + 1} 个有序 ✓。相等时（比较是 >）不后移——相等元素不会被换过去，这就是直接插入「稳定」的原因。`,
      `第 ${k} 趟完成`,
      k + 1
    );
  }
  const dups = items.filter((x) => isDup(input, x.v)).map((x) => String(x.o));
  snap(
    `完成：${items.map((x) => name(input, x)).join("、")}。角标顺序 ${dups.join("、")}（初始也是这个先后）→ 稳定 ✓。最好 O(n)（已有序，每趟比一次）、最坏/平均 O(n²)，适合基本有序或规模小。折半插入只是把「找位置」换成折半（比较 O(nlogn)），移动仍是 O(n²)。`,
    "完成",
    items.length
  );
  return frames;
}

/** 希尔排序（帧记录版）：按 gap 分组做插入，gap 递减到 1 */
export function shellSortFrames(input: number[], gaps: number[]): IFrame[] {
  const items = mkItems(input);
  const frames: IFrame[] = [];
  const snap = (desc: string, phase: string, hi: number[] = [], cmp?: [number, number]) =>
    frames.push({ desc, phase, sortedLen: 0, hi, cmp, items: items.map((x) => ({ ...x })) });

  snap(
    `同一组数据交给希尔：按增量 gap=${gaps.join("→")} 分组，组内做插入排序；gap 每趟减半，最后一趟 gap=1 就是直接插入（此时表已基本有序，移动很少）。`,
    "初始"
  );
  for (const gap of gaps) {
    snap(`gap = ${gap}：下标相差 ${gap} 的元素为一组（共 ${gap} 组），每组内做插入排序。组内是稳定的，但一次移动可以跨过别的小元素——跨「组」跳跃正是不稳定来源。`, `gap=${gap}`);
    for (let start = 0; start < gap; start++) {
      for (let k = start + gap; k < items.length; k += gap) {
        const x = { ...items[k]! };
        let i = k - gap;
        while (i >= start && items[i]!.v > x.v) {
          items[i + gap] = items[i]!;
          const moved = items[i]!;
          // 跳跃检测：moved 从 i 移到 i+gap，若区间 (i, i+gap) 里躺着与它相等的元素，相对顺序就被打乱
          const crossed = isDup(input, moved.v)
            ? items.slice(i + 1, i + gap).some((y) => y.v === moved.v)
            : false;
          const crossedNote = crossed
            ? `⚠ 看角标：${name(input, moved)} 从第 ${i + 1} 位被顶到第 ${i + gap + 1} 位，跨过了另一个 49——它们分属不同组，这一跳之后相对顺序就反了，希尔因此不稳定！`
            : "";
          snap(
            `组内比较：${name(input, moved)} > ${name(input, x)}，${name(input, moved)} 后移 ${gap} 格（组内其它元素不动）。${crossedNote}`,
            `gap=${gap}`,
            [i, i + gap],
            [i, i + gap]
          );
          i -= gap;
        }
        items[i + gap] = x;
      }
    }
    snap(`gap=${gap} 趟完成：${items.map((x) => name(input, x)).join("、")}。各组内有序，整体未必有序（「基本有序」，给最后一趟 gap=1 减负）。`, `gap=${gap} 完成`);
  }
  const dups = items.filter((x) => isDup(input, x.v)).map((x) => String(x.o));
  const stable = dups.every((o, i) => i === 0 || Number(o) > Number(dups[i - 1]));
  snap(
    `完成：${items.map((x) => name(input, x)).join("、")}。角标顺序 ${dups.join("、")}——初始是 1、2（49₂ 在前），现在 ${dups.join("、")}：${stable ? "没换" : "反了！49₁ 排到了 49₂ 前面"}。gap 间隔的远距离跳跃打乱相等元素相对顺序 ⇒ 希尔不稳定。时间约 O(n^1.3)（依赖增量序列），空间 O(1)，是第一个突破 O(n²) 的排序。`,
    "完成"
  );
  return frames;
}

type Mode = "直接插入" | "希尔";

export function InsertSortView() {
  const [mode, setMode] = useState<Mode>("直接插入");
  const frames = useMemo(
    () => (mode === "直接插入" ? insertSortFrames(INS_ARR) : shellSortFrames(INS_ARR, [4, 2, 1])),
    [mode]
  );
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["直接插入", "希尔"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">黄 = 比较对；绿 = 有序前缀；角标 = 重复值的初始位置</span>
      </div>
      <Cells items={toCells(fr, INS_ARR)} w="w-12" />
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
