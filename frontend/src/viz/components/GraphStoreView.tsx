// 图解 · 图的存储：同一张无向图分别落成邻接矩阵（O(n²)）与邻接表（O(n+e)），
// 逐边入座，直观看到「稠密图用矩阵、稀疏图用邻接表」。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const VS = ["A", "B", "C", "D", "E"] as const;
export const VE: [string, string][] = [
  ["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"], ["C", "E"],
];

/** 邻接矩阵（无向图对称） */
export function matrixOf(): number[][] {
  const m = VS.map(() => VS.map(() => 0));
  for (const [a, b] of VE) {
    const i = VS.indexOf(a as (typeof VS)[number]);
    const j = VS.indexOf(b as (typeof VS)[number]);
    m[i]![j] = 1;
    m[j]![i] = 1;
  }
  return m;
}

/** 邻接表（每个顶点按字母序串邻接点） */
export function listOf(): string[][] {
  const l: string[][] = VS.map(() => []);
  for (const [a, b] of VE) {
    l[VS.indexOf(a as (typeof VS)[number])]!.push(b);
    l[VS.indexOf(b as (typeof VS)[number])]!.push(a);
  }
  return l.map((row) => row.sort());
}

interface GFrame extends VizFrame {
  m: number[][];
  list: string[][];
  edgeIdx: number;
}

function buildStoreFrames(): GFrame[] {
  const frames: GFrame[] = [];
  const m = VS.map(() => VS.map(() => 0));
  const list: string[][] = VS.map(() => []);
  const snap = (desc: string, phase: string, edgeIdx = -1) =>
    frames.push({ desc, phase, m: m.map((r) => [...r]), list: list.map((r) => [...r]), edgeIdx });

  snap(
    "无向图：A-B、A-C、B-D、C-D、C-E（n=5，e=5）。两种存法同时搭：左边邻接矩阵 n×n 的 0/1 方阵，右边邻接表每行一个单链表。",
    "初始"
  );
  VE.forEach(([a, b], k) => {
    const i = VS.indexOf(a as (typeof VS)[number]);
    const j = VS.indexOf(b as (typeof VS)[number]);
    m[i]![j] = 1;
    list[i]!.push(b);
    snap(`加边 ${a}—${b}：矩阵置 M[${a}][${b}]=1；邻接表在 ${a} 的链表尾插 ${b}。无向图是对称操作——还要 M[${b}][${a}]=1、${b} 表里插 ${a}（存两份，空间翻倍）。`, "加边", k);
    m[j]![i] = 1;
    list[j]!.push(a);
    list[i]!.sort();
    list[j]!.sort();
  });
  snap(
    "存完。对比：矩阵空间 O(n²) 与边数无关、查「(i,j) 是否邻接」O(1)，适合稠密图；邻接表空间 O(n+e)、查某点所有邻居只要扫它的链表，稀疏图省内存，但查任意两点要顺链走。有向图邻接表只存出边（逆邻接表存入边）；度的计算：矩阵按行/列求和，表看链长（有向图出度）。常考：邻接矩阵第 i 行 1 的个数 = 顶点 i 的度。",
    "完成"
  );
  return frames;
}

export function GraphStoreView() {
  const frames = useMemo(buildStoreFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const [hiA, hiB] = fr.edgeIdx >= 0 ? VE[fr.edgeIdx]! : [null, null];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">邻接矩阵（黄格 = 本步置 1）</p>
          <div className="inline-block overflow-x-auto">
            <table className="border-collapse text-center font-mono text-xs">
              <thead>
                <tr>
                  <th className="p-1" />
                  {VS.map((v) => (
                    <th key={v} className="w-8 p-1 text-muted-foreground">{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fr.m.map((row, i) => (
                  <tr key={VS[i]}>
                    <th className="p-1 text-muted-foreground">{VS[i]}</th>
                    {row.map((v, j) => {
                      const hi =
                        (VS[i] === hiA && VS[j] === hiB) || (VS[i] === hiB && VS[j] === hiA);
                      return (
                        <td key={j} className={cn("border border-border p-1", hi ? "bg-amber-500 font-bold text-white" : v ? "bg-sky-500/30" : "")}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">邻接表（黄 = 本步插入）</p>
          <div className="space-y-1.5">
            {fr.list.map((row, i) => (
              <div key={VS[i]} className="flex items-center gap-1.5">
                <span className="w-5 font-mono text-xs font-bold">{VS[i]}</span>
                {row.length === 0 ? (
                  <span className="text-xs text-muted-foreground">∧</span>
                ) : (
                  row.map((nb) => (
                    <span
                      key={nb}
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-xs",
                        fr.edgeIdx >= 0 &&
                          ((VS[i] === hiA && nb === hiB) || (VS[i] === hiB && nb === hiA))
                          ? "border-amber-500 bg-amber-500 font-bold text-white"
                          : "border-border bg-muted/40"
                      )}
                    >
                      {nb}
                    </span>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
