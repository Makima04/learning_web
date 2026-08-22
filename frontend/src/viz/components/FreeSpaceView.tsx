// 图解 · 空闲空间管理：位示图（块号↔行列互转公式）与成组链接（空闲栈分配到组尾自动读下一组）。
// bitmapPos / groupLinkAlloc 现算，王道经典数（字长 32 位，第 3 行第 4 列 ↔ 块 100）由测试锁定。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const WORD = 32; // 位示图每字 32 位

/** 块号 → (行, 列)，均从 0 开始 */
export function bitmapPos(block: number, word = WORD): { row: number; col: number } {
  return { row: Math.floor(block / word), col: block % word };
}

/** (行, 列) → 块号 */
export function bitmapBlock(row: number, col: number, word = WORD): number {
  return row * word + col;
}

/** 成组链接：空闲栈（当前组 [21..40]，40 在栈顶），分配到 21（组尾）时读出它记录的下一组 [1..20] */
export const STACK_GROUP: number[] = Array.from({ length: 20 }, (_, i) => 21 + i); // [21,…,40] 栈顶 40
export const NEXT_GROUP: number[] = Array.from({ length: 20 }, (_, i) => 1 + i); // [1,…,20] 栈顶 20

export interface AllocEvent {
  block: number;
  reload: boolean; // 本块分配触发了「读入下一组」
}

/** 连续分配 n 块：弹栈；栈到组尾（弹出组内最后一块）时把它记载的下一组装入栈 */
export function groupLinkAlloc(n: number): { events: AllocEvent[]; stackLeft: number } {
  const stack = [...STACK_GROUP];
  const events: AllocEvent[] = [];
  for (let k = 0; k < n; k++) {
    const blk = stack.pop()!;
    const reload = stack.length === 0 && k < n - 1;
    if (reload) {
      // 组内最后一块（记录着下一组信息）被分配 → 读入下一组
      stack.push(...NEXT_GROUP);
    }
    events.push({ block: blk, reload });
  }
  return { events, stackLeft: stack.length };
}

const ALLOC = groupLinkAlloc(25);

interface Frame extends VizFrame {
  show: "bitmap" | "bitmap2" | "group0" | "group1" | "group2";
}

function buildFrames(): Frame[] {
  const reloadIdx = ALLOC.events.findIndex((e) => e.reload);
  return [
    {
      show: "bitmap",
      phase: "位示图·正求",
      desc: `位示图：每个空闲块用一个二进制位（0 空闲/1 占用）。字长 ${WORD} 位：块号 b = 行×${WORD} + 列。例：块 100 → 行 ${bitmapPos(100).row}、列 ${bitmapPos(100).col}（100 = 3×32+4）。占用/归还只改一个位，找连续空闲位需扫描。`,
    },
    {
      show: "bitmap2",
      phase: "位示图·反求",
      desc: `反过来：已知第 i 行第 j 列（0 起），块号 = ${WORD}×i + j。第 3 行第 4 列 → 块 ${bitmapBlock(3, 4)}。注意题目行列是否从 1 起（从 1 起要先减 1）。位示图常驻内存，容量开销 = 总块数/8 字节（如 40GB 盘 /1KB 块 → 40M 位 ≈ 5MB）。`,
    },
    {
      show: "group0",
      phase: "成组链接·结构",
      desc: `UNIX 成组链接：空闲块每 ${STACK_GROUP.length} 块一组，用「空闲盘块号栈」管理。栈里是当前组的块号（栈顶 ${STACK_GROUP.at(-1)}）；组内编号最小的一块（${STACK_GROUP[0]}）存放下一组的块号与数量。超级块的栈是全局入口。分配 = 弹栈顶；回收 = 压栈（若组满则把当前组写回盘、新组起头）。`,
    },
    {
      show: "group1",
      phase: "分配 25 块",
      desc: `连续分配 25 块：先弹 ${STACK_GROUP.at(-1)}、${STACK_GROUP.at(-1)! - 1} … 共 ${STACK_GROUP.length} 块把当前组用完；弹到组内最后一块 ${STACK_GROUP[0]} 时，先读出它记录的下一组 [${NEXT_GROUP[0]}…${NEXT_GROUP.at(-1)}] 装入栈，再继续弹 ${NEXT_GROUP.length - ALLOC.stackLeft} 块。全程只多一次读盘（换组时）——这就是它比位示图省内存、比空闲表高效的理由。`,
    },
    {
      show: "group2",
      phase: "回收",
      desc: `回收一块 = 压栈。若栈已满（${STACK_GROUP.length} 块），先把栈中这组块号写进被回收的那块（它成为新一组的「目录块」），清空栈再压入它。组链自动延伸。注意：分配到「栈剩 1 块且那是最后一组的标志 0」表示整个文件系统没有空闲块了。${reloadIdx >= 0 ? "本例换组发生在第 " + (reloadIdx + 1) + " 次分配。" : ""}`,
    },
  ];
}

export function FreeSpaceView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {(fr.show === "bitmap" || fr.show === "bitmap2") && (
        <div className="rounded-xl border border-dashed p-4 text-center font-mono text-sm">
          {fr.show === "bitmap" ? (
            <>块 100 → 第 <b className="text-sky-600">{bitmapPos(100).row}</b> 行 第 <b className="text-sky-600">{bitmapPos(100).col}</b> 列</>
          ) : (
            <>第 3 行 第 4 列 → 块 <b className="text-sky-600">{bitmapBlock(3, 4)}</b></>
          )}
          <div className="mt-1 text-xs text-muted-foreground">b = 32 × i + j（行、列均从 0 起）</div>
        </div>
      )}
      {(fr.show === "group1" || fr.show === "group2") && (
        <div className="flex flex-wrap gap-1">
          {ALLOC.events.map((e, i) => (
            <div
              key={i}
              className={cn(
                "rounded border px-1.5 py-1 text-center font-mono text-[11px]",
                e.reload ? "border-amber-500 bg-amber-500/20 font-bold" : "border-border bg-muted/40"
              )}
            >
              {e.block}
              {e.reload && <div className="text-[9px] text-amber-600">读下一组</div>}
            </div>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
