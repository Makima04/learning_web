// 图解 · 分页/分段：逻辑地址 → 物理地址的两套翻译。分页「一维地址 + 等长页」（2500 → 页2偏移452 → 帧5 → 5572）；
// 分段「二维地址 (段,偏移) + 变长段」（段表查基址，偏移超段长 → 越界中断）。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const PG_PAGE_SIZE = 1024; // 1KB
export const PG_TABLE: Record<number, number> = { 0: 2, 1: 7, 2: 5, 3: 9 }; // 页号 → 帧号
export const PG_VA = 2500;

/** 分页翻译：返回页号/偏移/物理地址（页不在表内 → fault） */
export function pagingTranslate(va: number, pageSize: number, table: Record<number, number>): { page: number; offset: number; frame?: number; pa?: number; fault: boolean } {
  const page = Math.floor(va / pageSize);
  const offset = va % pageSize;
  const frame = table[page];
  if (frame === undefined) return { page, offset, fault: true };
  return { page, offset, frame, pa: frame * pageSize + offset, fault: false };
}

export interface SegEntry {
  base: number;
  limit: number;
}
export const SEG_TABLE: SegEntry[] = [
  { base: 40 * 1024, limit: 3 * 1024 },
  { base: 80 * 1024, limit: 2 * 1024 },
  { base: 120 * 1024, limit: 6 * 1024 },
  { base: 160 * 1024, limit: 2 * 1024 },
];
export const SEG_ADDR = { seg: 3, offset: 500 };

/** 分段翻译：偏移超段长 → 越界中断 */
export function segTranslate(seg: number, offset: number, table: SegEntry[]): { pa?: number; trap: boolean } {
  const e = table[seg];
  if (!e || offset >= e.limit) return { trap: true };
  return { pa: e.base + offset, trap: false };
}

interface PgFrame extends VizFrame {
  hi: string[];
}

function buildPagingFrames(): PgFrame[] {
  const frames: PgFrame[] = [];
  const push = (desc: string, phase: string, hi: string[]) => frames.push({ desc, phase, hi });
  const { page, offset, frame, pa } = pagingTranslate(PG_VA, PG_PAGE_SIZE, PG_TABLE);

  push(
    `分页：页大小 ${PG_PAGE_SIZE}B（页内偏移 10 位）。逻辑地址 ${PG_VA} 是「一维」的，硬件自动拆两半。页表只存「页号 → 帧号」（页框等长，无外部碎片；页内平均浪费半页 = 内部碎片）。`,
    "初始",
    []
  );
  push(
    `① 拆地址：${PG_VA} = ${page}×${PG_PAGE_SIZE} + ${offset} ⇒ 页号 ${page}、页内偏移 ${offset}。二进制视角：${PG_VA} = ${PG_VA.toString(2).padStart(12, "0")}₂，高 2 位是页号、低 10 位是偏移。`,
    "拆地址",
    ["拆"]
  );
  push(
    `② 查页表：第 ${page} 页 → 帧 ${frame}。页表基址寄存器 PTBR 指向页表；访存一次数据要先访存一次页表（TLB 见虚拟存储器演示）。`,
    "查页表",
    ["表"]
  );
  push(
    `③ 拼地址：物理地址 = 帧号×${PG_PAGE_SIZE} + 偏移 = ${frame}×${PG_PAGE_SIZE} + ${offset} = ${pa}。偏移原样照抄，只换页号。`,
    "拼地址",
    ["拼"]
  );
  push(
    "分页完成。一次访存变两次（页表 + 数据），快表/多级页表/TLB 都是为省这一步。页表本身占内存：32 位系统 4KB 页 → 2²⁰ 项 → 需要二级页表分散存放。",
    "分页完成",
    []
  );
  return frames;
}

function buildSegFrames(): PgFrame[] {
  const frames: PgFrame[] = [];
  const push = (desc: string, phase: string, hi: string[]) => frames.push({ desc, phase, hi });
  const { seg, offset } = SEG_ADDR;
  const good = segTranslate(seg, offset, SEG_TABLE);

  push(
    `分段：按程序逻辑划分（主程序/子程序/数据段…），段长可变 ⇒ 地址是「二维」的：(段号, 段内偏移)。段表每项 = (段长, 基址)，按段号直接索引（不设段表基址偏移，段号就是下标）。`,
    "初始",
    []
  );
  push(
    `① 给地址 (${seg}, ${offset})：段号 ${seg}，偏移 ${offset}。段号查段表前必须先检查偏移是否越界——这是分段特有的保护。`,
    "给地址",
    ["拆"]
  );
  push(
    `② 查段表：段 ${seg} 的表项 = (段长 ${SEG_TABLE[seg]!.limit}, 基址 ${SEG_TABLE[seg]!.base})。偏移 ${offset} < 段长 ${SEG_TABLE[seg]!.limit} ✓ 合法。`,
    "查段表",
    ["表"]
  );
  push(
    `③ 拼地址：PA = 基址 + 偏移 = ${SEG_TABLE[seg]!.base} + ${offset} = ${good.pa}。`,
    "拼地址",
    ["拼"]
  );
  push(
    `反例：若偏移 = ${SEG_TABLE[seg]!.limit + 10} ≥ 段长 ${SEG_TABLE[seg]!.limit} → 越界中断（trap），不访存。段长不等 → 无内部碎片，但分配要找空闲区（有外部碎片，紧拼接法解决）。`,
    "越界检查",
    ["界"]
  );
  push(
    "对比与组合：分页对程序员透明（一维、硬件拆）、分段可见（二维、按逻辑）；段页式 = 先段表后页表，地址 (段号, 页号, 页内偏移)，访存 3 次起步（段表/页表/数据，可被 TLB 削掉）。大题常给页大小、页表、逻辑地址求物理地址，或问访问某地址共访存几次。",
    "完成",
    []
  );
  return frames;
}

type Mode = "分页" | "分段";

export function PagingView() {
  const [mode, setMode] = useState<Mode>("分页");
  const frames = useMemo(() => (mode === "分页" ? buildPagingFrames() : buildSegFrames()), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const { page, offset, frame, pa } = pagingTranslate(PG_VA, PG_PAGE_SIZE, PG_TABLE);
  const { seg, offset: segOff } = SEG_ADDR;
  const segPa = segTranslate(seg, segOff, SEG_TABLE).pa;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["分页", "分段"] as Mode[]).map((m) => (
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
      </div>
      {mode === "分页" ? (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("拆") ? "border-sky-500 bg-sky-500/15 font-bold" : "border-border")}>
            逻辑地址 {PG_VA}
          </span>
          <span>=</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("拆") ? "border-sky-500 bg-sky-500/15 font-bold" : "border-border")}>
            页号 {page}
          </span>
          <span>+</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("拆") ? "border-amber-500 bg-amber-500/15 font-bold" : "border-border")}>
            偏移 {offset}
          </span>
          <span>→</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("表") ? "border-emerald-600 bg-emerald-500/15 font-bold" : "border-border")}>
            页表[{page}] = 帧 {frame}
          </span>
          <span>→</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("拼") ? "border-violet-500 bg-violet-500/15 font-bold" : "border-border")}>
            PA = {pa}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("拆") ? "border-sky-500 bg-sky-500/15 font-bold" : "border-border")}>
            地址 ({seg}, {segOff})
          </span>
          <span>→</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("界") ? "border-rose-500 bg-rose-500/15 font-bold" : "border-border")}>
            偏移 {segOff} &lt; 段长 {SEG_TABLE[seg]!.limit} ✓
          </span>
          <span>→</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("表") ? "border-emerald-600 bg-emerald-500/15 font-bold" : "border-border")}>
            段表[{seg}] = 基址 {SEG_TABLE[seg]!.base}
          </span>
          <span>→</span>
          <span className={cn("rounded border px-2 py-1", fr.hi.includes("拼") ? "border-violet-500 bg-violet-500/15 font-bold" : "border-border")}>
            PA = {segPa}
          </span>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
