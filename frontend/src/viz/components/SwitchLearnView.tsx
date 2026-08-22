// 图解 · 以太网交换机自学习：帧到达先「记源 MAC→端口」，再查表转发；
// 查不到就洪泛。交换机行为由 switchLearn() 模拟（测试断言首帧洪泛、次帧单播）。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface FrameEvent {
  from: string; // 源主机
  to: string; // 目的主机
}

/** 三帧：A→B（表空）、B→A（已学）、C→B（部分已学） */
export const EVENTS: FrameEvent[] = [
  { from: "A", to: "B" },
  { from: "B", to: "A" },
  { from: "C", to: "B" },
];

export const PORT: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };

export interface SwitchAction {
  frame: FrameEvent;
  learned: boolean; // 是否学到新表项
  outPorts: number[]; // 实际转发出的端口
  flood: boolean;
}

/** 逐帧模拟交换机（自学习 + 查表转发 + 洪泛） */
export function switchLearn(events: FrameEvent[]): SwitchAction[] {
  const table = new Map<string, number>(); // MAC → 端口
  return events.map((f) => {
    const srcPort = PORT[f.from]!;
    const learned = table.get(f.from) !== srcPort;
    table.set(f.from, srcPort);
    const dst = table.get(f.to);
    const flood = dst == null;
    const outPorts = flood
      ? Object.values(PORT).filter((p) => p !== srcPort) // 除入口外全发
      : [dst];
    return { frame: f, learned, outPorts, flood };
  });
}

interface Frame extends VizFrame {
  step: number; // -1 开场；0..2 帧
}

function buildFrames(): Frame[] {
  const acts = switchLearn(EVENTS);
  const frames: Frame[] = [
    {
      step: -1,
      phase: "交换机",
      desc: "以太网交换机工作在链路层：每个端口独享带宽、全双工，各端口是一个独立冲突域（但整个交换机仍是一个广播域，VLAN 才切开）。转发靠 MAC 地址表：源 MAC 自学习，目的 MAC 查表，查不到就洪泛。看三帧的表是怎么长出来的。",
    },
  ];
  acts.forEach((a, i) => {
    frames.push({
      step: i,
      phase: `帧${i + 1}：${a.frame.from} → ${a.frame.to}`,
      desc: `${a.frame.from} 的帧从端口 ${PORT[a.frame.from]} 进入：先学——把 ${a.frame.from} 记到端口 ${PORT[a.frame.from]}${a.learned ? "（新表项）" : "（已有）"}；再查 ${a.frame.to}——${a.flood ? `表里没有 → 洪泛：除入口外从 ${a.outPorts.join("、")} 端口全发出去（只有 ${a.frame.to} 收下，其余丢弃）。交换机「宁可错发、不可漏发」。` : `表里有（端口 ${a.outPorts[0]}）→ 精准单播转发，其他端口不受打扰。`}`,
    });
  });
  frames.push({
    step: acts.length,
    phase: "对比",
    desc: "设备对比：集线器（物理层）——信号级放大广播，所有端口同冲突域同广播域；交换机（链路层）——按 MAC 转发，隔离冲突域、不隔离广播域；路由器（网络层）——按 IP 转发，冲突域广播域都隔离。两种交换方式：存储转发（先收全帧校验，可靠慢）vs 直通（收到目的 MAC 就转发，快但不校验）。",
  });
  return frames;
}

export function SwitchLearnView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const acts = switchLearn(EVENTS);
  const table = new Map<string, number>();
  for (let i = 0; i <= Math.min(fr.step, acts.length - 1); i++) {
    const a = acts[i]!;
    table.set(a.frame.from, PORT[a.frame.from]!);
  }
  const cur = fr.step >= 0 && fr.step < acts.length ? acts[fr.step]! : null;

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 520 170" className="w-full">
        {/* 交换机 */}
        <rect x={200} y={70} width={120} height={44} rx={8} fill="#e2e8f0" stroke="#94a3b8" />
        <text x={260} y={97} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0f172a">交换机</text>
        {Object.entries(PORT).map(([mac, port], i) => {
          const x = 60 + i * 118;
          const active = cur != null && (cur.frame.from === mac || cur.outPorts.includes(port) || cur.frame.to === mac);
          const isSrc = cur?.frame.from === mac;
          return (
            <g key={mac}>
              <line x1={x} y1={40} x2={x} y2={70} stroke={isSrc ? "#f59e0b" : active ? "#0ea5e9" : "#cbd5e1"} strokeWidth={isSrc || active ? 2.4 : 1.2} />
              <rect x={x - 20} y={12} width={40} height={28} rx={6} fill={isSrc ? "#f59e0b" : active ? "#0ea5e9" : "#e2e8f0"} />
              <text x={x} y={31} textAnchor="middle" fontSize={12} fontWeight={700} fill={isSrc || active ? "#fff" : "#0f172a"}>{mac}</text>
              <text x={x} y={66} textAnchor="middle" fontSize={9} fill="#64748b">{port} 口</text>
            </g>
          );
        })}
        {cur && (
          <text x={260} y={140} textAnchor="middle" fontSize={10} fill={cur.flood ? "#b45309" : "#047857"}>
            {cur.flood ? `洪泛：从 ${cur.outPorts.join("/")} 端口转发` : `单播：仅端口 ${cur.outPorts.join("/")}`}
          </text>
        )}
      </svg>
      <div className="rounded-xl border p-3">
        <p className="mb-2 text-xs font-semibold">MAC 地址表</p>
        {table.size === 0 ? (
          <p className="text-xs text-muted-foreground">（空）</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...table.entries()].map(([mac, port]) => (
              <span key={mac} className="rounded border border-border bg-muted/40 px-2 py-1 font-mono">
                {mac} → 端口{port}
              </span>
            ))}
          </div>
        )}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
