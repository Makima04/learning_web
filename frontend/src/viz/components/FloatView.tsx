// 图解 · IEEE754 单精度：把 -12.75 变成 32 位 0xC14C0000。二进制、规格化、阶码偏移、隐含 1 一步一步拼。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const FX = -12.75;

export interface FloatBits {
  sign: string; // 1 位
  exp: string; // 8 位（含偏移）
  frac: string; // 23 位
  hex: string; // 0xXXXXXXXX
}

/** 精确取出 float32 的位段（用 DataView，避免 JS number 的 double 误差） */
export function floatBits(x: number): FloatBits {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, x);
  const u = dv.getUint32(0);
  return {
    sign: String((u >>> 31) & 1),
    exp: ((u >>> 23) & 0xff).toString(2).padStart(8, "0"),
    frac: (u & 0x7fffff).toString(2).padStart(23, "0"),
    hex: "0x" + u.toString(16).toUpperCase().padStart(8, "0"),
  };
}

interface FFrame extends VizFrame {
  /** 已揭示的位段：sign / exp / frac */
  reveal: ("sign" | "exp" | "frac")[];
}

function buildFloatFrames(): FFrame[] {
  const frames: FFrame[] = [];
  const bits = floatBits(FX);
  const push = (desc: string, phase: string, reveal: FFrame["reveal"]) =>
    frames.push({ desc, phase, reveal });

  push(
    `目标：写出 ${FX} 的 IEEE754 单精度（32 位）表示。三段式：符号 1 位 + 阶码 8 位 + 尾数 23 位。阶码用「移码」（真值 + 偏置 127），规格化数尾数隐含最高位的 1 不存。`,
    "初始",
    []
  );
  push(
    "① 化二进制：12.75 = 8+4+0.5+0.25 = 1100.11₂；负号另记，最后填符号位。",
    "化二进制",
    []
  );
  push(
    "② 规格化：1100.11 = 1.10011 × 2³。小数点左移 3 位，真阶码 E = 3。",
    "规格化",
    []
  );
  push(
    "③ 阶码 = E + 偏置 = 3 + 127 = 130 = 10000010₂。偏置 127（单精度）让阶码从 0~255 变成「无符号可直接比大小」，0 与 255 留作特殊值。",
    "算阶码",
    ["exp"]
  );
  push(
    "④ 尾数：1.10011 隐含整数位的 1，只存小数部分 10011，后面补 0 到 23 位 → 10011000…0。",
    "写尾数",
    ["exp", "frac"]
  );
  push(
    `⑤ 拼装：符号 ${bits.sign}（负）| 阶码 ${bits.exp} | 尾数 ${bits.frac.slice(0, 8)}… → 按字节分组得 ${bits.hex}。验证：符号 1、阶码 130−127=3、尾数 1.10011₂ = 1.59375，×2³ = 12.75，加符号 ✓。`,
    "拼装",
    ["sign", "exp", "frac"]
  );
  push(
    "特殊值要背：阶码全 0 → 非规格化数（±2^−126×0.frac，含 ±0）；阶码全 1 → 尾数 0 为 ±∞，非 0 为 NaN。范围：规格化数约 ±(2−2⁻²³)×2¹²⁷ ≈ ±3.4×10³⁸；float 与 double（11 位阶码偏置 1023、52 位尾数）精度差在尾数位数。常考：给出十六进制求值 / 给数求机器码 / 判断能否精确表示（0.1 不能——二进制小数位有限）。",
    "完成",
    ["sign", "exp", "frac"]
  );
  return frames;
}

function Bits({ bits, reveal }: { bits: FloatBits; reveal: FFrame["reveal"] }) {
  const cell = (ch: string, i: number, cls: string, show: boolean) => (
    <span
      key={i}
      className={cn(
        "grid h-7 w-5 place-items-center rounded font-mono text-xs font-bold",
        show ? cls : "bg-muted/30 text-transparent"
      )}
    >
      {show ? ch : "0"}
    </span>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-xs font-bold", reveal.includes("sign") ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>符号</span>
        <div className="flex gap-0.5">
          {bits.sign.split("").map((ch, i) =>
            cell(ch, i, reveal.includes("sign") ? "bg-rose-500 text-white" : "", reveal.includes("sign"))
          )}
        </div>
        <span className={cn("text-xs font-bold", reveal.includes("exp") ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>阶码（8 位）</span>
        <div className="flex gap-0.5">
          {bits.exp.split("").map((ch, i) =>
            cell(ch, i, reveal.includes("exp") ? "bg-emerald-600 text-white" : "", reveal.includes("exp"))
          )}
        </div>
        <span className={cn("text-xs font-bold", reveal.includes("frac") ? "text-sky-700 dark:text-sky-400" : "text-muted-foreground")}>尾数（23 位，隐含 1.）</span>
      </div>
      <div className="flex gap-0.5">
        {bits.frac.split("").map((ch, i) =>
          cell(ch, i, reveal.includes("frac") ? "bg-sky-500 text-white" : "", reveal.includes("frac"))
        )}
      </div>
    </div>
  );
}

export function FloatView() {
  const frames = useMemo(buildFloatFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const bits = floatBits(FX);

  return (
    <div className="space-y-4">
      <Bits bits={bits} reveal={fr.reveal} />
      <div className="rounded-lg border bg-muted/30 p-2 font-mono text-xs">
        {bits.hex}（十进制 {FX}）· 阶码真值 = {parseInt(bits.exp, 2) - 127} · 完整位串 {bits.sign + bits.exp + bits.frac}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
