// 图解 · 死锁与银行家算法：王道经典数据。安全性检查逐进程试分配（Work/Need 比较），
// 给出安全序列；再用 P4 的试探请求演示「不安全 → 拒绝并回滚」。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const BK_NAMES = ["P0", "P1", "P2", "P3", "P4"];
/** 王道经典：A/B/C 三类资源 */
export const BK_ALLOC = [
  [0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2],
];
export const BK_MAX = [
  [7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3],
];
export const BK_AVAIL = [3, 3, 2];
/** 试探请求：P4 要 (3,3,0) → 不安全，应拒绝 */
export const BK_REQUEST = { p: 4, req: [3, 3, 0] };

const needOf = (i: number) => BK_MAX[i]!.map((m, k) => m - BK_ALLOC[i]![k]!);
const fmt = (v: number[]) => `(${v.join(",")})`;

/** 安全性检查：返回安全序列（空 = 不安全） */
export function bankerSafe(avail: number[], alloc: number[][], max: number[][]): string[] {
  const n = alloc.length;
  const need = alloc.map((_, i) => max[i]!.map((m, k) => m - alloc[i]![k]!));
  const work = [...avail];
  const finished = Array.from({ length: n }, () => false);
  const seq: string[] = [];
  while (seq.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (!finished[i] && need[i]!.every((v, k) => v <= work[k]!)) {
        pick = i;
        break;
      }
    }
    if (pick < 0) return [];
    for (let k = 0; k < work.length; k++) work[k]! += alloc[pick]![k]!;
    finished[pick] = true;
    seq.push(BK_NAMES[pick]!);
  }
  return seq;
}

/** 试探请求：能否立即分配（预分配后再跑安全性检查） */
export function tryRequest(avail: number[], alloc: number[][], max: number[][], p: number, req: number[]): { grant: boolean; reason: string } {
  if (!req.every((v, k) => v <= needOf2(alloc, max, p)[k]!)) return { grant: false, reason: "请求超过 Need，进程自己声明的最大量都不够" };
  if (!req.every((v, k) => v <= avail[k]!)) return { grant: false, reason: "请求超过 Available，得先等" };
  const avail2 = avail.map((v, k) => v - req[k]!);
  const alloc2 = alloc.map((a, i) => (i === p ? a.map((v, k) => v + req[k]!) : [...a]));
  const seq = bankerSafe(avail2, alloc2, max);
  return seq.length
    ? { grant: true, reason: `试分配后仍安全（安全序列 ${seq.join("→")}），可以分配` }
    : { grant: false, reason: "试分配后找不到安全序列（不安全状态）→ 拒绝请求并回滚，P4 继续等" };
}
function needOf2(alloc: number[][], max: number[][], p: number): number[] {
  return max[p]!.map((m, k) => m - alloc[p]![k]!);
}

interface BkFrame extends VizFrame {
  /** 安全性检查进度：已完成的进程 + 当前 Work */
  finished: string[];
  work: number[];
  seq: string[];
  /** 请求试探阶段 */
  reqMode: boolean;
}

function buildBankerFrames(): BkFrame[] {
  const frames: BkFrame[] = [];
  const snap = (desc: string, phase: string, finished: string[], work: number[], seq: string[], reqMode = false) =>
    frames.push({ desc, phase, finished, work, seq, reqMode });

  const need = BK_NAMES.map((_, i) => needOf(i));
  snap(
    `银行家算法的数据四件套：Available ${fmt(BK_AVAIL)}、Allocation（已分）、Max（声明）、Need = Max − Allocation。安全性检查：拿着 Work（=Available 的副本）逐个问「谁的 Need ≤ Work？」——有就假设它跑完并归还资源（Work += Alloc），一路推到全部完成 = 安全；中途卡住 = 不安全。死锁四条件：互斥、持有并等待、不可剥夺、循环等待——破坏任一即可预防；银行家属于「避免」（事先算）。`,
    "初始",
    [],
    [...BK_AVAIL],
    []
  );
  const work = [...BK_AVAIL];
  const finished: string[] = [];
  const seq: string[] = [];
  while (finished.length < BK_NAMES.length) {
    let pick = -1;
    for (let i = 0; i < BK_NAMES.length; i++) {
      if (!finished.includes(BK_NAMES[i]!) && need[i]!.every((v, k) => v <= work[k]!)) {
        pick = i;
        break;
      }
    }
    if (pick < 0) break;
    snap(
      `Need ≤ Work 的候选里选 ${BK_NAMES[pick]}（Need ${fmt(need[pick]!)} ≤ Work ${fmt(work)}）→ 假设它顺利跑完，归还其 Allocation，Work 变为 ${fmt(work.map((w, k) => w + BK_ALLOC[pick]![k]!))}，加入安全序列。`,
      `试 ${BK_NAMES[pick]}`,
      [...finished],
      [...work],
      [...seq]
    );
    for (let k = 0; k < work.length; k++) work[k]! += BK_ALLOC[pick]![k]!;
    finished.push(BK_NAMES[pick]!);
    seq.push(BK_NAMES[pick]!);
  }
  snap(
    `安全序列 ${seq.join("→")} 找到：最坏情况下按这个顺序让进程独占跑完再释放，人人能到终点 ⇒ 当前状态安全。注意安全序列不唯一（P1 P3 P4 P0 P2 也是一条）。`,
    "安全",
    [...finished],
    [...work],
    [...seq]
  );

  // 试探请求
  const { p, req } = BK_REQUEST;
  snap(`换一个场景：${BK_NAMES[p]} 突然请求 ${fmt(req)}。三步判：① req ≤ Need ✓；② req ≤ Available ${fmt(BK_AVAIL)} ✓；③ 预分配后重跑安全性检查——先试着给。`, "请求到达", [...finished], [...BK_AVAIL], [], true);
  const avail2 = BK_AVAIL.map((v, k) => v - req[k]!);
  const need2 = need[p]!.map((v, k) => v - req[k]!);
  snap(`试分配：Available ${fmt(BK_AVAIL)} → ${fmt(avail2)}，${BK_NAMES[p]} 的 Need ${fmt(need[p]!)} → ${fmt(need2)}。现在检查新状态安不安全。`, "试分配", [...finished], [...avail2], [], true);
  const unsafe = BK_NAMES.every((_, i) => !needOf(i).map((v, k) => (i === p ? v - req[k]! : v)).every((v, k) => v <= avail2[k]!));
  snap(
    unsafe
      ? `逐个看：P0 Need(7,4,3)、P1(1,2,2)、P2(6,0,0)、P3(0,1,1)、P4 试分配后 (1,3,1)——没有任何一个 ≤ Available ${fmt(avail2)}，全卡住 ⇒ 不安全状态！银行家拒绝本次请求、回滚试分配，${BK_NAMES[p]} 继续等待（避免了「可能死锁」的一步）。`
      : `试分配后仍能找到安全序列，可以分配。`,
    unsafe ? "不安全·拒绝" : "安全·同意",
    [...finished],
    [...avail2],
    [],
    true
  );
  snap(
    "总结：死锁处理四路线——预防（破坏四条件之一，如一次申请全部资源/资源有序分配）、避免（银行家，要预知 Max）、检测（资源分配图化简）+ 解除（剥夺/撤销）。银行家缺点：要预声明最大需求、每次请求都跑 O(m×n²) 检查，现实中少用，考场上常考手推。",
    "完成",
    [...finished],
    [...BK_AVAIL],
    [...seq]
  );
  return frames;
}

export function BankerView() {
  const frames = useMemo(buildBankerFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const need = BK_NAMES.map((_, i) => needOf(i));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center font-mono text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="border border-border p-1.5">进程</th>
              {["Allocation", "Max", "Need"].map((h) => (
                <th key={h} className="border border-border p-1.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BK_NAMES.map((name, i) => (
              <tr
                key={name}
                className={cn(
                  fr.finished.includes(name) && !fr.reqMode && "bg-emerald-500/10",
                  fr.reqMode && BK_REQUEST.p === i && "bg-amber-500/10"
                )}
              >
                <td className="border border-border p-1.5 font-bold">{name}</td>
                <td className="border border-border p-1.5">{fmt(BK_ALLOC[i]!)}</td>
                <td className="border border-border p-1.5">{fmt(BK_MAX[i]!)}</td>
                <td className="border border-border p-1.5">{fmt(need[i]!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded border border-border bg-muted/40 px-2 py-1 font-mono">Work/Available：{fmt(fr.work)}</span>
        {fr.seq.length > 0 && (
          <span className="rounded border border-emerald-600 bg-emerald-500/10 px-2 py-1 font-mono">
            安全序列：{fr.seq.join("→")}
          </span>
        )}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
