// 图解 · 快速排序：王道挖坑法 partition，pivot 每趟归位，递归左右区间。
// 数据刻意用相邻的两个 49（标 49₁/49₂）：第一趟基准归位即跨越相等元素，直观展示快排不稳定。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export const QS_ARR = [49, 49, 38, 97, 76, 13, 27, 65];

/** 带身份的元素：o = 初始位置（1-based），重复值用它做角标 */
interface Item {
  v: number;
  o: number;
}

interface QFrame extends VizFrame {
  arr: number[];
  /** 与 arr 对齐的原始下标（仅重复值非空，用作角标） */
  tags: (string | null)[];
  /** 当前处理区间（1-based 闭区间） */
  lo?: number;
  hi?: number;
  pivotVal?: number;
  pivotTag?: string | null;
  hole?: number; // 1-based 坑位
  i?: number;
  j?: number;
  settled: number[]; // 1-based 已就位下标
}

/** 重复值的原始下标才需要角标 */
function tagOf(items: Item[], k: number): string | null {
  const v = items[k]!.v;
  return items.filter((x) => x.v === v).length > 1 ? String(items[k]!.o) : null;
}

const fmtTag = (o: number): string => (o === 1 ? "₁" : o === 2 ? "₂" : String(o));

export function buildQuickSortFrames(input: number[]): QFrame[] {
  const items: Item[] = input.map((v, k) => ({ v, o: k + 1 }));
  const isDup = (v: number): boolean => input.filter((x) => x === v).length > 1;
  const fmt = (it: Item): string => (isDup(it.v) ? `${it.v}${fmtTag(it.o)}` : String(it.v));
  const frames: QFrame[] = [];
  const settled: number[] = [];
  const snap = (desc: string, phase: string, extra?: Partial<QFrame>) => {
    frames.push({
      desc,
      phase,
      arr: items.map((x) => x.v),
      tags: items.map((_, k) => tagOf(items, k)),
      settled: [...settled],
      ...extra,
    });
  };

  const dupVals = [...new Set(input)].filter((v) => input.filter((x) => x === v).length > 1);
  snap(
    `待排序列 ${items.map((x) => fmt(x)).join("、")}（1-based）。两个 49 用角标 ₁、₂ 标出原始身份，盯住它们的相对位置。快排思路：每趟选一个基准 pivot，把表分成「≤pivot │ pivot │ ≥pivot」，pivot 就位不再动，再对两段递归。这里用教材的「挖坑法」，基准取区间第一个元素。`,
    "开始"
  );

  const go = (lo0: number, hi0: number): void => {
    if (lo0 > hi0) return;
    if (lo0 === hi0) {
      settled.push(lo0);
      snap(`区间 [${lo0 + 1}] 只有一个元素，天然就位。`, "单元素", { lo: lo0 + 1, hi: hi0 + 1 });
      return;
    }
    snap(`进入子区间 [${lo0 + 1}..${hi0 + 1}]。`, "新区间", { lo: lo0 + 1, hi: hi0 + 1 });
    const p = items[lo0]!;
    // 挖出基准前先记下它的角标（填坑会覆盖 items[lo0]）
    const pTag = tagOf(items, lo0);
    snap(
      `取基准 pivot = ${fmt(p)}：把它「挖出来」，位置 ${lo0 + 1} 变成坑。i、j 双指针从区间两端向中间扫描。`,
      "选基准",
      { lo: lo0 + 1, hi: hi0 + 1, pivotVal: p.v, pivotTag: pTag, hole: lo0 + 1, i: lo0 + 1, j: hi0 + 1 }
    );
    let lo = lo0;
    let hi = hi0;
    while (lo < hi) {
      while (lo < hi && items[hi]!.v >= p.v) {
        const eq = items[hi]!.v === p.v && pTag != null;
        snap(
          `j 指向 ${fmt(items[hi]!)}：≥ pivot，不动它${eq ? "（相等也不动，盯住它的位置）" : ""}，j 左移。`,
          "j 左扫",
          { lo: lo0 + 1, hi: hi0 + 1, pivotVal: p.v, pivotTag: pTag, hole: hi + 1, i: lo + 1, j: hi + 1 }
        );
        hi--;
      }
      if (lo < hi) {
        const it = items[hi]!;
        items[lo] = it;
        snap(
          `j 指向 ${fmt(it)}：< pivot，把它填进坑 ${lo + 1}，坑移到 ${hi + 1}，i 右移一位。`,
          "填坑",
          { lo: lo0 + 1, hi: hi0 + 1, pivotVal: p.v, pivotTag: pTag, hole: hi + 1, i: lo + 2, j: hi + 1 }
        );
        lo++;
      }
      while (lo < hi && items[lo]!.v <= p.v) {
        const eq = items[lo]!.v === p.v && pTag != null;
        snap(
          `i 指向 ${fmt(items[lo]!)}：≤ pivot，不动它${eq ? "（与基准相等，被跳过、留在原地）" : ""}，i 右移。`,
          "i 右扫",
          { lo: lo0 + 1, hi: hi0 + 1, pivotVal: p.v, pivotTag: pTag, hole: lo + 1, i: lo + 1, j: hi + 1 }
        );
        lo++;
      }
      if (lo < hi) {
        const it = items[lo]!;
        items[hi] = it;
        snap(
          `i 指向 ${fmt(it)}：> pivot，把它填进坑 ${hi + 1}，坑移到 ${lo + 1}，j 左移一位。`,
          "填坑",
          { lo: lo0 + 1, hi: hi0 + 1, pivotVal: p.v, pivotTag: pTag, hole: lo + 1, i: lo + 1, j: hi }
        );
        hi--;
      }
    }
    items[lo] = p;
    settled.push(lo);
    // 不稳定判定：pivot 左边出现了「初始位置在 pivot 之后」的相等元素（如 49₂ 排到了 49₁ 前面）
    const crossed = items.some((x, k) => x.v === p.v && k !== lo && k < lo && x.o > p.o);
    snap(
      `i、j 相遇于 ${lo + 1}，pivot 入坑：${fmt(p)} 归位在第 ${lo + 1} 个位置${crossed ? `——注意它落进了相等元素的右边：基准从区间头一路跨越中间元素归位，相等元素的相对顺序被打乱，这就是快排「不稳定」的来源` : "（左边全 ≤ 它，右边全 ≥ 它）"}。递归处理左右两段。`,
      "基准归位",
      { lo: lo0 + 1, hi: hi0 + 1, pivotVal: p.v, pivotTag: pTag, settled: [...settled] }
    );
    go(lo0, lo - 1);
    go(lo + 1, hi0);
  };
  go(0, items.length - 1);
  const finalItems = [...items];
  const stableOk = (() => {
    for (const v of dupVals) {
      const os = finalItems.filter((x) => x.v === v).map((x) => x.o);
      for (let k = 1; k < os.length; k++) if (os[k]! < os[k - 1]!) return false;
    }
    return true;
  })();
  snap(
    `完成：${finalItems.map((x) => fmt(x)).join("、")}。${stableOk ? "巧合的是这组数据里相等元素的相对顺序没有再被打乱" : "看结果：排序正确，但 49₂ 排到了 49₁ 前面（初始顺序是 49₁、49₂）——相等元素的相对顺序被改变，快排是不稳定排序"}。最好/平均 O(nlogn)，最坏 O(n²)（已有序 + 取首元素为基准）；空间 O(logn)～O(n)（递归栈）。口诀：一堆(堆排)嘻嘻(希尔)快(快排)选(选择)些(直接插入)不稳。`,
    "完成"
  );
  return frames;
}

export function quickSorted(input: number[]): number[] {
  return buildQuickSortFrames(input).at(-1)!.arr;
}

export function QuickSortView() {
  const frames = useMemo(() => buildQuickSortFrames(QS_ARR), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const max = Math.max(...QS_ARR);

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${QS_ARR.length * 62} 230`} className="w-full">
        {fr.arr.map((v, k) => {
          const idx = k + 1;
          const h = 28 + (v / max) * 120;
          const x = k * 62 + 10;
          const isSettled = fr.settled.includes(k);
          const isHole = fr.hole === idx;
          const inRange = fr.lo != null && fr.hi != null ? idx >= fr.lo && idx <= fr.hi : true;
          const isPivot = fr.pivotVal === v && fr.pivotTag === fr.tags[k] && fr.pivotTag != null;
          // 已就位绿；坑透明；基准琥珀；趟内区间蓝；无区间的帧（开始/完成）保持底色
          const fill = isSettled
            ? C.done
            : isHole
              ? "transparent"
              : isPivot && inRange
                ? C.warn
                : fr.pivotVal != null && inRange
                  ? C.active
                  : C.node;
          return (
            <g key={k} opacity={inRange ? 1 : 0.35}>
              <rect
                x={x}
                y={170 - h}
                width={44}
                height={h}
                rx={5}
                fill={fill}
                stroke={isSettled || isPivot ? "transparent" : "#94a3b8"}
                strokeDasharray={isHole ? "5 4" : undefined}
              />
              <text x={x + 22} y={170 - h - 7} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.nodeText}>
                {isHole ? "坑" : v}
              </text>
              {/* 重复元素的原始下标角标：追踪身份，演示稳定性 */}
              {!isHole && fr.tags[k] && (
                <text x={x + 38} y={170 - h - 14} fontSize={9} fontWeight={700} fill={isSettled ? "#065f46" : "#0284c7"}>
                  {fr.tags[k] === "1" ? "₁" : fr.tags[k] === "2" ? "₂" : fr.tags[k]}
                </text>
              )}
              <text x={x + 22} y={186} textAnchor="middle" fontSize={11} fill={C.text}>
                {idx}
              </text>
              {fr.i === idx && (
                <text x={x + 22} y={204} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.done}>
                  i
                </text>
              )}
              {fr.j === idx && (
                <text x={x + 22} y={204} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.bad}>
                  j
                </text>
              )}
              {fr.lo === idx && <text x={x + 10} y={222} fontSize={10} fill={C.text}>lo</text>}
              {fr.hi === idx && <text x={x + 30} y={222} fontSize={10} fill={C.text}>hi</text>}
            </g>
          );
        })}
        {fr.pivotVal != null && (
          <text x={8} y={16} fontSize={13} fontWeight={700} fill={C.warn}>
            pivot = {fr.pivotVal}
            {fr.pivotTag === "1" ? "₁" : fr.pivotTag === "2" ? "₂" : ""}
          </text>
        )}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
