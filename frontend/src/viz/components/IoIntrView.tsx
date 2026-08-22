// 图解 · 程序查询 vs 中断：传 100 个字，设备每字需 100µs 准备。
// 查询方式 CPU 全程空转轮询；中断方式设备好了才叫 CPU，花 3µs 处理一个字。CPU 时间账由 ioCompare() 现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface IoCost {
  queryCpuUs: number; // 查询：CPU 占用总时长
  queryWaitUs: number; // 查询：其中空转轮询时长
  intrCpuUs: number; // 中断：CPU 占用总时长
  intrUsefulUs: number; // 中断：其中真正干活的时长
  totalUs: number; // 设备侧总耗时（两者相同）
}

/** words 个字；prepUs 设备每字准备时间；procUs 每字 CPU 处理时间 */
export function ioCompare(words: number, prepUs: number, procUs: number): IoCost {
  const totalUs = words * (prepUs + procUs);
  return {
    totalUs,
    queryCpuUs: totalUs, // 查询：准备期间 CPU 一直在轮询状态口
    queryWaitUs: words * prepUs,
    intrCpuUs: words * procUs, // 中断：只有服务程序那点时间归 CPU
    intrUsefulUs: words * procUs,
  };
}

export const IO_WORDS = 100;
export const IO_PREP = 100; // µs
export const IO_PROC = 3; // µs
const COST = ioCompare(IO_WORDS, IO_PREP, IO_PROC);

interface Frame extends VizFrame {
  show: "setup" | "query" | "intr" | "flow" | "compare";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "setup",
      phase: "设定",
      desc: `设备要往内存传 ${IO_WORDS} 个字，每字设备需 ${IO_PREP}µs 准备（机械/电子设备的节奏），CPU 处理一个字只要 ${IO_PROC}µs。矛盾在于：CPU 快、设备慢，怎么等？两种方式：程序查询（CPU 主动反复问「好了没」）与中断（设备好了主动叫 CPU）。`,
    },
    {
      show: "query",
      phase: "程序查询",
      desc: `查询方式：CPU 发出读命令后进入死循环读状态口。设备准备期间（每字 ${IO_PREP}µs）CPU 一直在空转轮询；好了传一个字（${IO_PROC}µs），再进入下一轮轮询。${IO_WORDS} 个字全程 CPU 被占 ${COST.queryCpuUs}µs，其中 ${(COST.queryWaitUs / COST.queryCpuUs * 100).toFixed(0)}% 是纯等待。CPU 与设备只能「串行」——接口最简单（不要中断逻辑），但 CPU 利用率极低。`,
    },
    {
      show: "intr",
      phase: "中断方式",
      desc: `中断方式：CPU 启动设备后回去继续执行别的程序；设备每准备好一个字，发中断请求 → CPU 在「指令周期结束时」检查中断，响应后：断点入栈、保护现场、执行 ${IO_PROC}µs 的中断服务程序、恢复现场、中断返回。${IO_WORDS} 个字只花 CPU ${COST.intrCpuUs}µs——利用率从查询的 0% 变成 ${((1 - COST.intrCpuUs / COST.totalUs) * 100).toFixed(1)}% 可跑别的。CPU 与设备并行，是并发的起点。`,
    },
    {
      show: "flow",
      phase: "中断流程",
      desc: "中断处理完整流程（大题常考排序）：① 请求：设备完成 → INTR 线拉高；② 判优/屏蔽判断；③ 响应：在指令执行周期结束、无更高级中断时，CPU 关中断、保存断点（PC/PSW 入栈）；④ 保护现场（服务程序里保存寄存器）；⑤ 执行设备服务程序（传数、清请求）；⑥ 恢复现场与断点、开中断；⑦ 中断返回。注意「关中断→保护现场」顺序，以及单重/多重中断（中断嵌套要求开中断提前到恢复现场前）。",
    },
    {
      show: "compare",
      phase: "对比",
      desc: `时间线对齐看（下图）：查询方式的 CPU 段全是「轮询+干活」；中断方式 CPU 只在绿色小段出现，其余时间可跑其他程序。但注意中断也有代价：每字一次「保存/恢复现场」开销，若设备速度快到接近 CPU，中断开销反而拖后腿——那时用 DMA（见下一节）。`,
    },
  ];
}

function Timeline({ mode }: { mode: "query" | "intr" }) {
  const segs = 8;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 text-muted-foreground">CPU</span>
        <div className="flex flex-1 gap-0.5">
          {Array.from({ length: segs }, (_, i) => {
            const busy = mode === "query" || i % 4 === 2;
            const poll = mode === "query";
            return (
              <div
                key={i}
                className={cn(
                  "h-6 flex-1 rounded-sm",
                  busy ? "bg-emerald-500" : poll ? "bg-amber-300" : "bg-muted"
                )}
                title={busy ? "处理数据" : poll ? "轮询等待" : "跑其他程序"}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 text-muted-foreground">设备</span>
        <div className="flex flex-1 gap-0.5">
          {Array.from({ length: segs }, (_, i) => (
            <div key={i} className="h-6 flex-1 rounded-sm bg-sky-400" title="准备数据" />
          ))}
        </div>
      </div>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        {mode === "query"
          ? <><span>🟨 CPU 轮询等待</span><span>🟩 CPU 处理</span></>
          : <><span>⬜ CPU 跑其他程序</span><span>🟩 中断服务</span></>}
      </div>
    </div>
  );
}

export function IoIntrView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {(fr.show === "query" || fr.show === "compare") && <Timeline mode="query" />}
      {(fr.show === "intr" || fr.show === "compare") && <Timeline mode="intr" />}
      {fr.show === "compare" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">查询：CPU 占用</p>
            <p className="font-mono text-lg font-bold text-amber-600">{COST.queryCpuUs} µs</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">中断：CPU 占用</p>
            <p className="font-mono text-lg font-bold text-emerald-600">{COST.intrCpuUs} µs</p>
          </div>
        </div>
      )}
      {fr.show === "flow" && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {["① 请求", "② 判优", "③ 响应/关中断", "④ 保护现场", "⑤ 服务程序", "⑥ 恢复现场", "⑦ 开中断", "⑧ 中断返回"].map((s) => (
            <span key={s} className="rounded border border-border bg-muted/40 px-2 py-1">{s}</span>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
