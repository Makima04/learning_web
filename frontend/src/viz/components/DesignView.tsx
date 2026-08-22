// 图解 · 算法设计综合：以「判断回文链表」为例走完大题答法三件套——
// 思想（快慢指针找中点 + 就地逆置后半 + 双指针比对）→ 步骤动画 → 复杂度（时间 O(n)、空间 O(1)）。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";

export const PAL_VALS = [1, 2, 3, 2, 1];

/** 回文链表判定：快慢指针找中点 + 就地逆置后半 + 双指针比对（O(n) 时间、O(1) 空间） */
export function isPalindromeList(vals: number[]): boolean {
  let slow = 0;
  let fast = 0;
  while (fast + 1 < vals.length) {
    slow++;
    fast += 2;
  }
  const halfLen = Math.floor((vals.length + 1) / 2); // 前半长度（奇数含中点）
  const back = vals.slice(halfLen).reverse();
  const front = vals.slice(0, halfLen);
  return back.every((v, i) => v === front[i]);
}

interface DzFrame extends VizFrame {
  front: number[];
  back: number[];
  /** 比对进度 */
  cmp?: [number, number];
  slow?: number;
  fast?: number;
}

function buildDesignFrames(): DzFrame[] {
  const frames: DzFrame[] = [];
  const front: number[] = [];
  const back: number[] = [...PAL_VALS];
  const snap = (desc: string, phase: string, extra?: Partial<DzFrame>) =>
    frames.push({ desc, phase, front: [...front], back: [...back], ...extra });

  snap(
    `题目：判断单链表 ${PAL_VALS.join("→")} 是否回文（逆序后相同），要求时间 O(n)、空间 O(1) 且不破坏中间过程可恢复。大题套路：先说思想，再给步骤，最后复杂度——这里的思想是「找中点 + 逆置后半 + 双指针比对」三连。`,
    "初始"
  );
  // 快慢指针
  let slow = 0;
  let fast = 0;
  snap("第 ① 步 快慢指针找中点：slow 走 1 步、fast 走 2 步，fast 到尾时 slow 恰在中点（长度 5 → 第 3 个）。", "快慢指针", { slow, fast });
  while (fast + 1 < PAL_VALS.length) {
    slow += 1;
    fast += 2;
    snap(
      fast >= PAL_VALS.length - 1
        ? `slow 到第 ${slow + 1} 个（中点），fast 已到尾 —— 停。一次遍历定位中点，这正是「快慢指针」在链表中点/判环/找倒数第 k 个三类题里的通用手法。`
        : `slow 到第 ${slow + 1} 个，fast 到第 ${fast + 1} 个。`,
      "快慢指针",
      { slow, fast }
    );
  }
  // 逆置后半
  snap("第 ② 步 从中点后一个起，就地逆置后半段（头插法，见链表应用演示）：2→1 变成 1→2。前半 1→2→3 不动。", "逆置后半");
  const midIdx = Math.ceil(PAL_VALS.length / 2); // 前半长度 3（奇数长度含中点）
  while (back.length > PAL_VALS.length - midIdx) {
    const x = back.shift()!;
    front.push(x);
  }
  const backRev = [...back].reverse();
  snap(`后半逆置完成：前半 ${front.join("→")}，后半（新表头）${backRev.join("→")}。空间 O(1)：只动指针不开数组。`, "逆置完成");
  // 比对
  snap("第 ③ 步 双指针从两段表头出发逐个比对，值都相等且后段先走完 → 回文。", "比对");
  for (let k = 0; k < backRev.length; k++) {
    const a = front[k]!;
    const b = backRev[k]!;
    const eq = a === b;
    snap(`比较前半第 ${k + 1} 个 ${a} 与后半第 ${k + 1} 个 ${b}：${eq ? "相等 ✓" : "不等 ✗ —— 不是回文，立即可返回"}。`, eq ? "相等" : "不等", { cmp: [k, k] });
  }
  snap(
    `后半走完，全部相等 → 是回文 ✓。复杂度：三步各 O(n)，总时间 O(n)；只用常数个指针，空间 O(1)。若题目要求不破坏链表，把第 ② 步的逆置再做一遍还原即可（多一趟 O(n)）。这就是综合题的答法：思想 → 步骤 → 复杂度，逐步都对应演示里的某一帧。`,
    "完成"
  );
  return frames;
}

const cellRow = (arr: number[], hi: number[] = [], label: string): CellItem[] =>
  arr.map((v, i) => ({ label: `${label}${i + 1}`, v, state: hi.includes(i) ? "warn" : "normal" }));

export function DesignView() {
  const frames = useMemo(buildDesignFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const backShown =
    fr.phase === "逆置完成" || ["比对", "相等", "不等", "完成"].includes(fr.phase ?? "")
      ? [...fr.back].reverse()
      : fr.back;
  const hiFront = fr.cmp ? [fr.cmp[0]!] : [];
  const hiBack = fr.cmp ? [fr.cmp[1]!] : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            前半段 {fr.slow !== undefined && fr.fast !== undefined && fr.phase === "快慢指针" ? `（slow 指第 ${fr.slow + 1} 个，fast 指第 ${Math.min(fr.fast + 1, PAL_VALS.length)} 个）` : ""}
          </p>
          <Cells items={cellRow(fr.phase === "快慢指针" ? PAL_VALS : fr.front, hiFront, "F")} w="w-12" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">后半段（逆置后，头在上）</p>
          <Cells items={cellRow(backShown, hiBack, "B")} w="w-12" />
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
