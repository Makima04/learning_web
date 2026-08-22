// 图解 · 指令格式与寻址方式：同一条「取一个操作数」的指令，8 种寻址方式的 EA 与访存次数全由 eaModes() 现算。
// 场景自洽：形式地址 A=800，M[800]=1000，M[1000]=42，殊途同归大多取到 42。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const A = 800;
export const PC0 = 2000; // 该指令在主存 2000 号单元
export const R0 = 1000; // 寄存器寻址演示用
export const IX = 200; // 变址寄存器
export const BR = 1300; // 基址寄存器
export const MEM: Record<number, number> = { 800: 1000, 1000: 42, 2100: 42, 2800: 42 };

export interface EaItem {
  mode: string;
  ea: number | null; // null = 无 EA（操作数直接在指令/寄存器里）
  operand: number;
  memAccess: number; // 取操作数的访存次数（不含取指令）
  formula: string;
}

/** 8 种寻址方式的 EA / 操作数 / 访存次数 */
export function eaModes(): EaItem[] {
  const m = (n: number) => MEM[n] ?? 0;
  return [
    { mode: "立即寻址", ea: null, operand: A, memAccess: 0, formula: "操作数 = A 本身（#800）" },
    { mode: "直接寻址", ea: A, operand: m(A), memAccess: 1, formula: `EA = A = ${A}` },
    { mode: "一次间接寻址", ea: m(A), operand: m(m(A)), memAccess: 2, formula: `EA = (A) = M[${A}] = ${m(A)}` },
    { mode: "寄存器寻址", ea: null, operand: R0, memAccess: 0, formula: "操作数 = R0" },
    { mode: "寄存器间接寻址", ea: R0, operand: m(R0), memAccess: 1, formula: `EA = (R0) = ${R0}` },
    { mode: "相对寻址", ea: PC0 + A, operand: m(PC0 + A), memAccess: 1, formula: `EA = (PC)+A = ${PC0}+${A} = ${PC0 + A}` },
    { mode: "基址寻址", ea: BR + A, operand: m(BR + A), memAccess: 1, formula: `EA = (BR)+A = ${BR}+${A} = ${BR + A}` },
    { mode: "变址寻址", ea: IX + A, operand: m(IX + A), memAccess: 1, formula: `EA = (IX)+A = ${IX}+${A} = ${IX + A}` },
  ];
}

/** 扩展操作码：16 位指令 = 4 位操作码 + 3×4 位地址，各段留 1111 扩展 → 15/15/15/16 条 */
export function expandOpcodes(): { three: number; two: number; one: number; zero: number; total: number } {
  const three = 15, two = 15, one = 15, zero = 16; // 最后一段不扩展，4 位全用
  return { three, two, one, zero, total: three + two + one + zero };
}

interface Frame extends VizFrame {
  step: number; // -1 开场；0..7 对应 eaModes()；8 扩展操作码；9 小结
}

function buildFrames(): Frame[] {
  const modes = eaModes();
  const ex = expandOpcodes();
  const frames: Frame[] = [
    {
      step: -1,
      phase: "指令格式",
      desc: `指令字 = 操作码 OP + 寻址特征 + 形式地址 A。设某条「取操作数」指令存于主存 ${PC0} 号单元，形式地址 A = ${A}。寄存器：R0 = ${R0}，变址 IX = ${IX}，基址 BR = ${BR}。主存：M[800] = 1000、M[1000] = 42、M[2100] = 42、M[2800] = 42。下面把 8 种寻址方式逐个走一遍——EA（有效地址）在哪、取到的操作数是什么、额外访存几次。`,
    },
  ];
  modes.forEach((m, i) => {
    frames.push({
      step: i,
      phase: m.mode,
      desc: `${m.formula}。${m.ea != null ? `有效地址 EA = ${m.ea}，从主存取出操作数 ${m.operand}，访存 ${m.memAccess} 次。` : `操作数直接就是 ${m.operand}，取操作数不访存（${m.memAccess} 次访存）。`}${m.mode === "相对寻址" ? "相对寻址的 EA 随指令位置浮动——这正是它支持「位置无关代码」、跳转指令写 ±位移的原因。" : ""}${m.mode === "基址寻址" ? "基址面向系统（操作系统定位程序装入基点），变址面向用户（数组遍历：A 当基址、IX 当下标）。" : ""}${m.mode === "一次间接寻址" ? "间接寻址扩大了寻址范围（EA 的位宽不再受 A 限制），代价是每多一层间址就多一次访存。" : ""}`,
    });
  });
  frames.push({
    step: 8,
    phase: "扩展操作码",
    desc: `操作码不定长怎么办？扩展操作码：16 位指令、4 位基本操作码。三地址指令用 0000~1110（15 条，1111 留作扩展标志）；二地址再借 4 位 → 15 条；一地址 → 15 条；零地址 1111 1111 1111 **** → 16 条。合计 ${ex.total} 条。规则：短码不能是长码的前缀（保留码做扩展）。`,
  });
  frames.push({
    step: 9,
    phase: "小结",
    desc: `访存次数（取操作数）：立即/寄存器 0 次 < 直接/寄存器间接/相对/基址/变址 1 次 < 间接 2 次。大题常考：① 给机器码求 EA 与操作数；② 问「执行一条指令共访存几次」= 取指 1 次 + 取操作数次（间址再 +1）；③ 扩展操作码算指令条数。`,
  });
  return frames;
}

const MODES = eaModes();

function MemChain({ m }: { m: EaItem }) {
  const cells: { label: string; v: number | string; on: boolean }[] = [
    { label: "A", v: A, on: m.ea === A || m.ea == null },
    { label: "M[800]", v: MEM[800]!, on: m.ea === 800 || m.ea === 1000 },
    { label: "M[1000]", v: MEM[1000]!, on: m.ea === 1000 },
    { label: "M[2100]", v: MEM[2100]!, on: m.ea === 2100 },
    { label: "M[2800]", v: MEM[2800]!, on: m.ea === 2800 },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {cells.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground">→</span>}
          <div
            className={cn(
              "rounded-md border px-2.5 py-1 text-center",
              c.on ? "border-sky-500 bg-sky-500/15" : "border-border bg-muted/30"
            )}
          >
            <div className="text-[10px] text-muted-foreground">{c.label}</div>
            <div className="font-mono text-sm font-bold">{c.v}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function IsaView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const mode = fr.step >= 0 && fr.step < MODES.length ? MODES[fr.step]! : null;
  const ex = expandOpcodes();

  return (
    <div className="space-y-4">
      {fr.step === -1 && (
        <div className="rounded-xl border border-dashed p-4 text-center font-mono text-sm">
          | 操作码 OP | 寻址特征 Mod | 形式地址 A = {A} |<br />
          <span className="text-xs text-muted-foreground">指令存于主存 {PC0} 号单元（该指令取出后 PC 自动 +1）</span>
        </div>
      )}
      {mode && (
        <div className="space-y-3">
          <MemChain m={mode} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-1 font-mono">{mode.formula}</span>
            {mode.ea != null && <span className="rounded bg-sky-500/15 px-2 py-1 font-mono text-sky-600">EA = {mode.ea}</span>}
            <span className="rounded bg-emerald-600 px-2 py-1 font-mono text-white">操作数 = {mode.operand}</span>
            <span className="rounded bg-muted px-2 py-1 font-mono">访存 {mode.memAccess} 次</span>
          </div>
        </div>
      )}
      {fr.step === 8 && (
        <div className="rounded-xl border p-3 font-mono text-xs leading-6">
          <div>三地址：0000 **** **** **** ～ 1110 **** **** ****（{ex.three} 条）</div>
          <div>二地址：1111 0000 **** **** ～ 1111 1110 **** ****（{ex.two} 条）</div>
          <div>一地址：1111 1111 0000 **** ～ 1111 1111 1110 ****（{ex.one} 条）</div>
          <div>零地址：1111 1111 1111 0000 ～ 1111 1111 1111 1111（{ex.zero} 条）</div>
          <div className="font-bold">合计 {ex.total} 条</div>
        </div>
      )}
      {fr.step === 9 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-medium">寻址方式</th>
              <th className="font-medium">EA</th>
              <th className="font-medium">操作数</th>
              <th className="font-medium">取数访存</th>
            </tr>
          </thead>
          <tbody>
            {MODES.map((m) => (
              <tr key={m.mode} className="border-t">
                <td className="py-1">{m.mode}</td>
                <td className="text-center font-mono">{m.ea ?? "—"}</td>
                <td className="text-center font-mono">{m.operand}</td>
                <td className="text-center font-mono">{m.memAccess}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
