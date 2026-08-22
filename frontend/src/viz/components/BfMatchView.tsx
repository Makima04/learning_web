// 图解 · 串的暴力匹配 BF：主串指针 i 一次次回溯，本例成功匹配共比较 16 次；
// 同一数据交给 KMP（见 KMP 演示）主串不回溯——对比正是考点。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";

export const BF_S = "ababcabcacbab";
export const BF_T = "abcac";

export interface BfTrace {
  comparisons: number;
  /** 0-based 匹配起点，-1 未匹配 */
  foundAt: number;
  /** 每次比较：主串绝对下标、模式串下标、是否相等 */
  steps: { si: number; tj: number; ok: boolean; attempt: number }[];
}

/** BF 匹配本体：返回比较轨迹（考试常问：成功匹配共比较了多少次字符） */
export function bfTrace(s: string, t: string): BfTrace {
  const steps: BfTrace["steps"] = [];
  let comparisons = 0;
  for (let start = 0; start + t.length <= s.length; start++) {
    let j = 0;
    while (j < t.length) {
      const si = start + j;
      const ok = s[si] === t[j];
      comparisons++;
      steps.push({ si, tj: j, ok, attempt: start });
      if (!ok) break;
      j++;
    }
    if (j === t.length) return { comparisons, foundAt: start, steps };
  }
  return { comparisons, foundAt: -1, steps };
}

interface BfFrame extends VizFrame {
  s: CellItem[];
  t: CellItem[];
  offset: number;
}

function buildBfFrames(s: string, t: string): BfFrame[] {
  const trace = bfTrace(s, t);
  const frames: BfFrame[] = [];
  const sRow = (si: number, ok: boolean | null): CellItem[] =>
    s.split("").map((ch, i) => ({
      v: ch,
      state: i === si ? (ok === false ? "bad" : "hi") : i < si ? "dim" : "normal",
    }));
  const tRow = (tj: number, ok: boolean | null): CellItem[] =>
    t.split("").map((ch, j) => ({
      v: ch,
      state: j === tj ? (ok === false ? "bad" : "hi") : j < tj ? "done" : "normal",
    }));

  let lastAttempt = -1;
  frames.push({
    desc: `主串 S="${s}"（长 ${s.length}），模式串 T="${t}"（长 ${t.length}）。BF 的做法：T 对齐 S 的某个起点，从左往右逐字符比；一旦失配，S 指针回退到起点+1，T 从头再来。`,
    phase: "初始",
    s: sRow(-1, null),
    t: tRow(-1, null),
    offset: 0,
  });
  for (const st of trace.steps) {
    const restart = st.attempt !== lastAttempt;
    frames.push({
      desc: restart
        ? `T 对齐到 S 的第 ${st.attempt + 1} 个字符（下标 ${st.attempt}）重新开比：${s[st.si]} vs ${st.tj}。注意 i 从上一次失配处被「拽回」了——这就是 BF 的痛点。`
        : st.ok
          ? `${s[st.si]} = ${s[st.si]}（位置 ${st.si + 1}），继续右移比较。`
          : `${s[st.si]} ≠ ${s[st.si]}，失配！本趟作废：i 回溯到 ${st.attempt + 2}（起点+1），j 归 0，重新对齐。已比较字符的信息被白白扔掉。`,
      phase: restart ? `第 ${st.attempt + 1} 趟` : st.ok ? "比较" : "失配",
      s: sRow(st.si, st.ok),
      t: tRow(st.tj, st.ok),
      offset: st.attempt,
    });
    lastAttempt = st.attempt;
  }
  if (trace.foundAt >= 0) {
    frames.push({
      desc: `匹配成功！T 出现在 S 的第 ${trace.foundAt + 1} 个字符处，全程共比较 ${trace.comparisons} 次字符。BF 最好 O(m)，最坏 O(m×n)（如 S="aaaa…ab"、T="aaab"）。同一份数据给 KMP：主串指针一次都不回退，模式串用 next 数组「记住」已匹配前缀——去看 KMP 的演示对比。`,
      phase: "完成",
      s: s.split("").map((ch, i) => ({
        v: ch,
        state: i >= trace.foundAt && i < trace.foundAt + t.length ? "done" : "dim",
      })),
      t: tRow(t.length, null),
      offset: trace.foundAt,
    });
  }
  return frames;
}

export function BfMatchView() {
  const frames = useMemo(() => buildBfFrames(BF_S, BF_T), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const w = "w-8"; // 固定格宽，用 margin 让 T 行对齐到当前趟起点

  return (
    <div className="space-y-4">
      <div className="space-y-3 overflow-x-auto">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">主串 S（红色 = 当前失配位置）</p>
          <Cells items={fr.s} w={w} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">模式串 T（对齐到当前趟起点）</p>
          <div style={{ marginLeft: fr.offset * 34 }} className="w-fit">
            <Cells items={fr.t} w={w} />
          </div>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
