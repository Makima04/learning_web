// 图解 · 数字编码波形：NRZ / NRZI / 曼彻斯特 / 差分曼彻斯特 对同一比特串 10110010 的波形，
// 半电平序列由 encodeWave() 现算（测试断言中间跳变数与起始跳变规则），逐层叠加对比。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const BITS = "10110010";

export type Scheme = "nrz" | "nrzi" | "man" | "diff";

export const SCHEME_NAME: Record<Scheme, string> = {
  nrz: "NRZ 不归零",
  nrzi: "NRZI 反转不归零",
  man: "曼彻斯特",
  diff: "差分曼彻斯特",
};

/** 编码为「半比特」电平序列（1=高 0=低），约定：
 * NRZ：1 高 0 低；NRZI：1 在位开始跳变、0 保持；
 * 曼彻斯特：1 低→高、0 高→低（中间必跳变）；差分曼彻斯特：0 在位开始跳变、1 不跳（中间必跳变） */
export function encodeWave(bits: string, scheme: Scheme): number[] {
  const half: number[] = [];
  let level = 0; // 起始低电平
  for (const b of bits) {
    if (scheme === "nrz") {
      half.push(b === "1" ? 1 : 0, b === "1" ? 1 : 0);
    } else if (scheme === "nrzi") {
      if (b === "1") level = level ? 0 : 1;
      half.push(level, level);
    } else if (scheme === "man") {
      half.push(b === "1" ? 0 : 1, b === "1" ? 1 : 0);
    } else {
      if (b === "0") level = level ? 0 : 1;
      half.push(level, level ? 0 : 1);
    }
    if (scheme === "man") level = b === "1" ? 1 : 0;
    if (scheme === "diff") level = half.at(-1)!;
  }
  return half;
}

/** 波形跳变统计：中间跳变数（位中央）、边界跳变数 */
export function transitions(bits: string, scheme: Scheme): { mid: number; boundary: number } {
  const half = encodeWave(bits, scheme);
  let mid = 0;
  let boundary = 0;
  for (let i = 0; i < bits.length; i++) {
    if (half[2 * i] !== half[2 * i + 1]) mid++;
    if (i > 0 && half[2 * i] !== half[2 * i - 1]) boundary++;
  }
  return { mid, boundary };
}

interface Frame extends VizFrame {
  schemes: Scheme[];
}

function buildFrames(): Frame[] {
  return [
    {
      schemes: ["nrz"],
      phase: "NRZ",
      desc: `比特串 ${BITS}（下方黄格）。NRZ 不归零：1 高电平、0 低电平。问题：连续多个相同位（如 100）时电平长期不变，接收方失去位同步（无法数清到底几个 0）；且存在直流分量。`,
    },
    {
      schemes: ["nrzi"],
      phase: "NRZI",
      desc: `NRZI：见 1 就在位开始处跳变，0 保持（本例约定；USB 反过来用）。虽然 1 的游程天然受限，但一串 0 仍会失去同步——工程上配合位填充使用。它是「差分编码」：信息在跳变里，不在绝对电平里，极性接反也能正确解码。`,
    },
    {
      schemes: ["man"],
      phase: "曼彻斯特",
      desc: `曼彻斯特（以太网）：每个比特中间必有一次跳变，跳变兼作「时钟」与「数据」：1 = 低→高、0 = 高→低（本例约定）。${BITS.length} 位共 ${transitions(BITS, "man").mid} 次中间跳变——自同步能力最强，代价是波特率翻倍（10Mb/s 以太网需要 20 MBaud），编码效率 50%。`,
    },
    {
      schemes: ["diff", "man"],
      phase: "差分曼彻斯特",
      desc: `差分曼彻斯特（令牌环）：中间必跳变（仅作时钟），数据看「位开始处有无跳变」：0 有跳、1 无跳（对比曼彻斯特波形看开头的差异）。同为差分思想：极性反转不影响解码。考试常给波形让你写比特串——先找中点跳变定比特边界，再看边界跳变判 0/1。`,
    },
    {
      schemes: ["nrz", "nrzi", "man", "diff"],
      phase: "对比+调制",
      desc: "四码同屏对比。补充调制（模拟）：ASK 振幅、FSK 频率、PSK 相位、QAM=ASK+PSK 叠加（16QAM 每码元 4bit）。编码（数字→数字）与调制（数字→模拟）是两条线：基带传输用编码，频带传输用调制。",
    },
  ];
}

function Wave({ bits, scheme, show }: { bits: string; scheme: Scheme; show: boolean }) {
  const half = encodeWave(bits, scheme);
  const cw = 26; // 半比特宽
  const h = 34;
  const y = (l: number) => (l === 1 ? 14 : 14 + h);
  const pts = half.map((l, i) => `${i * cw},${y(l)}`).join(" L");
  const path = `M${pts}`;
  const width = half.length * cw + 20;
  return (
    <svg viewBox={`0 0 ${width} ${h + 56}`} className="w-full" style={{ display: show ? undefined : "none" }}>
      {bits.split("").map((b, i) => (
        <g key={i}>
          <rect x={i * cw * 2 + 2} y={h + 26} width={cw * 2 - 4} height={18} rx={3} fill={b === "1" ? C.warn : C.node} />
          <text x={i * cw * 2 + cw} y={h + 39} textAnchor="middle" fontSize={12} fontWeight={700} fill={b === "1" ? "#fff" : C.nodeText}>
            {b}
          </text>
          <line x1={i * cw * 2} y1={8} x2={i * cw * 2} y2={h + 24} stroke="#e2e8f0" strokeDasharray="3 3" />
        </g>
      ))}
      <path d={path} fill="none" stroke={C.active} strokeWidth={2.4} strokeLinejoin="round" />
    </svg>
  );
}

export function CodingView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const showAll = p.idx === frames.length - 1;

  return (
    <div className="space-y-2">
      {(Object.keys(SCHEME_NAME) as Scheme[]).map((s) => {
        const on = fr.schemes.includes(s);
        return (
          <div key={s} className={cn("rounded-xl border p-2", on ? "border-sky-400" : "border-border opacity-50")}>
            <p className="px-2 text-xs font-semibold text-muted-foreground">{SCHEME_NAME[s]}</p>
            <Wave bits={BITS} scheme={s} show={on || showAll} />
          </div>
        );
      })}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
