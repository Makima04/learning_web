// 图解 · Cache 映射：同一访问序列 [0,1,4,5,0,1]，直接映射全 miss（同组冲突抖动），
// 2 路组相联/全相联各命中 2 次——「相联度消灭冲突失效」当场可见。地址按 位 |index|offset 拆。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const CACHE_BLOCKS = [0, 1, 4, 5, 0, 1]; // 主存块号（块地址 = 块号×4B，主存地址 8 位）
const LINES = 4;

export type CacheOrg = "direct" | "set2" | "full";
export const ORG_LABEL: Record<CacheOrg, string> = {
  direct: "直接映射",
  set2: "2 路组相联",
  full: "全相联",
};

export interface Access {
  block: number;
  addr: number;
  /** 落到哪：line L / set S way W */
  where: string;
  hit: boolean;
  evict?: number;
}
export interface CacheSimResult {
  accesses: Access[];
  hits: number;
  /** 各槽位最终内容（块号 or null） */
  slots: (number | null)[];
  slotsPerSet: number[];
}

/** 模拟一次访问序列（LRU 替换） */
export function cacheSim(blocks: number[], org: CacheOrg): CacheSimResult {
  const sets = org === "direct" ? LINES : org === "set2" ? 2 : 1;
  const ways = LINES / sets;
  const tags: (number | null)[][] = Array.from({ length: sets }, () => Array.from({ length: ways }, () => null));
  const lru: number[][] = Array.from({ length: sets }, () => Array.from({ length: ways }, () => 0)); // 越小越久未用
  const accesses: Access[] = [];
  let hits = 0;
  let clock = 0;
  for (const b of blocks) {
    clock++;
    const set = org === "direct" ? b % LINES : org === "set2" ? b % 2 : 0;
    const si = org === "direct" ? set : set;
    const arr = tags[si]!;
    let hit = false;
    let way = arr.findIndex((t) => t === b);
    if (way >= 0) {
      hit = true;
      hits++;
    } else {
      // 找空位或 LRU
      way = arr.findIndex((t) => t === null);
      if (way < 0) {
        way = lru[si]!.reduce((m, v, i, a) => (v < a[m]! ? i : m), 0);
      }
      arr[way] = b;
    }
    lru[si]![way] = clock;
    accesses.push({
      block: b,
      addr: b * 4,
      where: org === "direct" ? `行 ${set}` : org === "set2" ? `组 ${set} 路 ${way}` : `行 ${way}`,
      hit,
    });
  }
  return {
    accesses,
    hits,
    slots: tags.flat(),
    slotsPerSet: tags.map((s) => s.length),
  };
}

interface CFrame extends VizFrame {
  /** 已模拟到的访问下标 */
  upto: number;
  org: CacheOrg;
  sim: CacheSimResult;
}

function buildCacheFrames(org: CacheOrg): CFrame[] {
  const frames: CFrame[] = [];
  const sim = cacheSim(CACHE_BLOCKS, org);
  const snap = (desc: string, phase: string, upto: number, simUpTo: CacheSimResult) =>
    frames.push({ desc, phase, upto, org, sim: simUpTo });

  const intro: Record<CacheOrg, string> = {
    direct: "直接映射：块号 mod 4 定行，每块只有唯一去处——硬件最简单，但同余的块互相踢。",
    set2: "2 路组相联：块号 mod 2 定组，组内 2 行任选（LRU）——折中方案，最常用。",
    full: "全相联：不限位置，任意空行都能放（LRU）——冲突最少，但比较器代价最大。",
  };
  const reSim = (n: number) => cacheSim(CACHE_BLOCKS.slice(0, n), org);
  snap(`${intro[org]}访问序列（主存块号）：${CACHE_BLOCKS.join("、")}。主存地址 8 位 = 块号 6 位 + 块内 2 位；块 0 的地址 0x00、块 4 的地址 0x10。看哪些访问命中（绿）、哪些失效（红）。`, "初始", 0, reSim(0));
  CACHE_BLOCKS.forEach((b, k) => {
    const r = reSim(k + 1);
    const a = r.accesses.at(-1)!;
    const hitRate = r.hits / (k + 1);
    const kickedEarlier = org === "direct" && CACHE_BLOCKS.slice(0, k).some((x) => x % LINES === b % LINES && x !== b);
    snap(
      a.hit
        ? `访问块 ${b}（地址 0x${a.addr.toString(16).padStart(2, "0").toUpperCase()}）：${a.where} 里正是它 → 命中 ✓（Cache 送 CPU，约 1~几个周期）。当前命中率 ${(hitRate * 100).toFixed(0)}%。`
        : `访问块 ${b}（地址 0x${a.addr.toString(16).padStart(2, "0").toUpperCase()}）：${a.where} 不是它 → 失效，从主存调入整块${kickedEarlier ? "——行里先前的同余块又被踢了出去，这种「你来我往」就是直接映射的冲突抖动" : ""}。当前命中率 ${(hitRate * 100).toFixed(0)}%。`,
      a.hit ? "命中" : "失效",
      k + 1,
      r
    );
  });
  const direct = cacheSim(CACHE_BLOCKS, "direct");
  const set2 = cacheSim(CACHE_BLOCKS, "set2");
  const full = cacheSim(CACHE_BLOCKS, "full");
  snap(
    `结果：直接映射命中 ${direct.hits}/6、2 路组相联 ${set2.hits}/6、全相联 ${full.hits}/6。块 0/4 与 1/5 在直接映射下挤同一行，互相踢（冲突失效抖动）；给一行加一路就把它们隔开了。平均访问时间 = 命中率×Tc + 失效率×Tm。写策略补一句：写命中用「写直达」（同时写 Cache 与主存，配写缓冲）或「写回」（脏位，替换时才写回）；写失效按「写分配/非写分配」。`,
    "完成",
    CACHE_BLOCKS.length,
    sim
  );
  return frames;
}

type Mode = CacheOrg;

export function CacheView() {
  const [mode, setMode] = useState<Mode>("direct");
  const frames = useMemo(() => buildCacheFrames(mode), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const sets = mode === "direct" ? 4 : mode === "set2" ? 2 : 1;
  const cur = fr.sim.accesses[fr.upto - 1];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["direct", "set2", "full"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {ORG_LABEL[m]}
          </button>
        ))}
      </div>
      {cur && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 font-mono text-xs">
          <span>块 {cur.block}</span>
          <span className="text-muted-foreground">地址 {cur.addr.toString(2).padStart(8, "0")}₂ =</span>
          <span className="rounded bg-violet-500/25 px-1.5 py-0.5 font-bold">{Math.floor(cur.block / sets).toString(2).padStart(8 - 2 - Math.log2(sets), "0")}ᴛ</span>
          <span className="rounded bg-emerald-500/25 px-1.5 py-0.5 font-bold">{(mode === "direct" ? cur.block % 4 : mode === "set2" ? cur.block % 2 : 0).toString(2).padStart(Math.log2(sets), "0")}ᵢ</span>
          <span className="rounded bg-amber-500/25 px-1.5 py-0.5 font-bold">00ₒ</span>
          <span className={cn("rounded px-1.5 py-0.5 font-bold", cur.hit ? "bg-emerald-600 text-white" : "bg-rose-500 text-white")}>
            {cur.hit ? "命中" : "失效"} → {cur.where}
          </span>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Cache 槽位（绿 = 当前命中块；{mode === "direct" ? "每行一组" : mode === "set2" ? "每组 2 行" : "1 组 4 行"}）
        </p>
        <div className="flex flex-wrap gap-1.5">
          {fr.sim.slots.map((t, i) => {
            const isCur = cur && t === cur.block && (mode === "direct" ? i === cur.block % 4 : mode === "set2" ? Math.floor(i / 2) === cur.block % 2 : true);
            return (
              <div key={i} className={cn("w-16 overflow-hidden rounded-md border text-center", isCur ? "border-emerald-600" : "border-border")}>
                <div className="bg-muted text-[10px] text-muted-foreground">
                  {mode === "direct" ? `行 ${i}` : mode === "set2" ? `组 ${Math.floor(i / 2)}·路 ${i % 2}` : `行 ${i}`}
                </div>
                <div className={cn("py-0.5 font-mono text-sm font-bold", t === null && "text-muted-foreground")}>{t === null ? "—" : `块${t}`}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CACHE_BLOCKS.map((b, k) => (
          <div
            key={k}
            className={cn(
              "w-10 rounded border py-0.5 text-center font-mono text-xs font-bold",
              k >= fr.upto ? "border-border text-muted-foreground/50" : fr.sim.accesses[k]?.hit ? "border-emerald-600 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" : "border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-400"
            )}
          >
            {b}
          </div>
        ))}
        <span className="self-center text-xs text-muted-foreground">← 访问序列（绿命中/红失效），已命中 {fr.sim.hits}/{fr.upto}</span>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
