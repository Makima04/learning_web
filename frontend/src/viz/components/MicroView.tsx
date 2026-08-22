// 图解 · 硬布线 vs 微程序控制器：同一条 ADD，硬布线在固定节拍里发控制信号（快、改不动）；
// 微程序把它编成控制存储器 CM 里的一串微指令（规整、可改、慢一拍）。μ地址转移序列由 microRun() 现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface MicroStep {
  addr: number; // 微地址（硬布线时显示节拍号）
  signal: string; // 微命令（控制信号）
  effect: string;
}

/** 微程序：0/1 = 取指两条微指令；2 = LDA 执行；3 = ADD 执行。末字段「判别测试 P1」按 OP 转移 */
export const CM: { addr: number; ctrl: string; next: string }[] = [
  { addr: 0, ctrl: "PC→MAR, Read", next: "1" },
  { addr: 1, ctrl: "MDR→IR, PC+1, P1 判别", next: "由 OP 转移" },
  { addr: 2, ctrl: "Ad(IR)→ACC", next: "0" },
  { addr: 3, ctrl: "ACC+Ad(IR)→ACC", next: "0" },
];

/** op = "LDA" | "ADD"：返回微指令执行序列（含微地址） */
export function microRun(op: "LDA" | "ADD"): MicroStep[] {
  const exec = op === "LDA" ? 2 : 3;
  const steps: MicroStep[] = [
    { addr: 0, signal: CM[0]!.ctrl, effect: "PC 送 MAR，发读命令，等待主存" },
    { addr: 1, signal: CM[1]!.ctrl, effect: "取回的指令经 MDR 送 IR，PC 自动 +1；P1 字段用 OP 译码决定下个微地址" },
    { addr: exec, signal: CM[exec]!.ctrl, effect: `${op} 执行微指令：完成运算并回 ACC，下地址 0 → 回到取指` },
  ];
  return steps;
}

/** 硬布线：同一指令的节拍-控制信号表（组合逻辑直接产生，无需取微指令） */
export function hardwireRun(op: "LDA" | "ADD"): MicroStep[] {
  const base: MicroStep[] = [
    { addr: 0, signal: "T0: PC→MAR, Read", effect: "节拍 T0（时钟上升沿）" },
    { addr: 1, signal: "T1: MDR→IR, PC+1", effect: "节拍 T1" },
  ];
  const exec: MicroStep = op === "LDA"
    ? { addr: 2, signal: "T2: Ad(IR)→ACC", effect: "节拍 T2：取立即数/操作数入 ACC" }
    : { addr: 2, signal: "T2: ACC+Ad(IR)→ACC", effect: "节拍 T2：ALU 相加写回 ACC" };
  return [...base, exec];
}

interface Frame extends VizFrame {
  step: number; // 微指令/节拍序号 0..2
  mode: "micro" | "hard";
  op: "LDA" | "ADD";
}

function buildFrames(): Frame[] {
  const frames: Frame[] = [
    {
      step: 0, mode: "micro", op: "ADD",
      phase: "控制器分工",
      desc: "控制器 = 「节拍发生器 + 控制信号生成」。两种实现：硬布线——纯组合逻辑，按节拍/状态直接吐控制信号，快，但指令集一改就得重新设计电路；微程序——把每条机器指令编成一串微指令存进控制存储器 CM，像写小程序一样规整、易扩展，但每条微指令要花一个读 CM 的周期，慢。先看微程序执行 ADD。",
    },
  ];
  (["ADD", "LDA"] as const).forEach((op) => {
    const seq = microRun(op);
    seq.forEach((s, i) => {
      frames.push({
        step: i, mode: "micro", op,
        phase: `${op} · μ地址 ${s.addr}`,
        desc: `${s.signal}。${s.effect}。当前 CM 行见下表高亮。`,
      });
    });
  });
  frames.push({
    step: 2, mode: "hard", op: "ADD",
    phase: "硬布线对照",
    desc: "同一条 ADD 走硬布线：T0/T1 取指、T2 执行，控制信号由组合逻辑在节拍电位里直接给出——没有「读 CM」这一步，所以快；代价是电路固定。微程序的 CM 是 ROM，改指令 = 改微程序；RISC 指令简单规整，普遍用硬布线（CISC 常用微程序）。",
  });
  return frames;
}

export function MicroView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const seq = fr.mode === "micro" ? microRun(fr.op) : hardwireRun(fr.op);
  const cur = seq[fr.step]!;

  return (
    <div className="space-y-4">
      {fr.mode === "micro" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-medium">微地址</th>
                <th className="text-left font-medium">微命令（控制字段）</th>
                <th className="text-left font-medium">下地址 / 判别</th>
              </tr>
            </thead>
            <tbody>
              {CM.map((row) => {
                const on = row.addr === cur.addr && (row.addr < 2 || microRun(fr.op)[2]!.addr === row.addr);
                return (
                  <tr key={row.addr} className={cn("border-t font-mono", on && "bg-sky-500/15 font-bold")}>
                    <td className="py-1.5">{row.addr}</td>
                    <td className="">{row.ctrl}</td>
                    <td className="">{row.next}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-1.5">
          {hardwireRun(fr.op).map((s) => (
            <div key={s.addr} className={cn("rounded-md border px-3 py-2 font-mono text-xs", s.addr === cur.addr ? "border-sky-500 bg-sky-500/15 font-bold" : "border-border bg-muted/30")}>
              {s.signal}
              <span className="ml-2 font-sans text-[11px] text-muted-foreground">{s.effect}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {fr.mode === "micro" ? `执行流：μ0 → μ1 →（按 OP 判别）→ μ${microRun(fr.op)[2]!.addr} → μ0` : "硬布线：节拍 T0→T1→T2，无取微指令开销"}
      </p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
