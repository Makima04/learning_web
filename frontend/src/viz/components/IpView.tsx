// 图解 · IP 地址/子网/CIDR：192.168.1.0/24 借 2 位划 4 个子网（每网 62 主机）；
// 已知地址+掩码用二进制 AND 演算网络地址/广播地址；CIDR 聚合把 4 个 /24 并成 /22。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export interface SubnetInfo {
  network: string;
  broadcast: string;
  first: string;
  last: string;
  count: number;
  mask: string;
}

const ipToInt = (ip: string): number =>
  ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
const intToIp = (n: number): string =>
  [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

/** 子网信息：网络地址 / 广播地址 / 可用范围 / 掩码 */
export function subnetInfo(ip: string, prefix: number): SubnetInfo {
  const n = ipToInt(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (n & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return {
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    first: intToIp(network + 1),
    last: intToIp(broadcast - 1),
    count: 2 ** (32 - prefix) - 2,
    mask: intToIp(mask),
  };
}

/** CIDR 聚合：判断一组等长前缀网络能否聚合（连续且对齐），返回聚合前缀长度或 null */
export function aggregate(nets: string[]): number | null {
  const parsed = nets.map((s) => {
    const [ip, p] = s.split("/");
    return { n: ipToInt(ip!), prefix: Number(p) };
  });
  const prefix = parsed[0]!.prefix;
  if (parsed.some((x) => x.prefix !== prefix)) return null;
  const size = 2 ** (32 - prefix);
  const base = Math.min(...parsed.map((x) => x.n));
  if (parsed.some((x) => x.n % size !== base % size)) return null;
  const k = parsed.length;
  if (2 ** Math.ceil(Math.log2(k)) !== k || base % (size * k) !== 0) return null;
  return prefix - Math.log2(k);
}

interface IpFrame extends VizFrame {
  hi: number; // 演算高亮字节
}

function buildIpFrames(): IpFrame[] {
  const frames: IpFrame[] = [];
  const push = (desc: string, phase: string, hi = 3) => frames.push({ desc, phase, hi });

  push(
    "IP 地址 = 网络号 + 主机号。分类地址（A/B/C 类按首字节划分）已成历史，现在的核心是 CIDR/子网：前缀 /n 表示前 n 位是网络前缀，后面可再「借位」划分子网。主机号全 0 = 网络地址，全 1 = 广播地址，这两个不能分给主机。",
    "初始"
  );
  push(
    "划分子网：192.168.1.0/24 要分成 4 个子网 → 主机位借 2 位（2²=4），前缀变 /26，掩码 255.255.255.192。每个子网 2⁶=64 个地址，可用 62。",
    "借位"
  );
  [0, 64, 128, 192].forEach((off, i) => {
    const info = subnetInfo(`192.168.1.${off}`, 26);
    push(
      `子网 ${i + 1}：192.168.1.${off}/26，范围 ${info.first} ~ ${info.last}（可用 ${info.count} 个），网络地址 ${info.network}，广播地址 ${info.broadcast}。路由器按「最长前缀匹配」选路：给 192.168.1.70 的包先匹配 /26 的子网 2，而不是 /24。`,
      `子网 ${i + 1}`
    );
  });
  const q = subnetInfo("192.168.10.70", 26);
  push(
    `经典演算：主机 192.168.10.70，掩码 255.255.255.192。第四字节 70 = 01000110₂，掩码 192 = 11000000₂ → AND = 01000000₂ = 64 ⇒ 网络地址 ${q.network}；该子网块 64~127 ⇒ 广播地址 ${q.broadcast}，可用 ${q.first} ~ ${q.last}；主机号 = 70 − 64 = 6。套路：块大小 = 256 − 掩码字节（64），看地址落在哪个块的区间。`,
    "AND 演算"
  );
  const agg = aggregate(["192.168.0.0/24", "192.168.1.0/24", "192.168.2.0/24", "192.168.3.0/24"]);
  push(
    `CIDR 聚合（构成超网）：路由器把 192.168.0~3.0/24 四条路由并为 192.168.0.0/${agg}（第 3 字节 0~3 = 000000/000001/000010/000011，公共前缀取到第 22 位，掩码 255.255.252.0）。路由表从 4 条变 1 条。条件：网络连续、个数是 2 的幂、起始地址按聚合块对齐。`,
    "CIDR 聚合"
  );
  push(
    "补充要点：私有地址块 10/8、172.16/12、192.168/16（配合 NAT 用）；127.0.0.1 回环；主机号全 0/全 1 有特殊含义；IPv6 128 位、冒分十六进制、不再用 ARP（改 NDP）与广播（改组播）。子网划分的逆问题（最少借几位）用 2ⁿ ≥ 需求解。",
    "完成"
  );
  return frames;
}

export function IpView() {
  const frames = useMemo(buildIpFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const q = subnetInfo("192.168.10.70", 26);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center font-mono text-xs">
          <thead>
            <tr className="bg-muted/50">
              {["地址", "前缀", "掩码", "网络地址", "广播地址", "可用主机数"].map((h) => (
                <th key={h} className="border border-border p-1.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 64, 128, 192].map((off, i) => {
              const info = subnetInfo(`192.168.1.${off}`, 26);
              return (
                <tr key={off} className={fr.phase === `子网 ${i + 1}` ? "bg-sky-500/10" : ""}>
                  <td className="border border-border p-1.5">192.168.1.{off}</td>
                  <td className="border border-border p-1.5">/26</td>
                  <td className="border border-border p-1.5">255.255.255.192</td>
                  <td className="border border-border p-1.5">{info.network}</td>
                  <td className="border border-border p-1.5">{info.broadcast}</td>
                  <td className="border border-border p-1.5">{info.count}</td>
                </tr>
              );
            })}
            <tr className={fr.phase === "AND 演算" ? "bg-amber-500/10" : ""}>
              <td className="border border-border p-1.5 font-bold">192.168.10.70</td>
              <td className="border border-border p-1.5 font-bold">/26</td>
              <td className="border border-border p-1.5">255.255.255.192</td>
              <td className="border border-border p-1.5 font-bold">{q.network}</td>
              <td className="border border-border p-1.5 font-bold">{q.broadcast}</td>
              <td className="border border-border p-1.5">{q.count}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {fr.phase === "AND 演算" && (
        <div className="rounded-lg border bg-muted/30 p-2 font-mono text-xs leading-6">
          <div>192.168.10.<span className="font-bold text-sky-600 dark:text-sky-400">70</span> = …01000110₂</div>
          <div>255.255.255.<span className="font-bold text-sky-600 dark:text-sky-400">192</span> = …11000000₂</div>
          <div>AND ⇒ …01000000₂ = <span className="font-bold">64</span> → 网络 192.168.10.64；块 64–127；广播 .127；主机号 70−64=6</div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
