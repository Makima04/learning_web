// 图解 · 虚拟存储器与 TLB：一次访存的完整决策树——TLB 命中 / TLB 缺失查页表 / 缺页中断，
// 以及地址怎么从「虚页号+页内偏移」拼成物理地址。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

/** 虚实地址拼接：页大小 4KB（低 12 位偏移），帧号替换高位 */
export function translate(va: number, frameNo: number): number {
  return (frameNo << 12) | (va & 0xfff);
}

/** TLB 命中率 h 下的有效访存时间（TLB 10ns、访存 100ns） */
export function emat(h: number, tlb = 10, mem = 100): number {
  return h * (tlb + mem) + (1 - h) * (tlb + 2 * mem);
}

interface VFrame extends VizFrame {
  /** 决策树节点高亮路径 */
  active: string[];
  vaNum: number | null;
  pa: number | null;
  tlb: { vpn: number; frame: number }[];
}

// 页表：虚页号 → 帧号（-1 表示不在内存）
const PAGE_TABLE: Record<number, number> = { 0: 7, 1: 3, 2: 5, 3: 9, 8: -1 };

function buildVirtFrames(): VFrame[] {
  const frames: VFrame[] = [];
  let tlb: { vpn: number; frame: number }[] = [{ vpn: 3, frame: 9 }];
  const snap = (desc: string, phase: string, active: string[], vaNum: number | null, pa: number | null, t: typeof tlb) =>
    frames.push({ desc, phase, active, vaNum, pa, tlb: [...t] });

  snap(
    "页式虚拟存储：虚拟地址按页划分，页表记录「虚页号 → 物理帧号 + 有效位」。TLB（快表）是页表项的高速缓存，命中就免一次访存查页表。看三次访存分别走哪条路。页大小 4KB ⇒ 虚/实地址低 12 位都是页内偏移，翻译只是替换高位。",
    "初始",
    [],
    null,
    null,
    tlb
  );

  // 访问 1：TLB 命中
  const va1 = 0x3a7f;
  const pa1 = translate(va1, 9);
  snap(
    `访存 ① VA = 0x3A7F：拆成 虚页号 ${va1 >> 12} + 页内偏移 0x${(va1 & 0xfff).toString(16).toUpperCase()}。TLB 里有页 3 → 帧 9：命中！物理地址 = 帧 9 拼偏移 = 0x${pa1.toString(16).toUpperCase()}。全程 1 次访存拿到数据（TLB 极快）。`,
    "TLB 命中",
    ["VA", "TLB", "PA"],
    va1,
    pa1,
    tlb
  );

  // 访问 2：TLB 缺失，页表命中
  const va2 = 0x2c56;
  const frame2 = PAGE_TABLE[va2 >> 12]!;
  const pa2 = translate(va2, frame2);
  snap(
    `访存 ② VA = 0x2C56：虚页号 ${va2 >> 12}，TLB 没有这一项 → 缺失。先访存读页表：有效位 1、帧号 ${frame2} → PA = 0x${pa2.toString(16).toUpperCase()}，再访存取数据。代价 = 2 次访存；同时把页表项填进 TLB（局部性：下次大概率再命中）。`,
    "TLB 缺失",
    ["VA", "TLB", "页表", "PA"],
    va2,
    pa2,
    tlb
  );
  tlb = [{ vpn: 3, frame: 9 }, { vpn: 2, frame: 5 }];

  // 访问 3：缺页
  const va3 = 0x8123;
  snap(
    `访存 ③ VA = 0x8123：虚页号 ${va3 >> 12}，TLB 缺失；查页表发现有效位 0（页表里存的是「不在内存」）——缺页。触发缺页中断：OS 找空闲帧（没有就按置换算法淘汰一页，脏页写回）→ 从磁盘调入整页 → 页表置有效、更新 TLB → 重新执行被中断的指令。缺页是「异常」，代价以磁盘计（百万周期级）：虚拟存储用页表+磁盘把内存「变大」，命中率靠局部性撑着。`,
    "缺页中断",
    ["VA", "TLB", "页表", "缺页处理"],
    va3,
    null,
    tlb
  );

  snap(
    "总结：访存路径 = TLB →（缺失）页表 →（无效）缺页中断。有效访存时间 EMAT = h×(T_TLB+T_访存) + (1−h)×(T_TLB+2×T_访存)；h=0.98、T_TLB=10ns、T_访存=100ns 时 = 112ns。多级页表省页表自身的空间；段页式先查段表再查页表（3 次访存起步）。换来的是：每进程独立地址空间 + 程序可超物理内存。页面置换算法见操作系统·虚拟内存的专门演示。",
    "完成",
    [],
    null,
    null,
    tlb
  );
  return frames;
}

const NODES: Record<string, { x: number; y: number; w: number; label: string }> = {
  VA: { x: 40, y: 96, w: 84, label: "虚拟地址 VA" },
  TLB: { x: 170, y: 40, w: 84, label: "查 TLB" },
  页表: { x: 170, y: 152, w: 84, label: "查页表(访存)" },
  缺页处理: { x: 310, y: 152, w: 96, label: "缺页中断" },
  PA: { x: 330, y: 40, w: 96, label: "拼物理地址" },
};

export function VirtMemView() {
  const frames = useMemo(buildVirtFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 440 200" className="w-full">
        {Object.entries(NODES).map(([id, n]) => {
          const on = fr.active.includes(id);
          return (
            <g key={id} opacity={fr.active.length === 0 ? 0.85 : on ? 1 : 0.4}>
              <rect x={n.x} y={n.y} width={n.w} height={30} rx={8} fill={on ? C.active : C.node} stroke="#94a3b8" />
              <text x={n.x + n.w / 2} y={n.y + 20} textAnchor="middle" fontSize={12} fontWeight={700} fill={on ? "#fff" : C.nodeText}>
                {n.label}
              </text>
            </g>
          );
        })}
        <path d="M124,111 L170,62" stroke={C.line} strokeWidth={1.4} markerEnd="" />
        <path d="M124,111 L170,162" stroke={C.line} strokeWidth={1.4} />
        <path d="M254,55 L330,55" stroke={C.line} strokeWidth={1.4} />
        <path d="M254,167 L358,152 L358,70" stroke={C.line} strokeWidth={1.4} strokeDasharray="4 3" />
      </svg>
      {fr.vaNum !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 font-mono text-xs">
          {fr.pa != null ? (
            <>
              <span>VA 0x{fr.vaNum.toString(16).toUpperCase()}</span>
              <span>=</span>
              <span className="rounded bg-emerald-500/25 px-1.5 py-0.5 font-bold">虚页 {fr.vaNum >> 12}</span>
              <span className="rounded bg-amber-500/25 px-1.5 py-0.5 font-bold">偏移 0x{(fr.vaNum & 0xfff).toString(16).toUpperCase()}</span>
              <span>→</span>
              <span className="rounded bg-sky-500/25 px-1.5 py-0.5 font-bold">PA 0x{fr.pa.toString(16).toUpperCase()}</span>
            </>
          ) : (
            <span className="text-rose-600 dark:text-rose-400">虚页 {fr.vaNum >> 12}：缺页！有效位 0，转 OS 处理</span>
          )}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">TLB（快表）当前内容</p>
        <div className="flex flex-wrap gap-1.5">
          {fr.tlb.map((t) => (
            <span key={t.vpn} className="rounded border border-border bg-sky-500/15 px-2 py-0.5 font-mono text-xs font-bold">
              页{t.vpn} → 帧{t.frame}
            </span>
          ))}
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
