// 图解 · KMP 与 next 数组：先逐位推导 next（最长相等前后缀 +1），再看匹配时主串指针不回退
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

const PAT = "ababaa";
const TXT = "ababababaa";

interface Frame extends VizFrame {
  kind: "next" | "match";
  // next 推导
  next: number[];
  nextCur?: number;
  preHi?: [number, number]; // 前缀高亮（模式串 1-based 闭区间）
  sufHi?: [number, number]; // 后缀高亮
  // 匹配
  pos?: number; // 模式串当前对齐起点
  i?: number;
  j?: number;
  comps?: { tIdx: number; ok: boolean }[]; // 本次对齐已比较的结果
  matched?: boolean;
}

/** 最长相等前后缀长度（真前后缀） */
export function longestBorder(s: string): number {
  for (let k = s.length - 1; k > 0; k--) {
    if (s.slice(0, k) === s.slice(s.length - k)) return k;
  }
  return 0;
}

/** 王道教材 next：next[1]=0，next[2]=1，next[j]=最长相等前后缀长度+1（下标 0 弃用） */
export function buildNext(p: string): number[] {
  const next = [0, 0];
  for (let j = 2; j <= p.length; j++) {
    next[j] = longestBorder(p.slice(0, j - 1)) + 1;
  }
  return next;
}

/** KMP 匹配，返回首次匹配位置（1-based），不匹配返回 -1 */
export function kmpMatch(t: string, p: string): number {
  const next = buildNext(p);
  let i = 1;
  let j = 1;
  while (i <= t.length && j <= p.length) {
    if (t[i - 1] === p[j - 1]) {
      i++;
      j++;
    } else {
      j = next[j];
      if (j === 0) {
        i++;
        j = 1;
      }
    }
  }
  return j > p.length ? i - p.length : -1;
}

export function buildKmpFrames(t: string, p: string): Frame[] {
  const frames: Frame[] = [];
  const next = buildNext(p);
  const push = (f: Frame) => frames.push(f);

  // —— 第一部分：next 数组推导 ——
  push({
    kind: "next",
    next,
    desc: `模式串 T = ${p}（长度 ${p.length}）。next[j] 的含义：j 处失配时，模式串应回退到的位置。教材定义 next[1]=0、next[2]=1，j≥3 时看 T[1..j-1] 这段的「最长相等前后缀长度 k」，next[j] = k+1。`,
    phase: "next 推导",
  });
  for (let j = 2; j <= p.length; j++) {
    const s = p.slice(0, j - 1);
    const L = longestBorder(s);
    if (j === 2) {
      push({
        kind: "next",
        next,
        nextCur: j,
        desc: `next[2] 恒为 1：T[1..1] 只有一个字符，没有真前后缀（k=0），next[2] = 0+1 = 1。`,
        phase: "next 推导",
      });
      continue;
    }
    const desc =
      L > 0
        ? `j=${j}：T[1..${j - 1}] = "${s}"，最长相等前后缀是 "${s.slice(0, L)}"（长度 ${L}，绿色前缀 = 琥珀色后缀），next[${j}] = ${L}+1 = ${next[j]}。`
        : `j=${j}：T[1..${j - 1}] = "${s}"，不存在相等的前后缀（k=0），next[${j}] = 1。`;
    push({
      kind: "next",
      next,
      nextCur: j,
      preHi: L > 0 ? [1, L] : undefined,
      sufHi: L > 0 ? [j - L, j - 1] : undefined,
      desc,
      phase: "next 推导",
    });
  }
  push({
    kind: "next",
    next,
    desc: `next = [${next.slice(1).join(", ")}]。口诀：失配时模式串「滑到」next[j]，已经匹配的前缀部分无需再比。下面拿它匹配主串 ${t}。`,
    phase: "next 推导完成",
  });

  // —— 第二部分：匹配过程 ——
  let i = 1;
  let j = 1;
  let pos = 1;
  let comps: { tIdx: number; ok: boolean }[] = [];
  push({
    kind: "match",
    next,
    pos: 1,
    i: 1,
    j: 1,
    comps: [],
    desc: `主串 S = ${t}，模式串对齐在位置 1。i 指主串、j 指模式串，都从 1 开始。`,
    phase: "匹配",
  });
  while (i <= t.length && j <= p.length) {
    const ok = t[i - 1] === p[j - 1];
    comps = [...comps, { tIdx: i, ok }];
    if (ok) {
      push({
        kind: "match",
        next,
        pos,
        i: i + 1,
        j: j + 1,
        comps,
        desc: `比较 S[${i}]=${t[i - 1]} 与 T[${j}]=${p[j - 1]}：相等，i、j 同时后移。`,
        phase: "匹配",
      });
      i++;
      j++;
    } else {
      push({
        kind: "match",
        next,
        pos,
        i,
        j,
        comps,
        desc: `比较 S[${i}]=${t[i - 1]} 与 T[${j}]=${p[j - 1]}：失配！`,
        phase: "失配",
      });
      const nj = next[j];
      pos = i - nj + 1;
      push({
        kind: "match",
        next,
        pos,
        i,
        j: nj,
        comps: [],
        desc: `j = next[${j}] = ${nj}：模式串右移到位置 ${pos}。注意 i 原地不动——已匹配前缀 "${p.slice(0, j - 1)}" 的比较结果直接被复用，这就是 KMP 省 time 的原因（主串指针从不回退，整个过程 O(n+m)）。`,
        phase: "滑动",
      });
      j = nj;
      if (j === 0) {
        i++;
        j = 1;
        pos = i;
        push({
          kind: "match",
          next,
          pos,
          i,
          j,
          comps: [],
          desc: `next=0：当前字符连 T[1] 都配不上，i 后移一位，j 回到 1。`,
          phase: "滑动",
        });
      }
    }
  }
  const matched = j > p.length;
  push({
    kind: "match",
    next,
    pos: i - p.length,
    i,
    j,
    comps,
    matched,
    desc: matched
      ? `j 越过模式串末尾：匹配成功！模式串出现在主串第 ${i - p.length} 个位置（比较从始至终 i 没有回头）。`
      : `i 越过主串末尾仍未匹配成功。`,
    phase: "完成",
  });
  return frames;
}

const CELL = 30;

function CharRow({
  s,
  offset = 0,
  colorOf,
}: {
  s: string;
  offset?: number;
  colorOf: (idx1: number) => "normal" | "pre" | "suf" | "ok" | "bad";
}) {
  return (
    <g transform={`translate(${offset},0)`}>
      {s.split("").map((ch, k) => {
        const idx = k + 1;
        const st = colorOf(idx);
        const fill =
          st === "pre" ? C.done : st === "suf" ? C.warn : st === "ok" ? C.done : st === "bad" ? C.bad : C.node;
        return (
          <g key={k}>
            <rect
              x={k * CELL}
              y={0}
              width={CELL - 2}
              height={28}
              rx={5}
              fill={fill}
              stroke={st === "normal" ? "#94a3b8" : "transparent"}
            />
            <text
              x={(k * CELL + (CELL - 2)) / 2}
              y={19}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill={st === "normal" ? C.nodeText : "#fff"}
            >
              {ch}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function KmpView() {
  const frames = useMemo(() => buildKmpFrames(TXT, PAT), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  const compsMap = new Map((fr.comps ?? []).map((c) => [c.tIdx, c.ok]));
  const inHi = (r: [number, number] | undefined, idx: number) =>
    !!r && idx >= r[0] && idx <= r[1];

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${TXT.length * CELL + 130} 132`} className="w-full">
        {/* 主串行 */}
        <text x={0} y={16} fontSize={12} fill={C.text}>主串 S</text>
        <g transform="translate(0,24)">
          <CharRow
            s={TXT}
            colorOf={(idx) => {
              const ok = compsMap.get(idx);
              if (ok === true) return "ok";
              if (ok === false) return "bad";
              return "normal";
            }}
          />
          {Array.from({ length: TXT.length }, (_, k) => (
            <text key={k} x={k * CELL + 14} y={42} textAnchor="middle" fontSize={9} fill={C.text}>
              {k + 1}
            </text>
          ))}
          {fr.kind === "match" && fr.i != null && fr.i <= TXT.length && (
            <text x={(fr.i - 1) * CELL + 14} y={56} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.active}>
              i
            </text>
          )}
        </g>
        {/* 模式串行（按对齐位置平移） */}
        <text x={0} y={94} fontSize={12} fill={C.text}>模式 T</text>
        <g transform={`translate(${fr.kind === "match" && fr.pos ? (fr.pos - 1) * CELL : 0},102)`}>
          <CharRow
            s={PAT}
            colorOf={(idx) => {
              if (fr.kind === "next") {
                if (inHi(fr.preHi, idx)) return "pre";
                if (inHi(fr.sufHi, idx)) return "suf";
                return "normal";
              }
              const tIdx = (fr.pos ?? 1) + idx - 1;
              const ok = compsMap.get(tIdx);
              if (ok === true) return "ok";
              if (ok === false) return "bad";
              return "normal";
            }}
          />
          {fr.kind === "match" && fr.j != null && fr.j <= PAT.length && (
            <text x={(fr.j - 1) * CELL + 14} y={42} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.active}>
              j
            </text>
          )}
        </g>
      </svg>

      {/* next 表 */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">next（1-based，王道约定）</p>
        <div className="flex flex-wrap gap-1">
          {PAT.split("").map((_, k) => {
            const j = k + 1;
            const shown = fr.kind === "next" ? fr.nextCur != null && j <= fr.nextCur : true;
            return (
              <div key={j} className="w-9 overflow-hidden rounded-md border text-center">
                <div className={cn("text-[10px]", fr.nextCur === j ? "bg-primary/15 font-semibold text-primary" : "bg-muted text-muted-foreground")}>
                  j={j}
                </div>
                <div className="font-mono text-sm font-bold">
                  {shown ? fr.next[j] : "·"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
