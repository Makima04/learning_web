// 图解 · 校验码：海明码（分组偶校验 + 纠一位错）与 CRC（模 2 除法）。
// 核心值已用脚本核对：海明(1010)=1011010、翻转第 3 位→S=3；CRC(M=10110,G=10011)=1111。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

/** 生成海明码：数据位依次放入非 2^k 位置，偶校验 */
export function hammingCode(data: number[]): { code: number[]; groups: Record<number, number[]> } {
  // 找出所有非 2^k 的位置（数据位槽），取前 n 个
  const positions: number[] = [];
  for (let p = 3; positions.length < data.length; p++) {
    if ((p & (p - 1)) !== 0) positions.push(p);
  }
  const len = positions.at(-1)!;
  const code: number[] = new Array(len).fill(0);
  data.forEach((bit, i) => (code[positions[i]! - 1] = bit));
  const groups: Record<number, number[]> = {};
  for (const pk of [1, 2, 4, 8].filter((x) => x <= len)) {
    const cover: number[] = [];
    for (let i = 1; i <= len; i++) if (i & pk && i !== pk && code[i - 1] === 1) cover.push(i);
    code[pk - 1] = cover.length % 2; // 偶校验：连同校验位共偶数个 1
    groups[pk] = cover;
  }
  return { code, groups };
}

/** 校验：返回症候字 S（0=无错，否则 S = 出错位号） */
export function hammingCheck(code: number[]): number {
  let s = 0;
  for (const pk of [1, 2, 4, 8]) {
    if (pk > code.length) break;
    let x = 0;
    for (let i = 1; i <= code.length; i++) if (i & pk) x ^= code[i - 1]!;
    if (x) s += pk;
  }
  return s;
}

/** CRC 模 2 除法余数（位串数组） */
export function crcRem(msg: number[], g: number[]): number[] {
  const m = [...msg, ...new Array(g.length - 1).fill(0)];
  for (let i = 0; i <= m.length - g.length; i++) {
    if (m[i]) for (let j = 0; j < g.length; j++) m[i + j] ^= g[j]!;
  }
  return m.slice(-(g.length - 1));
}

/** 模 2 除法竖式的每一行（供动画展示） */
export function crcSteps(msg: number[], g: number[]): { divisorAt: number; state: number[] }[] {
  const m = [...msg, ...new Array(g.length - 1).fill(0)];
  const rows: { divisorAt: number; state: number[] }[] = [];
  for (let i = 0; i <= m.length - g.length; i++) {
    if (m[i]) {
      for (let j = 0; j < g.length; j++) m[i + j] ^= g[j]!;
      rows.push({ divisorAt: i, state: [...m] });
    }
  }
  return rows;
}

const DATA = [1, 0, 1, 0];
const HM = hammingCode(DATA);
const CODE = HM.code;
const RECV = [...CODE];
RECV[2] = RECV[2]! ^ 1; // 第 3 位出错
const SYN = hammingCheck(RECV);

const MSG = [1, 0, 1, 1, 0];
const GX = [1, 0, 0, 1, 1];
const REM = crcRem(MSG, GX);
const TX = [...MSG, ...REM];

interface Frame extends VizFrame {
  show: "h-place" | "h-p1" | "h-p2" | "h-p4" | "h-check" | "c-div" | "c-verify";
  /** 海明：当前校验组覆盖的位号 */
  cover?: number[];
  /** CRC：当前竖式行 */
  row?: number;
}

function bitLabel(i: number): string {
  const isP = (i & (i - 1)) === 0;
  return isP ? `P${i}` : `D`;
}

function buildFrames(): Frame[] {
  const frames: Frame[] = [
    {
      show: "h-place",
      phase: "海明·布局",
      desc: `4 位数据 ${DATA.join("")} 要变成海明码：校验位 P 放在 2ᵏ 位置（1、2、4、8…），数据位 D 从左到右填其余位置。n 位数据需 k 位校验位，满足 2ᵏ ≥ n+k+1（4 位数据 → 3 位校验 → 7 位码字）。`,
    },
  ];
  ([1, 2, 4] as const).forEach((pk) => {
    frames.push({
      show: `h-p${pk}` as Frame["show"],
      phase: `海明·P${pk}`,
      cover: HM.groups[pk]!,
      desc: `P${pk} 校验「位号二进制第 ${Math.log2(pk)} 位为 1」的那些位置：${HM.groups[pk]!.join("、")}。偶校验要求这一组 1 的个数为偶数，目前数据位里有 ${HM.groups[pk]!.filter((i) => CODE[i - 1] === 1).length} 个 1，所以 P${pk} = ${CODE[pk - 1]}。`,
    });
  });
  frames.push({
    show: "h-check",
    phase: "海明·纠错",
    desc: `发送码字 ${CODE.join("")}。传输中第 3 位翻转，收到 ${RECV.join("")}。重新分组异或：S₁、S₂、S₄ 分别为 ${SYN & 1}、${(SYN >> 1) & 1}、${(SYN >> 2) & 1} → S = S₄S₂S₁ = ${SYN.toString(2).padStart(3, "0")}₂ = ${SYN}，直接指出第 ${SYN} 位出错，取反即纠回。海明码「检一位错并纠一位错」；要检 2 位错需再加一位全局奇偶位。`,
  });
  frames.push({
    show: "c-div",
    phase: "CRC·发送方",
    desc: `发送方：M = ${MSG.join("")} 后面补 ${GX.length - 1} 个 0（生成多项式 ${GX.join("")} 共 ${GX.length} 位），对 G 做模 2 除法（异或，不借位）。竖式见下：每一步把 G 对齐当前最高位的 1 异或。余数 ${REM.join("")} 替换掉补的 0 → 发送 ${TX.join("")}。`,
  });
  frames.push({
    show: "c-verify",
    phase: "CRC·接收方",
    desc: `接收方把收到的 ${TX.length} 位整体再除以 G：余数为 0 → 认为无错（若任何一位出错，余数必非 0）。CRC 只检错不纠错；r 位校验码可检出所有 ≤r 位的突发错误，以太网 FCS 用 32 位 CRC。海明重「纠」，CRC 重「检」，这是两者的分工。`,
  });
  return frames;
}

function HamPanel({ cover, phase }: { cover?: number[]; phase: string }) {
  const cov = new Set(cover ?? []);
  const checking = phase.startsWith("海明");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {CODE.map((b, i) => {
          const pos = i + 1;
          const on = cov.has(pos);
          const isP = (pos & (pos - 1)) === 0;
          return (
            <div key={i} className="text-center">
              <div className="text-[10px] text-muted-foreground">{bitLabel(pos)}<sub>{pos}</sub></div>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded border font-mono text-sm font-bold",
                  on ? "border-amber-500 bg-amber-500 text-white" : isP ? "border-sky-400 bg-sky-500/10 text-sky-600" : "border-border bg-muted/40"
                )}
              >
                {b}
              </div>
            </div>
          );
        })}
      </div>
      {checking && (
        <p className="mt-1 text-[11px] text-muted-foreground">蓝框 = 校验位；黄框 = 当前校验组覆盖的数据位</p>
      )}
    </div>
  );
}

function CrcPanel({ row }: { row?: number }) {
  const steps = crcSteps(MSG, GX);
  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/30 p-3 font-mono text-xs leading-6">
      <div className="font-bold">{MSG.join("")}{"0".repeat(GX.length - 1)} ← 被除数：M = {MSG.join("")} 补 {GX.length - 1} 个 0</div>
      {steps.map((s, i) => (
        <div key={i} className={cn("whitespace-pre", row === i && "rounded bg-amber-500/20 px-1")}>
          {" ".repeat(s.divisorAt)}
          {GX.join("")} ┐ 异或后 ↓ {" "}
          {i === steps.length - 1 ? `余数 = ${s.state.slice(-(GX.length - 1)).join("")}` : s.state.join("")}
        </div>
      ))}
      <div className="mt-1 font-bold">发送帧 = {TX.join("")}（前 {MSG.length} 位数据 + {REM.length} 位余数）</div>
    </div>
  );
}

export function CheckCodeView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show.startsWith("h") ? (
        <div className="space-y-3">
          <HamPanel cover={fr.cover} phase={fr.phase ?? ""} />
          {fr.show === "h-check" && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-1 font-mono">收到 {RECV.join("")}</span>
              <span className="text-muted-foreground">S = {SYN} → 第 {SYN} 位出错 → 纠回 {CODE.join("")}</span>
              <span className="rounded bg-emerald-600 px-2 py-1 font-mono text-white">纠正成功</span>
            </div>
          )}
        </div>
      ) : (
        <CrcPanel row={fr.row} />
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
