// 图解 · PPP：帧格式与透明传输（字节填充 7E→7D 5E）、LCP/NCP 建链五阶段。
// byteStuff() 与 pppStateWalk() 现算，测试锁定填充字节与阶段序列。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const PPP_TAIL: { name: string; bytes: string; note: string }[] = [
  { name: "标志 F", bytes: "7E", note: "帧定界（与 HDLC 相同）" },
  { name: "地址 A", bytes: "FF", note: "广播地址（点对点用不上，固定）" },
  { name: "控制 C", bytes: "03", note: "固定值" },
  { name: "协议", bytes: "2B", note: "0021=IP / C021=LCP / 8021=NCP" },
  { name: "信息", bytes: "≤1500B", note: "净荷（IP 数据报）" },
  { name: "FCS", bytes: "2B", note: "CRC 校验（只查地址起）" },
];

/** 字节填充：信息段里的定界/转义字节要转义（异步链路） */
export function byteStuff(data: number[]): number[] {
  const out: number[] = [];
  for (const b of data) {
    if (b === 0x7e) out.push(0x7d, 0x5e);
    else if (b === 0x7d) out.push(0x7d, 0x5d);
    else if (b === 0x03) out.push(0x7d, 0x23); // 控制字节约定也转义
    else if (b < 0x20) out.push(0x7d, b + 0x20);
    else out.push(b);
  }
  return out;
}

export type PppState = "dead" | "establish" | "auth" | "network" | "open" | "terminate";

/** 拨号建链：Dead→LCP 协商→(可选鉴别)→NCP 分配 IP→Open→Terminate */
export function pppStateWalk(auth: boolean): { state: PppState; msg: string }[] {
  const steps: { state: PppState; msg: string }[] = [
    { state: "dead", msg: "链路不可用（物理层未通）" },
    { state: "establish", msg: "LCP 协商：MRU、认证方式、魔术数等选项" },
  ];
  if (auth) steps.push({ state: "auth", msg: "鉴别：PAP（明文两次握手）或 CHAP（挑战-响应三次握手）" });
  steps.push(
    { state: "network", msg: "NCP 协商：IPCp 给主机分配/协商 IP 地址" },
    { state: "open", msg: "打开：可传 IP 分组（协议字段 0021）" },
    { state: "terminate", msg: "终止：LCP Terminate → 回到 Dead" },
  );
  return steps;
}

const DATA = [0x7e, 0x45, 0x7d, 0x00];
const STUFFED = byteStuff(DATA);

interface Frame extends VizFrame {
  show: "format" | "stuff" | "states" | "summary";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "format",
      phase: "帧格式",
      desc: "PPP（点对点协议）是用户-ISP 拨号/路由器串行链路的标准：Flag 7E + 固定 FF/03 + 协议字段（区分 LCP/NCP/IP）+ 信息段 + FCS + Flag。三个组成部分：封装格式、LCP（链路控制）、NCP（网络控制，如 IPCP 分 IP）。面向字节，帧长是整数倍字节。",
    },
    {
      show: "stuff",
      phase: "透明传输",
      desc: `信息段里出现与定界符相同的 7E 怎么办？异步链路用字节填充：7E → 7D 5E、7D → 7D 5D、小于 0x20 的控制字符 → 7D (c+20)。例：数据 [${DATA.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}] → 填充后 [${STUFFED.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}]，接收端逆变换。同步链路（如 SONET）用零比特填充（连续 5 个 1 后插 0，HDLC 做法）。PPP 不使用序号与确认——不可靠无重传，差错直接丢弃交上层`,
    },
    {
      show: "states",
      phase: "建链状态机",
      desc: "状态机走一遍（下图）：物理层通 → LCP 建立 → 鉴别（可选）→ NCP 分配 IP → OPEN 传数据 → Terminate。PAP 口令明文；CHAP 挑战-响应、口令不上链路。考试爱问：某阶段用哪个协议（LCP/NCP/IPCP）、CHAP 与 PAP 区别。",
    },
    {
      show: "summary",
      phase: "小结",
      desc: "PPP 特征清单：点对点（无 MAC/无冲突）、全双工、面向字节、差错检测（FCS）不纠错重传、支持多种网络层（协议字段）、支持身份鉴别（HDLC 没有）。 PPPoE 把 PPP 帧装进以太网，实现家宽拨号认证。",
    },
  ];
}

export function PppView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const states = pppStateWalk(true);

  return (
    <div className="space-y-4">
      {fr.show === "format" && (
        <div className="flex overflow-hidden rounded-xl border text-center text-[11px]">
          {PPP_TAIL.map((f) => (
            <div key={f.name} className="flex-1 border-r last:border-r-0" title={f.note}>
              <div className="bg-muted/60 py-1 font-semibold">{f.name}</div>
              <div className="py-1.5 font-mono text-xs">{f.bytes}</div>
            </div>
          ))}
        </div>
      )}
      {fr.show === "stuff" && (
        <div className="rounded-xl border p-3 font-mono text-xs leading-6">
          <div>原始数据：{DATA.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}</div>
          <div className="text-rose-500">7E、7D 是特殊字节，需转义 ↓</div>
          <div className="font-bold text-sky-600">发送字节：{STUFFED.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}</div>
        </div>
      )}
      {fr.show === "states" && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {states.map((s, i) => (
            <div key={s.state} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span className={cn("rounded border px-2 py-1 font-semibold", s.state === "open" ? "border-emerald-500 bg-emerald-500/10" : "border-border")} title={s.msg}>
                {s.state}
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
