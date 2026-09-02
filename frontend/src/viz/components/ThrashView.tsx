// 图解 · 抖动与工作集：同一局部性串上帧不足则缺页暴增；工作集 WS(t, Δ) 由 workingSetAt 现算。
// 故障数复用 pageReplace 的 FIFO。四档：抖动曲线 / 工作集窗口 / 408 时刻 t / 缺页率因素。
import { useMemo, useState } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { pageReplace } from "@/viz/components/PageReplaceView";
import { cn } from "@/lib/utils";

/** 局部性访问串：程序循环访问页 1/2/3（工作集恒为 3 页） */
export const WS_REF = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3];

/** 2016 选择 29 教法演示串：窗口 Δ=6，观察时刻 t 的工作集 */
export const T408_REF = [1, 2, 3, 4, 2, 3, 4, 5, 6, 3, 2, 3, 4, 5, 6, 7];
export const T408_W = 6;

/** 时刻 t 的工作集：过去 w 次访问（含当前）触及的页集合。t 为 0-based，窗口 refs[max(0,t-w+1) ..= t] */
export function workingSetAt(refs: number[], w: number, t: number): Set<number> {
  return new Set(refs.slice(Math.max(0, t - w + 1), t + 1));
}

/** 工作集：过去 w 次访问出现过的页集合（返回每步的集合大小与页集合） */
export function workingSet(refs: number[], w: number): { sizes: number[]; sets: Set<number>[]; total: number } {
  const sets = refs.map((_, t) => workingSetAt(refs, w, t));
  const sizes = sets.map((s) => s.size);
  return { sizes, sets, total: Math.max(...sizes) };
}

/** 页框数从多到少，FIFO 缺页数（帧不足时暴增 = 抖动） */
export function thrashCurve(refs: number[], frames: number[]): number[] {
  return frames.map((m) => pageReplace(refs, m, "FIFO").faults);
}

function fmtSet(s: Set<number>): string {
  return `{${[...s].sort((a, b) => a - b).join(",")}}`;
}

const FRAMES = [5, 4, 3, 2];
const FAULTS = thrashCurve(WS_REF, FRAMES);
const WS2 = workingSet(WS_REF, 2);
const WS3 = workingSet(WS_REF, 3);

type Tab = "curve" | "ws" | "t408" | "factor";
type FactorKey = "fault" | "cost" | "eat" | "noeat";

interface Frame extends VizFrame {
  kind: "curve" | "cause" | "ws2" | "ws3" | "t408" | "factor";
  t: number;
  hot: FactorKey[];
}

const TABS: { key: Tab; label: string }[] = [
  { key: "curve", label: "抖动曲线" },
  { key: "ws", label: "工作集窗口" },
  { key: "t408", label: "408 时刻 t" },
  { key: "factor", label: "缺页率因素" },
];

const FACTOR_CARDS: { key: FactorKey; title: string; body: string; cls: string; hi: string }[] = [
  {
    key: "fault",
    title: "会影响缺页率",
    body: "置换算法、工作集/驻留集大小、进程数（多道程度）、页大小。驻留集 < 工作集 → 抖动。",
    cls: "border-sky-400 bg-sky-500/5",
    hi: "border-sky-500 bg-sky-500/15 ring-2 ring-sky-500",
  },
  {
    key: "cost",
    title: "不影响缺页率（影响缺页代价）",
    body: "页缓冲队列：已淘汰页的缓存。缺页已发生，队列命中只免读盘，不改变缺页次数。",
    cls: "border-amber-400 bg-amber-500/5",
    hi: "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500",
  },
  {
    key: "eat",
    title: "降低 EAT，不降缺页率",
    body: "TLB：缓存页表项，削翻译访存。页缓冲队列：降缺页 I/O，从而降平均访存时间。",
    cls: "border-emerald-500 bg-emerald-500/5",
    hi: "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500",
  },
  {
    key: "noeat",
    title: "不降低 EAT",
    body: "多级页表：减少页表连续内存，翻译多一次访存，平均访存时间上升而不是下降。",
    cls: "border-rose-400 bg-rose-500/5",
    hi: "border-rose-500 bg-rose-500/15 ring-2 ring-rose-500",
  },
];

function snap(kind: Frame["kind"], phase: string, desc: string, t = 0, hot: FactorKey[] = []): Frame {
  return { kind, phase, desc, t, hot };
}

function buildCurveFrames(): Frame[] {
  const f = FRAMES.map((m, i) => `${m} 框 ${FAULTS[i]!} 次`).join("、");
  return [
    snap(
      "curve",
      "缺页曲线",
      `程序循环访问页 1、2、3（${WS_REF.length} 次访问）。给它 ${FRAMES.map(String).join("/")} 个页框跑 FIFO：${f}。只要帧 ≥ 工作集的 3 页，缺页都是 3 次（头三回 compulsory）；帧一旦降到 2，每次访问都缺页（${FAULTS.at(-1)!} 次）——刚换入就被挤出去，磁盘忙于换页、CPU 几乎干不了活，这就是「抖动」（thrashing）。`
    ),
    snap(
      "cause",
      "根因",
      "抖动的根因：多道程序度（并发进程数）过高 → 每个进程分到的页框 < 其工作集 → 全体进程同时缺页 → 磁盘饱和、CPU 空转。反直觉点：此时「继续增加进程」更糟，「挂起（换出）几个进程」让其余进程凑够工作集才能止血。另有缺页率反馈（PFF）：缺页率高于阈值加框、低于则回收，等效于自适应调驻留集。分配与置换必须匹配：固定分配只能配局部置换；全局置换会改变各进程页框数，与固定分配矛盾（2015 选择 30 不能组合的就是「固定分配 + 全局置换」）。可变分配可配局部或全局。"
    ),
  ];
}

function buildWsFrames(): Frame[] {
  return [
    snap(
      "ws2",
      "工作集 w=2",
      `工作集 WS(t, w) = 过去 w 次访问触及的页集合，刻画「程序此刻真正需要的页量」。w=2 时各步工作集恒为 ${WS2.total} 页。窗口越小，工作集越紧贴最近的局部。`
    ),
    snap(
      "ws3",
      "工作集 w=3",
      `w=3 时工作集恒为 ${WS3.total} 页——这就是本题抖动的分水岭：驻留集 ≥ ${WS3.total} 时 3 次缺页后全是命中；< ${WS3.total} 缺页雪崩。工作集策略：定期采样工作集，缺页时把缺的页并入工作集、整个工作集驻留；驻留集始终 ≥ 工作集 → 不抖。`
    ),
  ];
}

function buildT408Frames(): Frame[] {
  const frames: Frame[] = [
    snap(
      "t408",
      "定义",
      `2016 选择 29：「若工作集窗口大小为 6，则在 t 时刻的工作集为？」。WS(t, Δ) = 过去 Δ 次访问触及的页集合（含当前）。下面用教材串 ${T408_REF.join(",")}，Δ=${T408_W}，窗口从左滑到右；格子数 = 窗口，集合写成 {…}。原卷序列在图里，文本丢了具体页号，算法与选项形态相同。`,
      0
    ),
  ];
  T408_REF.forEach((page, t) => {
    const s = workingSetAt(T408_REF, T408_W, t);
    const lo = Math.max(0, t - T408_W + 1);
    const n = t - lo + 1;
    frames.push(
      snap(
        "t408",
        `t=${t} 访问 ${page}`,
        `时刻 t=${t}（0-based），访问页 ${page}。窗口下标 [${lo}, ${t}]，共 ${n} 格${n < T408_W ? "（串首不足 Δ，窗口从 0 起）" : ""}。WS(t, ${T408_W}) = ${fmtSet(s)}，大小 ${s.size}。选工作集就是把窗口里出现过的页去重，与顺序无关。`,
        t
      )
    );
  });
  const last = workingSetAt(T408_REF, T408_W, T408_REF.length - 1);
  frames.push(
    snap(
      "t408",
      "收束",
      `滑完：最后时刻 t=${T408_REF.length - 1} 的工作集 ${fmtSet(last)}。考试只问某一个 t，把图上 t 左侧（含 t）共 Δ 个访问圈出来去重即可。不要把窗口外的页算进去，也不要按访问顺序当答案。`,
      T408_REF.length - 1
    )
  );
  return frames;
}

function buildFactorFrames(): Frame[] {
  return [
    snap(
      "factor",
      "四类对照",
      "缺页率 ≠ 有效访存时间（EAT）。缺页率看「要不要进缺页处理」；EAT 还要看翻译几次、缺页要不要读盘。下面四张卡对应 408 常考的分界。",
      0,
      ["fault", "cost", "eat", "noeat"]
    ),
    snap(
      "factor",
      "2015 分配+置换",
      "2015 选择 30：不能组合的是「固定分配 + 全局置换」。固定分配规定各进程页框数不变；全局置换缺页时可抢别人的页框，页框数就变了——自相矛盾。能组合的是：固定+局部、可变+局部、可变+全局。多道程度（进程数）一高，每进程驻留集掉到工作集以下，缺页率飙升，这是抖动的开关。",
      0,
      ["fault"]
    ),
    snap(
      "factor",
      "2022 页缓冲",
      "2022 选择 30：不会影响系统缺页率的是「页缓冲队列的长度」。置换算法、工作集大小、进程数都会改缺页次数；页缓冲队列只是已淘汰页的内存缓存——缺页已经发生，队列命中只是免去读盘，改的是缺页处理代价，不是缺页次数本身。",
      0,
      ["cost"]
    ),
    snap(
      "factor",
      "2026 TLB vs 多级页表",
      "2026 选择 29：能降低平均访存时间的是 I TLB、III 工作集、IV 页表缓冲队列；II 多级页表不能。TLB 削翻译代价（不改缺页率）；工作集降缺页率；页缓冲队列降缺页 I/O。多级页表为的是页表本身不必连续占满内存，翻译却要多走一级，EAT 上升。口诀：降缺页靠工作集/置换/少进程；降代价靠 TLB 与页缓冲；多级页表省空间不省时间。",
      0,
      ["eat", "noeat"]
    ),
  ];
}

function buildFrames(tab: Tab): Frame[] {
  if (tab === "curve") return buildCurveFrames();
  if (tab === "ws") return buildWsFrames();
  if (tab === "t408") return buildT408Frames();
  return buildFactorFrames();
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

function T408Panel({ t }: { t: number }) {
  const s = workingSetAt(T408_REF, T408_W, t);
  const lo = Math.max(0, t - T408_W + 1);
  const win = T408_REF.slice(lo, t + 1);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        访问串（Δ = {T408_W}，当前 t = {t}）
      </p>
      <Cells
        items={T408_REF.map((v, i) => {
          const inWin = i >= lo && i <= t;
          return {
            v,
            label: i === t ? "t" : String(i),
            state: i === t ? "hi" : inWin ? "warn" : i < t ? "done" : "dim",
          };
        })}
        w="w-9"
      />
      <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">窗口内 {win.length} 格（满窗 = {T408_W}）</p>
        <Cells
          items={win.map((v, i) => ({
            v,
            label: String(lo + i),
            state: lo + i === t ? "hi" : "warn",
          }))}
          w="w-9"
        />
        <p className="font-mono text-lg font-bold">
          WS({t}, {T408_W}) = {fmtSet(s)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">共 {s.size} 页</span>
        </p>
      </div>
    </div>
  );
}

function FactorCards({ hot }: { hot: FactorKey[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FACTOR_CARDS.map((c) => (
        <div key={c.key} className={cn("rounded-xl border p-3 text-xs leading-6", hot.includes(c.key) ? c.hi : c.cls)}>
          <p className="mb-1 text-sm font-semibold">{c.title}</p>
          {c.body}
        </div>
      ))}
    </div>
  );
}

function CauseCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-rose-400 bg-rose-500/5 p-3 text-xs leading-6">
        <p className="mb-1 text-sm font-semibold text-rose-600">抖动中</p>
        进程多 → 每进程页框 &lt; 工作集 → 齐缺页 → 磁盘饱和 → CPU 空转
      </div>
      <div className="rounded-xl border border-emerald-500 bg-emerald-500/5 p-3 text-xs leading-6">
        <p className="mb-1 text-sm font-semibold text-emerald-600">解药</p>
        挂起部分进程 / 工作集策略 / PFF 反馈 / 预留页框。固定分配不可配全局置换（2015）。
      </div>
    </div>
  );
}

export function ThrashView() {
  const [tab, setTab] = useState<Tab>("curve");
  const frames = useMemo(() => buildFrames(tab), [tab]);
  const p = usePlayer(frames.length);
  const fr = frames[Math.min(p.idx, frames.length - 1)]!;

  const goTab = (next: Tab) => {
    setTab(next);
    p.reset();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goTab(t.key)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "ws" && (
        <div className="flex flex-wrap gap-2">
          {([2, 3] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                p.reset();
                if (w === 3) p.step(1);
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs",
                (w === 2 ? fr.kind === "ws2" : fr.kind === "ws3")
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              w={w}
            </button>
          ))}
        </div>
      )}
      {fr.kind === "curve" && <Curve />}
      {fr.kind === "cause" && <CauseCards />}
      {fr.kind === "ws2" && <WsBar ws={WS2} w={2} />}
      {fr.kind === "ws3" && <WsBar ws={WS3} w={3} />}
      {fr.kind === "t408" && <T408Panel t={fr.t} />}
      {fr.kind === "factor" && <FactorCards hot={fr.hot} />}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
