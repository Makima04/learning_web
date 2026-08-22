// 图解 · 磁盘分配与多级索引：块 4KB、地址项 4B → 每索引块 1024 个指针。
// 10 直接 + 1 一级 + 1 二级 + 1 三级索引的最大文件与深层读盘次数由 indexMax()/readDepth() 现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export const BS = 4096; // 块大小
export const PTR = 4; // 地址项字节
export const PPN = BS / PTR; // 每块指针数 = 1024
export const DIRECT = 10; // 直接地址项数

export interface InodeCalc {
  blocks: number[]; // 直接 / 一级 / 二级 / 三级 各级可指块数
  maxBlocks: number;
  maxSizeGB: number; // 保留 2 位
  reads: number[]; // 访问各级深处数据块的读盘次数（假设索引块都不在内存）
}

/** 多级索引容量与读盘深度 */
export function indexMax(bs = BS, ptr = PTR, direct = DIRECT): InodeCalc {
  const ppn = bs / ptr;
  const blocks = [direct, ppn, ppn * ppn, ppn ** 3];
  const maxBlocks = blocks.reduce((a, b) => a + b, 0);
  const maxSizeGB = (maxBlocks * bs) / 1024 ** 3;
  const reads = [1, 2, 3, 4]; // 直接 1 次读数据；一级：先读索引块再读数据 …
  return { blocks, maxBlocks, maxSizeGB, reads };
}

const CALC = indexMax();

interface Frame extends VizFrame {
  show: "fcfs" | "levels" | "deep" | "compare";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "fcfs",
      phase: "起点",
      desc: `UNIX 经典方案：inode 里 ${DIRECT} 个直接地址 + 1 个一级间接 + 1 个二级间接 + 1 个三级间接指针。块 ${BS / 1024}KB、地址项 ${PTR}B → 每个索引块容纳 ${PPN} 个块指针。这套结构是「小文件快、大文件也能撑」的折中——绝大多数文件 < 10 块，直接指针一步到位。`,
    },
    {
      show: "levels",
      phase: "容量",
      desc: `各级可指数据块：直接 ${CALC.blocks[0]}、一级 ${CALC.blocks[1]!.toLocaleString()}、二级 ${CALC.blocks[2]!.toLocaleString()}、三级 ${CALC.blocks[3]!.toLocaleString()}，合计 ${CALC.maxBlocks.toLocaleString()} 块 × ${BS / 1024}KB ≈ ${CALC.maxSizeGB.toFixed(2)} GB。大题套路：给块大小和地址项大小，先算每块指针数，再逐级乘。`,
    },
    {
      show: "deep",
      phase: "读盘深度",
      desc: `访问代价（索引块不在内存时）：直接块 ${CALC.reads[0]} 次读盘；一级间接 ${CALC.reads[1]} 次（索引块+数据）；二级 ${CALC.reads[2]}；三级 ${CALC.reads[3]}。所以索引表项常驻内存/缓存收益巨大。若题目说「索引节点已在内存」，直接块 1 次、一级 1 次（索引块也得读？——注意区分：索引块不在 inode 里，仍需读盘）。`,
    },
    {
      show: "compare",
      phase: "对比",
      desc: "分配方式横向比：连续——随机访问 O(1)、预读友好，但要连续空间（碎片）、扩容难；链接（隐式）——无碎片好扩展，但随机 O(n)；FAT（显式）——随机恢复 O(1)（查表），但表占内存、整个文件系统一张；索引——每文件独立表、随机 O(1)、支持稀疏文件（洞不占块），小文件不划算（min 1 索引块）。 extents（现代 ext4）：连续区段折中。",
    },
  ];
}

export function InodeView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "levels" && (
        <div className="grid gap-3 sm:grid-cols-4">
          {["直接", "一级间接", "二级间接", "三级间接"].map((n, i) => (
            <div key={n} className="rounded-xl border p-3 text-center">
              <p className="text-xs text-muted-foreground">{n}</p>
              <p className="my-1 font-mono text-sm font-bold text-sky-600">{CALC.blocks[i]!.toLocaleString()} 块</p>
              <p className="text-[11px] text-muted-foreground">读盘 {CALC.reads[i]} 次</p>
            </div>
          ))}
        </div>
      )}
      {fr.show === "deep" && (
        <div className="rounded-xl border border-dashed p-4 text-center">
          <p className="font-mono text-sm">最大文件 = {CALC.maxBlocks.toLocaleString()} 块 × 4KB ≈ {CALC.maxSizeGB.toFixed(2)} GB</p>
          <p className="mt-1 text-xs text-muted-foreground">1024 = 4KB ÷ 4B（每个索引块放的指针数）</p>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
