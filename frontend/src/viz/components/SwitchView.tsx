// 图解 · 三种交换方式：电路 / 报文 / 分组交换传同一段数据（4 跳链路），
// 时延由 switchCompare() 按标准公式现算——分组交换把报文切小后在链路上流水线交叠。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

/** 报文 x=9.8×10⁵ bit 拆 100 组（每组 9800 数据 + 200 头），4 段 10Mb/s 链路（忽略传播） */
export const X_BITS = 9.8e5;
export const PAYLOAD = 9800;
export const HEAD = 200;
export const HOPS = 4;
export const BW = 1e7; // 10 Mb/s

export interface SwitchResult {
  circuit: number; // 电路（含 0.05s 建链）
  message: number; // 报文
  packet: number; // 分组
  groups: number;
  perPacketBits: number;
}

export function switchCompare(
  x = X_BITS, payload = PAYLOAD, head = HEAD, hops = HOPS, bw = BW,
): SwitchResult {
  const groups = Math.ceil(x / payload);
  const p = payload + head;
  const circuit = 0.05 + x / bw; // 建链 s=0.05s + 一段发送（电路透明直通）
  const message = hops * (x / bw); // 每跳整存整发
  const packet = groups * (p / bw) + (hops - 1) * (p / bw); // 首组沿路 + 后续组流水
  return { circuit, message, packet, groups, perPacketBits: p };
}

const R = switchCompare();
const ms = (s: number) => (s * 1000).toFixed(0);

interface Frame extends VizFrame {
  show: "circuit" | "message" | "packet" | "compare";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "circuit",
      phase: "电路交换",
      desc: `电路交换（传统电话）：先沿路逐段发信令建链（0.05s），建立后专线直通——数据像水流过管道，${ms(R.circuit)}ms 里只有一次「发送时延」。优点：时延稳定、无排队；缺点：建链慢、独占带宽（双方不说话线路也空占）、不支持差错控制。适合实时性要求高、持续大流量的场景。`,
    },
    {
      show: "message",
      phase: "报文交换",
      desc: `报文交换（存储转发）：整个报文（${(X_BITS / 1e3).toFixed(0)}kb）一站一站存下来校验再转发，${HOPS} 跳共 ${HOPS} 次完整发送 → ${ms(R.message)}ms。无需建链、线路复用，但每个中间节点要存整个报文（缓存压力大）、时延高。`,
    },
    {
      show: "packet",
      phase: "分组交换",
      desc: `分组交换：报文拆成 ${R.groups} 组（每组 ${R.perPacketBits} bit 含头），每组独立路由。时延 = 首组走完全程 ${R.groups}×(p/b) + 后续组在最后一跳的流水尾部 (k−1)×(p/b) = ${ms(R.packet)}ms——比报文交换快 ${((R.message / R.packet - 1) * 100).toFixed(0)}%，因为各组在第 2、3、4 段链路上交叠（流水线）传输。代价：每组带头（开销 +${((R.groups * HEAD / X_BITS) * 100).toFixed(1)}%）、可能失序需重排。数据报（无连接，Internet）vs 虚电路（先建逻辑路径，X.25）两种实现。`,
    },
    {
      show: "compare",
      phase: "对比",
      desc: `三柱同屏：电路 ${ms(R.circuit)}ms / 报文 ${ms(R.message)}ms / 分组 ${ms(R.packet)}ms（本例忽略传播时延，加上传播三者的差不变）。选择口诀：实时独占 → 电路；突发、可容忍抖动、要复用与可靠性 → 分组。报文交换是历史中间形态（电报）。`,
    },
  ];
}

function Bars() {
  const max = Math.max(R.circuit, R.message, R.packet);
  const rows = [
    { name: "电路交换", v: R.circuit, cls: "bg-violet-400" },
    { name: "报文交换", v: R.message, cls: "bg-amber-400" },
    { name: "分组交换", v: R.packet, cls: "bg-emerald-500" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground">{r.name}</span>
          <div className="h-6 flex-1 rounded bg-muted/30">
            <div className={`h-full rounded ${r.cls}`} style={{ width: `${(r.v / max) * 100}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right font-mono">{ms(r.v)}ms</span>
        </div>
      ))}
    </div>
  );
}

export function SwitchView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {(fr.show === "circuit" || fr.show === "compare") && <Bars />}
      {fr.show !== "compare" && (
        <div className="flex items-center gap-1 rounded-xl border p-3 text-xs">
          {["源", "R1", "R2", "R3", "目的"].map((n, i) => (
            <div key={n} className="flex items-center gap-1">
              {i > 0 && <div className="h-1 w-12 rounded bg-sky-400" />}
              <div className="flex h-8 w-10 items-center justify-center rounded border border-border bg-muted/50 font-mono">{n}</div>
            </div>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
