// 图解 · HTTP 非持久 vs 持久 vs 流水线连接：页面 = 1 HTML + 3 图片，RTT 计数由 httpTotal() 现算
//（非持久 8 RTT / 持久 5 / 流水 3）；HTTPS 在 TCP 之上再加 TLS 握手。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export type HttpMode = "nonkeep" | "keep" | "pipeline";

export interface HttpCalc {
  rtts: number; // 总 RTT（忽略传输时延，对象足够小时）
  conns: number; // TCP 连接次数
  breakdown: string[]; // 各对象耗时明细
}

/** 4 个对象（1 HTML + 3 图），每对象忽略传输时间：建连 1 RTT + 请求响应 1 RTT（非持久每对象重新来） */
export function httpTotal(mode: HttpMode, objects = 4): HttpCalc {
  if (mode === "nonkeep") {
    const breakdown = Array.from({ length: objects }, (_, i) =>
      `对象${i + 1}：TCP 建连 1 RTT + 请求/响应 1 RTT`
    );
    return { rtts: objects * 2, conns: objects, breakdown };
  }
  if (mode === "keep") {
    const breakdown = [
      "TCP 建连：1 RTT（仅一次）",
      ...Array.from({ length: objects }, (_, i) => `对象${i + 1}：请求/响应 1 RTT（串行）`),
    ];
    return { rtts: 1 + objects, conns: 1, breakdown };
  }
  return {
    rtts: 1 + 1 + 1, // 建连 1 + 全部请求一批 1 + 最后响应 1
    conns: 1,
    breakdown: [
      "TCP 建连：1 RTT",
      "HTML 解析后把 3 个图片请求一口气发出：1 RTT",
      "响应依次返回（流水线重叠）：1 RTT",
    ],
  };
}

export const HTTP_NAME: Record<HttpMode, string> = {
  nonkeep: "非持久连接（HTTP/1.0）",
  keep: "持久连接（HTTP/1.1 keep-alive）",
  pipeline: "持久 + 流水线（HTTP/1.1 pipelining）",
};

interface Frame extends VizFrame {
  mode: HttpMode;
  step: number; // -1 开场；0..breakdown-1；末尾小结
}

function buildFrames(mode: HttpMode): Frame[] {
  const calc = httpTotal(mode);
  const frames: Frame[] = [
    {
      mode, step: -1,
      phase: "页面设定",
      desc: `页面含 1 个 HTML + 3 个图片 = 4 个对象，每个对象「传输时间忽略」、每次 HTTP 请求响应 = 1 RTT、每次 TCP 建连 = 1 RTT。非持久连接：每个对象开一条新 TCP（用完就断）；持久连接：一条 TCP 传完所有对象；流水线：不等响应连着发多个请求。数 RTT 看谁快。`,
    },
  ];
  calc.breakdown.forEach((b, i) => {
    frames.push({ mode, step: i, phase: `第 ${i + 1} 步`, desc: `${b}。累计 ${Math.min(i + 1, calc.rtts)} RTT。` });
  });
  frames.push({
    mode, step: calc.breakdown.length,
    phase: "结果",
    desc: `${HTTP_NAME[mode]}：共 ${calc.rtts} RTT、TCP 连接 ${calc.conns} 次。对比：非持久 ${httpTotal("nonkeep").rtts} / 持久 ${httpTotal("keep").rtts} / 流水线 ${httpTotal("pipeline").rtts}。真实世界的演进：HTTP/2 多路复用（一个连接并发多流，解决队头阻塞的 HTTP 部分）、HTTP/3 改用 QUIC（UDP 上重建可靠+0-RTT 建连）。HTTPS = HTTP + TLS：TCP 三次握手后再加 TLS 握手（1~2 RTT），后续会话可复用（session resumption）。`,
  });
  return frames;
}

function MiniTimeline({ mode }: { mode: HttpMode }) {
  const calc = httpTotal(mode);
  const cells = calc.rtts;
  const connColor = (i: number) =>
    mode === "nonkeep" ? ["#f59e0b", "#fbbf24", "#f59e0b", "#fbbf24", "#f59e0b", "#fbbf24", "#f59e0b", "#fbbf24"][i % 8] : "#10b981";
  return (
    <div>
      <div className="flex gap-0.5">
        {Array.from({ length: cells }, (_, i) => (
          <div key={i} className="h-6 flex-1 rounded-sm" style={{ background: connColor(i) }} title={`RTT ${i + 1}`} />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">每格 1 RTT，共 {cells} 格（{calc.conns} 次 TCP 建连）</p>
    </div>
  );
}

export function HttpView() {
  const [mode, setMode] = useState<HttpMode>("nonkeep");
  const frames = useMemo(() => buildFrames(mode), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(HTTP_NAME) as HttpMode[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={cn("rounded-md border px-2.5 py-1 text-xs", mode === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {HTTP_NAME[k]} · {httpTotal(k).rtts} RTT
          </button>
        ))}
      </div>
      <MiniTimeline mode={fr.mode} />
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
