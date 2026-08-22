// 图解 · 抖动与工作集：同一个局部性访问串，页框从 5 减到 3，缺页反而暴增；
// 工作集窗口 w=2 / w=3 的驻留集大小由 workingSet() 现算。故障数复用 pageReplace 的 FIFO。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { pageReplace } from "@/viz/components/PageReplaceView";
import { cn } from "@/lib/utils";

/** 局部性访问串：程序循环访问页 1/2/3（工作集恒为 3 页） */
export const WS_REF = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3];

/** 工作集：过去 w 次访问出现过的页集合（返回每步的集合大小与页集合） */
export function workingSet(refs: number[], w: number): { sizes: number[]; sets: Set<number>[]; total: number } {
  const sets: Set<number>[] = [];
  const sizes: number[] = [];
  refs.forEach((_, t) => {
    const s = new Set(refs.slice(Math.max(0, t - w + 1), t + 1));
    sets.push(s);
    sizes.push(s.size);
  });
  return { sizes, sets, total: Math.max(...sizes) };
}

/** 页框数从多到少，FIFO 缺页数（帧不足时暴增 = 抖动） */
export function thrashCurve(refs: number[], frames: number[]): number[] {
  return frames.map((m) => pageReplace(refs, m, "FIFO").faults);
}

const FRAMES = [5, 4, 3, 2];
const FAULTS = thrashCurve(WS_REF, FRAMES);
const WS2 = workingSet(WS_REF, 2);
const WS3 = workingSet(WS_REF, 3);

interface Frame extends VizFrame {
  show: "curve" | "ws2" | "ws3" | "cause";
}

function buildFrames(): Frame[] {
  const f = FRAMES.map((m, i) => `${m} 框 ${FAULTS[i]!} 次`).join("、");
  return [
    {
      show: "curve",
      phase: "缺页曲线",
      desc: `程序循环访问页 1、2、3（${WS_REF.length} 次访问）。给它 ${FRAMES.map(String).join("/")} 个页框跑 FIFO：${f}。只要帧 ≥ 工作集的 3 页，缺页都是 3 次（头三回 compulsory）；帧一旦降到 2，每次访问都缺页（${FAULTS.at(-1)!} 次）——刚换入就被挤出去，磁盘忙于换页、CPU 几乎干不了活，这就是「抖动」（thrashing）。`,
    },
    {
      show: "ws2",
      phase: "工作集 w=2",
      desc: `工作集 WS(t, w) = 过去 w 次访问触及的页集合，刻画「程序此刻真正需要的页量」。w=2 时各步工作集恒为 ${WS2.total} 页。窗口越小，工作集越紧贴最近的局部。`,
    },
    {
      show: "ws3",
      phase: "工作集 w=3",
      desc: `w=3 时工作集恒为 ${WS3.total} 页——这就是本题抖动的分水岭：驻留集 ≥ ${WS3.total} 时 3 次缺页后全是命中；< ${WS3.total} 缺页雪崩。工作集策略：定期采样工作集，缺页时把缺的页并入工作集、整个工作集驻留；驻留集始终 ≥ 工作集 → 不抖。`,
    },
    {
      show: "cause",
      phase: "根因",
      desc: "抖动的根因：多道程序度（并发进程数）过高 → 每个进程分到的页框 < 其工作集 → 全体进程同时缺页 → 磁盘饱和、CPU 空转。反直觉点：此时「继续增加进程」更糟，「挂起（换出）几个进程」让其余进程凑够工作集才能止血。另有缺页率反馈（PFF）：缺页率高于阈值加框、低于则回收，等效于自适应调驻留集。",
    },
  ];
}

function Curve() {
  const max = Math.max(...FAULTS);
  return (
    <div className="flex items-end gap-4 rounded-xl border p-4">
      {FRAMES.map((m, i) => (
        <div key={m} className="flex-1 text-center">
          <p className="font-mono text-lg font-bold text-sky-600">{FAULTS[i]}</p>
          <div className="mx-auto mt-1 w-full rounded-t bg-sky-500/80" style={{ height: `${(FAULTS[i]! / max) * 90}px` }} />
          <p className="mt-1 text-xs text-muted-foreground">{m} 个页框</p>
        </div>
      ))}
    </div>
  );
}

function WsBar({ ws, w }: { ws: ReturnType<typeof workingSet>; w: number }) {
  return (
    <div className="space-y-1 overflow-x-auto">
      <p className="text-xs text-muted-foreground">窗口 w = {w}：每一步的工作集</p>
      <div className="flex gap-1">
        {ws.sets.map((s, t) => (
          <div key={t} className={cn("rounded border px-1 py-0.5 text-center font-mono text-[10px]", s.size >= 3 ? "border-amber-500 bg-amber-500/20" : "border-border bg-muted/40")}>
            <div className="text-muted-foreground">{WS_REF[t]}</div>
            <div>{[...s].sort().join("")}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">黄底 = 工作集达到 3 页（w=3 时全满：这就是必须给足的页框数）</p>
    </div>
  );
}

export function ThrashView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "curve" && <Curve />}
      {fr.show === "ws2" && <WsBar ws={WS2} w={2} />}
      {fr.show === "ws3" && <WsBar ws={WS3} w={3} />}
      {fr.show === "cause" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-400 bg-rose-500/5 p-3 text-xs leading-6">
            <p className="mb-1 text-sm font-semibold text-rose-600">抖动中</p>
            进程多 → 每进程页框 &lt; 工作集 → 齐缺页 → 磁盘饱和 → CPU 空转
          </div>
          <div className="rounded-xl border border-emerald-500 bg-emerald-500/5 p-3 text-xs leading-6">
            <p className="mb-1 text-sm font-semibold text-emerald-600">解药</p>
            挂起部分进程 / 工作集策略 / PFF 反馈 / 预留页框
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
