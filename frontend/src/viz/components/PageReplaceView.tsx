// 图解 · 页面置换：经典 Belady 序列 1,2,3,4,1,2,5,1,2,3,4,5。
// FIFO 3 帧缺页 9 次、加到 4 帧反而 10 次（Belady 异常）；LRU 10 次；OPT 7 次（理论下界）。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const REF_STR = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
export type PrAlgo = "FIFO" | "LRU" | "OPT";

export interface PrStep {
  ref: number;
  frames: (number | null)[];
  hit: boolean;
  evicted?: number;
  /** LRU 用：最近使用时间戳 */
  lastUsed: number[];
}

/** 单算法模拟：返回每步快照与缺页数 */
export function pageReplace(refs: number[], m: number, algo: PrAlgo): { steps: PrStep[]; faults: number } {
  const frames: (number | null)[] = Array.from({ length: m }, () => null);
  const lastUsed = Array.from({ length: m }, () => -1);
  const loadedAt = Array.from({ length: m }, () => -1); // FIFO 用
  const steps: PrStep[] = [];
  let faults = 0;
  let clock = 0;
  for (const r of refs) {
    clock++;
    const idx = frames.indexOf(r);
    let hit = idx >= 0;
    let evicted: number | undefined;
    if (hit) {
      lastUsed[idx] = clock;
    } else {
      faults++;
      let slot = frames.indexOf(null);
      if (slot < 0) {
        if (algo === "FIFO") {
          slot = loadedAt.reduce((mi, t, i, a) => (t < a[mi]! ? i : mi), 0); // 最早进入
        } else if (algo === "LRU") {
          slot = lastUsed.reduce((mi, t, i, a) => (t < a[mi]! ? i : mi), 0); // 最久未用
        } else {
          // OPT：淘汰「将来最晚才被用到 / 不再使用」的页
          const future = frames.map((p) => {
            const next = refs.slice(clock).indexOf(p!);
            return next === -1 ? Infinity : next;
          });
          slot = future.reduce((mi, t, i, a) => (t > a[mi]! ? i : mi), 0);
        }
        evicted = frames[slot]!;
      }
      frames[slot] = r;
      lastUsed[slot] = clock;
      loadedAt[slot] = clock;
    }
    steps.push({ ref: r, frames: [...frames], hit, evicted, lastUsed: [...lastUsed] });
  }
  return { steps, faults };
}

interface PRFrame extends VizFrame {
  upto: number;
  algo: PrAlgo;
  m: number;
}

function buildPrFrames(algo: PrAlgo, m: number): PRFrame[] {
  const frames: PRFrame[] = [];
  const { steps, faults } = pageReplace(REF_STR, m, algo);
  const reSim = (n: number) => pageReplace(REF_STR.slice(0, n), m, algo);
  const snap = (desc: string, phase: string, upto: number) => frames.push({ desc, phase, upto, algo, m });

  snap(
    `访问串 ${REF_STR.join(" ")}，物理帧 ${m} 个，算法 ${algo}。缺页才产生磁盘 I/O（还要看修改位决定是否写回），命中率是置换算法的核心指标。`,
    "初始",
    0
  );
  steps.forEach((st, i) => {
    const cur = reSim(i + 1);
    const a = cur.steps.at(-1)!;
    snap(
      a.hit
        ? `访问 ${a.ref}：帧里有 → 命中 ✓（LRU 顺便刷新它的「最近使用」时间）。`
        : `访问 ${a.ref}：缺页！${a.evicted !== undefined ? `${a.evicted} 被淘汰（${algo === "FIFO" ? "最早进入的" : algo === "LRU" ? "最久未用的" : "将来最晚才用/不再用的"}），${a.ref} 装入。` : `有空帧，直接装入。`}累计缺页 ${cur.faults}/${i + 1}。`,
      a.hit ? `命中 ${a.ref}` : `缺页 ${a.ref}`,
      i + 1
    );
  });
  snap(`本算法 ${m} 帧共缺页 ${faults} 次 / ${REF_STR.length} 次访问。`, "小计", REF_STR.length);
  return frames;
}

type Mode = "fifo3" | "fifo4" | "lru3" | "opt3";
const MODES: { key: Mode; algo: PrAlgo; m: number; label: string }[] = [
  { key: "fifo3", algo: "FIFO", m: 3, label: "FIFO·3帧" },
  { key: "fifo4", algo: "FIFO", m: 4, label: "FIFO·4帧" },
  { key: "lru3", algo: "LRU", m: 3, label: "LRU·3帧" },
  { key: "opt3", algo: "OPT", m: 3, label: "OPT·3帧" },
];

export function PageReplaceView() {
  const [mode, setMode] = useState<Mode>("fifo3");
  const cfg = MODES.find((x) => x.key === mode)!;
  const frames = useMemo(() => buildPrFrames(cfg.algo, cfg.m), [cfg]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const steps = pageReplace(REF_STR.slice(0, fr.upto), fr.m, fr.algo).steps;
  const fifo3 = pageReplace(REF_STR, 3, "FIFO").faults;
  const fifo4 = pageReplace(REF_STR, 4, "FIFO").faults;
  const lru3 = pageReplace(REF_STR, 3, "LRU").faults;
  const opt3 = pageReplace(REF_STR, 3, "OPT").faults;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-center font-mono text-xs">
          <thead>
            <tr>
              <th className="p-1 text-muted-foreground">访问</th>
              {REF_STR.map((r, i) => (
                <th key={i} className={cn("w-8 p-1", i < fr.upto ? "font-bold text-foreground" : "text-muted-foreground/40")}>
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: fr.m }, (_, row) => (
              <tr key={row}>
                <th className="p-1 text-muted-foreground">帧{row + 1}</th>
                {REF_STR.map((_, i) => {
                  const st = steps[i];
                  const v = st?.frames[row];
                  const isNew = st && !st.hit && v === st.ref;
                  const isEvict = st && !st.hit && st.evicted !== undefined && steps[i - 1]?.frames[row] !== v && v !== st.ref;
                  return (
                    <td
                      key={i}
                      className={cn(
                        "border border-border/50 p-1",
                        i >= fr.upto && "text-transparent",
                        isNew && "bg-sky-500/25 font-bold",
                        isEvict && "text-muted-foreground"
                      )}
                    >
                      {v ?? "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th className="p-1 text-muted-foreground">命中?</th>
              {REF_STR.map((_, i) => {
                const st = steps[i];
                return (
                  <td key={i} className="p-1">
                    {st && i < fr.upto ? (
                      <span className={cn("font-bold", st.hit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {st.hit ? "✓" : "✗"}
                      </span>
                    ) : (
                      <span className="text-transparent">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
        四种组合的缺页数：FIFO·3帧 {fifo3} 次、FIFO·4帧 {fifo4} 次（帧更多缺页反而更多 → Belady 异常，FIFO 独有）、
        LRU·3帧 {lru3} 次、OPT·3帧 {opt3} 次（理论最优，无法在线实现，只作评价基准）。Clock（NRU 简化版）近似 LRU。
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
