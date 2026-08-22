// 图解 · 性能指标：主频 ≠ 速度。指令混合 CPI 加权出程序时间；A 机主频高但 CPI 也高，跑同一段程序反而未必快。
// 所有数字由 perfCalc 现算（帧里不手写结论），测试断言精确值。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface MixItem {
  name: string;
  count: number; // 指令条数
  cpi: number;
}

/** fMHz 主频 + 指令混合 → 周期数 / 执行时间(µs) / 平均 CPI / MIPS */
export function perfCalc(fMHz: number, mix: MixItem[]) {
  const cycles = mix.reduce((s, m) => s + m.count * m.cpi, 0);
  const instrs = mix.reduce((s, m) => s + m.count, 0);
  const timeUs = cycles / fMHz; // cycles / (f×10^6 Hz) 换算后恰为 µs
  const cpi = cycles / instrs;
  const mips = instrs / timeUs; // 条/µs 即 MIPS
  return { cycles, instrs, timeUs, cpi, mips };
}

/** 对比场景：同一段程序（10⁶ 条指令），两台机器 */
export const MIX_A: MixItem[] = [{ name: "全部指令", count: 1e6, cpi: 4 }]; // 主频 2GHz，CPI=4
export const MIX_B: MixItem[] = [{ name: "全部指令", count: 1e6, cpi: 2 }]; // 主频 1GHz，CPI=2
/** 指令混合场景：1GHz，三类指令 */
export const MIX_C: MixItem[] = [
  { name: "运算类", count: 1e6, cpi: 4 },
  { name: "访存类", count: 1.5e6, cpi: 3 },
  { name: "分支类", count: 0.5e6, cpi: 2 },
];

interface Frame extends VizFrame {
  show: "intro" | "ab" | "mix" | "done";
}

const RES_A = perfCalc(2000, MIX_A);
const RES_B = perfCalc(1000, MIX_B);
const RES_C = perfCalc(1000, MIX_C);

function buildFrames(): Frame[] {
  return [
    {
      show: "intro",
      phase: "概念",
      desc: "三个核心指标：主频 f（时钟每秒跳多少次，GHz = 10⁹ Hz）；CPI（一条指令平均花的时钟周期数）；MIPS（每秒执行多少百万条指令）。关系：程序时间 = 指令条数 × CPI ÷ f；MIPS = f ÷ CPI（单位 MHz 时）。注意分母是 CPI——主频高的机器如果每条指令要更多周期，未必更快。",
    },
    {
      show: "ab",
      phase: "主频陷阱",
      desc: `同一程序 10⁶ 条指令：A 机主频 2GHz 但 CPI = 4，时间 = 10⁶ × 4 ÷ 2×10⁹ = ${(RES_A.timeUs / 1000).toFixed(0)} ms；B 机主频只有 1GHz 但 CPI = 2，时间 = 10⁶ × 2 ÷ 10⁹ = ${(RES_B.timeUs / 1000).toFixed(0)} ms。${RES_A.timeUs === RES_B.timeUs ? "两者一样快——比较不同 ISA 的机器，必须同时看主频和 CPI。" : "B 更快。"}`,
    },
    {
      show: "mix",
      phase: "指令混合",
      desc: `真实程序的 CPI 是各类指令的加权平均：C 程序（右表）共 ${RES_C.instrs / 1e6}M 条指令，总周期 ${RES_C.cycles / 1e6}M，平均 CPI = ${RES_C.cycles}÷${RES_C.instrs} ≈ ${RES_C.cpi.toFixed(2)}，执行时间 = ${RES_C.cycles / 1e6}M ÷ 1000MHz = ${(RES_C.timeUs / 1000).toFixed(1)} ms，MIPS = ${RES_C.instrs / 1e6}M ÷ ${RES_C.timeUs}µs = ${RES_C.mips.toFixed(0)}。`,
    },
    {
      show: "done",
      phase: "小结",
      desc: "考试常用变形：由「时间 = 条数×CPI÷f」两边凑未知量；MIPS 大不代表单条指令快（RISC 的 MIPS 天然偏高）；基准程序（SPEC）才是公平比较。瓶颈分析：时间不变时，某类指令占比或 CPI 的变化对总时间的影响，直接按混合公式重算即可——右表就是重算器。",
    },
  ];
}

function MachineCard({ name, f, res, win }: { name: string; f: number; res: ReturnType<typeof perfCalc>; win: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", win ? "border-emerald-500 bg-emerald-500/5" : "border-border")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{name}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{f / 1000} GHz</span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">CPI</span><span className="font-mono">{res.cpi}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">总周期</span><span className="font-mono">{res.cycles / 1e6} M</span></div>
        <div className="flex justify-between font-semibold"><span>执行时间</span><span className="font-mono">{(res.timeUs / 1000).toFixed(0)} ms</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">MIPS</span><span className="font-mono">{res.mips.toFixed(0)}</span></div>
      </div>
      {win && <div className="mt-2 text-center text-[11px] text-emerald-600">同为 10⁶ 条指令</div>}
    </div>
  );
}

export function PerfView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {fr.show === "ab" || fr.show === "done" ? (
          <>
            <MachineCard name="A 机" f={2000} res={RES_A} win />
            <MachineCard name="B 机" f={1000} res={RES_B} win />
          </>
        ) : null}
        {fr.show === "mix" || fr.show === "done" ? (
          <div className="rounded-xl border p-3 md:col-span-2">
            <p className="mb-2 text-sm font-semibold">指令混合（C 程序 · 主频 1GHz）</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 text-left font-medium">指令类</th>
                  <th className="text-right font-medium">条数</th>
                  <th className="text-right font-medium">CPI</th>
                  <th className="text-right font-medium">周期</th>
                </tr>
              </thead>
              <tbody>
                {MIX_C.map((m) => (
                  <tr key={m.name} className="border-t">
                    <td className="py-1">{m.name}</td>
                    <td className="text-right font-mono">{m.count / 1e6} M</td>
                    <td className="text-right font-mono">{m.cpi}</td>
                    <td className="text-right font-mono">{((m.count * m.cpi) / 1e6).toFixed(1)} M</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1">合计</td>
                  <td className="text-right font-mono">{RES_C.instrs / 1e6} M</td>
                  <td className="text-right font-mono">≈{RES_C.cpi.toFixed(2)}</td>
                  <td className="text-right font-mono">{RES_C.cycles / 1e6} M</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              时间 {RES_C.timeUs / 1000} ms · MIPS {RES_C.mips.toFixed(0)}
            </p>
          </div>
        ) : null}
        {fr.show === "intro" && (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">
            <p className="font-mono">程序时间 = 指令条数 × CPI ÷ 主频</p>
            <p className="mt-1 font-mono">MIPS = 指令条数 ÷ 时间(µs) = 主频(MHz) ÷ CPI</p>
          </div>
        )}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
