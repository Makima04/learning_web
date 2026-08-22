// 图解 · DNS 递归 vs 迭代查询：解析 www.example.com 的消息条数与路径由 dnsResolve() 现算
//（全递归 8 条 / 迭代 6 条 / 缓存命中 2 条 / hosts 命中 0 条）。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export type DnsMode = "hosts" | "cache" | "recursive" | "iterative";

export interface DnsMessage {
  no: number;
  from: string;
  to: string;
  query: string; // 查的名字
  broadcast: boolean;
  note: string;
}

/** 不同命中方式下的消息序列（hosts/缓存命中本地即答；递归=各级代理向上递归；迭代=本地服务器逐级自己问） */
export function dnsResolve(mode: DnsMode): { messages: DnsMessage[]; count: number } {
  const q = "www.example.com";
  if (mode === "hosts") {
    return { messages: [], count: 0 };
  }
  if (mode === "cache") {
    return {
      messages: [
        { no: 1, from: "主机", to: "本地域名服务器", query: q, broadcast: true, note: "查询请求（UDP 53）" },
        { no: 2, from: "本地域名服务器", to: "主机", query: q, broadcast: false, note: "缓存未过期，直接返回 IP" },
      ],
      count: 2,
    };
  }
  if (mode === "recursive") {
    return {
      messages: [
        { no: 1, from: "主机", to: "本地域名服务器", query: q, broadcast: true, note: "「我只要结果」——递归查询" },
        { no: 2, from: "本地", to: "根服务器", query: q, broadcast: false, note: "本地代替主机继续递归" },
        { no: 3, from: "根", to: "本地", query: ".com", broadcast: false, note: "「去问 .com 的顶级域服务器」（返回地址）" },
        { no: 4, from: "本地", to: ".com 顶级", query: q, broadcast: false, note: "递归到顶级" },
        { no: 5, from: ".com 顶级", to: "本地", query: "example.com", broadcast: false, note: "返回权威服务器地址" },
        { no: 6, from: "本地", to: "权威", query: q, broadcast: false, note: "递归到权威" },
        { no: 7, from: "权威", to: "本地", query: "1.2.3.4", broadcast: false, note: "最终答案沿原路回传" },
        { no: 8, from: "本地", to: "主机", query: "1.2.3.4", broadcast: false, note: "主机拿到 IP（共 8 条消息）" },
      ],
      count: 8,
    };
  }
  return {
    messages: [
      { no: 1, from: "主机", to: "本地域名服务器", query: q, broadcast: true, note: "主机→本地：递归（只要结果）" },
      { no: 2, from: "本地", to: "根", query: q, broadcast: false, note: "本地→根：迭代查询「下次我问谁？」" },
      { no: 3, from: "根", to: "本地", query: ".com", broadcast: false, note: "根不代劳，只指路：去问 .com" },
      { no: 4, from: "本地", to: ".com 顶级", query: q, broadcast: false, note: "本地自己去问顶级" },
      { no: 5, from: ".com 顶级", to: "本地", query: "example.com", broadcast: false, note: "指路：去问权威" },
      { no: 6, from: "本地", to: "权威", query: q, broadcast: false, note: "本地问权威拿到 1.2.3.4" },
      { no: 7, from: "本地", to: "主机", query: "1.2.3.4", broadcast: false, note: "本地转交主机（迭代共 6 条）" },
    ],
    count: 6,
  };
}

interface Frame extends VizFrame {
  mode: DnsMode;
  step: number; // -1 开场；0..n 消息；n+1 小结
}

function buildFrames(mode: DnsMode): Frame[] {
  const { messages, count } = dnsResolve(mode);
  const frames: Frame[] = [
    {
      mode, step: -1,
      phase: "起点",
      desc: `解析 www.example.com。先查本机 hosts 文件${mode === "hosts" ? "——命中，0 条网络消息。" : "未命中"}${mode !== "hosts" ? "，再问本地域名服务器（通常是 ISP 或路由器）。递归查询：被问者负责「问到底再回话」；迭代查询：被问者只回「你去问谁」。主机→本地几乎总用递归；本地→外部通常迭代。" : ""}`,
    },
  ];
  messages.forEach((m, i) => {
    frames.push({
      mode, step: i,
      phase: `消息 ${m.no}（${m.from} → ${m.to}）`,
      desc: `${m.note}。${m.no === count ? `共 ${count} 条消息。` : ""}`,
    });
  });
  frames.push({
    mode, step: messages.length,
    phase: "小结",
    desc: `消息数：hosts ${dnsResolve("hosts").count} / 缓存 ${dnsResolve("cache").count} / 全递归 ${dnsResolve("recursive").count} / 迭代 ${dnsResolve("iterative").count}。记录类型：A（IPv4）/AAAA（IPv6）/CNAME（别名）/MX（邮件）/NS。传输层用 UDP 53（响应小、快；区域传送用 TCP 53）。缓存按 TTL 过期，减轻根/顶级压力。`,
  });
  return frames;
}

const NODES: Record<string, [number, number]> = {
  "主机": [60, 120],
  "本地域名服务器": [60, 40],
  "根": [330, 20],
  ".com 顶级": [330, 70],
  "权威": [330, 120],
  // 消息里的简称别名（与上面同坐标）
  "本地": [60, 40],
  ".com": [330, 70],
};
const UNIQUE_NODES = ["主机", "本地域名服务器", "根", ".com 顶级", "权威"];

export function DnsView() {
  const [mode, setMode] = useState<DnsMode>("iterative");
  const frames = useMemo(() => buildFrames(mode), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const { messages } = dnsResolve(mode);
  const cur = fr.step >= 0 && fr.step < messages.length ? messages[fr.step]! : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {([["hosts", "hosts 命中"], ["cache", "缓存命中"], ["recursive", "全递归"], ["iterative", "迭代"]] as [DnsMode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("rounded border px-2 py-1", m === mode ? "border-sky-500 bg-sky-500/10 font-bold" : "border-border text-muted-foreground hover:bg-muted")}
          >
            {label}：{dnsResolve(m).count} 条
          </button>
        ))}
      </div>
      <svg viewBox="0 0 420 160" className="w-full">
        {UNIQUE_NODES.map((name) => {
          const [x, y] = NODES[name]!;
          const on = cur != null && (cur.from === name || cur.to === name || NODES[cur.from]?.[0] === x);
          return (
            <g key={name}>
              <rect x={x - 52} y={y - 14} width={104} height={28} rx={14} fill={on ? "#0ea5e9" : "#e2e8f0"} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={on ? "#fff" : "#0f172a"}>{name}</text>
            </g>
          );
        })}
        {messages.slice(0, fr.step + 1).map((m, i) => {
          const a = NODES[m.from];
          const b = NODES[m.to];
          if (!a || !b) return null;
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 3" opacity={i === fr.step ? 1 : 0.35} />;
        })}
        {cur && (
          <text x={210} y={152} textAnchor="middle" fontSize={10} fill="#0369a1">
            {cur.from} → {cur.to}：{cur.query}
          </text>
        )}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
