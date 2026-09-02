// 图解 · 分页/分段/多级页表：逻辑地址 → 物理地址。
// 分页「一维 + 等长页」（2500 → 页2偏移452 → 帧5 → 5572）；
// 分段「二维 (段,偏移) + 变长段」（偏移超段长 → 越界中断）；
// 二级 10+10+12（2020 大题 46 走翻译）；三级 25|9|9|9|12（2026 选择 28 算 L3 页框）。
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

/** 大写十六进制，满 8 位按 4 位空格分组，后缀 H（如 1080 1008H） */
function hexH(n: number, digits = 0): string {
  let s = Math.trunc(n).toString(16).toUpperCase();
  if (digits > s.length) s = s.padStart(digits, "0");
  if (s.length <= 4) return s + "H";
  if (s.length % 4 !== 0) return s + "H";
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += 4) parts.push(s.slice(i, i + 4));
  return parts.join(" ") + "H";
}

/** 把虚拟地址按位域拆开（高位在前） */
export function splitVa(va: number, fields: number[]): number[] {
  const out: number[] = [];
  let pos = fields.reduce((s, w) => s + w, 0);
  const n = Math.trunc(va);
  for (const w of fields) {
    pos -= w;
    out.push(Math.floor(n / 2 ** pos) % 2 ** w);
  }
  return out;
}

export interface TwoLevelWalk {
  dir: number; // 页目录号
  pt: number; // 页表索引
  offset: number;
  pdbr: number; // 页目录物理基址
  pdePa: number; // 该目录项物理地址 = pdbr + dir * pteSize
  ptBase: number; // 该目录项里的页框号 << 12（二级页表起始物理地址）
  ptePa: number; // 页表项物理地址 = ptBase + pt * pteSize
  frame: number; // 页框号
  pa: number; // 物理地址 = (frame << 12) | offset
}

/** 二级页表走一轮（默认 10+10+12，PTE 4B，页 4KB） */
export function walkTwoLevel(opts: {
  va: number;
  pdbr: number; // 页目录起始物理地址
  dirFrame: number; // 该目录项存放的页框号（二级页表所在帧）
  pageFrame: number; // 该页表项存放的页框号（数据页）
  pteSize?: number; // 默认 4
  offsetBits?: number; // 默认 12
  dirBits?: number; // 默认 10
  ptBits?: number; // 默认 10
}): TwoLevelWalk {
  const pteSize = opts.pteSize ?? 4;
  const offsetBits = opts.offsetBits ?? 12;
  const dirBits = opts.dirBits ?? 10;
  const ptBits = opts.ptBits ?? 10;
  const parts = splitVa(opts.va, [dirBits, ptBits, offsetBits]);
  const dir = parts[0] ?? 0;
  const pt = parts[1] ?? 0;
  const offset = parts[2] ?? 0;
  const pageBytes = 2 ** offsetBits;
  const pdePa = opts.pdbr + dir * pteSize;
  const ptBase = opts.dirFrame * pageBytes;
  const ptePa = ptBase + pt * pteSize;
  const frame = opts.pageFrame;
  const pa = frame * pageBytes + offset;
  return { dir, pt, offset, pdbr: opts.pdbr, pdePa, ptBase, ptePa, frame, pa };
}

/** 三级页表：满映射时第 L 级页表占用多少页框（level 1-based） */
export function levelTableFrames(indexBits: number[], offsetBits: number, level: number): number {
  if (level < 1 || level > indexBits.length) return 0;
  // 虚页数 = 地址空间 2^{Σindex+offset} / 页大小 2^offset
  const vaBits = indexBits.reduce((s, b) => s + b, 0) + offsetBits;
  const pageCount = 2 ** (vaBits - offsetBits);
  // 一张第 L 级表覆盖的虚页数 = 2^{b_L + b_{L+1} + …}
  const coverBits = indexBits.slice(level - 1).reduce((s, b) => s + b, 0);
  return pageCount / 2 ** coverBits;
}

// 2020 大题 46：a[1024][1024] int，起始 VA=1080 0000H，PDBR=0020 1000H
const TL_VA = 0x10801008; // a[1][2]
const TL_PDBR = 0x00201000;
const TL_DIR_FRAME = 0x00301;
const TL_PAGE_FRAME = 0x00030; // 题面问到 PTE 物理地址为止，数据页框用于走完翻译
const Q31_VA = 0x20501225; // 2019 选择 31

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

function buildTwoLevelFrames(): PgFrame[] {
  const frames: PgFrame[] = [];
  const push = (desc: string, phase: string, hi: string[]) => frames.push({ desc, phase, hi });
  const w = walkTwoLevel({ va: TL_VA, pdbr: TL_PDBR, dirFrame: TL_DIR_FRAME, pageFrame: TL_PAGE_FRAME });
  const q31 = splitVa(Q31_VA, [10, 10, 12]);

  push(
    `二级页表（2020 大题 46）：32 位、页 4KB（偏移 12 位）、PTE 4B → 每张页表恰好 2¹⁰ 项、占 1 页，所以索引拆成 10+10。数组 int a[1024][1024] 起始 VA = ${hexH(0x10800000, 8)}；一行 1024×4B = 4KB 正好一页。PDBR = ${hexH(TL_PDBR, 8)} 是页目录的物理地址（不是虚拟地址！2021 选择 29）。`,
    "初始",
    []
  );
  push(
    `① 拆 VA：a[1][2] = ${hexH(0x10800000, 8)} + (1×1024+2)×4 = ${hexH(TL_VA, 8)}。按 10|10|12 切开：页目录号 ${hexH(w.dir, 3)}、页号 ${hexH(w.pt, 3)}、偏移 ${hexH(w.offset, 3)}。对照 2019 选择 31：VA ${hexH(Q31_VA, 8)} → 页目录号 ${hexH(q31[0] ?? 0, 3)}、页号 ${hexH(q31[1] ?? 0, 3)}、偏移 ${hexH(q31[2] ?? 0, 3)}（高位在前，缺位补 0）。`,
    "拆 VA",
    ["拆", "dir", "pt", "off"]
  );
  push(
    `② 用 PDBR 算目录项物理地址：PDE PA = PDBR + 页目录号 × 4 = ${hexH(w.pdbr, 8)} + ${hexH(w.dir, 3)}×4 = ${hexH(w.pdePa, 8)}。页表基址寄存器存的是物理地址，MMU 不经翻译直接访存页目录。进程切换才改 PDBR（换地址空间）；同一进程的线程共享页表，线程切换不改 PDBR（2018 大题 45）。`,
    "算 PDE",
    ["pdbr", "pde"]
  );
  push(
    `③ 读 PDE：该目录项给出二级页表所在页框 ${hexH(TL_DIR_FRAME, 5)}。页框号左移 12 位即二级页表起始物理地址 = ${hexH(w.ptBase, 8)}。页表本身也按页存放，所以可以不连续——这正是多级页表的意义。`,
    "二级页表基址",
    ["pde", "ptb"]
  );
  push(
    `④ 算页表项物理地址：PTE PA = 二级页表基址 + 页号 × 4 = ${hexH(w.ptBase, 8)} + ${hexH(w.pt, 3)}×4 = ${hexH(w.ptePa, 8)}。到这里已经访存 2 次（目录项 + 页表项），还没拿到数据。TLB 命中可把这两次都省掉。`,
    "算 PTE",
    ["ptb", "pte"]
  );
  push(
    `⑤ 拼物理地址：假设该 PTE 的页框号为 ${hexH(w.frame, 3)}（题面问到页表项物理地址为止），PA = (页框号 << 12) | 偏移 = ${hexH(w.pa, 8)}。偏移原样照抄，只替换高位。无 TLB 时一次数据访问 = 2 次页表 + 1 次数据 = 3 次访存。`,
    "拼 PA",
    ["pte", "拼"]
  );
  push(
    "多级页表的优点是减少页表占用的连续内存（页表可分页、离散存放），并不能加快地址翻译——级数越多越慢（2014 选择 32）。未映射的目录项对应的整张二级页表都可以不分配。访存次数靠 TLB 砍；进程切换改 PDBR，线程切换不用。",
    "完成",
    []
  );
  return frames;
}

function buildThreeLevelFrames(): PgFrame[] {
  const frames: PgFrame[] = [];
  const push = (desc: string, phase: string, hi: string[]) => frames.push({ desc, phase, hi });
  const idx = [9, 9, 9];
  const off = 12;
  const l1 = levelTableFrames(idx, off, 1);
  const l2 = levelTableFrames(idx, off, 2);
  const l3 = levelTableFrames(idx, off, 3);
  const pages = 2 ** idx.reduce((s, b) => s + b, 0);

  push(
    `64 位三级页表（2026 选择 28）：地址结构 25|9|9|9|12。高 25 位不用（规范地址/保留），中间三级各 9 位索引，低 12 位是 4KB 页内偏移。64 位 PTE 8B，每张表 2⁹=512 项 × 8B = 4KB，刚好一页。`,
    "初始",
    ["unused", "l1", "l2", "l3", "off"]
  );
  push(
    `① 位域：未用 25 + L1 9 + L2 9 + L3 9 + 偏移 12 = 64。每级 512 项，一张表一页框。满空间时虚页数 = 2^{9+9+9} = 2²⁷ = ${pages.toLocaleString("en-US")} 页。`,
    "拆结构",
    ["l1", "l2", "l3", "off"]
  );
  push(
    `② 满映射时第 L 级页框数 = 2^{前面各级索引位数}：L1 只有 ${l1} 张（根，必须在）；L2 有 2⁹ = ${l2} 张。公式对任意级数通用。`,
    "L1 / L2",
    ["l1", "l2"]
  );
  push(
    `③ 第三级：每张 L3 表 2⁹ 项，管 512 个数据页。满空间 2²⁷ 个数据页 / 2⁹ = 2¹⁸ = ${l3} = ${l3 / 1024}K 个页框。这就是 2026 选择 28 的答案。`,
    "L3 = 256K",
    ["l3"]
  );
  push(
    `④ 关键收益：进程实际用不到 2²⁷ 页。空着的 L1 项下面整棵 L2/L3 都不分配。例如只用 1 个数据页：L1+L2+L3 各 1 张，页表只占 3 个页框，而不是 ${l3 / 1024}K。多级页表让未用区域的中间层可以不分配。`,
    "稀疏不分配",
    ["sparse"]
  );
  push(
    `对比一级页表：2²⁷ 项 × 8B = 1GB，还必须连续。多级把页表也分页，用时间（多几次访存）换连续空间。加速靠 TLB，不靠加级数（2014 选择 32 对二级同样成立）。`,
    "完成",
    ["l1", "l2", "l3"]
  );
  return frames;
}

type Mode = "分页" | "分段" | "二级页表" | "三级页表";
const MODES: Mode[] = ["分页", "分段", "二级页表", "三级页表"];

function BitBar({
  fields,
  hi,
}: {
  fields: { id: string; label: string; bits: number; value: string; cls: string }[];
  hi: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[28rem] overflow-hidden rounded-xl border text-center text-xs">
        {fields.map((f) => {
          const on = hi.length === 0 || hi.includes(f.id);
          return (
            <div
              key={f.id}
              className={cn("border-r last:border-r-0", on ? f.cls : "bg-muted/20 text-muted-foreground")}
              style={{ flexGrow: f.bits, flexBasis: 0 }}
            >
              <div className={cn("py-1 font-semibold", on ? "bg-black/5 dark:bg-white/5" : "bg-muted/40")}>
                {f.label}（{f.bits}）
              </div>
              <div className="px-1 py-2 font-mono font-bold">{f.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ on, cls, children }: { on: boolean; cls: string; children: string }) {
  return (
    <span className={cn("rounded border px-2 py-1 font-mono text-xs", on ? `${cls} font-bold` : "border-border")}>
      {children}
    </span>
  );
}

export function PagingView() {
  const [mode, setMode] = useState<Mode>("分页");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
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
      <PagingDemo key={mode} mode={mode} />
    </div>
  );
}

function PagingDemo({ mode }: { mode: Mode }) {
  const frames = useMemo(() => {
    if (mode === "分页") return buildPagingFrames();
    if (mode === "分段") return buildSegFrames();
    if (mode === "二级页表") return buildTwoLevelFrames();
    return buildThreeLevelFrames();
  }, [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const { page, offset, frame, pa } = pagingTranslate(PG_VA, PG_PAGE_SIZE, PG_TABLE);
  const { seg, offset: segOff } = SEG_ADDR;
  const segPa = segTranslate(seg, segOff, SEG_TABLE).pa;
  const w = walkTwoLevel({ va: TL_VA, pdbr: TL_PDBR, dirFrame: TL_DIR_FRAME, pageFrame: TL_PAGE_FRAME });
  const q31 = splitVa(Q31_VA, [10, 10, 12]);
  const l1 = levelTableFrames([9, 9, 9], 12, 1);
  const l2 = levelTableFrames([9, 9, 9], 12, 2);
  const l3 = levelTableFrames([9, 9, 9], 12, 3);

  return (
    <div className="space-y-4">
      {mode === "分页" && (
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
      )}
      {mode === "分段" && (
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
      {mode === "二级页表" && (
        <div className="space-y-3">
          <BitBar
            hi={fr.hi}
            fields={[
              { id: "dir", label: "页目录号", bits: 10, value: hexH(w.dir, 3), cls: "bg-sky-500/20" },
              { id: "pt", label: "页号", bits: 10, value: hexH(w.pt, 3), cls: "bg-emerald-500/20" },
              { id: "off", label: "页内偏移", bits: 12, value: hexH(w.offset, 3), cls: "bg-amber-500/20" },
            ]}
          />
          <div className="flex min-w-[28rem] overflow-x-auto font-mono text-[10px]">
            {(
              [
                ["dir", 10, w.dir],
                ["pt", 10, w.pt],
                ["off", 12, w.offset],
              ] as [string, number, number][]
            ).map(([id, bits, v]) => (
              <span
                key={id}
                className={cn(
                  "px-1 text-center tracking-tight",
                  fr.hi.includes(id) ? "font-bold text-foreground" : "text-muted-foreground"
                )}
                style={{ flexGrow: bits, flexBasis: 0 }}
              >
                {v.toString(2).padStart(bits, "0")}₂
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip on={fr.hi.includes("拆")} cls="border-sky-500 bg-sky-500/15">
              {`VA ${hexH(TL_VA, 8)}`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("pdbr")} cls="border-rose-500 bg-rose-500/15">
              {`PDBR ${hexH(w.pdbr, 8)}（物理）`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("pde")} cls="border-sky-500 bg-sky-500/15">
              {`PDE ${hexH(w.pdePa, 8)}`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("ptb")} cls="border-emerald-600 bg-emerald-500/15">
              {`PT 基址 ${hexH(w.ptBase, 8)}`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("pte")} cls="border-violet-500 bg-violet-500/15">
              {`PTE ${hexH(w.ptePa, 8)}`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("拼")} cls="border-amber-500 bg-amber-500/15">
              {`PA ${hexH(w.pa, 8)}`}
            </Chip>
          </div>
          <p className="rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
            2019 选择 31　{hexH(Q31_VA, 8)} → 页目录号 {hexH(q31[0] ?? 0, 3)}、页号 {hexH(q31[1] ?? 0, 3)}、偏移 {hexH(q31[2] ?? 0, 3)}
          </p>
          <p className="text-xs text-muted-foreground">
            考点：PDBR 存物理地址（2021 选 29）· 进程切换改 PDBR、线程不改（2018 大题 45）· 多级页表减连续内存、不加快翻译（2014 选 32）
          </p>
        </div>
      )}
      {mode === "三级页表" && (
        <div className="space-y-3">
          <BitBar
            hi={fr.hi}
            fields={[
              { id: "unused", label: "未用", bits: 25, value: "保留", cls: "bg-muted/50" },
              { id: "l1", label: "L1", bits: 9, value: "512 项", cls: "bg-sky-500/20" },
              { id: "l2", label: "L2", bits: 9, value: "512 项", cls: "bg-emerald-500/20" },
              { id: "l3", label: "L3", bits: 9, value: "512 项", cls: "bg-violet-500/20" },
              { id: "off", label: "偏移", bits: 12, value: "4KB", cls: "bg-amber-500/20" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip on={fr.hi.includes("l1")} cls="border-sky-500 bg-sky-500/15">
              {`L1 ${l1} 页框`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("l2")} cls="border-emerald-600 bg-emerald-500/15">
              {`L2 ${l2} 页框`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("l3")} cls="border-violet-500 bg-violet-500/15">
              {`L3 ${l3 / 1024}K 页框`}
            </Chip>
            <span className="text-xs text-muted-foreground">→</span>
            <Chip on={fr.hi.includes("off")} cls="border-amber-500 bg-amber-500/15">
              {`数据页 2²⁷`}
            </Chip>
          </div>
          {fr.hi.includes("sparse") && (
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                满映射：L3 = {l3.toLocaleString("en-US")} = 256K 个页框
              </div>
              <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 font-bold">
                只用 1 个数据页：页表仅 L1+L2+L3 各 1 张
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            考点：2026 选择 28　满空间第三级页表所占页框数 = 256K；未用区域的中间层可以不分配
          </p>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
