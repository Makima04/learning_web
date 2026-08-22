// 图解 · 总线仲裁与定时：链式查询（BG 串行传递，离控制器近者优先）/ 计数器查询 / 独立请求；
// 定时对比同步（公共时钟）与异步（握手 REQUEST/ACK）。授予结果由 grant 函数现算。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

/** 链式查询：总线允许 BG 沿链串行传递，先到先得（下标小 = 离仲裁器近 = 优先级高） */
export function chainGrant(requests: boolean[]): number {
  return requests.findIndex((r) => r);
}

/** 计数器查询：设备号 = 计数值时若该设备请求则授予，否则计数 +1 循环扫（从 counter+1 起找下一个请求者） */
export function counterGrant(counter: number, requests: boolean[]): number {
  const n = requests.length;
  for (let k = 1; k <= n; k++) {
    const i = (counter + k) % n;
    if (requests[i]) return i;
  }
  return -1;
}

/** 独立请求：仲裁器并行看所有请求，这里按优先级固定判（硬件可用并行判决网络，速度与设备数无关） */
export function parallelGrant(requests: boolean[]): number {
  return requests.findIndex((r) => r);
}

export const REQ_DEMO = [false, true, true, false]; // 4 设备，1、2 号同时请求

interface Frame extends VizFrame {
  mode: "chain" | "counter" | "indep" | "sync" | "async";
  winner: number; // -1 = 不适用
  bgAt: number; // 链式：BG 走到几号；-1 = 未开始
  wave: number; // 异步握手阶段 0..4；-1 = 不适用
}

function buildFrames(): Frame[] {
  const cg = chainGrant(REQ_DEMO);
  const counterDemo = counterGrant(0, REQ_DEMO);
  const pg = parallelGrant(REQ_DEMO);
  return [
    { mode: "chain", winner: cg, bgAt: 0, wave: -1, phase: "链式查询", desc: `总线仲裁解决「多个主设备同时想当 master」。链式查询：总线请求 BR 公用（任一设备拉高），仲裁器回一根总线允许 BG 沿设备链串行传递。现在 1、2 号同时请求：BG 从 0 号开始传——0 号没请求，把 BG 传给下家；${REQ_DEMO.indexOf(true)} 号收到 BG 立即截住，获得总线权。离仲裁器越近优先级越高，且固定不变；BG 链上挂 N 个设备要传 N 次，对干扰敏感（链断全瘫）。` },
    { mode: "chain", winner: cg, bgAt: 1, wave: -1, phase: "链式查询", desc: `BG 到达 ${cg} 号：它有请求 → 截获 BG、置 BB（总线忙），仲裁器撤回 BG。本次仲裁花 2 步传播。优点：控制线少（BR+BG+BB 共 3 根），易扩展；缺点：优先级固化、逐级延迟。` },
    { mode: "counter", winner: counterDemo, bgAt: -1, wave: -1, phase: "计数器查询", desc: `计数器查询：仲裁器里有个计数器，计数输出经设备号译码线广播。每次仲裁从上次的计数值 +1 开始找（本例从 0 出发 → 下一候选 1）：1 号正在请求 → 授予 1 号。设备号 = 计数值时若请求即获得总线。优先级由计数策略决定：循环计数 → 各设备机会均等；每次从 0 开始 → 退化成固定优先级。比链式快（并行译码），但多了 log₂N 根设备号线。` },
    { mode: "indep", winner: pg, bgAt: -1, wave: -1, phase: "独立请求", desc: `独立请求：每个设备一对 BRᵢ/BGᵢ 直连仲裁器，仲裁器内部并行判决（本例 1、2 号同时请求，判给 1 号）。速度最快、优先级灵活（可编程动态调整）；代价是 2N 根控制线 + 复杂仲裁逻辑。PCIe/AXI 等现代总线多用此法。` },
    { mode: "sync", winner: -1, bgAt: -1, wave: -1, phase: "同步定时", desc: "定时（什么时候采样信号）两种：同步——所有设备共用时钟，事件在时钟沿采样，必须满足最坏时序（时钟周期按最慢设备+最大时钟偏移设计），快但不便长线/异速设备。异步——握手，见下一步。", },
    { mode: "async", winner: -1, bgAt: -1, wave: 4, phase: "异步握手", desc: "异步全互锁握手四步：① 主设备发 REQUEST（请求并同步放好地址/数据）；② 从设备准备好后回 ACKNOWLEDGE；③ 主设备撤销 REQ（数据已收妥）；④ 从设备撤销 ACK。每一步都等对方确认，像打乒乓球——可靠、可长线、可异速（ISA/PCI 用它），但每次握手 4 个来回，慢于同步。", },
  ];
}

function ArbDiagram({ mode, winner, bgAt }: { mode: Frame["mode"]; winner: number; bgAt: number }) {
  if (mode !== "chain" && mode !== "counter" && mode !== "indep") return null;
  return (
    <svg viewBox="0 0 460 200" className="w-full">
      {/* 仲裁器 */}
      <rect x={20} y={70} width={80} height={60} rx={8} fill={C.node} stroke="#94a3b8" />
      <text x={60} y={96} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.nodeText}>仲裁器</text>
      <text x={60} y={112} textAnchor="middle" fontSize={9} fill={C.text}>{mode === "chain" ? "BG 链" : mode === "counter" ? "计数译码" : "并行判决"}</text>
      {REQ_DEMO.map((req, i) => {
        const x = 150 + i * 80;
        const won = winner === i;
        const bgPassing = mode === "chain" && bgAt >= i;
        return (
          <g key={i}>
            <line x1={100} y1={100} x2={x - 30} y2={100} stroke={mode === "indep" && req ? C.active : C.line} strokeWidth={mode === "indep" && req ? 2 : 1} />
            <rect x={x - 30} y={70} width={60} height={60} rx={8}
              fill={won ? C.done : req ? C.warn : C.node} stroke="#94a3b8" />
            <text x={x} y={96} textAnchor="middle" fontSize={12} fontWeight={700} fill={won || req ? "#fff" : C.nodeText}>设备{i}</text>
            <text x={x} y={112} textAnchor="middle" fontSize={9} fill={won || req ? "#f8fafc" : C.text}>
              {req ? (won ? "获得总线" : "请求中") : "空闲"}
            </text>
            {mode === "chain" && i < REQ_DEMO.length - 1 && (
              <line x1={x + 30} y1={100} x2={x + 50} y2={100} stroke={bgPassing ? C.active : "#cbd5e1"} strokeWidth={bgPassing ? 2.4 : 1.4} strokeDasharray={bgPassing ? undefined : "3 3"} />
            )}
          </g>
        );
      })}
      <text x={230} y={170} textAnchor="middle" fontSize={11} fill={C.text}>
        {mode === "chain" ? "虚线 = BG 链（蓝 = 已传到）· 优先级：设备0 > 1 > 2 > 3" : mode === "counter" ? "计数器从 0 开始扫，1 号命中" : "每设备独立 BR/BG 直连仲裁器"}
      </text>
    </svg>
  );
}

function WaveDiagram({ wave }: { wave: number }) {
  // 异步握手波形：REQ / ACK 两行，四阶段
  const y = (row: number) => 40 + row * 50;
  const hi = (row: number) => y(row) - 18;
  const lo = (row: number) => y(row);
  const seg = (row: number, x1: number, x2: number, level: number) => {
    const yy = level === 1 ? hi(row) : lo(row);
    return <line x1={x1} y1={yy} x2={x2} y2={yy} stroke={C.nodeText} strokeWidth={2} />;
  };
  const w = 420;
  const reqUp = 40, ackUp = 140, reqDn = 240, ackDn = 340;
  return (
    <svg viewBox={`0 0 ${w} 130`} className="w-full">
      {[0, 1].map((row) => seg(row, 10, reqUp, row === 0 ? 1 : 0))}
      <line x1={reqUp} y1={hi(0)} x2={reqUp} y2={lo(0)} stroke={C.nodeText} strokeWidth={2} />
      {seg(0, reqUp, wave >= 3 ? reqDn : w - 10, 1)}
      {wave >= 3 && <line x1={reqDn} y1={hi(0)} x2={reqDn} y2={lo(0)} stroke={C.nodeText} strokeWidth={2} />}
      {wave >= 3 && seg(0, reqDn, w - 10, 0)}
      {wave >= 2 && seg(1, ackUp, wave >= 4 ? ackDn : w - 10, 1)}
      {wave >= 2 && <line x1={ackUp} y1={hi(1)} x2={ackUp} y2={lo(1)} stroke={C.nodeText} strokeWidth={2} />}
      {wave >= 4 && <line x1={ackDn} y1={hi(1)} x2={ackDn} y2={lo(1)} stroke={C.nodeText} strokeWidth={2} />}
      {wave >= 4 && seg(1, ackDn, w - 10, 0)}
      {seg(1, 10, wave >= 2 ? ackUp : w - 10, 0)}
      <text x={12} y={hi(0) - 6} fontSize={11} fontWeight={700} fill={C.nodeText}>REQ</text>
      <text x={12} y={hi(1) - 6} fontSize={11} fontWeight={700} fill={C.nodeText}>ACK</text>
      {[
        [reqUp, "①主方发请求"],
        [ackUp, "②从方确认"],
        [reqDn, "③主方撤销"],
        [ackDn, "④从方撤销"],
      ].map(([x, label], i) => (
        <text key={i} x={x as number} y={122} fontSize={9} textAnchor="middle" fill={wave >= i + 1 ? "#0284c7" : C.text}>{label as string}</text>
      ))}
    </svg>
  );
}

export function BusArbView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <ArbDiagram mode={fr.mode} winner={fr.winner} bgAt={fr.bgAt} />
      {fr.mode === "async" && <WaveDiagram wave={fr.wave + 1} />}
      {fr.mode === "sync" && (
        <div className={cn("rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground")}>
          公共时钟 CLK：每个时钟沿采样一次 · 周期按最慢设备 + 时钟偏移设计
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
