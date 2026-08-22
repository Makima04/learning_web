// 图解 · 差错控制与滑动窗口：同一丢包场景（帧 2 丢失）下 停等 / GBN / SR 的行为差异，
// 事件与发送帧数由 slidingSim() 现算；CRC 检错归 408 校验码考点（见计组·校验码演示）。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export type Protocol = "stop" | "gbn" | "sr";

export interface WinEvent {
  no: number;
  type: "send" | "ack" | "loss" | "timeout" | "discard";
  note: string;
}

/** 传 4 帧（0..3），帧 2 丢失；返回事件序列与总发送帧数 */
export function slidingSim(protocol: Protocol): { events: WinEvent[]; sent: number } {
  const events: WinEvent[] = [];
  const push = (no: number, type: WinEvent["type"], note: string) => events.push({ no, type, note });
  let sent = 0;
  const send = (no: number, lost = false) => {
    sent++;
    push(no, lost ? "loss" : "send", lost ? `帧 ${no} 发出并在途中丢失` : `发送帧 ${no}`);
  };
  if (protocol === "stop") {
    send(0); push(0, "ack", "ACK0 到达，窗口滑到 1");
    send(1); push(1, "ack", "ACK1 到达，窗口滑到 2");
    send(2, true); push(2, "timeout", "超时未收到 ACK2，重传");
    send(2); push(2, "ack", "ACK2 到达");
    send(3); push(3, "ack", "ACK3 到达，全部送达");
  } else if (protocol === "gbn") {
    send(0); send(1); send(2, true); send(3); // 窗口 4 一口气发 0..3
    push(0, "ack", "ACK0（累积确认，期望 1）");
    push(1, "ack", "ACK1（期望 2）");
    push(3, "discard", "帧 3 到达但失序：GBN 接收方丢弃并重发 ACK1");
    push(2, "timeout", "帧 2 超时：GBN 重传 2 及其后所有已发送帧");
    send(2); send(3); // 回退 N
    push(2, "ack", "ACK2（累积确认到 3）");
  } else {
    send(0); send(1); send(2, true); send(3);
    push(3, "ack", "帧 3 失序但 SR 接收窗口缓存它，单独 ACK3");
    push(0, "ack", "ACK0");
    push(1, "ack", "ACK1");
    push(2, "timeout", "仅帧 2 超时：SR 只重传帧 2");
    send(2);
    push(2, "ack", "ACK2 到达 → 2、3 一起交付上层");
  }
  return { events, sent };
}

export const PROTO_NAME: Record<Protocol, string> = {
  stop: "停止-等待",
  gbn: "后退 N 帧（GBN）",
  sr: "选择重传（SR）",
};

interface Frame extends VizFrame {
  step: number;
  protocol: Protocol;
}

function buildFrames(protocol: Protocol): Frame[] {
  const { events, sent } = slidingSim(protocol);
  const frames: Frame[] = events.map((e, i) => ({
    protocol,
    step: i,
    phase: e.type === "timeout" ? "超时" : e.type === "ack" ? "确认" : e.type === "loss" ? "丢失" : e.type === "discard" ? "丢弃" : "发送",
    desc: `${e.note}。${i === events.length - 1 ? `共发送 ${sent} 帧（4 帧数据${protocol === "stop" ? "、发送窗口=1 逐帧等 ACK" : protocol === "gbn" ? "、丢一帧则回退重传其后全部" : "、谁丢重谁"}）。${protocol === "stop" ? "停等利用率 = T_D/(T_D+RTT+T_A)，长途链路上极低（1/(1+2a)）。" : protocol === "gbn" ? "GBN 窗口 ≤ 2ⁿ−1（n 位序号）；累积确认；接收窗口=1。" : "SR 窗口 ≤ 2ⁿ⁻¹；逐帧确认、缓存失序帧；接收窗口>1。"}` : ""}`,
  }));
  return frames;
}

export function SlidingView() {
  const [protocol, setProtocol] = useState<Protocol>("gbn");
  const frames = useMemo(() => buildFrames(protocol), [protocol]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const sim = slidingSim(protocol);
  const acked = new Set(
    sim.events.slice(0, fr.step + 1).filter((e) => e.type === "ack").map((e) => e.no)
  );
  const lost = new Set(
    sim.events.slice(0, fr.step + 1).filter((e) => e.type === "loss" || e.type === "timeout").map((e) => e.no)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PROTO_NAME) as Protocol[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setProtocol(k)}
            className={cn("rounded-md border px-2.5 py-1 text-xs", protocol === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {PROTO_NAME[k]}
          </button>
        ))}
        <span className="ml-auto rounded bg-muted px-2 py-1 text-xs font-mono">已发送 {sim.sent} 帧</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[0, 1, 2, 3].map((no) => {
          const isAcked = acked.has(no);
          const isLost = lost.has(no);
          return (
            <div
              key={no}
              className={cn(
                "w-14 rounded-md border py-1.5 text-center font-mono text-xs font-bold",
                isAcked ? "border-emerald-600 bg-emerald-600 text-white" : isLost ? "border-rose-500 bg-rose-500/20 text-rose-600" : "border-border bg-muted/40"
              )}
            >
              帧{no}
              <div className="text-[9px] font-normal">{isAcked ? "已确认" : isLost ? "丢失/重传" : ""}</div>
            </div>
          );
        })}
      </div>
      <div className="space-y-1">
        {sim.events.slice(0, fr.step + 1).slice(-6).map((e, i) => (
          <div key={i} className={cn(
            "rounded-md border px-3 py-1 text-xs",
            e.type === "ack" ? "border-emerald-400 bg-emerald-500/10" : e.type === "timeout" || e.type === "loss" ? "border-rose-400 bg-rose-500/10" : "border-border bg-muted/40"
          )}>
            {e.note}
          </div>
        ))}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
