// 图解 · SRAM/DRAM 与芯片扩展：用 4K×4 位 SRAM 芯片拼 16K×8 位存储器（位扩展×2、字扩展×4 共 8 片），
// 地址 14 位 = 高 2 位片选 + 低 12 位片内地址；DRAM 部分算刷新安排（2ms/128 行）。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface ChipPlan {
  wordExpand: number; // 字扩展（需要几组芯片）
  bitExpand: number; // 位扩展（一组几片拼位宽）
  chips: number;
  addrBits: number; // 总地址位数
  offBits: number; // 片内地址位数
  csBits: number; // 片选（高位）位数
}

/** chipK: 芯片字数(K)，chipW: 芯片位宽；totalK/totalW 目标规格 */
export function chipPlan(chipK: number, chipW: number, totalK: number, totalW: number): ChipPlan {
  const wordExpand = totalK / chipK;
  const bitExpand = totalW / chipW;
  const addrBits = Math.log2(totalK * 1024);
  const offBits = Math.log2(chipK * 1024);
  return { wordExpand, bitExpand, chips: wordExpand * bitExpand, addrBits, offBits, csBits: addrBits - offBits };
}

/** 地址译码：高 csBits 位选组，低 offBits 位进芯片 */
export function decodeAddr(addr: number, offBits: number): { cs: number; intra: number } {
  return { cs: addr >>> offBits, intra: addr & ((1 << offBits) - 1) };
}

/** DRAM 刷新安排：rows 行须在 totalMs 内全部刷新 */
export function refreshPlan(rows: number, totalMs: number): { intervalUs: number; deadUs: number; rowRefreshUs: number } {
  const intervalUs = (totalMs * 1000) / rows; // 分散刷新：每这么久刷一行
  const rowRefreshUs = 0.1; // 每行刷新约一个读写周期
  const deadUs = rows * rowRefreshUs; // 集中刷新：连续刷完 128 行的「死时间」
  return { intervalUs, deadUs, rowRefreshUs };
}

export const CHIP_K = 4; // 4K 字
export const CHIP_W = 4; // 4 位
export const TOTAL_K = 16;
export const TOTAL_W = 8;
const PLAN = chipPlan(CHIP_K, CHIP_W, TOTAL_K, TOTAL_W);
const ADDR = 0x35af; // 演示地址 0011 0101 1010 1111
const DEC = decodeAddr(ADDR, PLAN.offBits);
const REF = refreshPlan(128, 2);

interface Frame extends VizFrame {
  hotGroup: number; // -1 无；0..3 选中组
  addrBitsHot: "cs" | "intra" | "both" | "none";
  showDram: boolean;
}

function buildFrames(): Frame[] {
  return [
    {
      hotGroup: -1, addrBitsHot: "none", showDram: false,
      phase: "目标",
      desc: `任务：用 ${CHIP_K}K×${CHIP_W} 位的 SRAM 芯片，组成 ${TOTAL_K}K×${TOTAL_W} 位存储器。字数不够 → 字扩展（多组芯片，地址高位译码选组）；位宽不够 → 位扩展（一组内两片，各出 4 位拼成 8 位）。字扩展 ${PLAN.wordExpand} 组 × 位扩展 ${PLAN.bitExpand} 片 = 共 ${PLAN.chips} 片。`,
    },
    {
      hotGroup: -1, addrBitsHot: "both", showDram: false,
      phase: "地址结构",
      desc: `总容量 ${TOTAL_K}K 字 → 地址 ${PLAN.addrBits} 位（2¹⁴ = 16K）；每片 ${CHIP_K}K → 片内地址 ${PLAN.offBits} 位。高 ${PLAN.csBits} 位经译码器产生 ${PLAN.wordExpand} 个片选信号 CS₀…CS₃——任何时刻只有一组芯片被选中，其余组不耗访问功耗。`,
    },
    {
      hotGroup: DEC.cs, addrBitsHot: "cs", showDram: false,
      phase: "访问示例",
      desc: `CPU 给出地址 ${ADDR.toString(16).toUpperCase()}H = ${ADDR.toString(2).padStart(PLAN.addrBits, "0")}B：高 ${PLAN.csBits} 位 ${DEC.cs.toString(2).padStart(PLAN.csBits, "0")} → 译码选中第 ${DEC.cs} 组（CS${DEC.cs} 有效）；低 ${PLAN.offBits} 位 ${DEC.intra.toString(2).padStart(PLAN.offBits, "0")} 同时送进该组两片芯片，各自读出 4 位，拼成 8 位数据。`,
    },
    {
      hotGroup: -1, addrBitsHot: "none", showDram: false,
      phase: "SRAM vs DRAM",
      desc: "SRAM：触发器存位，非破坏读出、不需刷新、快但贵/密度低 → 做 Cache。DRAM：电容存位，破坏性读出要再生、电容漏电要刷新、慢但便宜/密度高 → 做主存。刷新按「行」进行：读写一次实际是对一整行充电。",
    },
    {
      hotGroup: -1, addrBitsHot: "none", showDram: true,
      phase: "刷新安排",
      desc: `DRAM 某芯片 128 行，须 2ms 内全部刷新一遍（不然电容漏光电荷失真）。分散刷新：每 ${REF.intervalUs.toFixed(1)}µs 刷一行（2ms÷128），无集中死区但每次访存周期变长；集中刷新：留出一段连续 ${REF.deadUs}µs（128 行×${REF.rowRefreshUs}µs）一次刷完，期间 CPU 访存只能等——这段就是「死时间」；异步刷新：折中，把 128 行均匀摊到 2ms 里逐个安排在空闲时刷（现代 DRAM 的做法）。刷新对 CPU 透明，按行而非按位进行。`,
    },
  ];
}

function addrBitsStr(hot: Frame["addrBitsHot"]): { s: string; hi: boolean[] } {
  const full = ADDR.toString(2).padStart(PLAN.addrBits, "0");
  const csLen = PLAN.csBits;
  return {
    s: full,
    hi: full.split("").map((_, i) => (hot === "both" ? true : hot === "cs" ? i < csLen : i >= csLen)),
  };
}

export function ChipView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const ab = addrBitsStr(fr.addrBitsHot);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-[46%]">
          <p className="mb-2 text-xs text-muted-foreground">
            {TOTAL_K}K×{TOTAL_W} 位存储器 = {PLAN.wordExpand} 组（字扩展）× 每组 {PLAN.bitExpand} 片（位扩展）
          </p>
          <div className="grid grid-cols-2 gap-2" style={{ width: 250 }}>
            {Array.from({ length: PLAN.wordExpand }, (_, g) => (
              <div
                key={g}
                className={cn(
                  "rounded-lg border p-2",
                  fr.hotGroup === g ? "border-sky-500 bg-sky-500/10 ring-2 ring-sky-500" : "border-border"
                )}
              >
                <div className="mb-1 text-center text-[11px] font-semibold">组 {g}（CS{g}）</div>
                <div className="flex gap-1.5">
                  {Array.from({ length: PLAN.bitExpand }, (_, b) => (
                    <div
                      key={b}
                      className={cn(
                        "flex-1 rounded border py-2 text-center font-mono text-[10px]",
                        fr.hotGroup === g ? "border-sky-400 bg-white" : "border-border bg-muted/40"
                      )}
                    >
                      片{g * PLAN.bitExpand + b}
                      <div className="text-muted-foreground">{CHIP_K}K×{CHIP_W}</div>
                      {b === 0 ? "D₇..D₄" : "D₃..D₀"}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">地址线（共 {PLAN.addrBits} 位）</p>
            <div className="flex flex-wrap gap-1">
              {ab.s.split("").map((bit, i) => {
                const isCs = i < PLAN.csBits;
                return (
                  <span
                    key={i}
                    className={cn(
                      "flex h-7 w-6 items-center justify-center rounded border font-mono text-xs font-bold",
                      isCs ? "border-sky-500" : "border-border",
                      ab.hi[i] ? (isCs ? "bg-sky-500 text-white" : "bg-emerald-600 text-white") : "bg-muted/40"
                    )}
                  >
                    {bit}
                  </span>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              蓝框前 {PLAN.csBits} 位 = 片选（组号）· 绿框后 {PLAN.offBits} 位 = 片内地址
            </p>
          </div>
          {fr.showDram && (
            <div className="rounded-xl border p-3 text-xs">
              <p className="mb-2 font-semibold">DRAM 刷新（128 行 / 2ms）</p>
              <div className="space-y-1 font-mono">
                <div>分散刷新：每 {REF.intervalUs.toFixed(1)}µs 刷一行</div>
                <div>集中刷新：连续 {REF.deadUs.toFixed(0)}µs 死时间</div>
                <div>异步刷新：2ms 内均匀摊开</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
