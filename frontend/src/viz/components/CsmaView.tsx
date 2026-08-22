// 图解 · CSMA/CD：冲突窗口时间线（两站最坏 2τ 才能检测到冲突）、最小帧长 = 2τ×R、截断二进制退避。
// 最小帧长与退避上限由 minFrameLen()/backoffMax() 现算（10Mb/s 以太网 = 64B，与标准一致）。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export const TAU = 25.6; // 单程端到端传播 µs（10Mb/s 以太网约定）
export const CONTENTION = 2 * TAU; // 争用期 51.2µs = 512 bit 时间

/** 最小帧长（字节）= 2τ × R / 8：发送至少要持续到能检测到最晚冲突（µs × Mb/s = bit） */
export function minFrameLen(rMbps: number, tauUs = TAU): number {
  return (2 * tauUs * rMbps) / 8;
}

/** 第 i 次冲突后的退避槽数上限（截断二进制指数退避，10 次封顶，16 次放弃） */
export function backoffMax(i: number): number {
  return 2 ** Math.min(i, 10) - 1;
}

interface Frame extends VizFrame {
  show: "flow" | "collision" | "minframe" | "backoff" | "ca";
}

function buildFrames(): Frame[] {
  const min64 = minFrameLen(10);
  return [
    {
      show: "flow",
      phase: "流程",
      desc: `CSMA/CD（以太网，半双工）：① 载波侦听——先听后发；② 边发送边检测冲突；③ 检测到冲突立即停发并发 48bit 强化干扰信号（jam）；④ 随机退避后重试。核心约束：发送时间必须 ≥ 2τ（${CONTENTION}µs），否则帧发完了冲突还没传回来，发送方误以为无冲突——这决定了最小帧长。`,
    },
    {
      show: "collision",
      phase: "冲突窗口",
      desc: `最坏情形时间线（下图）：t=0 A 开始发；t=τ−ε 时 B 察听总线空闲（A 的信号最后 1µs 才到）也开始发；t=τ 两信号在 B 处撞上，B 立刻发现并发 jam；jam 传回 A 要再走 τ → A 在 t=2τ 才检测到冲突。所以「检测冲突的最长时间 = 2τ（端到端往返）」，以太网取 512 bit 时间 = ${CONTENTION}µs。`,
    },
    {
      show: "minframe",
      phase: "最小帧长",
      desc: `最小帧长 = 2τ × 数据率：10Mb/s → ${min64} 字节（512bit），正是以太网 64B 最小帧。短帧必须填充（pad）到 64B。反过来：速率 ×10 到 100Mb/s，若保持 64B 最小帧，网络直径必须 ÷10（争用期 bit 数不变）；千兆半双工靠载波扩展把帧拉到 512B 时间。口诀：速率越高/距离越长 → 越难满足 2τ 约束——这是 CSMA/CD 不适合长距离高速率的原因。`,
    },
    {
      show: "backoff",
      phase: "退避",
      desc: `截断二进制指数退避：第 i 次冲突后，从 {0…2^min(i,10)−1} 个「争用期槽」里随机选一个等待（i=1 最多 ${backoffMax(1)} 槽，i=2 最多 ${backoffMax(2)} 槽，10 次后封顶 ${backoffMax(10)}），16 次仍失败则放弃上报。适应性地给负载「泄压」，但也让重传多的帧越来越吃亏（捕获效应）。`,
    },
    {
      show: "ca",
      phase: "CSMA/CA",
      desc: "无线 802.11 用 CSMA/CA（冲突避免）：空气里信号衰减快，网卡边发边听不现实（自己的信号淹没对方）→ 只能避免而非检测：帧间间隔 DIFS + 随机退避后发送；可选 RTS/CTS 预约信道（解决隐蔽站）；可靠传输交给 MAC 层 ACK（停等）。以太网（有线）= CD，Wi-Fi（无线）= CA，考点常对比。",
    },
  ];
}

function CollisionTimeline() {
  // A 在左 B 在右，事件按 t/2τ 缩放到 0..1
  const w = 560;
  const x = (t: number) => 40 + (t / (CONTENTION * 1.1)) * (w - 80);
  return (
    <svg viewBox={`0 0 ${w} 168`} className="w-full">
      <text x={20} y={30} fontSize={11} fontWeight={700} fill={C.nodeText}>A</text>
      <text x={20} y={110} fontSize={11} fontWeight={700} fill={C.nodeText}>B</text>
      <line x1={40} y1={30} x2={w - 20} y2={30} stroke="#cbd5e1" />
      <line x1={40} y1={110} x2={w - 20} y2={110} stroke="#cbd5e1" />
      {/* A 的信号向右 */}
      <line x1={x(0)} y1={30} x2={x(TAU)} y2={110} stroke={C.active} strokeWidth={2} />
      {/* B 的信号向左（t=τ−ε 起） */}
      <line x1={w - 20} y1={110} x2={x(TAU)} y2={110} stroke={C.bad} strokeWidth={2} />
      {/* B 处冲突 */}
      <circle cx={x(TAU)} cy={110} r={9} fill={C.bad} opacity={0.25} />
      <text x={x(TAU)} y={134} textAnchor="middle" fontSize={10} fill={C.bad}>t=τ 冲突！B 停发+jam</text>
      {/* jam 传回 A */}
      <line x1={x(TAU)} y1={110} x2={x(CONTENTION)} y2={30} stroke={C.warn} strokeWidth={2} strokeDasharray="5 3" />
      <text x={x(CONTENTION)} y={22} textAnchor="middle" fontSize={10} fill="#b45309">t=2τ A 才发现</text>
      {/* 刻度 */}
      {[0, TAU, CONTENTION].map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={26} x2={x(t)} y2={34} stroke="#94a3b8" />
          <line x1={x(t)} y1={106} x2={x(t)} y2={114} stroke="#94a3b8" />
          <text x={x(t)} y={158} textAnchor="middle" fontSize={9} fill={C.text}>{t.toFixed(0)}µs</text>
        </g>
      ))}
      <text x={x(TAU / 2)} y={70} textAnchor="middle" fontSize={9} fill="#0369a1">A 的信号 →</text>
      <text x={x(TAU * 1.5)} y={96} textAnchor="middle" fontSize={9} fill="#b45309">← jam 回传</text>
    </svg>
  );
}

export function CsmaView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "collision" && <CollisionTimeline />}
      {fr.show === "minframe" && (
        <div className="rounded-xl border border-dashed p-4 text-center font-mono text-sm">
          最小帧长 = 2τ × R ÷ 8 = 512bit × 10Mb/s 口径 = <b className="text-sky-600">{minFrameLen(10)} B</b>
        </div>
      )}
      {fr.show === "backoff" && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[1, 2, 3, 4, 10, 16].map((i) => (
            <span key={i} className="rounded border border-border bg-muted/40 px-2 py-1 font-mono">
              第{i}次：≤ {backoffMax(i)} 槽{i === 16 ? "（放弃）" : ""}
            </span>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
