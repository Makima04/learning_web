// 图解 · I/O 软件层次与控制方式：用户系统调用 → 设备独立性软件 → 驱动 → 中断处理 → 硬件，
// 一路「向下递请求、向上递应答」；四种控制方式的 CPU 介入次数对比沿用 ioCpuCost 的现算结果。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface Layer {
  name: string;
  down: string; // 向下做什么
  up: string; // 向上做什么
}

/** I/O 软件四层（自上而下） */
export const LAYERS: Layer[] = [
  { name: "用户层软件", down: "库函数包装（printf → write 系统调用）", up: "返回结果/错误码给用户" },
  { name: "设备独立性软件", down: "统一命名、保护、缓冲、分配、设备映射（/dev/xxx → 设备号）", up: "把驱动结果规范化上交" },
  { name: "设备驱动程序", down: "把抽象请求翻译成控制器命令（寄存器读写）", up: "中断时检查状态、唤醒等待进程" },
  { name: "中断处理程序", down: "保存现场、应答控制器、清中断", up: "向上递交完成信号" },
  { name: "硬件（控制器/设备）", down: "执行 I/O，DMA/中断送回数据", up: "置状态、发中断" },
];

interface Frame extends VizFrame {
  dir: "down" | "up";
  hot: number; // LAYERS 下标
}

function buildFrames(): Frame[] {
  const frames: Frame[] = [
    {
      dir: "down", hot: 0,
      phase: "请求下行",
      desc: `用户进程要读磁盘：库函数把 read(fd, buf, n) 变成系统调用 → 设备独立性软件查 fd 对应的逻辑设备、走统一接口 → 驱动程序算柱面/扇区、向磁盘控制器写命令寄存器 → 控制器启动寻道。请求每下一层就「更具体一点」，抽象逐层剥掉。`,
    },
    {
      dir: "down", hot: 2,
      phase: "驱动与硬件",
      desc: `只有驱动知道硬件方言：寄存器地址、命令编码。控制器拿到命令后自主工作（此时 CPU 可以去跑别的进程——中断/DMA 方式），完成后发中断。`,
    },
    {
      dir: "up", hot: 3,
      phase: "应答上行",
      desc: `中断触发：中断处理程序保存现场、读控制器状态、DMA 已把数据放进缓冲 → 唤醒阻塞的 read 进程（阻塞队列 → 就绪队列）→ 进程从内核把数据拷到用户缓冲区、系统调用返回。数据路径：设备 → DMA → 内核缓冲 → 用户缓冲（两次拷贝，可被 io_uring/零拷贝优化）。`,
    },
    {
      dir: "up", hot: 1,
      phase: "设计目标",
      desc: "分层的意义：设备独立性（用户代码不关心具体设备，换盘不改程序）；统一接口（所有设备一类 sys call）；错误与重试在底层处理；缓冲/高速缓存在中间层做。考试常给「某功能属于哪层」——映射命名/保护/缓冲 = 设备独立性层；寄存器级操作 = 驱动；保存现场/唤醒进程 = 中断处理。",
    },
  ];
  return frames;
}

export function IoLayerView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-3">
      {LAYERS.map((l, i) => (
        <div
          key={l.name}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-3 transition",
            fr.hot === i ? "border-sky-500 bg-sky-500/5 ring-2 ring-sky-500" : "border-border"
          )}
        >
          <span className="w-32 shrink-0 text-sm font-semibold">{l.name}</span>
          <span className="flex-1 text-xs">{fr.dir === "down" ? `↓ ${l.down}` : `↑ ${l.up}`}</span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        {fr.dir === "down" ? "▼ 请求自上而下逐层具体化" : "▲ 应答/中断自下而上逐层抽象化"}
      </p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
