// 图解 · 链表应用：两个递增链表的归并（多项式相加的骨架）+ 头插法就地逆置。
// 归并时相等取前一个表 → 保序（稳定），用两个 2 的角标当场验证。
import { useMemo, useState } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";
import { cn } from "@/lib/utils";

/* ---------- 归并：相等取 A，保证稳定 ---------- */

export interface MergeItem {
  v: number;
  o: string; // 来源：A1/A2/B1/B2，标角标用
}

const A: MergeItem[] = [
  { v: 2, o: "A1" },
  { v: 8, o: "A2" },
  { v: 25, o: "A3" },
];
const B: MergeItem[] = [
  { v: 2, o: "B1" },
  { v: 5, o: "B2" },
  { v: 19, o: "B3" },
];

/** 归并两个递增序列（相等先取 a）；isDup 时给角标 */
export function mergeSorted(a: MergeItem[], b: MergeItem[]): MergeItem[] {
  const out: MergeItem[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]!.v <= b[j]!.v) out.push(a[i++]!);
    else out.push(b[j++]!);
  }
  while (i < a.length) out.push(a[i++]!);
  while (j < b.length) out.push(b[j++]!);
  return out;
}

interface MFrame extends VizFrame {
  a: CellItem[];
  b: CellItem[];
  out: CellItem[];
}

function buildMergeFrames(): MFrame[] {
  const frames: MFrame[] = [];
  const out: MergeItem[] = [];
  const dupCount = new Map<number, number>();
  for (const x of [...A, ...B]) dupCount.set(x.v, (dupCount.get(x.v) ?? 0) + 1);
  const tag = (x: MergeItem): string | undefined =>
    (dupCount.get(x.v) ?? 0) > 1 ? x.o : undefined;
  const rowOf = (arr: MergeItem[], cur: number): CellItem[] =>
    arr.map((x, k) => ({ label: x.o[0], tag: tag(x)?.slice(1), v: x.v, state: k === cur ? "hi" : k < cur ? "dim" : "normal" }));
  const outRow = (): CellItem[] =>
    out.map((x) => ({ label: x.o[0], tag: tag(x)?.slice(1), v: x.v, state: "done" }));

  let i = 0;
  let j = 0;
  frames.push({
    desc: "两条递增链表 A、B（多项式相加就是「指数递增的两个链表」这样归并，系数相加的项合成一个结点）。双指针 i、j 各指着两条表当前的表头，谁小谁被摘下来接到结果链 C 尾部（尾插保序）。",
    phase: "初始",
    a: rowOf(A, 0),
    b: rowOf(B, 0),
    out: [],
  });
  while (i < A.length && j < B.length) {
    frames.push({
      desc:
        A[i]!.v <= B[j]!.v
          ? `比较两表当前头：A 的 ${A[i]!.v} ≤ B 的 ${B[j]!.v}，摘 A 结点接到 C 尾（i 后移）。相等时约定取 A——这正是归并「稳定」的关键。`
          : `比较两表当前头：B 的 ${B[j]!.v} < A 的 ${A[i]!.v}，摘 B 结点接到 C 尾（j 后移）。`,
      phase: "比较",
      a: rowOf(A, i),
      b: rowOf(B, j),
      out: outRow(),
    });
    if (A[i]!.v <= B[j]!.v) out.push(A[i++]!);
    else out.push(B[j++]!);
  }
  while (i < A.length) {
    out.push(A[i++]!);
    frames.push({ desc: "B 已摘完，把 A 剩余结点整段接到 C 尾。", phase: "扫尾", a: rowOf(A, i), b: rowOf(B, j), out: outRow() });
  }
  while (j < B.length) {
    out.push(B[j++]!);
    frames.push({ desc: "A 已摘完，把 B 剩余结点整段接到 C 尾。", phase: "扫尾", a: rowOf(A, i), b: rowOf(B, j), out: outRow() });
  }
  const tags = out.filter((x) => tag(x)).map((x) => x.o);
  frames.push({
    desc: `归并完成：${out.map((x) => x.v).join("、")}。注意两个 2 的角标：A₁ 仍在 B₁ 前面——相等时先取前面的表，相对顺序不乱，所以链表归并（以及数组归并排序）是稳定的。时间 O(m+n)，每个结点只被摘一次。`,
    phase: "完成",
    a: rowOf(A, A.length),
    b: rowOf(B, B.length),
    out: outRow(),
  });
  void tags;
  return frames;
}

/* ---------- 逆置：头插法 ---------- */

const REV = ["a", "b", "c", "d"];

interface RFrame extends VizFrame {
  rest: string[];
  fresh: string[];
  hi?: string;
}

function buildReverseFrames(): RFrame[] {
  const frames: RFrame[] = [];
  let rest = [...REV];
  const fresh: string[] = [];
  frames.push({
    desc: "就地逆置单链表 a→b→c→d：不开新表，用「头插法」把结点一个个摘下来插到链表头。p 指向待摘结点，L 是新表头。",
    phase: "初始",
    rest: [...rest],
    fresh: [],
  });
  while (rest.length > 0) {
    const x = rest.shift()!;
    fresh.unshift(x);
    frames.push({
      desc: `摘下结点 ${x}，插到新表头部：先 ${x}->next = L，再 L = ${x}（两步不能反，反了新表就丢了）。头插天然倒序——这就是「正建反、反建正」。`,
      phase: "头插",
      rest: [...rest],
      fresh: [...fresh],
      hi: x,
    });
  }
  frames.push({
    desc: `逆置完成：${fresh.join("→")}。时间 O(n)、空间 O(1)。常考变体：每隔 k 个逆置一段、逆置部分区间（先找前驱再对区间头插）。数组逆置则用首尾双指针交换，更简单。`,
    phase: "完成",
    rest: [],
    fresh: [...fresh],
  });
  return frames;
}

/* ---------- 组件 ---------- */

type Mode = "归并" | "逆置";

export function PolyMergeView() {
  const [mode, setMode] = useState<Mode>("归并");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["归并", "逆置"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "归并" ? "有序链表归并" : "头插法逆置"}
          </button>
        ))}
      </div>
      {mode === "归并" ? <MergeDemo /> : <ReverseDemo />}
    </div>
  );
}

function MergeDemo() {
  const frames = useMemo(buildMergeFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">链表 A（i）</p>
          <Cells items={fr.a} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">链表 B（j）</p>
          <Cells items={fr.b} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">结果链 C（尾插，绿色已接好）</p>
          <Cells items={fr.out} />
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}

function ReverseDemo() {
  const frames = useMemo(buildReverseFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const chip = (s: string) => ({
    v: s,
    state: (s === fr.hi ? "hi" : "normal") as CellItem["state"],
  });
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">原表剩余（p 所指将摘下）</p>
          <Cells items={fr.rest.map(chip)} w="w-12" />
          {fr.rest.length === 0 && <p className="text-xs text-muted-foreground">（已摘空）</p>}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">新表 L（头插，头在上）</p>
          <Cells items={fr.fresh.map(chip)} w="w-12" />
          {fr.fresh.length === 0 && <p className="text-xs text-muted-foreground">（空）</p>}
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
