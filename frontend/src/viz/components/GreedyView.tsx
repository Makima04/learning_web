// 图解 · 贪心：活动选择（区间调度）。按「最早结束」贪心能选出最多 4 个不冲突活动；
// 换「最早开始」或「最短时长」作贪心标准都不行——同一组数据程序跑给你看。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface Act {
  s: number;
  f: number;
}
/** CLRS 经典 11 个活动（已按结束时间排序） */
export const ACTS: Act[] = [
  { s: 1, f: 4 }, { s: 3, f: 5 }, { s: 0, f: 6 }, { s: 5, f: 7 }, { s: 3, f: 8 },
  { s: 5, f: 9 }, { s: 6, f: 10 }, { s: 8, f: 11 }, { s: 8, f: 12 }, { s: 2, f: 13 }, { s: 12, f: 14 },
];

/** 活动选择：key = "finish"（最早结束贪心）| "start"（最早开始）| "short"（最短时长） */
export function activitySelect(acts: Act[], key: "finish" | "start" | "short" = "finish"): number[] {
  const sorted = acts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const kx = key === "finish" ? x.a.f : key === "start" ? x.a.s : x.a.f - x.a.s;
      const ky = key === "finish" ? y.a.f : key === "start" ? y.a.s : y.a.f - y.a.s;
      return kx - ky;
    });
  const picked: number[] = [];
  let last = -1;
  for (const { a, i } of sorted) {
    if (a.s >= last) {
      picked.push(i);
      last = a.f;
    }
  }
  return picked;
}

interface GFrame extends VizFrame {
  picked: number[];
  skipped: number[];
  cur: number | null;
  lastF: number | null;
}

function buildGreedyFrames(): GFrame[] {
  const frames: GFrame[] = [];
  const picked: number[] = [];
  const skipped: number[] = [];
  let last = -1;
  const snap = (desc: string, phase: string, cur: number | null) =>
    frames.push({ desc, phase, picked: [...picked], skipped: [...skipped], cur, lastF: last < 0 ? null : last });

  snap(
    "11 个活动各自有起止时间（横轴 0-14），同一时刻只能进行一个活动，目标：选出最多的相容活动。贪心 = 每步取「局部最优」且不回头。关键是选对贪心标准——按「结束时间最早」排序后依次尝试。",
    "初始",
    null
  );
  ACTS.forEach((a, i) => {
    if (a.s >= last) {
      picked.push(i);
      last = a.f;
      snap(
        `活动 ${i + 1}（${a.s}-${a.f}）：开始 ${a.s} ≥ 上一选中活动的结束 ${frames.at(-1)!.lastF ?? "无（第一个活动直接选）"} → 相容，选中 ✓。已选 ${picked.length} 个。直觉：结束得越早，给后面留的空间越大。`,
        `选 ${i + 1}`,
        i
      );
    } else {
      skipped.push(i);
      snap(`活动 ${i + 1}（${a.s}-${a.f}）：开始 ${a.s} < 上一个选中活动的结束 ${last}，冲突 → 跳过（贪心不回头）。`, `弃 ${i + 1}`, i);
    }
  });
  const byStart = activitySelect(ACTS, "start");
  const byShort = activitySelect(ACTS, "short");
  snap(
    `按最早结束贪心：选到 ${picked.length} 个活动（${picked.map((i) => `${i + 1}号`).join("、")}）——可以证明这就是最优。反例程序实测：按「最早开始」贪心只能选 ${byStart.length} 个、按「最短时长」只能选 ${byShort.length} 个——贪心策略错一步，结果就不是最优。408 贪心大题（如磁盘存储、哈夫曼也是贪心）都要先论证贪心标准成立。`,
    "完成",
    null
  );
  return frames;
}

export function GreedyView() {
  const frames = useMemo(buildGreedyFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const W = 460; // 横轴 0..14

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W + 30} 250`} className="w-full">
        {/* 时间轴 */}
        <line x1={20} y1={228} x2={W + 20} y2={228} stroke="#94a3b8" />
        {Array.from({ length: 8 }, (_, i) => i * 2).map((t) => (
          <g key={t}>
            <line x1={20 + (t / 14) * W} y1={224} x2={20 + (t / 14) * W} y2={232} stroke="#94a3b8" />
            <text x={20 + (t / 14) * W} y={244} textAnchor="middle" fontSize={9} fill="#64748b">{t}</text>
          </g>
        ))}
        {/* 上一个选中活动的结束线 */}
        {fr.lastF !== null && (
          <line x1={20 + (fr.lastF / 14) * W} y1={6} x2={20 + (fr.lastF / 14) * W} y2={222} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.4} />
        )}
        {ACTS.map((a, i) => {
          const y = 12 + i * 19;
          const isPicked = fr.picked.includes(i);
          const isSkipped = fr.skipped.includes(i);
          return (
            <g key={i} opacity={isSkipped ? 0.4 : 1}>
              <rect
                x={20 + (a.s / 14) * W}
                y={y}
                width={((a.f - a.s) / 14) * W}
                height={13}
                rx={4}
                fill={isPicked ? "#10b981" : fr.cur === i ? "#f59e0b" : "#94a3b8"}
                opacity={isPicked || fr.cur === i ? 0.9 : 0.35}
              />
              <text x={24 + (a.s / 14) * W} y={y + 10} fontSize={9} fontWeight={700} fill="#fff">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={cn("text-xs text-muted-foreground")}>
        绿 = 已选中，黄 = 当前考察，灰 = 已跳过；绿色虚线 = 上一个选中活动的结束时刻。已选 {fr.picked.length} 个。
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
