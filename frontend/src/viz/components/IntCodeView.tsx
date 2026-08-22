// 图解 · 定点数原码/反码/补码/移码：以 -45 为例走「原码 → 反码 → 补码 → 移码」四步，
// 每步高亮发生翻转的位。边界值（±127 / -128）由 intEncodings 现算，不手写结论。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface IntEnc {
  orig: string | null; // 原码（-128 无原码）
  inv: string | null; // 反码
  comp: string; // 补码（总有）
  shift: string; // 移码 = 补码符号位取反
  hex: string;
}

export function intEncodings(x: number, bits = 8): IntEnc {
  const pad = (n: number) => (n >>> 0).toString(2).padStart(bits, "0").slice(-bits);
  const comp = pad(x & 0xff);
  let orig: string | null;
  let inv: string | null;
  if (x >= 0) {
    orig = pad(x);
    inv = pad(x);
  } else {
    const mag = -x;
    if (mag > 2 ** (bits - 1) - 1) {
      orig = null; // 数值位放不下（如 8 位 -128：|x|=128 超 7 位）
      inv = null;
    } else {
      orig = `1${pad(mag).slice(1)}`;
      // 反码 = 原码数值位取反
      inv = "1" + pad(mag).slice(1).split("").map((b) => (b === "0" ? "1" : "0")).join("");
    }
  }
  const shift = (comp[0] === "0" ? "1" : "0") + comp.slice(1);
  return { orig, inv, comp, shift, hex: `0x${(x & 0xff).toString(16).toUpperCase().padStart(2, "0")}` };
}

const X = -45;
const ENC = intEncodings(X);

interface Frame extends VizFrame {
  code: "orig" | "inv" | "comp" | "shift";
  /** 与上一步相比翻转的位下标 */
  changed: number[];
}

function diff(a: string, b: string): number[] {
  return a.split("").flatMap((c, i) => (c !== b[i] ? [i] : []));
}

function buildFrames(): Frame[] {
  const comp = ENC.comp!;
  return [
    {
      phase: "原码",
      code: "orig",
      changed: [],
      desc: `求 ${X} 的原码：符号位 1（负数）+ 数值位 ${(-X).toString(2).padStart(7, "0")}（45 = 101101）→ ${ENC.orig}。原码直观，但 0 有 ±0 两种表示，且加法器不能直接算减法。`,
    },
    {
      phase: "反码",
      code: "inv",
      changed: diff(ENC.orig!, ENC.inv!),
      desc: `反码 = 原码的数值位（蓝色位）逐位取反，符号位不动 → ${ENC.inv}。正数的原、反、补码相同。反码只是求补码的中间站。`,
    },
    {
      phase: "补码",
      code: "comp",
      changed: diff(ENC.inv!, comp),
      desc: `补码 = 反码 + 1（末位加 1 产生进位，逐位翻转直到第一个 0）→ ${comp}，即 ${ENC.hex}。补码把减法变成加法（A - B = A + [-B]补），且 0 表示唯一。已知补码求真值：符号位权值取负：${comp} = -128 + ${parseInt(comp, 2) - 128}×1 = ${X}。`,
    },
    {
      phase: "移码",
      code: "shift",
      changed: [0],
      desc: `移码 = 补码符号位取反 → ${ENC.shift}。移码的大小顺序与真值一致（可当无符号数直接比较），用于浮点数的阶码。补码 10000000(-128) 的移码是 00000000。`,
    },
    {
      phase: "对比",
      code: "comp",
      changed: [],
      desc: `四码对比与表示范围（8 位）：正数四码中除移码外全相同；[-128]补 = 10000000 但没有原码/反码（真值需要 9 位才能既放符号又放 128）。范围：原码/反码 -127～+127（各含 ±0）；补码/移码 -128～+127（0 唯一）。上表右侧由 intEncodings 逐值现算。`,
    },
  ];
}

const CODE_LABEL: Record<Frame["code"], string> = { orig: "原码", inv: "反码", comp: "补码", shift: "移码" };

function BitRow({ label, s, changed }: { label: string; s: string; changed: number[] }) {
  const ch = new Set(changed);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {s.split("").map((b, i) => (
          <span
            key={i}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded font-mono text-sm font-bold",
              i === 0 ? "border border-sky-400 text-sky-600" : "border border-border",
              ch.has(i) ? "bg-amber-500 text-white" : "bg-muted/40"
            )}
            style={ch.has(i) ? { borderColor: C.warn } : undefined}
          >
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

export function IntCodeView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const cur = ENC[fr.code]!;
  const sample = [45, -1, 127, -128];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="space-y-2 lg:w-[58%]">
          <p className="text-xs text-muted-foreground">
            求 {X} 的四种机器码（第一位蓝框 = 符号位，黄色 = 本步翻转的位）
          </p>
          <BitRow label={CODE_LABEL[fr.code]} s={cur} changed={fr.changed} />
          {fr.code !== "orig" && (
            <p className="font-mono text-xs text-muted-foreground">
              原码 {ENC.orig} → 反码 {ENC.inv} → 补码 {ENC.comp}（{ENC.hex}）→ 移码 {ENC.shift}
            </p>
          )}
        </div>
        <div className="flex-1">
          <p className="mb-1 text-xs text-muted-foreground">典型值速查（现算）</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-medium">真值</th>
                <th className="font-medium">原码</th>
                <th className="font-medium">反码</th>
                <th className="font-medium">补码</th>
                <th className="font-medium">移码</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((v) => {
                const e = intEncodings(v);
                return (
                  <tr key={v} className={cn("border-t font-mono", v === X && "bg-sky-500/10 font-bold")}>
                    <td className="py-1 text-left font-sans">{v}</td>
                    <td>{e.orig ?? "—"}</td>
                    <td>{e.inv ?? "—"}</td>
                    <td>{e.comp}</td>
                    <td>{e.shift}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
