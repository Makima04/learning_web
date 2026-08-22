// 图解 · ARP 与 ICMP：同网段 ARP 两步解析（广播问+单答回）、跨网段改问网关；
// ICMP 差错报告类型与 traceroute 的 TTL 递增，全部由 arpSteps()/traceroute() 现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface ArpPacket {
  step: number;
  kind: "request" | "reply" | "data";
  broadcast: boolean;
  note: string;
}

/** ARP 解析：cache 命中直接发数据；同网段广播请求+单答回应；跨网段对网关做 ARP */
export function arpSteps(cacheHit: boolean, sameSubnet: boolean): { packets: ArpPacket[]; targetIp: string } {
  const dst = "192.168.1.20";
  const gw = "192.168.1.1";
  const targetIp = sameSubnet ? dst : gw;
  if (cacheHit) {
    return { targetIp, packets: [{ step: 1, kind: "data", broadcast: false, note: `缓存命中（${targetIp} 的 MAC 已在表里）→ 直接封装 IP 分组发送，0 个 ARP 包` }] };
  }
  const packets: ArpPacket[] = [
    { step: 1, kind: "request", broadcast: true, note: sameSubnet ? `广播 ARP 请求：「谁是 192.168.1.20？告诉 192.168.1.10」` : `目的不在本网段 → 先对默认网关 ARP：广播「谁是 ${gw}？」` },
    { step: 2, kind: "reply", broadcast: false, note: `${targetIp} 单播回应自己的 MAC 地址，请求方写入 ARP 缓存（有存活时间）` },
    { step: 3, kind: "data", broadcast: false, note: sameSubnet ? "IP 分组直接封装该 MAC 发给目的主机" : "帧的目的 MAC = 网关，IP 头的目的 IP 仍是最终主机（MAC 逐跳换、IP 端到端不变）" },
  ];
  return { targetIp, packets };
}

export interface TraceHop {
  ttl: number;
  hop: number;
  type: "timeout" | "echo";
  from: string;
}

/** traceroute：TTL=1,2,3…，中间路由器回 ICMP 超时(11)，终点回回送回答(0) */
export function traceroute(hops: number): TraceHop[] {
  const out: TraceHop[] = [];
  for (let i = 1; i < hops; i++) {
    out.push({ ttl: i, hop: i, type: "timeout", from: `路由器 R${i}` });
  }
  out.push({ ttl: hops, hop: hops, type: "echo", from: "目的主机" });
  return out;
}

const ICMP_TYPES = [
  { no: 0, name: "回送回答", note: "ping 的回应" },
  { no: 3, name: "目的不可达", note: "网络/主机/端口不可达" },
  { no: 5, name: "改变路由（重定向）", note: "告诉主机有更近的网关" },
  { no: 8, name: "回送请求", note: "ping 的请求" },
  { no: 11, name: "超时", note: "TTL=0；traceroute 靠它" },
];

interface Frame extends VizFrame {
  show: "arp" | "arpX" | "cache" | "icmp" | "trace";
}

function buildFrames(): Frame[] {
  const same = arpSteps(false, true);
  return [
    {
      show: "arp",
      phase: "同网段 ARP",
      desc: `主机 A（192.168.1.10）要给 B（192.168.1.20）发 IP 分组：以太网帧需要目的 MAC，但 A 只知道 IP → 查 ARP 缓存未命中 → 广播（FF:FF:FF:FF:FF:FF）ARP 请求，全网主机都收到；只有 B 单播回应自己的 MAC。共 2 个 ARP 包 + 1 个数据帧。ARP 解决「同网段内 IP→MAC」，是即插即用的自动映射。`,
    },
    {
      show: "arpX",
      phase: "跨网段 ARP",
      desc: "目的 IP 不在本网段（子网掩码判断）时，ARP 的对象是默认网关：拿到网关 MAC 后把帧发给网关，帧里 IP 头目的地址不变——「IP 端到端、MAC 逐跳」。这是「抓包看到 MAC 是路由器、IP 却是远端主机」的原因。",
    },
    {
      show: "cache",
      phase: "缓存与防环",
      desc: "ARP 结果进缓存（几分钟过期）；ARP 请求与回应都可学习（收到就更新表）。安全隐患：ARP 欺骗（伪造回应把流量引走）。考试细节：ARP 请求是广播、回应是单播；ARP 属于网络层附带的地址解析功能（常被归到「IP 辅助协议」）。",
    },
    {
      show: "icmp",
      phase: "ICMP 类型",
      desc: "ICMP 差错报告：3 目的不可达 / 5 改变路由 / 11 超时 / 12 参数问题；询问：8 请求 0 回答（ping）。四种「不发 ICMP 差错」的情况要对 ICMP 差错报文本身、对分片非首片、对广播/多播、对特殊地址。ICMP 装在 IP 里（协议号 1），但功能上属于网络层。",
    },
    {
      show: "trace",
      phase: "traceroute",
      desc: `traceroute 依次发 TTL=1、2、3… 的探测包：每台路由器把 TTL 减到 0 时丢弃并回「ICMP 超时(11)」，报文里带上自己的地址 → 逐跳暴露路径；终点收到探测回「回送回答(0)」结束。${traceroute(3).map((h) => `TTL=${h.ttl}→${h.from}`).join("，")}。ping 用的是 8/0。`,
    },
  ];
}

export function ArpView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const same = arpSteps(false, true);
  const cross = arpSteps(false, false);
  const hit = arpSteps(true, true);

  return (
    <div className="space-y-4">
      {(fr.show === "arp" || fr.show === "arpX" || fr.show === "cache") && (
        <div className="space-y-1.5">
          {(fr.show === "arp" ? same : fr.show === "arpX" ? cross : hit).packets.map((pk) => (
            <div key={pk.step} className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
              pk.broadcast ? "border-amber-500 bg-amber-500/10" : pk.kind === "data" ? "border-emerald-500 bg-emerald-500/10" : "border-border"
            )}>
              <span className="w-16 shrink-0 font-semibold">
                {pk.kind === "request" ? "① 请求" : pk.kind === "reply" ? "② 回应" : "③ 数据"}
              </span>
              <span className="flex-1">{pk.note}</span>
              {pk.broadcast && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">广播</span>}
            </div>
          ))}
        </div>
      )}
      {fr.show === "icmp" && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-medium">类型号</th>
              <th className="text-left font-medium">名称</th>
              <th className="text-left font-medium">用途</th>
            </tr>
          </thead>
          <tbody>
            {ICMP_TYPES.map((t) => (
              <tr key={t.no} className="border-t">
                <td className="py-1 font-mono font-bold text-sky-600">{t.no}</td>
                <td className="">{t.name}</td>
                <td className="text-muted-foreground">{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {fr.show === "trace" && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {traceroute(4).map((h) => (
            <div key={h.ttl} className="flex items-center gap-1.5">
              {h.ttl > 1 && <span className="text-muted-foreground">→</span>}
              <span className={cn("rounded border px-2 py-1 font-mono", h.type === "echo" ? "border-emerald-500 bg-emerald-500/10" : "border-border")}>
                TTL={h.ttl} {h.from}
                <div className="text-[10px] text-muted-foreground">ICMP {h.type === "echo" ? "0 回答" : "11 超时"}</div>
              </span>
            </div>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
