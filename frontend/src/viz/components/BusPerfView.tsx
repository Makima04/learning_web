// 图解 · 总线性能指标：总线带宽 = 工作频率 × 位宽/8 × 每周期传输次数；比特率 = 波特率 × 每码元比特数。
// 全部由 busBw / bitRate 现算，卡片数字随公式走。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

/** 总线带宽 MB/s：freqMHz × (widthBits/8) × perCycle */
export function busBw(freqMHz: number, widthBits: number, perCycle = 1): number {
  return (freqMHz * (widthBits / 8) * perCycle);
}

/** 比特率 = 波特率 × 每码元携带的比特数（log2 码元状态数） */
export function bitRate(baud: number, bitsPerSymbol: number): number {
  return baud * bitsPerSymbol;
}

const CASES = [
  { name: "32 位总线 @ 100MHz", f: 100, w: 32, k: 1 },
  { name: "64 位总线 @ 200MHz", f: 200, w: 64, k: 1 },
  { name: "64 位 @ 200MHz · 每周期 2 次（DDR）", f: 200, w: 64, k: 2 },
];

interface Frame extends VizFrame {
  show: "bw" | "qpsk" | "summary";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "bw",
      phase: "总线带宽",
      desc: "总线带宽 = 总线工作频率 × 总线宽度(bit)÷8 × 每个时钟周期传输次数。32 位 @100MHz、每周期 1 次 → 100M × 4B = 400 MB/s（下表第一行）；位宽翻倍、频率翻倍各自贡献 2 倍；DDR 在一个周期传两次再 ×2。注意单位：MHz × 字节 = MB/s。",
    },
    {
      show: "qpsk",
      phase: "波特 vs 比特",
      desc: `波特率 = 每秒传输的码元（信号波形）个数；比特率 = 每秒的二进制位数。若 1 码元携带 4 种有效状态（QPSK），每码元 log₂4 = 2 bit → 1200 Baud 的线路比特率 = ${bitRate(1200, 2).toFixed(0)} b/s。只有「每个码元恰好 2 种状态」（1 bit/码元，如 NRZ）时两者才相等。`,
    },
    {
      show: "summary",
      phase: "易错点",
      desc: "① 带宽算的是「数据线」的吞吐，地址线/控制线不算；② 「每周期传几次」看总线协议（SDR=1、DDR=2、QDR=4）；③ 波特率与比特率别混——多进制调制下比特率更高；④ 总线宽度 32 位 = 4 根数据线每根 1 bit 并行；⑤ 提高带宽三途径：加宽（位宽）、提速（频率）、更密的传输（每周期次数）。",
    },
  ];
}

export function BusPerfView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed p-4 text-center font-mono text-sm">
        {fr.show === "bw" ? "带宽(MB/s) = 频率(MHz) × 位宽(bit) ÷ 8 × 每周期次数" : "比特率(b/s) = 波特率(Baud) × log₂(码元状态数)"}
      </div>
      {fr.show === "bw" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {CASES.map((c) => (
            <div key={c.name} className="rounded-xl border p-3 text-center">
              <p className="text-xs text-muted-foreground">{c.name}</p>
              <p className="my-2 font-mono text-xl font-bold text-sky-600">{busBw(c.f, c.w, c.k).toFixed(0)} MB/s</p>
              <p className="font-mono text-[11px] text-muted-foreground">{c.f} × {c.w / 8}B × {c.k}</p>
            </div>
          ))}
        </div>
      )}
      {fr.show === "qpsk" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "二进制码元（NRZ）", states: 2 },
            { name: "四进制码元（QPSK）", states: 4 },
          ].map((m) => (
            <div key={m.name} className="rounded-xl border p-3 text-center">
              <p className="text-xs text-muted-foreground">{m.name} · 1200 Baud</p>
              <p className="my-2 font-mono text-xl font-bold text-sky-600">{bitRate(1200, Math.log2(m.states)).toFixed(0)} b/s</p>
              <p className="font-mono text-[11px] text-muted-foreground">每码元 {Math.log2(m.states)} bit</p>
            </div>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
