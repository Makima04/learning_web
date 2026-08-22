// 图解 · 四种 I/O 控制方式总览（含通道）：CPU 介入次数由 ioCpuCost() 现算——
// 查询/中断按字节、DMA 按块（预+后）、通道按批（启动+完成）。4096B、块 512B 的账摆在卡片上。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export type IoMode = "query" | "intr" | "dma" | "channel";

/** 传 bytes 字节 CPU 需介入的次数 */
export function ioCpuCost(bytes: number, mode: IoMode, blockSize = 512): number {
  switch (mode) {
    case "query": return bytes; // 每字都要 CPU 亲手搬
    case "intr": return bytes; // 每字一次中断
    case "dma": return Math.ceil(bytes / blockSize) * 2; // 每块：预处理 + 完成中断
    case "channel": return 2; // 一批：启动 + 结束中断（通道执行通道程序）
  }
}

export const CH_BYTES = 4096;
const ROWS: { mode: IoMode; name: string; detail: string }[] = [
  { mode: "query", name: "程序查询", detail: "CPU 全程忙等，与设备串行" },
  { mode: "intr", name: "程序中断", detail: "每字节一次中断，并行但开销大" },
  { mode: "dma", name: "DMA", detail: "DMAC 窃取周期，每块 CPU 碰两次" },
  { mode: "channel", name: "通道", detail: "通道指令独立于 CPU，一批只碰两次" },
];

interface Frame extends VizFrame {
  hot: IoMode;
}

function buildFrames(): Frame[] {
  return [
    {
      hot: "query",
      phase: "演进主线",
      desc: `四种 I/O 方式的演进主线：CPU 越来越「甩手」。传 ${CH_BYTES} 字节（DMA 按 512B 一块），CPU 介入次数见卡片——查询 ${ioCpuCost(CH_BYTES, "query")} 次、中断 ${ioCpuCost(CH_BYTES, "intr")} 次、DMA ${ioCpuCost(CH_BYTES, "dma")} 次、通道 ${ioCpuCost(CH_BYTES, "channel")} 次。`,
    },
    {
      hot: "intr",
      phase: "中断的位置",
      desc: "中断方式的里程碑意义：CPU 与设备第一次并行。但每字节都要「保存现场—服务—恢复」，设备越快中断风暴越狠——所以高速设备必须升级到 DMA。",
    },
    {
      hot: "dma",
      phase: "DMA 的边界",
      desc: "DMA 把传送下放给硬件 DMAC，CPU 只做「配置 + 收尾」。但每台高速设备都要配一个 DMAC，且 DMAC 只会「从 A 搬到 B」这种死规则，设备多了 CPU 管理负担又回来。",
    },
    {
      hot: "channel",
      phase: "通道方式",
      desc: "通道 = 能执行「通道指令（通道程序）」的简易处理机：CPU 发一条启动指令，通道自己按通道程序控制多台设备、组织传送、处理结束；只在整批任务完成时中断 CPU 一次。CPU 与通道分时使用内存。大机（IBM 大型机）传统，微机里演化成 I/O 处理器/智能网卡思路。字节多路（低速字符，按字节交叉）、数组多路（块设备交叉）、选择通道（独占高速）三种类型。",
    },
    {
      hot: "channel",
      phase: "选择依据",
      desc: "考试问「某场景选哪种方式」：键盘/鼠标 → 中断；磁盘/SSD/网卡 → DMA；大量异构设备集中管理、追求 CPU 解放彻底 → 通道。判断依据就是这张卡的「CPU 介入粒度」。",
    },
  ];
}

export function ChannelView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROWS.map((r) => (
          <div
            key={r.mode}
            className={`rounded-xl border p-3 text-center ${fr.hot === r.mode ? "border-sky-500 bg-sky-500/5 ring-2 ring-sky-500" : "border-border"}`}
          >
            <p className="text-sm font-semibold">{r.name}</p>
            <p className="my-2 font-mono text-xl font-bold text-sky-600">{ioCpuCost(CH_BYTES, r.mode)}</p>
            <p className="text-[11px] text-muted-foreground">{r.detail}</p>
          </div>
        ))}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
