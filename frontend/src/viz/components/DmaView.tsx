// 图解 · DMA：预初始化 → 周期窃取传整块 → 完成中断后处理。CPU 只碰头尾各一次，
// 传 1000 字 CPU 只花 10µs；中断方式每字一次现场切换要 3000µs——数字由 dmaVsIntr() 现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface DmaCost {
  dmaCpuUs: number; // DMA：CPU 耗时（预处理 + 后处理）
  intrCpuUs: number; // 中断：CPU 耗时（每字一次中断）
  perWordDmaUs: number; // DMA 传送期 CPU 被窃取的周期（0：完全让出总线隙）
  blocks: number;
}

/** bytes 字节，块大小 blockSize；setupUs DMA 预/后处理各一次；intrUs 每字中断开销 */
export function dmaVsIntr(bytes: number, intrUs: number, setupUs: number, blockSize = 1): DmaCost {
  const blocks = Math.ceil(bytes / blockSize);
  return {
    blocks,
    dmaCpuUs: setupUs * 2,
    intrCpuUs: bytes * intrUs,
    perWordDmaUs: 0,
  };
}

export const DMA_BYTES = 1000;
export const INTR_US = 3;
export const SETUP_US = 5;
const COST = dmaVsIntr(DMA_BYTES, INTR_US, SETUP_US);

interface Frame extends VizFrame {
  show: "init" | "transfer" | "post" | "compare";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "init",
      phase: "① 预处理",
      desc: `CPU 执行几条指令把 DMA 控制器配好：内存起始地址 → 地址寄存器 AR；字节数 ${DMA_BYTES} → 字计数器 WC；方向（设备→内存）→ 控制逻辑。然后启动设备、继续跑自己的程序——这是 CPU 第一次也是几乎最后一次介入（${SETUP_US}µs）。`,
    },
    {
      show: "transfer",
      phase: "② 数据传送",
      desc: `设备每准备好一个字，DMA 控制器向 CPU 申请占用一个总线周期（周期窃取/周期挪用）：DMAC 拿到总线 → 从设备读入数据寄存器 → 写入 AR 指示的内存 → AR+1、WC−1，然后立刻把总线还给 CPU。整块 ${DMA_BYTES} 字传完，CPU 没执行一条传送指令；每字只是「少一个总线周期」，与中断的「保存现场—服务—恢复」完全不是一个量级。WC 减到 0 时置溢出标志。`,
    },
    {
      show: "post",
      phase: "③ 后处理",
      desc: `WC=0 → DMAC 向 CPU 发「结束中断」。CPU 第二次介入：校验数据、决定是否继续下一块（${SETUP_US}µs）。整块下来 CPU 共花 ${COST.dmaCpuUs}µs；若用中断方式，${DMA_BYTES} 个字要 ${COST.intrCpuUs}µs（每字 ${INTR_US}µs 现场切换）——差 ${COST.intrCpuUs / COST.dmaCpuUs} 倍。`,
    },
    {
      show: "compare",
      phase: "对比中断",
      desc: "DMA 与中断的本质区别：① 中断靠程序传送（CPU 执行指令搬数），DMA 靠硬件（DMAC 控制总线搬数）；② 中断每字响应一次，DMA 每块首尾各一次；③ 中断在指令周期结束时切换程序（微观），DMA 在存取周期结束时窃取周期（更细粒度）；④ DMA 适于高速块设备（磁盘、网卡），中断适于中低速字符设备。看下图 CPU 时间线。",
    },
  ];
}

export function DmaView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {(fr.show === "transfer" || fr.show === "compare") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-muted-foreground">DMA 的 CPU</span>
            <div className="flex flex-1 gap-0.5">
              <div className="h-6 w-6 rounded-sm bg-emerald-500" title="预处理" />
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-6 flex-1 rounded-sm bg-muted" title="CPU 跑自己的程序（偶尔被窃取一个总线周期）" />
              ))}
              <div className="h-6 w-6 rounded-sm bg-emerald-500/60" title="后处理中断" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-muted-foreground">中断的 CPU</span>
            <div className="flex flex-1 gap-0.5">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="h-6 flex-1 rounded-sm bg-amber-400" title="每字一次中断服务" />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-muted-foreground">设备（相同）</span>
            <div className="flex flex-1 gap-0.5">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="h-6 flex-1 rounded-sm bg-sky-400" />
              ))}
            </div>
          </div>
        </div>
      )}
      {fr.show === "compare" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">DMA：CPU 耗时</p>
            <p className="font-mono text-lg font-bold text-emerald-600">{COST.dmaCpuUs} µs</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">中断：CPU 耗时</p>
            <p className="font-mono text-lg font-bold text-amber-600">{COST.intrCpuUs} µs</p>
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
