// 图解 · 缓冲与 SPOOLing：单缓冲 vs 双缓冲的流水线时间由 bufferSim() 逐事件模拟现算
//（T=100 读入 / M=50 换出 / C=80 处理，5 块）；SPOOLing 帧讲「独占设备改造成共享」。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const T_READ = 100; // 设备把一块写入缓冲区 µs
export const M_MOVE = 50; // OS 把缓冲区数据搬到用户工作区 µs
export const C_PROC = 80; // CPU 处理一块 µs
export const N_BLOCKS = 5;

export interface BufferEvent {
  block: number;
  kind: "fill" | "move" | "proc";
  buf: number;
  start: number;
  end: number;
}

/** 事件级模拟：单缓冲（1 块轮流）vs 双缓冲（2 块交替）。返回全部事件与总耗时 */
export function bufferSim(mode: "single" | "double", n = N_BLOCKS): { events: BufferEvent[]; total: number } {
  const events: BufferEvent[] = [];
  const bufFree = mode === "single" ? [0] : [0, 0]; // 各缓冲可被填充的时刻
  let devFree = 0;
  let cpuFree = 0;
  for (let k = 0; k < n; k++) {
    const buf = mode === "single" ? 0 : k % 2;
    const fillStart = Math.max(devFree, bufFree[buf]!);
    const fillEnd = fillStart + T_READ;
    events.push({ block: k + 1, kind: "fill", buf, start: fillStart, end: fillEnd });
    devFree = fillEnd;
    const moveEnd = fillEnd + M_MOVE;
    events.push({ block: k + 1, kind: "move", buf, start: fillEnd, end: moveEnd });
    bufFree[buf] = moveEnd;
    const procStart = Math.max(cpuFree, moveEnd);
    const procEnd = procStart + C_PROC;
    events.push({ block: k + 1, kind: "proc", buf, start: procStart, end: procEnd });
    cpuFree = procEnd;
  }
  return { events, total: Math.max(...events.map((e) => e.end)) };
}

const SINGLE = bufferSim("single");
const DOUBLE = bufferSim("double");

interface Frame extends VizFrame {
  show: "setup" | "single" | "double" | "spool";
}

function buildFrames(): Frame[] {
  const perSingle = (SINGLE.total / N_BLOCKS).toFixed(0);
  return [
    {
      show: "setup",
      phase: "为什么要缓冲",
      desc: `缓和 CPU 与设备速度差（设备慢 3 个数量级）、减少中断次数（攒一块再交）、解决数据粒度不匹配（设备按字节产、进程按块要）。参数：设备写一块入缓冲 T=${T_READ}µs，OS 从缓冲搬到用户区 M=${M_MOVE}µs，CPU 处理一块 C=${C_PROC}µs，共 ${N_BLOCKS} 块。注意 M 必须与设备串行（同一块缓冲不能边写边搬），C 可与下一块的 T 并行。`,
    },
    {
      show: "single",
      phase: "单缓冲",
      desc: `一块缓冲轮流「装满→搬空」。事件模拟（见时间轴）：第 k 块的 T 必须等第 k−1 块的 M 结束（缓冲腾空）才能开始；总耗时 ${SINGLE.total}µs，平均每块 ${perSingle}µs。稳态周期 = max(T, C) + M = ${Math.max(T_READ, C_PROC) + M_MOVE}µs。瓶颈：设备与「搬运」串行。`,
    },
    {
      show: "double",
      phase: "双缓冲",
      desc: `两块缓冲交替：设备写 A 时 CPU 从 B 搬+处理，写满即换。模拟总耗时 ${DOUBLE.total}µs（单缓冲 ${SINGLE.total}µs）——设备与 CPU 的并行度更高，稳态周期 = max(T, M+C) = ${Math.max(T_READ, M_MOVE + C_PROC)}µs。设备比 CPU 慢时（T 大）靠缓冲「存货」；设备快时瓶颈回到 CPU。再往下是「缓冲池」：多个缓冲组成队列，按需分配收容/提取。`,
    },
    {
      show: "spool",
      phase: "SPOOLing",
      desc: `缓冲思想的极致：用磁盘上的「输入井/输出井」+ 内存缓冲 + 假脱机进程，把独占设备改造成共享。打印机例子：各进程的打印数据先进输出井排队，SPOOLing 进程慢慢往打印机打——N 个用户「同时」用一台物理打印机，互不阻塞。三件套：输入/输出井（磁盘）、输入/输出缓冲（内存）、假脱机管理进程。经典题：判断「让一台打印机同时服务多个进程」用的技术 = SPOOLing。`,
    },
  ];
}

function Timeline({ ev, total }: { ev: BufferEvent[]; total: number }) {
  const rows = [
    { key: "fill", label: "设备→缓冲" },
    { key: "move", label: "缓冲→用户" },
    { key: "proc", label: "CPU 处理" },
  ] as const;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-muted-foreground">{r.label}</span>
          <div className="relative h-5 flex-1 rounded border border-border bg-muted/30">
            {ev
              .filter((e) => e.kind === r.key)
              .map((e, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute top-0 h-full overflow-hidden text-center text-[9px] font-bold leading-5 text-white",
                    r.key === "fill" ? "bg-sky-500" : r.key === "move" ? "bg-amber-400 text-amber-900" : "bg-emerald-500"
                  )}
                  style={{ left: `${(e.start / total) * 100}%`, width: `${((e.end - e.start) / total) * 100}%` }}
                >
                  B{e.block}{r.key !== "move" && e.kind === "fill" ? `(${e.buf + 1})` : ""}
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end text-[10px] text-muted-foreground">总 {total}µs</div>
    </div>
  );
}

export function BufferView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "single" && <Timeline ev={SINGLE.events} total={SINGLE.total} />}
      {fr.show === "double" && <Timeline ev={DOUBLE.events} total={DOUBLE.total} />}
      {fr.show === "spool" && (
        <div className="rounded-xl border p-3 text-xs leading-6">
          <div className="flex flex-wrap items-center gap-2">
            {["进程1", "进程2", "进程3"].map((pr) => (
              <span key={pr} className="rounded border border-border bg-muted/50 px-2 py-1">{pr}</span>
            ))}
            <span className="text-muted-foreground">→ 输出井（磁盘队列）→</span>
            <span className="rounded border border-sky-400 bg-sky-500/10 px-2 py-1">SPOOLing 进程</span>
            <span className="text-muted-foreground">→</span>
            <span className="rounded border border-emerald-500 bg-emerald-500/10 px-2 py-1">打印机（独占）</span>
          </div>
          <p className="mt-2 text-muted-foreground">独占设备 → 逻辑上的共享设备；用户进程写完井就返回，不必等纸打完</p>
        </div>
      )}
      {(fr.show === "single" || fr.show === "double") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">单缓冲 5 块</p>
            <p className="font-mono text-lg font-bold text-amber-600">{SINGLE.total} µs</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">双缓冲 5 块</p>
            <p className="font-mono text-lg font-bold text-emerald-600">{DOUBLE.total} µs</p>
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
