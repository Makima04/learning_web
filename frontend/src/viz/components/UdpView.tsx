// 图解 · UDP 与校验和：8B 首部（源口/目的口/长度/校验和）+ 伪首部（只参与校验，不传输）。
// 反码求和（回卷取反）由 udpChecksum() 现算，已用脚本核对：sum=0xF445、checksum=0x0BBA、回验全 1。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

/** 16 位反码求和：回卷后取反。words 为所有 16 位字（伪首部+首部+数据） */
export function udpChecksum(words: number[]): { sum: number; checksum: number } {
  let s = 0;
  for (const w of words) {
    s += w;
    while (s >> 16) s = (s & 0xffff) + (s >> 16);
  }
  return { sum: s, checksum: ~s & 0xffff };
}

/** 演示场景：192.168.10.70:5353 → 192.168.10.254:53，数据 "Hi"(0x4869) 填充 0x0000 */
export const SC = {
  src: "192.168.10.70",
  dst: "192.168.10.254",
  srcPort: 0x14e9,
  dstPort: 0x0035,
  len: 12,
  data: [0x4869, 0x0000],
};

export function scenarioWords(): { pseudo: number[]; header: number[]; data: number[] } {
  const ip = (s: string) => s.split(".").map(Number);
  const [a, b, c, d] = ip(SC.src);
  const [e, f, g, h] = ip(SC.dst);
  const pseudo = [(a << 8) | b, (c << 8) | d, (e << 8) | f, (g << 8) | h, 0x0000, 17, SC.len];
  const header = [SC.srcPort, SC.dstPort, SC.len, 0]; // 校验和位先置 0
  return { pseudo, header, data: [...SC.data] };
}

const W = scenarioWords();
const ALL = [...W.pseudo, ...W.header, ...W.data];
const CALC = udpChecksum(ALL);
const VERIFY = udpChecksum([...W.pseudo, SC.srcPort, SC.dstPort, SC.len, CALC.checksum, ...W.data]);

const hex = (n: number) => "0x" + n.toString(16).toUpperCase().padStart(4, "0");

interface Frame extends VizFrame {
  show: "header" | "pseudo" | "sum" | "features";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "header",
      phase: "首部 8B",
      desc: `UDP 首部只有 4 个字段各 2B：源端口 ${SC.srcPort}（可省，如 DNS 查询仍填）、目的端口 ${SC.dstPort}、长度（首部+数据，最小 8）、校验和（可选——全 0 表示「没算」）。端口定位进程：0~1023 熟知端口（DNS 53、DHCP 67/68、SNMP 161），49152+ 动态分配。`,
    },
    {
      show: "pseudo",
      phase: "伪首部",
      desc: `算校验和要多借 12B「伪首部」：源 IP、目的 IP、全零、协议号 17、UDP 长度。它不传输，只为校验——让接收方顺带确认「分组没被投错主机」。这是 UDP/TCP 共同的设计：传输层校验覆盖部分网络层信息。`,
    },
    {
      show: "sum",
      phase: "反码求和",
      desc: `算法：把伪首部 + 首部（校验位 0）+ 数据全部当 16 位字做二进制反码求和——溢出回卷（加回低位），最后取反填入校验和。本例求和 ${hex(CALC.sum)} → 取反得 ${hex(CALC.checksum)}。接收方把所有字（含校验和）再求和应为 ${hex(VERIFY.sum)}（全 1），否则丢弃（UDP 不重传，交给应用处理）。数据奇数字节要补 0 参与计算（不真发送）。`,
    },
    {
      show: "features",
      phase: "特点与适用",
      desc: "UDP：无连接（省握手）、尽最大努力（不保证可靠、不重传）、面向报文（不加不减，一次交付一个完整报文）、无拥塞控制（网络拥塞也不降速）、支持一对一/一对多/多对一/多对多（首部开销 8B vs TCP 20B）。适合：DNS（小而快）、DHCP、RIP、音视频（实时性 > 完整性，丢就丢了）、SNMP。把「可靠」交给应用自己实现（QUIC 就是 UDP 上重建可靠）。",
    },
  ];
}

function WordTable() {
  const rows = [
    { label: "伪首部", words: W.pseudo, cls: "bg-amber-400/20" },
    { label: "UDP 首部", words: W.header, cls: "bg-sky-400/20" },
    { label: "数据", words: W.data, cls: "bg-emerald-500/20" },
  ];
  return (
    <div className="space-y-1 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-muted-foreground">{r.label}</span>
          {r.words.map((w, i) => (
            <span key={i} className={`rounded border border-border px-1.5 py-0.5 font-mono ${r.cls}`}>{hex(w)}</span>
          ))}
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs">
        <span>Σ（回卷）= {hex(CALC.sum)}</span>
        <span className="font-bold text-sky-600">校验和 = ~Σ = {hex(CALC.checksum)}</span>
        <span className="text-emerald-600">回验 Σ' = {hex(VERIFY.sum)}（全 1 通过）</span>
      </div>
    </div>
  );
}

export function UdpView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "header" && (
        <div className="flex overflow-hidden rounded-xl border text-center text-xs">
          {[
            ["源端口", SC.srcPort.toString()],
            ["目的端口", SC.dstPort.toString() + " (53)"],
            ["长度", `${SC.len} B`],
            ["校验和", hex(CALC.checksum)],
          ].map(([n, v]) => (
            <div key={n} className="flex-1 border-r last:border-r-0">
              <div className="bg-muted/60 py-1 font-semibold">{n}（2B）</div>
              <div className="py-2 font-mono">{v}</div>
            </div>
          ))}
        </div>
      )}
      {(fr.show === "pseudo" || fr.show === "sum") && <WordTable />}
      {fr.show === "features" && (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {["无连接", "尽最大努力交付", "面向报文", "无拥塞控制", "首部仅 8B", "支持一对多等"].map((f) => (
            <div key={f} className="rounded-lg border px-3 py-2">{f}</div>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
