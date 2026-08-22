// 图解 · ALU 加减法器与溢出：补码加减统一为加法（减法 = 加补码取反+1，sub 信号控制异或门）。
// 溢出判断全部现算：单符号位 V = 最高位进位输入 ⊕ 进位输出；双符号位 01 正溢 / 10 负溢。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface AddSub {
  bits: string; // 8 位结果（补码）
  result: number; // 真值（溢出后按补码回卷）
  v: boolean; // 溢出
  sub: boolean;
  /** 最高位的进位输入/输出 */
  cinMsb: number;
  coutMsb: number;
}

/** 8 位补码加减：sub=true 计算 a-b。进位链逐位模拟，V = cin(MSB) ⊕ cout(MSB) */
export function addSub8(a: number, b: number, sub = false): AddSub {
  const A = a & 0xff;
  const B = (sub ? ~b : b) & 0xff;
  let c = sub ? 1 : 0;
  const bits: number[] = [];
  const carries: number[] = [];
  for (let i = 0; i < 8; i++) {
    const ai = (A >> i) & 1;
    const bi = (B >> i) & 1;
    bits.push(ai ^ bi ^ c);
    c = (ai & bi) | (ai & c) | (bi & c);
    carries.push(c);
  }
  const v = (carries[6]! ^ carries[7]!) === 1;
  const bs = [...bits].reverse().join("");
  return {
    bits: bs,
    result: (parseInt(bs, 2) << 24) >> 24,
    v,
    sub,
    cinMsb: carries[6]!,
    coutMsb: carries[7]!,
  };
}

/** 双符号位（变形补码）：符号位复制成两位（共 9 位）相加，结果前两位 01=正溢、10=负溢 */
export function dualSign(a: number, b: number, sub = false): "00" | "01" | "10" | "11" {
  const ext = (x: number) => {
    const v = x & 0xff;
    const s = (v >> 7) & 1;
    return (s << 8) | v;
  };
  const sum = (ext(a) + ((sub ? ~ext(b) : ext(b)) & 0x1ff) + (sub ? 1 : 0)) & 0x1ff;
  return sum.toString(2).padStart(9, "0").slice(0, 2) as "00" | "01" | "10" | "11";
}

const CASES = [
  { a: 50, b: 25, sub: false },
  { a: 96, b: 96, sub: false },
  { a: -96, b: -96, sub: false },
  { a: 20, b: 80, sub: true },
];

function buildFrames(): Frame[] {
  const okCase = CASES[0]!;
  const rOk = addSub8(okCase.a, okCase.b);
  const ovCase = CASES[1]!;
  const rOv = addSub8(ovCase.a, ovCase.b);
  const negCase = CASES[2]!;
  const rNeg = addSub8(negCase.a, negCase.b);
  const subCase = CASES[3]!;
  const rSub = addSub8(subCase.a, subCase.b, true);
  const dsPos = dualSign(96, 96);
  const dsNeg = dualSign(-96, -96);

  const frames: Frame[] = [
    {
      show: 0,
      phase: "结构",
      desc: "补码加减法器：B 端每个位经异或门，sub=1 时取反并在最低位加 1——减法就这样变成「加补码」。最高位（符号位）的进位输入与输出异或即溢出标志 V（下排小字是每位的进位输出）。先看正常加法：",
    },
    {
      show: 0,
      phase: "正常加法",
      desc: `${okCase.a} + ${okCase.b}：逐位相加，结果 ${rOk.bits} = ${rOk.result}。两正数相加结果仍为正，V = ${rOk.cinMsb} ⊕ ${rOk.coutMsb} = ${Number(rOk.v)}，无溢出。`,
    },
    {
      show: 1,
      phase: "正溢",
      desc: `${ovCase.a} + ${ovCase.b}：0110 0000 + 0110 0000 逐位加出来是 ${rOv.bits}——两个正数算出「负数」${rOv.result}！符号位出现了进位输入 ${rOv.cinMsb} 与进位输出 ${rOv.coutMsb} 不一致，V = 1，正溢出（结果超出 +127）。`,
    },
    {
      show: 2,
      phase: "负溢",
      desc: `${negCase.a} + ${negCase.b}：和为 -192，超出 -128，补码回卷成 ${rNeg.result}。进位输入 ${rNeg.cinMsb} ⊕ 进位输出 ${rNeg.coutMsb} = ${Number(rNeg.v)}，负溢出。同号相加才可能溢出——异号相加必然不溢。`,
    },
    {
      show: 3,
      phase: "双符号位",
      desc: `双符号位（变形补码）：把符号位复制成两位再算。96+96 结果双符号位 ${dsPos}（正溢）；-96-96 结果 ${dsNeg}（负溢）；${dsPos === "01" && dsNeg === "10" ? "01 = 正溢、10 = 负溢、00/11 = 无溢出——两位符号不一致即溢出，这是大题里最常用的判据。" : ""}`,
    },
    {
      show: 3,
      phase: "减法",
      desc: `${subCase.a} - ${subCase.b}：sub=1，B=${subCase.b}（0101 0000）各位取反得 1010 1111，最低位 +1 → ${((~80) & 0xff).toString(2).padStart(8, "0")} 即 [-80]补，加得 ${rSub.bits} = ${rSub.result}，V = ${Number(rSub.v)} 无溢出。加减法共用一套加法器，这就是补码的价值。`,
    },
    {
      show: -1,
      phase: "小结",
      desc: "溢出只有三种可能：正+正、负+负、异号相减——本质是「真实的和超出表示范围」。硬件判据：V = 符号位进位输入 ⊕ 进位输出（或双符号位不一致）。注意：进位/借位 C 与溢出 V 是两回事，C 属于无符号数范畴。逐位演示看下方各例的进位链。",
    },
  ];
  return frames;
}

interface Frame extends VizFrame {
  show: number; // CASES 下标；-1 = 收尾
}

function CasePanel({ c }: { c: { a: number; b: number; sub: boolean } }) {
  const r = addSub8(c.a, c.b, c.sub);
  const aB = (c.a & 0xff).toString(2).padStart(8, "0");
  const bB = ((c.sub ? ~c.b : c.b) & 0xff).toString(2).padStart(8, "0");
  const rows = [
    { label: `A = ${c.a}`, s: aB, dim: false },
    { label: c.sub ? `B 取反 = ${c.b} 的补码` : `B = ${c.b}`, s: bB, dim: false },
    { label: "Σ", s: r.bits, dim: false },
  ];
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">
          {c.a} {c.sub ? "−" : "+"} {c.b}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", r.v ? "bg-rose-500 text-white" : "bg-emerald-600 text-white")}>
          {r.v ? "溢出 V=1" : "无溢出"}
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="mb-1 flex items-center gap-2">
          <span className="w-28 shrink-0 text-right text-[11px] text-muted-foreground">{row.label}</span>
          <div className="flex gap-0.5">
            {row.s.split("").map((bit, i) => (
              <span
                key={i}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold",
                  i === 0 ? "border border-sky-400" : "border border-border",
                  row.label === "Σ" && r.v ? "bg-rose-500/15 text-rose-600" : "bg-muted/40"
                )}
              >
                {bit}
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        结果真值：{r.result}（按补码解释）
      </p>
    </div>
  );
}

export function AluView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {CASES.map((c, i) => (
          <div key={i} className={cn(fr.show === i && "ring-2 ring-sky-500 rounded-xl")}>
            <CasePanel c={c} />
          </div>
        ))}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
