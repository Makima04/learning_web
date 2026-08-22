// 图解 · 时延/带宽/吞吐量：发送时延 = 分组长度/带宽，传播时延 = 距离/传播速率，
// 加上处理/排队时延；存储转发 k 跳总时延由 hopDelay() 现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

/** 发送时延（ms）：lenBytes / bwMbps */
export function sendDelayMs(lenBytes: number, bwMbps: number): number {
  return (lenBytes * 8) / (bwMbps * 1e6) * 1000;
}

/** 传播时延（ms）：km 公里，v = 2×10⁵ km/s */
export function propDelayMs(km: number, v = 2e5): number {
  return (km / v) * 1000;
}

/** 存储转发：k 段等长链路，每段带宽 bwMbps，忽略处理排队 */
export function hopDelayMs(lenBytes: number, bwMbps: number, kmPerHop: number, hops: number, v = 2e5): number {
  const perSend = sendDelayMs(lenBytes, bwMbps);
  return perSend + hops * (perSend + propDelayMs(kmPerHop, v));
}

const CASES = [
  { name: "1KB 分组 @ 10Mb/s", len: 1000, bw: 10, km: 1000 },
  { name: "10KB 报文 @ 100Mb/s", len: 10000, bw: 100, km: 1000 },
  { name: "40KB @ 1Gb/s", len: 40000, bw: 1000, km: 1000 },
];

const STORE = hopDelayMs(1000, 10, 500, 3);

interface Frame extends VizFrame {
  show: "formula" | "cases" | "store" | "mistakes";
}

function buildFrames(): Frame[] {
  const c0 = CASES[0]!;
  return [
    {
      show: "formula",
      phase: "四种时延",
      desc: `总时延 = 发送（传输）时延 + 传播时延 + 处理时延 + 排队时延。发送时延 = 分组长 ÷ 带宽（网卡把比特「推上线」的时间，与距离无关）；传播时延 = 距离 ÷ 传播速率（约 2×10⁵ km/s，光的 2/3；与带宽无关！）。例：${c0.name} → 发送 ${sendDelayMs(c0.len, c0.bw).toFixed(2)}ms + 传播 ${propDelayMs(c0.km).toFixed(1)}ms。`,
    },
    {
      show: "cases",
      phase: "算感",
      desc: "带宽只压缩「发送时延」；拉长距离只增加「传播时延」。1Gb/s 链路发 40KB 与 10Mb/s 发 400B 的发送时延一样——大文件在高带宽链路上按发送时延线性受益，卫星/跨洋链路的瓶颈常在传播时延。",
    },
    {
      show: "store",
      phase: "存储转发",
      desc: `报文交换/分组交换经过路由器都是「整存整发/组存组发」：每个中间节点收完整段再转发。1KB 分组经 3 段链路（10Mb/s，每段 500km）：发送 1 次 + 每跳（发送 0.8ms + 传播 2.5ms）×3 ≈ ${STORE.toFixed(2)}ms。分组交换把报文切小后各分组可在中间链路流水线交叠——这是它时延优势的来源。`,
    },
    {
      show: "mistakes",
      phase: "易错",
      desc: "① 高带宽 ≠ 低时延（高速公路更宽不等于更快到达）；② 时延带宽积 = 传播时延 × 带宽 = 「链路上正在飞的比特数」（发送窗口的物理依据）；③ 吞吐量受瓶颈链路限制（木桶效应）；④ 「传输时延」在 408 里默认指发送时延，注意题面。单位陷阱：1MB = 8Mb，别把字节当比特。",
    },
  ];
}

export function DelayView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "formula" && (
        <div className="rounded-xl border border-dashed p-4 text-center font-mono text-sm">
          总时延 = 发送(长/带宽) + 传播(距/速率) + 处理 + 排队
        </div>
      )}
      {fr.show === "cases" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {CASES.map((c) => (
            <div key={c.name} className="rounded-xl border p-3 text-center">
              <p className="text-xs text-muted-foreground">{c.name} · 1000km</p>
              <p className="my-2 font-mono text-sm font-bold">
                <span className="text-sky-600">发 {sendDelayMs(c.len, c.bw).toFixed(2)}ms</span>
                {" + "}
                <span className="text-violet-600">传 {propDelayMs(c.km).toFixed(1)}ms</span>
              </p>
              <p className="text-[11px] text-muted-foreground">共 {(sendDelayMs(c.len, c.bw) + propDelayMs(c.km)).toFixed(2)}ms</p>
            </div>
          ))}
        </div>
      )}
      {fr.show === "store" && (
        <div className="flex items-center gap-1 rounded-xl border p-3 text-xs">
          {["源", "R1", "R2", "R3", "目的"].map((n, i) => (
            <div key={n} className="flex items-center gap-1">
              {i > 0 && <div className="h-1 w-12 rounded bg-sky-400" />}
              <div className="flex h-8 w-10 items-center justify-center rounded border border-border bg-muted/50 font-mono">{n}</div>
            </div>
          ))}
          <span className="ml-2 text-muted-foreground">3 跳存储转发 ≈ {STORE.toFixed(1)}ms（1KB@10Mb/s，每段 500km）</span>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
