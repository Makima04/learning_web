// 图解 · 动态规划（408 尺度）：最长公共子序列 LCS。dp 表逐行填、最后回溯出解。
// 与贪心的分界：子问题重叠 + 需要全局最优时，把「子问题的答案」存表复用。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const LCS_X = "ABCBDAB";
export const LCS_Y = "BDCABA";

/** LCS dp 表：dp[i][j] = X 前 i 个与 Y 前 j 个的 LCS 长 */
export function lcsTable(x: string, y: string): { dp: number[][]; len: number } {
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => Array.from({ length: y.length + 1 }, () => 0));
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i]![j] = x[i - 1] === y[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return { dp, len: dp[x.length]![y.length]! };
}

/** 回溯一个 LCS（相等走对角；不等走上/左中较大者，上优先） */
export function lcsBacktrack(x: string, y: string): string {
  const { dp } = lcsTable(x, y);
  let i = x.length;
  let j = y.length;
  let out = "";
  while (i > 0 && j > 0) {
    if (x[i - 1] === y[j - 1]) {
      out = x[i - 1] + out;
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  return out;
}

/** 子序列判定（验证回溯结果合法性） */
export function isSubseq(sub: string, s: string): boolean {
  let it = 0;
  for (const ch of s) {
    if (it < sub.length && ch === sub[it]) it++;
  }
  return it === sub.length;
}

interface DFrame extends VizFrame {
  dp: number[][];
  row: number; // 当前填到的行（0 = 还没开始）
  path: [number, number][]; // 回溯路径（完成帧用）
}

function buildDpFrames(): DFrame[] {
  const frames: DFrame[] = [];
  const { dp, len } = lcsTable(LCS_X, LCS_Y);
  const x = LCS_X;
  const y = LCS_Y;
  const empty: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : -1))
  );
  const cur = empty.map((r) => [...r]);
  const snap = (desc: string, phase: string, row: number) =>
    frames.push({ desc, phase, dp: cur.map((r) => [...r]), row, path: [] });

  snap(
    `X="${x}"（竖），Y="${y}"（横）。dp[i][j] = X 前 i 个字符与 Y 前 j 个字符的 LCS 长度。转移：字符相等 → dp[i-1][j-1]+1（对角）；不等 → max(上, 左)。第 0 行/第 0 列全 0（空串）。与分治的区别：子问题重叠（同一个 (i,j) 被反复需要），存表避免重算——fib(4) 演示里那两棵重复子树就是 DP 的动机。`,
    "初始",
    0
  );
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      cur[i]![j] = dp[i]![j]!;
    }
    const eq = [...y].filter((c) => c === x[i - 1]).length;
    snap(
      `填第 ${i} 行（X 的第 ${i} 个字符 "${x[i - 1]!}"，与 Y 中 ${eq} 个字符相等）：相等格取对角 +1，不等格取上/左较大者。逐行填保证算 dp[i][j] 时左边、上边、左上都已就绪——这就是「无后效性 + 最优子结构」的落地。`,
      `第 ${i} 行`,
      i
    );
  }
  // 回溯路径
  const path: [number, number][] = [];
  let i = x.length;
  let j = y.length;
  while (i > 0 && j > 0) {
    path.push([i, j]);
    if (x[i - 1] === y[j - 1]) {
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  const lcs = lcsBacktrack(x, y);
  frames.push({
    desc: `dp[${x.length}][${y.length}] = ${len}，即 LCS 长度 ${len}。从右下角回溯（相等 → 沿对角收字符；不等 → 走上/左中较大的一边，路径不唯一，LCS 也不唯一）得到一条 LCS："${lcs}"（验证：确实是两串的公共子序列 ✓）。空间可滚动到 O(min(m,n))；要回溯解就得留整表。408 尺度的 DP 常与 LCS/背包/最长上升子序列（O(n²) 或 O(nlogn)）出现在算法设计题。`,
    phase: "完成",
    dp: cur.map((r) => [...r]),
    row: x.length,
    path,
  });
  return frames;
}

export function DpView() {
  const frames = useMemo(buildDpFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const pathKeys = new Set(fr.path.map(([i, j]) => `${i}-${j}`));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="border-collapse text-center font-mono text-xs">
          <thead>
            <tr>
              <th className="p-1 text-muted-foreground">dp</th>
              <th className="p-1 text-muted-foreground">∅</th>
              {LCS_Y.split("").map((c, j) => (
                <th key={j} className="w-8 p-1 font-bold text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fr.dp.map((row, i) => (
              <tr key={i}>
                <th className="p-1 font-bold text-muted-foreground">{i === 0 ? "∅" : LCS_X[i - 1]}</th>
                {row.map((v, j) => (
                  <td
                    key={j}
                    className={cn(
                      "border border-border p-1",
                      pathKeys.has(`${i}-${j}`) && "bg-emerald-500/30 font-bold",
                      fr.row === i && j > 0 && !pathKeys.has(`${i}-${j}`) && "bg-sky-500/20",
                      v === -1 && "text-transparent"
                    )}
                  >
                    {v === -1 ? "0" : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">蓝 = 本步填的行；绿 = 回溯路径（相等格）。答案在右下角。</p>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
