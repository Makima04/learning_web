// 图解 · IPv6 地址压缩：去前导零 → 连续全零组 → ::（只许一处）。
// compressIPv6() 按三步规则现算，经典示例（2001:db8::ff00:42:8329、::1）由测试锁定。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface CompressResult {
  steps: string[]; // 三步规则的中间结果
  result: string;
}

/** 压缩：①每组去前导零 ②≥2 个连续全零组→::（取最长、只一处）③单零组保留 0 */
export function compressIPv6(full: string): CompressResult {
  const groups = full.split(":").map((g) => g.toLowerCase());
  const zeroed = groups.map((g) => g.replace(/^0+(?=.)/, ""));
  const step1 = zeroed.join(":");
  // 找最长连续全零段（长度 ≥2 才缩）
  let best = -1;
  let bestLen = 0;
  let i = 0;
  while (i < zeroed.length) {
    if (zeroed[i] === "0") {
      let j = i;
      while (j < zeroed.length && zeroed[j] === "0") j++;
      const len = j - i;
      if (len > bestLen && len >= 2) {
        bestLen = len;
        best = i;
      }
      i = j;
    } else i++;
  }
  let result: string;
  if (best < 0) {
    result = step1;
  } else {
    const head = zeroed.slice(0, best).join(":");
    const tail = zeroed.slice(best + bestLen).join(":");
    result = `${head}::${tail}`;
  }
  return { steps: [step1], result };
}

export const SAMPLES = [
  "2001:0DB8:0000:0000:0000:FF00:0042:8329",
  "0000:0000:0000:0000:0000:0000:0000:0001",
  "2001:0db8:0001:0001:0001:0001:0001:0000",
];

interface Frame extends VizFrame {
  show: "rule" | "ex1" | "ex2" | "ex3" | "header";
}

function buildFrames(): Frame[] {
  const r0 = compressIPv6(SAMPLES[0]!);
  const r1 = compressIPv6(SAMPLES[1]!);
  const r2 = compressIPv6(SAMPLES[2]!);
  return [
    {
      show: "rule",
      phase: "压缩规则",
      desc: "IPv6 地址 128 位，8 组 × 4 个十六进制位，用 : 分隔。书写两条压缩规则：① 每组前导零可省（0042 → 42）；② 连续 ≥2 个全零组可缩成 ::，且整个地址只允许一处 ::（否则无法还原组数）。逐个看示例（已用 compressIPv6 现算，见右列）。",
    },
    {
      show: "ex1",
      phase: "示例 1",
      desc: `${SAMPLES[0]}：去前导零 → ${r0.steps[0]}；中间三组连续全零 0000:0000:0000 → 一处 :: → ${r0.result}。最常见题型：给完整形式写压缩形式（或反向展开）。`,
    },
    {
      show: "ex2",
      phase: "示例 2（全零）",
      desc: `${SAMPLES[1]}：8 组全零 → 整体一个 :: 加末尾的 1 → ${r1.result}（环回地址）。同理全零地址 :: = 未指定地址，::1 是环回。IPv4 映射地址如 ::ffff:192.168.1.1 也常考。`,
    },
    {
      show: "ex3",
      phase: "示例 3（单零不缩）",
      desc: `${SAMPLES[2]}：只有最后一组是单个 0 → 不满足「≥2 组连续」→ 不缩，写 ${r2.result} 的结尾是 1:0（保留一个 0）。注意 2001:db8:1:1:1:1:1:0 与 2001:db8:1:1:1:1:1:: 是同一个地址的两种写法，但后者更短——考试判「更优」。`,
    },
    {
      show: "header",
      phase: "头部与过渡",
      desc: "IPv6 头固定 40B：版本/流量类别/流标签/净荷长度/下一头/跳数限制/源/目的（128+128 位）。砍掉了校验和（每跳不再重算）、分片字段移到扩展头（只有源端分片）。地址分类：单播/多播/任播（没有广播！）。过渡技术：双栈（同时跑 v4/v6）、隧道（v6 装 v4 里穿越）。128 位 = 地址取之不尽，天然支持自动配置（SLAAC）。",
    },
  ];
}

export function Ipv6View() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 text-left font-medium">示例</th>
            <th className="text-left font-medium">完整形式</th>
            <th className="text-left font-medium">压缩结果</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLES.map((s, i) => {
            const r = compressIPv6(s);
            const hot = `ex${i + 1}` === fr.show;
            return (
              <tr key={s} className={cn("border-t", hot && "bg-sky-500/10 font-bold")}>
                <td className="py-1.5">示例 {i + 1}</td>
                <td className="font-mono text-[11px]">{s.toLowerCase()}</td>
                <td className="font-mono text-[11px] text-sky-600">{r.result}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fr.show === "header" && (
        <div className="rounded-xl border border-dashed p-4 text-center text-xs leading-6 text-muted-foreground">
          固定 40B 头 · 无首部校验和 · 无 hop 分片 · 无广播（用多播/任播替代）<br />
          过渡：双协议栈 / 隧道
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
