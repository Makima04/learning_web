// 图解 · 页面置换：经典 Belady 序列 1,2,3,4,1,2,5,1,2,3,4,5。
// FIFO 3 帧缺页 9 次、加到 4 帧反而 10 次（Belady 异常）；LRU 10 次；OPT 7 次（理论下界）。
// 另含 CLOCK / 改进 CLOCK，以及 2015/2019/2025 LRU 真题串。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const REF_STR = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
export const CLOCK_REF = [1, 2, 3, 1, 4, 2, 5];
/** 改进 CLOCK 演示串：比 CLOCK 多一次命中 3，好露出 (0,1) 脏页 */
export const CLOCK2_REF = [1, 2, 3, 1, 4, 3, 5];
/** 与 CLOCK2_REF 对齐：true = 写访问，置 M=1 */
export const CLOCK2_WRITES = [false, true, false, false, false, false, true];
export const LRU2015_REF = [2, 0, 2, 9, 3, 4, 2, 8, 2, 4, 8, 4, 5, 7];
export const LRU2019_REF = [0, 1, 2, 7, 0, 5, 3, 5, 0, 2, 7, 6];
export const LRU2025_REF = [0, 1, 2, 0, 5, 1, 4, 3, 0, 2, 3, 2, 0];
export const LRU2025_INIT = [0, 1, 2];

export type PrAlgo = "FIFO" | "LRU" | "OPT" | "CLOCK" | "CLOCK2";
export type AmClass = [0 | 1, 0 | 1];
/** 2016 选 26 答案 A：先冷且干净，再冷脏，再热干净，最后热脏 */
export const CLOCK2_ORDER: AmClass[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

export interface PrStep {
  ref: number;
  frames: (number | null)[];
  hit: boolean;
  evicted?: number;
  /** LRU 用：最近使用时间戳 */
  lastUsed: number[];
  aBits?: number[];
  mBits?: number[];
  clockHand?: number;
  /** 改进 CLOCK：第几轮扫到牺牲页 */
  clock2Scans?: number;
}

/** 改进 CLOCK 选牺牲页：最多四轮。(0,0) 不改 A → (0,1) 沿途清 A → 再 (0,0) → 再 (0,1) */
export function clock2Victim(
  pages: { id: number; a: 0 | 1; m: 0 | 1 }[],
  start: number
): { victimIndex: number; scans: number; afterA: (0 | 1)[] } {
  const n = pages.length;
  const afterA: (0 | 1)[] = pages.map((p) => p.a);
  if (n === 0) return { victimIndex: 0, scans: 1, afterA };

  const at = (i: number) => (((start % n) + n + i) % n);

  const find = (wantM: 0 | 1, clearA: boolean): number => {
    for (let i = 0; i < n; i++) {
      const idx = at(i);
      if (afterA[idx] === 0 && pages[idx]!.m === wantM) return idx;
      if (clearA) afterA[idx] = 0;
    }
    return -1;
  };

  let v = find(0, false);
  if (v >= 0) return { victimIndex: v, scans: 1, afterA };
  v = find(1, true);
  if (v >= 0) return { victimIndex: v, scans: 2, afterA };
  v = find(0, false);
  if (v >= 0) return { victimIndex: v, scans: 3, afterA };
  v = find(1, true);
  return { victimIndex: v >= 0 ? v : at(0), scans: 4, afterA };
}

/** 单算法模拟：返回每步快照与缺页数。initial 预填帧（不计缺页）；writes[i] 表示本次写访问 */
export function pageReplace(
  refs: number[],
  m: number,
  algo: PrAlgo,
  initial?: number[] | null,
  writes?: boolean[] | null
): { steps: PrStep[]; faults: number } {
  const frames: (number | null)[] = Array.from({ length: m }, () => null);
  const lastUsed = Array.from({ length: m }, () => -1);
  const loadedAt = Array.from({ length: m }, () => -1);
  const aBits = Array.from({ length: m }, () => 0);
  const mBits = Array.from({ length: m }, () => 0);
  const steps: PrStep[] = [];
  let faults = 0;
  let time = 0;
  let hand = 0;

  const seed = initial ?? [];
  for (let i = 0; i < m && i < seed.length; i++) {
    frames[i] = seed[i]!;
    time++;
    lastUsed[i] = time;
    loadedAt[i] = time;
    aBits[i] = 1;
  }

  for (let i = 0; i < refs.length; i++) {
    const r = refs[i]!;
    const isWrite = writes?.[i] === true;
    time++;
    const idx = frames.indexOf(r);
    const hit = idx >= 0;
    let evicted: number | undefined;
    let clock2Scans: number | undefined;

    if (hit) {
      lastUsed[idx] = time;
      aBits[idx] = 1;
      if (isWrite) mBits[idx] = 1;
    } else {
      faults++;
      let slot = frames.indexOf(null);
      if (slot < 0) {
        if (algo === "FIFO") {
          slot = loadedAt.reduce((mi, t, j, a) => (t < a[mi]! ? j : mi), 0);
        } else if (algo === "LRU") {
          slot = lastUsed.reduce((mi, t, j, a) => (t < a[mi]! ? j : mi), 0);
        } else if (algo === "OPT") {
          const future = frames.map((p) => {
            const next = refs.slice(i + 1).indexOf(p!);
            return next === -1 ? Infinity : next;
          });
          slot = future.reduce((mi, t, j, a) => (t > a[mi]! ? j : mi), 0);
        } else if (algo === "CLOCK") {
          let guard = 0;
          while (aBits[hand] === 1 && guard < m) {
            aBits[hand] = 0;
            hand = (hand + 1) % m;
            guard++;
          }
          slot = hand;
          hand = (hand + 1) % m;
        } else {
          const pages = frames.map((id, j) => ({
            id: id!,
            a: (aBits[j] ? 1 : 0) as 0 | 1,
            m: (mBits[j] ? 1 : 0) as 0 | 1,
          }));
          const v = clock2Victim(pages, hand);
          clock2Scans = v.scans;
          for (let j = 0; j < m; j++) aBits[j] = v.afterA[j]!;
          slot = v.victimIndex;
          hand = (v.victimIndex + 1) % m;
        }
        evicted = frames[slot]!;
      } else if (algo === "CLOCK" || algo === "CLOCK2") {
        hand = (slot + 1) % m;
      }
      frames[slot] = r;
      lastUsed[slot] = time;
      loadedAt[slot] = time;
      aBits[slot] = 1;
      mBits[slot] = isWrite ? 1 : 0;
    }

    const step: PrStep = { ref: r, frames: [...frames], hit, evicted, lastUsed: [...lastUsed] };
    if (algo === "CLOCK" || algo === "CLOCK2") {
      step.aBits = [...aBits];
      step.clockHand = hand;
    }
    if (algo === "CLOCK2") {
      step.mBits = [...mBits];
      if (clock2Scans !== undefined) step.clock2Scans = clock2Scans;
    }
    steps.push(step);
  }
  return { steps, faults };
}

/** 缺页且当时没有空帧才 +1（2019 选 29：置换次数 ≠ 缺页次数） */
export function replaceCount(refs: number[], m: number, algo: PrAlgo, initial?: number[] | null): number {
  return pageReplace(refs, m, algo, initial).steps.filter((s) => !s.hit && s.evicted !== undefined).length;
}

interface PRFrame extends VizFrame {
  upto: number;
}

interface ModeCfg {
  key: string;
  algo: PrAlgo;
  m: number;
  refs: number[];
  initial?: number[];
  writes?: boolean[];
  label: string;
  group: "algo" | "exam";
}

const MODES: ModeCfg[] = [
  { key: "fifo3", algo: "FIFO", m: 3, refs: REF_STR, label: "FIFO·3", group: "algo" },
  { key: "fifo4", algo: "FIFO", m: 4, refs: REF_STR, label: "FIFO·4", group: "algo" },
  { key: "lru3", algo: "LRU", m: 3, refs: REF_STR, label: "LRU·3", group: "algo" },
  { key: "opt3", algo: "OPT", m: 3, refs: REF_STR, label: "OPT·3", group: "algo" },
  { key: "clock", algo: "CLOCK", m: 3, refs: CLOCK_REF, label: "CLOCK", group: "algo" },
  { key: "clock2", algo: "CLOCK2", m: 3, refs: CLOCK2_REF, writes: CLOCK2_WRITES, label: "改进CLOCK", group: "algo" },
  { key: "lru2015", algo: "LRU", m: 4, refs: LRU2015_REF, label: "2015 LRU", group: "exam" },
  { key: "lru2019", algo: "LRU", m: 4, refs: LRU2019_REF, label: "2019 LRU", group: "exam" },
  { key: "lru2025", algo: "LRU", m: 3, refs: LRU2025_REF, initial: LRU2025_INIT, label: "2025 LRU", group: "exam" },
];

function victimWhy(algo: PrAlgo, st: PrStep): string {
  if (algo === "FIFO") return "最早进入的";
  if (algo === "LRU") return "最久未用的";
  if (algo === "OPT") return "将来最晚才用/不再用的";
  if (algo === "CLOCK") return "指针扫到的 A=0 页（第二次机会已用尽）";
  const scans = st.clock2Scans ?? 1;
  const want: AmClass = scans % 2 === 1 ? [0, 0] : [0, 1];
  return `改进 CLOCK 第 ${scans} 轮找 (${want[0]},${want[1]})`;
}

function introOf(cfg: ModeCfg): string {
  const head = `访问串 ${cfg.refs.join(" ")}，物理帧 ${cfg.m} 个，算法 ${cfg.algo}。`;
  if (cfg.key === "clock") {
    return `${head}CLOCK（第二次机会）：循环指针扫帧，A=1 清 0 再给一次机会，A=0 淘汰；新装入页 A=1，指针前进一步。命中只把 A 置 1、指针不动。`;
  }
  if (cfg.key === "clock2") {
    return `${head}改进 CLOCK 看 (A,M)：淘汰次序 (0,0)→(0,1)→(1,0)→(1,1)（2016 选 26 答案 A）。标 ᵂ 的是写访问，会把 M 置 1。优先踢干净冷页，少写磁盘。`;
  }
  if (cfg.key === "lru2015") {
    return `${head}2015 选 27：4 帧局部 LRU，问访问 7 时淘汰哪一页。先把 5 访问完，看帧里谁最久没被碰。`;
  }
  if (cfg.key === "lru2019") {
    return `${head}2019 选 29：问的是「页置换次数」不是缺页次数——前 4 次填空帧不算置换。`;
  }
  if (cfg.key === "lru2025") {
    return `${head}2025 选 26：0,1,2 已在内存（初始不计缺页），问本串缺页异常处理次数。`;
  }
  return `${head}缺页才产生磁盘 I/O（还要看修改位决定是否写回），命中率是置换算法的核心指标。`;
}

function buildPrFrames(cfg: ModeCfg, run: { steps: PrStep[]; faults: number }): PRFrame[] {
  const frames: PRFrame[] = [];
  const snap = (desc: string, phase: string, upto: number) => frames.push({ desc, phase, upto });
  const { steps, faults } = run;
  const n = cfg.refs.length;
  const repl = steps.filter((s) => !s.hit && s.evicted !== undefined).length;

  snap(introOf(cfg), "初始", 0);
  steps.forEach((a, i) => {
    const bits =
      cfg.algo === "CLOCK" && a.aBits
        ? ` 指针→帧${(a.clockHand ?? 0) + 1}，A=[${a.aBits.join("")}]。`
        : cfg.algo === "CLOCK2" && a.aBits && a.mBits
          ? ` 指针→帧${(a.clockHand ?? 0) + 1}，(A,M)=${a.aBits.map((b, j) => `(${b},${a.mBits![j]})`).join("")}。`
          : "";
    snap(
      a.hit
        ? `访问 ${a.ref}${cfg.writes?.[i] ? "（写）" : ""}：帧里有 → 命中 ✓。${
            cfg.algo === "LRU" ? "刷新它的「最近使用」时间。" : cfg.algo === "CLOCK" || cfg.algo === "CLOCK2" ? "A 置 1，指针不动。" : ""
          }${bits}`
        : `访问 ${a.ref}${cfg.writes?.[i] ? "（写）" : ""}：缺页！${
            a.evicted !== undefined
              ? `${a.evicted} 被淘汰（${victimWhy(cfg.algo, a)}），${a.ref} 装入。`
              : "有空帧，直接装入。"
          }累计缺页 ${steps.slice(0, i + 1).filter((s) => !s.hit).length}/${i + 1}。${bits}`,
      a.hit ? `命中 ${a.ref}` : `缺页 ${a.ref}`,
      i + 1
    );
  });

  if (cfg.key === "clock2") {
    const v2021 = clock2Victim(
      [
        { id: 3, a: 1, m: 0 },
        { id: 4, a: 1, m: 1 },
      ],
      0
    );
    snap(
      `本串 ${cfg.m} 帧共缺页 ${faults} 次 / ${n} 次访问。改进 CLOCK 淘汰次序 ${CLOCK2_ORDER.map((c) => `(${c[0]},${c[1]})`).join(" → ")}。2018 大题 45(3)：页表项除存在位外，还要访问位 A + 修改位 M。`,
      "2016 / 2018",
      n
    );
    snap(
      `2021 选 28 旁注：页 4KB，VA=02A01H → 页号 02H、偏移 A01H。页 2 存在位=0 才缺页，旧帧 20H 已无效。内存里页 3=(1,0) 帧 60H、页 4=(1,1) 帧 80H；改进 CLOCK 第 ${v2021.scans} 轮淘汰页 ${v2021.victimIndex === 0 ? 3 : 4}（先清 A 再找 (0,0)）。物理地址 = 帧号‖偏移 → 60A01H。先看存在位，缺页才走置换。`,
      "2021 选28",
      n
    );
    return frames;
  }

  if (cfg.key === "lru2015") {
    const after5 = steps[steps.length - 2];
    const evict7 = steps.at(-1)?.evicted;
    snap(
      `访问完 5 之后帧内是 ${after5?.frames.filter((x) => x !== null).join("、")}，最久未用的是即将被 7 挤掉的那页。访问 7：淘汰页 ${evict7}（2015 选 27）。`,
      "2015 选27",
      n
    );
    return frames;
  }
  if (cfg.key === "lru2019") {
    snap(
      `本串缺页 ${faults} 次，其中填空帧 ${faults - repl} 次、真正置换 ${repl} 次。2019 选 29 问「产生页置换的总次数」→ ${repl}。`,
      "2019 选29",
      n
    );
    return frames;
  }
  if (cfg.key === "lru2025") {
    snap(
      `0,1,2 已在内存，本串缺页 ${faults} 次 / ${n} 次访问（初始装入不计）。2025 选 26 问缺页异常处理次数 → ${faults}。`,
      "2025 选26",
      n
    );
    return frames;
  }

  snap(`本算法 ${cfg.m} 帧共缺页 ${faults} 次 / ${n} 次访问。${cfg.algo === "CLOCK" ? "Clock 是 LRU 的近似：只用 1 位访问位，硬件便宜得多。" : ""}`, "小计", n);
  return frames;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-sm",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function PageReplaceView() {
  const [mode, setMode] = useState("fifo3");
  const cfg = MODES.find((x) => x.key === mode)!;
  const run = useMemo(
    () => pageReplace(cfg.refs, cfg.m, cfg.algo, cfg.initial ?? null, cfg.writes),
    [cfg]
  );
  const frames = useMemo(() => buildPrFrames(cfg, run), [cfg, run]);
  const p = usePlayer(frames.length);
  const fr = frames[Math.min(p.idx, frames.length - 1)]!;
  const steps = run.steps.slice(0, fr.upto);
  const showBits = cfg.algo === "CLOCK" || cfg.algo === "CLOCK2";
  const initCol = cfg.initial ?? [];

  const fifo3 = pageReplace(REF_STR, 3, "FIFO").faults;
  const fifo4 = pageReplace(REF_STR, 4, "FIFO").faults;
  const lru3 = pageReplace(REF_STR, 3, "LRU").faults;
  const opt3 = pageReplace(REF_STR, 3, "OPT").faults;
  const exam2015 = pageReplace(LRU2015_REF, 4, "LRU").steps.at(-1)?.evicted;
  const exam2019 = replaceCount(LRU2019_REF, 4, "LRU");
  const exam2019Faults = pageReplace(LRU2019_REF, 4, "LRU").faults;
  const exam2025 = pageReplace(LRU2025_REF, 3, "LRU", LRU2025_INIT).faults;

  const switchTo = (key: string) => {
    setMode(key);
    p.reset();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MODES.filter((m) => m.group === "algo").map((m) => (
          <TabBtn key={m.key} active={mode === m.key} onClick={() => switchTo(m.key)}>
            {m.label}
          </TabBtn>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">408 真题</span>
        {MODES.filter((m) => m.group === "exam").map((m) => (
          <TabBtn key={m.key} active={mode === m.key} onClick={() => switchTo(m.key)}>
            {m.label}
          </TabBtn>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-center font-mono text-xs">
          <thead>
            <tr>
              <th className="p-1 text-muted-foreground">访问</th>
              {initCol.length > 0 && <th className="w-10 p-1 text-muted-foreground">初始</th>}
              {cfg.refs.map((r, i) => (
                <th
                  key={i}
                  className={cn(
                    "p-1",
                    showBits ? "min-w-[2.5rem]" : "w-8",
                    i < fr.upto ? "font-bold text-foreground" : "text-muted-foreground/40"
                  )}
                >
                  {r}
                  {cfg.writes?.[i] ? <span className="text-amber-600">ᵂ</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: cfg.m }, (_, row) => (
              <tr key={row}>
                <th className="p-1 text-muted-foreground">帧{row + 1}</th>
                {initCol.length > 0 && (
                  <td className="border border-border/50 bg-muted/40 p-1 text-muted-foreground">{initCol[row] ?? "·"}</td>
                )}
                {cfg.refs.map((_, i) => {
                  const st = steps[i];
                  const v = st?.frames[row];
                  const isNew = st && !st.hit && v === st.ref;
                  const isEvict = st && !st.hit && st.evicted !== undefined && steps[i - 1]?.frames[row] !== v && v !== st.ref;
                  const isHand = showBits && st && st.clockHand === row;
                  return (
                    <td
                      key={i}
                      className={cn(
                        "border border-border/50 p-1 leading-tight",
                        i >= fr.upto && "text-transparent",
                        isNew && "bg-sky-500/25 font-bold",
                        isEvict && "text-muted-foreground",
                        isHand && i === fr.upto - 1 && "ring-1 ring-amber-500"
                      )}
                    >
                      <div>{v ?? "·"}</div>
                      {showBits && st && v !== null && st.aBits && i < fr.upto && (
                        <div className="text-[9px] text-muted-foreground">
                          A{st.aBits[row]}
                          {cfg.algo === "CLOCK2" ? `M${st.mBits?.[row] ?? 0}` : ""}
                          {isHand ? " ▲" : ""}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th className="p-1 text-muted-foreground">命中?</th>
              {initCol.length > 0 && <td className="p-1 text-muted-foreground">·</td>}
              {cfg.refs.map((_, i) => {
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
      {cfg.algo === "CLOCK2" && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">淘汰次序</span>
          {CLOCK2_ORDER.map((c, i) => (
            <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono">
              {i + 1}.({c[0]},{c[1]})
            </span>
          ))}
          <span className="text-muted-foreground">ᵂ = 写，置 M=1；▲ = 循环指针</span>
        </div>
      )}
      {cfg.algo === "CLOCK" && (
        <div className="text-[11px] text-muted-foreground">每帧显示页号与访问位 A；▲ 是循环指针（指向下一候选）。命中只置 A，不挪指针。</div>
      )}
      <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
        Belady 串缺页：FIFO·3帧 {fifo3} 次、FIFO·4帧 {fifo4} 次（帧更多缺页反而更多 → Belady 异常，FIFO 独有）、
        LRU·3帧 {lru3} 次、OPT·3帧 {opt3} 次（理论最优，无法在线实现，只作评价基准）。Clock 近似 LRU；改进 Clock 再加修改位，少写回脏页。
        {cfg.group === "exam" && (
          <span className="mt-1 block text-foreground">
            {cfg.key === "lru2015" && `2015 选 27：访问 7 时 LRU 淘汰页 ${exam2015}。`}
            {cfg.key === "lru2019" && `2019 选 29：缺页 ${exam2019Faults} 次，置换 ${exam2019} 次（填空帧不算）。`}
            {cfg.key === "lru2025" && `2025 选 26：已在内存的 0,1,2 不计，本串缺页 ${exam2025} 次。`}
          </span>
        )}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
