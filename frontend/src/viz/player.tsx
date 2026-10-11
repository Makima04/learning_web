// 可视化共享播放器：所有演示组件的「帧」都预先算好，播放只是推进索引。
// 这样单步/后退/变速天然支持，也方便对帧生成逻辑写单测。
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface VizFrame {
  /** 本步解说（教学核心，写清“做了什么、为什么”） */
  desc: string;
  /** 阶段标签，如「建堆」「第 2 趟」「失配」 */
  phase?: string;
}

/** 三档播放速度（ms/步） */
export const SPEEDS = [
  { label: "慢", ms: 1500 },
  { label: "中", ms: 750 },
  { label: "快", ms: 350 },
];

export function usePlayer(total: number) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    if (idx >= total - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(
      () => setIdx((i) => Math.min(i + 1, total - 1)),
      SPEEDS[speed].ms
    );
    return () => window.clearTimeout(t);
  }, [playing, idx, total, speed]);

  const step = useCallback(
    (d: number) => {
      setPlaying(false);
      setIdx((i) => Math.min(Math.max(0, i + d), total - 1));
    },
    [total]
  );
  const reset = useCallback(() => {
    setPlaying(false);
    setIdx(0);
  }, []);

  return { idx, playing, speed, setSpeed, setPlaying, step, reset, total };
}

export type Player = ReturnType<typeof usePlayer>;

/** 步进控制条：重置/上一步/播放暂停/下一步 + 速度档 */
export function VizControls({ p }: { p: Player }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={p.reset} title="回到第一步">
        ⏮ 重置
      </Button>
      <Button size="sm" variant="outline" onClick={() => p.step(-1)} disabled={p.idx === 0}>
        ◀ 上一步
      </Button>
      <Button size="sm" onClick={() => p.setPlaying(!p.playing)}>
        {p.playing ? "⏸ 暂停" : "▶ 播放"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => p.step(1)}
        disabled={p.idx >= p.total - 1}
      >
        下一步 ▶
      </Button>
      <span className="ml-1 text-xs tabular-nums text-muted-foreground">
        第 {p.idx + 1} / {p.total} 步
      </span>
      <div className="ml-auto flex overflow-hidden rounded-full border-2 border-border">
        {SPEEDS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            className={cn(
              "px-2.5 py-1 text-xs",
              p.speed === i
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
            onClick={() => p.setSpeed(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 当前步骤解说面板 */
export function StepDesc({ frame }: { frame: VizFrame }) {
  return (
    <div className="min-h-[64px] rounded-2xl border-2 border-border/70 bg-card p-3 text-sm leading-relaxed shadow-edge-sm">
      {frame.phase && (
        <span className="mr-2 inline-block rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
          {frame.phase}
        </span>
      )}
      {frame.desc}
    </div>
  );
}

/** 统一色板：跟主题变量走，亮暗都可读。黄色状态用深色字。 */
export const C = {
  node: "var(--viz-node)",
  nodeText: "var(--viz-node-text)",
  active: "var(--viz-active)",
  activeText: "var(--viz-on)",
  done: "var(--viz-done)",
  doneText: "var(--viz-on)",
  warn: "var(--viz-warn)",
  warnText: "var(--viz-warn-text)",
  bad: "var(--viz-bad)",
  badText: "var(--viz-on)",
  line: "var(--viz-line)",
  text: "var(--viz-text)",
} as const;

/* ---------- 共享渲染小件：数组格子 / 下标转下标数字 ---------- */

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

/** 数字转下标字符（1→₁），用于标记重复元素的原始身份 */
export function sub(s: string | number): string {
  return String(s).split("").map((ch) => SUB[ch] ?? ch).join("");
}

export interface CellItem {
  v: ReactNode;
  /** 上标注释（通常是下标），配 tag 角标显示 */
  label?: ReactNode;
  /** 重复元素的原始位置角标（仅重复值给） */
  tag?: string;
  state?: "normal" | "hi" | "done" | "warn" | "bad" | "dim";
}

const CELL_CLS: Record<NonNullable<CellItem["state"]>, string> = {
  normal: "border-border bg-muted/40 text-foreground",
  hi: "border-info bg-info text-info-foreground",
  done: "border-success bg-success text-success-foreground",
  warn: "border-warning bg-warning text-warning-foreground",
  bad: "border-destructive bg-destructive text-destructive-foreground",
  dim: "border-border/60 bg-transparent text-muted-foreground",
};

/** 数组格子行：label 行 + 值行，配合 state 做高亮 */
export function Cells({ items, w = "w-11" }: { items: CellItem[]; w?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => {
        const st = it.state ?? "normal";
        const plain = st === "normal" || st === "dim";
        return (
          <div key={i} className={cn("overflow-hidden rounded-xl border-2 text-center", w, CELL_CLS[st])}>
            {it.label != null && (
              <div className={cn("text-[10px] leading-4", plain ? "bg-muted text-muted-foreground" : "opacity-80")}>
                {it.label}
                {it.tag ? sub(it.tag) : ""}
              </div>
            )}
            <div className="py-0.5 font-mono text-sm font-bold">{it.v}</div>
          </div>
        );
      })}
    </div>
  );
}
