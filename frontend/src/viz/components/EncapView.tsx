// 图解 · OSI/TCP-IP 分层与封装：应用报文逐层加头（TCP20/IP20/以太网14+FCS4），
// 每层头长与总长由 encapsulate() 现算；接收端反向拆包。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface PduLayer {
  layer: string;
  head: string;
  headBytes: number;
  tailBytes?: number; // 以太网有 FCS 尾
  pdu: string; // 本层 PDU 名称
  note: string;
}

export const LAYERS: PduLayer[] = [
  { layer: "应用层", head: "", headBytes: 0, pdu: "报文", note: "HTTP 请求文本" },
  { layer: "传输层", head: "TCP 头", headBytes: 20, pdu: "段（segment）", note: "加源/目的端口、序号、校验和" },
  { layer: "网络层", head: "IP 头", headBytes: 20, pdu: "分组/数据报", note: "加源/目的 IP、TTL、协议号=6" },
  { layer: "链路层", head: "以太网头", headBytes: 14, tailBytes: 4, pdu: "帧（frame）", note: "加 MAC 地址、类型=0x0800，尾部 FCS" },
];

/** 逐层封装：第 i 层后累计字节数（payload 起始 100B 应用数据） */
export function encapsulate(payload = 100): { depth: number; sizes: number[]; overhead: number } {
  const sizes: number[] = [payload];
  let cur = payload;
  for (const l of LAYERS.slice(1)) {
    cur += l.headBytes + (l.tailBytes ?? 0);
    sizes.push(cur);
  }
  return { depth: LAYERS.length, sizes, overhead: sizes.at(-1)! - payload };
}

const APP = 100;
const ENC = encapsulate(APP);

interface Frame extends VizFrame {
  step: number; // 0..3 封装深度；4 = 物理层；5..7 解封装
}

function buildFrames(): Frame[] {
  return [
    {
      step: 0,
      phase: "应用层",
      desc: `应用产生 ${APP}B 报文（如 HTTP GET）。分层模型两种：OSI 七层（物/链/网/传/会/表/应）是法律标准，会话与表示层很少独立实现；TCP/IP 四层（网接/网/传/应）是事实标准。5 层综合模型是 408 的答题基准。`,
    },
    {
      step: 1,
      phase: "传输层",
      desc: `TCP 加 ${LAYERS[1]!.headBytes}B 头 → ${ENC.sizes[1]!}B 段。端口（16 位）标识进程，端到端（进程到进程）。TCP 面向连接可靠；UDP 无连接。同层实体叫「对等实体」，靠协议字段互相理解。`,
    },
    {
      step: 2,
      phase: "网络层",
      desc: `IP 再加 ${LAYERS[2]!.headBytes}B 头 → ${ENC.sizes[2]!}B 分组。IP 地址（32 位）标识主机，主机到主机、尽力而为。路由器工作在这层。`,
    },
    {
      step: 3,
      phase: "链路层",
      desc: `以太网帧头 ${LAYERS[3]!.headBytes}B + 帧尾 FCS ${LAYERS[3]!.tailBytes}B → 最终帧 ${ENC.sizes[3]!}B（含 ${APP}B 数据 + ${ENC.overhead}B 开销）。MAC 地址标识网卡，链路/网段内有效。交换机在这层。MTU 1500B 限制单帧 payload，超了要 IP 分片。`,
    },
    {
      step: 4,
      phase: "物理层",
      desc: "帧变成比特流上线（编码/调制）。每个中间设备只拆到它需要的层：交换机读 MAC（链路层）、路由器读 IP（网络层）再重新成帧转发——所以 IP 头在每一跳不变（TTL 减），链路层头每一跳都换。",
    },
    {
      step: 5,
      phase: "接收端拆包",
      desc: "对端自下而上：校验 FCS → 剥以太网头 → IP 校验 → 剥 IP 头 → 按协议号 6 交给 TCP → 按端口交给进程。封装/解封装是考试画图高频：给各层头长算帧长、判断设备工作层次。",
    },
  ];
}

function PacketBar({ depth, dir }: { depth: number; dir: "send" | "recv" }) {
  const shown = dir === "send" ? LAYERS.slice(0, depth + 1) : LAYERS;
  const size = dir === "send" ? ENC.sizes[Math.min(depth, 3)]! : ENC.sizes[3]!;
  const segs: { label: string; w: number; cls: string }[] = [];
  const appW = (APP / ENC.sizes[3]!) * 100;
  if (dir === "recv") {
    const rem = Math.max(0, 3 - depth);
    if (rem >= 1) segs.push({ label: "IP头", w: (20 / size) * 100, cls: "bg-amber-400 text-amber-900" });
    if (rem >= 2) segs.push({ label: "TCP头", w: (20 / size) * 100, cls: "bg-sky-400" });
    if (rem >= 3) segs.push({ label: "以太头", w: (14 / size) * 100, cls: "bg-violet-400" });
    segs.push({ label: "数据", w: appW, cls: "bg-emerald-500" });
  } else {
    if (depth >= 3) {
      segs.push({ label: "以太头", w: (14 / size) * 100, cls: "bg-violet-400" });
      segs.push({ label: "TCP头", w: (20 / size) * 100, cls: "bg-sky-400" });
      segs.push({ label: "IP头", w: (20 / size) * 100, cls: "bg-amber-400 text-amber-900" });
    } else if (depth === 2) {
      segs.push({ label: "TCP头", w: (20 / size) * 100, cls: "bg-sky-400" });
      segs.push({ label: "IP头", w: (20 / size) * 100, cls: "bg-amber-400 text-amber-900" });
    } else if (depth === 1) {
      segs.push({ label: "TCP头", w: (20 / size) * 100, cls: "bg-sky-400" });
    }
    segs.push({ label: "数据", w: appW, cls: "bg-emerald-500" });
  }
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded border border-border">
        {segs.map((s, i) => (
          <div key={i} className={cn("flex items-center justify-center overflow-hidden border-r text-[10px] font-bold text-white last:border-r-0", s.cls)} style={{ width: `${s.w}%` }}>
            {s.label}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {dir === "send" ? `当前 PDU：${LAYERS[Math.min(depth, 3)]!.pdu}，${size}B` : depth === 0 ? "已剥到应用数据" : `剩余 ${["链路层帧", "IP 分组", "TCP 段"][Math.min(3 - depth, 2)]}`}
      </p>
    </div>
  );
}

export function EncapView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const dir = fr.step >= 5 ? "recv" : "send";
  const recvDepth = fr.step >= 5 ? fr.step - 4 : 3; // 5→1, 6→2 → clamp

  return (
    <div className="space-y-4">
      <PacketBar depth={dir === "send" ? Math.min(fr.step, 4) : Math.min(recvDepth, 3)} dir={dir} />
      {fr.step === 4 && (
        <div className="rounded-xl border border-dashed p-3 text-center font-mono text-xs">
          比特流 0101… 上线路由器：拆链路层 → 读 IP → 换链路头 → 转发
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
