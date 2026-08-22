// 图解 · TCP 拥塞控制：慢启动（指数）→ 拥塞避免（+1/RTT）→ 超时（门限减半、cwnd=1）
// → 快重传/快恢复（3 个冗余 ACK：门限=cwnd/2，cwnd=门限）。折线图逐 RTT 推进。
import { useMemo } from "react";
import type { ReactElement } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export interface CwndPoint {
  rtt: number;
  cwnd: number;
  phase: "慢启动" | "拥塞避免" | "重传";
  event?: "超时" | "3ACK";
  ssthresh: number;
}

/** 经典时间线：ssthresh 初始 8；cwnd 到 12 超时；恢复到 8 时收到 3 个冗余 ACK */
export function cwndTimeline(): CwndPoint[] {
  const pts: CwndPoint[] = [];
  let cwnd = 1;
  let ssthresh = 8;
  let rtt = 0;
  let phase: CwndPoint["phase"] = "慢启动";
  const push = (event?: CwndPoint["event"]) => pts.push({ rtt, cwnd, phase, event, ssthresh });
  push();
  // 慢启动 1→2→4→8
  for (let i = 0; i < 3; i++) {
    rtt++;
    cwnd *= 2;
    phase = cwnd >= ssthresh ? "拥塞避免" : "慢启动";
    push();
  }
  // 拥塞避免 8→12
  while (cwnd < 12) {
    rtt++;
    cwnd += 1;
    phase = "拥塞避免";
    push();
  }
  // 超时
  rtt++;
  ssthresh = Math.max(1, Math.floor(cwnd / 2));
  cwnd = 1;
  phase = "慢启动";
  push("超时");
  // 慢启动 1→2→4→6（门限 6）
  while (cwnd < ssthresh) {
    rtt++;
    cwnd = Math.min(ssthresh, cwnd * 2);
    push();
  }
  // 拥塞避免 6→8
  while (cwnd < 8) {
    rtt++;
    cwnd += 1;
    phase = "拥塞避免";
    push();
  }
  // 3 个冗余 ACK：快恢复
  rtt++;
  ssthresh = Math.floor(cwnd / 2);
  cwnd = ssthresh;
  phase = "拥塞避免";
  push("3ACK");
  rtt++;
  cwnd += 1;
  push();
  return pts;
}

interface CgFrame extends VizFrame {
  upto: number;
}

function buildCongFrames(): CgFrame[] {
  const frames: CgFrame[] = [];
  const tl = cwndTimeline();
  tl.forEach((pt, i) => {
    frames.push({
      desc:
        i === 0
          ? "连接建立：cwnd=1（一个 MSS），ssthresh=8。发送方维护拥塞窗口 cwnd，实际发送量 = min(cwnd, rwnd 接收窗口)——流量控制怕淹接收方，拥塞控制怕淹网络。"
          : pt.event === "超时"
            ? `超时（重传计时器到期）——最严重的拥塞信号：ssthresh 降为 cwnd/2 = ${pt.ssthresh}，cwnd 重置为 1，重回慢启动。`
            : pt.event === "3ACK"
              ? `连续 3 个冗余 ACK（快重传）——轻度拥塞（个别丢包，网络还在转发）：不回到 1，快恢复：ssthresh = cwnd/2 = ${pt.ssthresh}，cwnd 直接设为 ssthresh=${pt.cwnd}，接着拥塞避免。`
              : pt.phase === "慢启动"
                ? `RTT ${pt.rtt}：慢启动，cwnd 翻倍 → ${pt.cwnd}（每个 ACK 放行一个新段，指数增长：1→2→4→8…）。到达门限 ssthresh=${pt.ssthresh} 就切拥塞避免。`
                : `RTT ${pt.rtt}：拥塞避免，cwnd 每 RTT 加 1 个 MSS → ${pt.cwnd}（线性，谨慎试探）。`,
      phase: pt.event ? `${pt.event}！` : pt.phase,
      upto: i,
    });
  });
  frames.push({
    desc: "完成。四算法：慢启动（指数探路）、拥塞避免（线性加性增）、超时（乘性减 ssthresh=cwnd/2、cwnd=1）、快重传+快恢复（3 冗余 ACK，cwnd 减半后线性）。整体呈「AIMD」锯齿。大题给 RTT 序列画 cwnd 曲线、问某时刻 cwnd/ssthresh 或「第 n 个 RTT 发送多少报文段」。",
    phase: "完成",
    upto: tl.length - 1,
  });
  return frames;
}

const X0 = 44;
const Y0 = 26;
const PW = 420;
const PH = 190;
const MAXR = 17;
const MAXC = 13;

export function CongView() {
  const frames = useMemo(buildCongFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const tl = cwndTimeline();
  const px = (r: number) => X0 + (r / MAXR) * PW;
  const py = (c: number) => Y0 + PH - (c / MAXC) * PH;

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${X0 + PW + 30} ${Y0 + PH + 34}`} className="w-full">
        {/* 坐标轴 */}
        <line x1={X0} y1={Y0} x2={X0} y2={Y0 + PH} stroke="#94a3b8" />
        <line x1={X0} y1={Y0 + PH} x2={X0 + PW} y2={Y0 + PH} stroke="#94a3b8" />
        {Array.from({ length: 7 }, (_, i) => i * 2).map((c) => (
          <g key={c}>
            <line x1={X0 - 4} y1={py(c)} x2={X0} y2={py(c)} stroke="#94a3b8" />
            <text x={X0 - 8} y={py(c) + 3} textAnchor="end" fontSize={9} fill="#64748b">{c}</text>
          </g>
        ))}
        {tl.filter((_, i) => i % 3 === 0).map((pt) => (
          <text key={pt.rtt} x={px(pt.rtt)} y={Y0 + PH + 14} textAnchor="middle" fontSize={9} fill="#64748b">
            {pt.rtt}
          </text>
        ))}
        <text x={X0 + PW / 2} y={Y0 + PH + 30} textAnchor="middle" fontSize={10} fill="#64748b">RTT</text>
        {/* ssthresh 阶梯线 */}
        {(() => {
          const segs: ReactElement[] = [];
          let prev = tl[0]!;
          tl.forEach((pt) => {
            segs.push(
              <line
                key={pt.rtt}
                x1={px(prev.rtt)} y1={py(prev.ssthresh)}
                x2={px(pt.rtt)} y2={py(pt.ssthresh)}
                stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.2}
              />
            );
            prev = pt;
          });
          return segs;
        })()}
        {/* cwnd 折线 */}
        {tl.slice(0, fr.upto + 1).map((pt, i) => {
          if (i === 0) return null;
          const prev = tl[i - 1]!;
          const ev = pt.event;
          return (
            <g key={pt.rtt}>
              <line
                x1={px(prev.rtt)} y1={py(prev.cwnd)}
                x2={px(pt.rtt)} y2={py(pt.cwnd)}
                stroke={ev ? C.bad : pt.phase === "慢启动" ? C.active : C.done}
                strokeWidth={2.4}
              />
              {ev && <circle cx={px(pt.rtt)} cy={py(pt.cwnd)} r={4} fill={C.bad} />}
            </g>
          );
        })}
        {tl.slice(0, fr.upto + 1).map((pt) => (
          <circle key={pt.rtt} cx={px(pt.rtt)} cy={py(pt.cwnd)} r={3} fill={pt.event ? C.bad : C.nodeText} />
        ))}
        <text x={X0 + PW - 60} y={py(8) - 6} fontSize={10} fill="#64748b">ssthresh…</text>
      </svg>
      <p className="text-xs text-muted-foreground">
        蓝线 = 慢启动（指数），绿线 = 拥塞避免（线性），红点 = 拥塞事件；灰虚线 = ssthresh（随事件降半）。
      </p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
