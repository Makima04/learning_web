// 图解 · TCP 连接管理：三次握手与四次挥手。报文带 seq/ack 逐条飞，两端状态机同步迁移；
// 为什么是三次（防旧 SYN、双方确认收发）、为什么挥手四次（半关闭 + TIME_WAIT 2MSL）。
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

interface Packet {
  dir: "c2s" | "s2c";
  y: number;
  label: string;
  sub: string;
}
interface TcpState {
  cState: string;
  sState: string;
}

interface TFrame extends VizFrame {
  packets: Packet[];
  cState: string;
  sState: string;
}

const X_C = 70;
const X_S = 400;

/** 三次握手报文（x=1000, y=5000） */
const HS_PACKETS: (Packet & TcpState)[] = [
  { dir: "c2s", y: 60, label: "① SYN=1, seq=x(1000)", sub: "请求建立连接", cState: "SYN_SENT", sState: "LISTEN" },
  { dir: "s2c", y: 120, label: "② SYN=1, ACK=1, seq=y(5000), ack=x+1(1001)", sub: "同意，并确认收到 ①", cState: "SYN_SENT", sState: "SYN_RCVD" },
  { dir: "c2s", y: 180, label: "③ ACK=1, seq=x+1, ack=y+1(5001)", sub: "确认收到 ②（可捎带数据）", cState: "ESTABLISHED", sState: "SYN_RCVD" },
  { dir: "c2s", y: 240, label: "", sub: "服务器收到 ③ → ESTABLISHED", cState: "ESTABLISHED", sState: "ESTABLISHED" },
];

const FW_PACKETS: (Packet & TcpState)[] = [
  { dir: "c2s", y: 60, label: "① FIN=1, seq=u(2000)", sub: "客户端数据发完了", cState: "FIN_WAIT_1", sState: "ESTABLISHED" },
  { dir: "s2c", y: 120, label: "② ACK=1, ack=u+1", sub: "知道了，但我可能还有数据（半关闭）", cState: "FIN_WAIT_2", sState: "CLOSE_WAIT" },
  { dir: "s2c", y: 180, label: "③ FIN=1, ACK=1, seq=w(7000), ack=u+1", sub: "服务器数据也发完了", cState: "FIN_WAIT_2", sState: "LAST_ACK" },
  { dir: "c2s", y: 240, label: "④ ACK=1, ack=w+1", sub: "确认；随后 TIME_WAIT 2MSL", cState: "TIME_WAIT→CLOSED", sState: "LAST_ACK" },
  { dir: "c2s", y: 300, label: "", sub: "服务器收到 ④ → CLOSED；客户端 2MSL 后 CLOSED", cState: "CLOSED", sState: "CLOSED" },
];

function buildTcpFrames(mode: "hs" | "fw"): TFrame[] {
  const packets = mode === "hs" ? HS_PACKETS : FW_PACKETS;
  const frames: TFrame[] = [];
  const name = mode === "hs" ? "三次握手（建立）" : "四次挥手（释放）";
  frames.push({
    desc:
      mode === "hs"
        ? "TCP 是面向连接的：通信前必须三报文握手同步初始序号（ISN）。客户端主动 open，服务器被动 LISTEN。SYN 段不携带数据但要消耗一个序号。"
        : "任何一方都可以主动关闭（这里客户端先）。FIN 也消耗一个序号。TCP 是全双工，两个方向分别关——所以比握手多一次。",
    phase: "初始",
    packets: [],
    cState: mode === "hs" ? "CLOSED" : "ESTABLISHED",
    sState: mode === "hs" ? "LISTEN" : "ESTABLISHED",
  });
  packets.forEach((pk, i) => {
    frames.push({
      desc:
        mode === "hs"
          ? i === 0
            ? "客户 → 服务器：SYN=1，随机初始序号 seq=x。客户端进入 SYN_SENT。"
            : i === 1
              ? "服务器 → 客户端：SYN+ACK 一并回：自己的初始序号 y + 对 x 的确认（ack=x+1，表示「x 及以前都收到了，期望下一个是 x+1」）。服务器 SYN_RCVD（半连接，占资源——SYN 洪泛就是打这里）。"
              : i === 2
                ? "客户 → 服务器：ACK=1, ack=y+1。客户端 ESTABLISHED，可立即发数据；服务器收到后才 ESTABLISHED。"
                : "三报文缺一不可：少第三次，服务器无法确认「客户端能收到我的报文」；且旧的迟到 SYN 重连时会浪费服务器资源。RST 可在异常时打断。SYN 洪泛防御 = SYN cookie。"
          : i === 0
            ? "客户端发 FIN（seq=u）：我不再发数据（还能收）。FIN_WAIT_1。"
            : i === 1
              ? "服务器 ACK 确认，进 CLOSE_WAIT（等应用层把剩余数据发完）——客户端 FIN_WAIT_2，形成「半关闭」：客户端只收不发。"
              : i === 2
                ? "服务器数据发完，发 FIN（seq=w）。LAST_ACK。"
                : i === 3
                  ? "客户端 ACK 确认后不是立刻 CLOSED，而是 TIME_WAIT 等 2MSL（报文段最大生存时间的两倍）：① 保证最后一个 ACK 若丢了还能重发；② 让本连接的旧报文在网络中消逝，不污染新连接。"
                  : "双方 CLOSED，资源释放。保活计时器可检测对方主机崩溃。大题常考：画时序图标状态、数握手/挥手次数、TIME_WAIT 的作用、为什么握手三次挥手四次（挥手的服务器 ACK 与 FIN 分开发）。",
      phase: pk.label || name,
      packets: packets.slice(0, i + 1).map(({ dir, y, label, sub }) => ({ dir, y, label, sub })),
      cState: pk.cState,
      sState: pk.sState,
    });
  });
  return frames;
}

type Mode = "hs" | "fw";

export function TcpView() {
  const [mode, setMode] = useState<Mode>("hs");
  const frames = useMemo(() => buildTcpFrames(mode), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const H = mode === "hs" ? 300 : 350;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([["hs", "三次握手"], ["fw", "四次挥手"]] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 470 ${H}`} className="w-full">
        {/* 生命线 */}
        <text x={X_C} y={22} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.nodeText}>客户端</text>
        <text x={X_S} y={22} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.nodeText}>服务器</text>
        <line x1={X_C} y1={30} x2={X_C} y2={H - 8} stroke="#94a3b8" />
        <line x1={X_S} y1={30} x2={X_S} y2={H - 8} stroke="#94a3b8" />
        {/* 状态标签 */}
        <text x={X_C - 6} y={H - 14} textAnchor="end" fontSize={10} fontWeight={700} fill="#0ea5e9">{fr.cState}</text>
        <text x={X_S + 6} y={H - 14} fontSize={10} fontWeight={700} fill="#10b981">{fr.sState}</text>
        {/* 报文箭头 */}
        {fr.packets.map((pk, i) => {
          const from = pk.dir === "c2s" ? X_C : X_S;
          const to = pk.dir === "c2s" ? X_S : X_C;
          const isInfo = pk.label === "";
          return (
            <g key={i}>
              {!isInfo && (
                <>
                  <line x1={from + 4} y1={pk.y} x2={to - 8} y2={pk.y} stroke={C.active} strokeWidth={1.8} markerEnd="url(#tcp-arrow)" />
                  <text x={(X_C + X_S) / 2} y={pk.y - 6} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={C.nodeText}>
                    {pk.label}
                  </text>
                </>
              )}
              <text x={(X_C + X_S) / 2} y={pk.y + 13} textAnchor="middle" fontSize={9.5} fill={C.text}>
                {pk.sub}
              </text>
            </g>
          );
        })}
        <defs>
          <marker id="tcp-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill={C.active} />
          </marker>
        </defs>
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
