// 图解 · 文件物理结构：同一文件「读第 5 块」在连续 / 链接 / 索引三种结构下代价完全不同，
// 读盘次数由 readCost() 现算。逻辑结构（顺序/索引/索引顺序文件）另帧说明。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const F_BLOCKS = 6; // 文件占 6 个物理块
export const F_START = 20; // 连续结构起始物理块
export const LINK_NEXT: Record<number, number> = { 20: 33, 33: 41, 41: 17, 17: 58, 58: 26 }; // 链接指针
export const INDEX_TABLE = [20, 33, 41, 17, 58, 26]; // 索引表：逻辑块 i → 物理块

export type Structure = "seq" | "linked" | "indexed";

/** 读逻辑块 blockNo（1-based）需要的读盘次数与路径 */
export function readCost(structure: Structure, blockNo: number): { reads: number; path: number[]; how: string } {
  if (structure === "seq") {
    const phys = F_START + blockNo - 1;
    return { reads: 1, path: [phys], how: `起始块 ${F_START} +（块号−1）→ 物理块 ${phys}，直接寻址` };
  }
  if (structure === "linked") {
    const path: number[] = [];
    let cur = Number(
      Object.keys(LINK_NEXT).find((k) => !Object.values(LINK_NEXT).includes(Number(k))) ?? 20
    );
    for (let k = 0; k < blockNo; k++) {
      path.push(cur);
      cur = LINK_NEXT[cur] ?? -1;
    }
    return { reads: path.length, path, how: `从首块沿指针逐块走，读第 ${blockNo} 块要顺链过 ${path.length} 块` };
  }
  const phys = INDEX_TABLE[blockNo - 1]!;
  return { reads: 1, path: [phys], how: `查索引表（常驻内存）得物理块 ${phys}，一次读盘` };
}

interface Frame extends VizFrame {
  structure: Structure;
  step: number; // -1 逻辑结构；0 = 定位；1.. = 逐块
}

function buildFrames(): Frame[] {
  const r5 = (s: Structure) => readCost(s, 5);
  const frames: Frame[] = [
    {
      structure: "seq", step: -1,
      phase: "逻辑结构",
      desc: "先分清两层：逻辑结构是「用户看到的记录组织」——顺序文件（按序存取，插删要搬）、索引文件（按键+记录指针，随机快）、索引顺序文件（分组索引，折中最常用）；物理结构是「块怎么摆到磁盘上」——连续 / 链接 / 索引，直接决定随机访问性能。下面统一用「读某文件第 5 块」对比三种物理结构。",
    },
    {
      structure: "seq", step: 0,
      phase: "连续分配",
      desc: `FCB 记起始块 ${F_START} + 长度。读第 5 块：物理块 = ${F_START} + (5−1) = ${r5("seq").path[0]}，一次读盘搞定——支持随机访问（还能直接算 + 预读）。代价：文件增长没地方伸（要求连续空间，产生外部碎片）；插入/删除要移动块。磁带类顺序设备只能用它。`,
    },
    {
      structure: "linked", step: 1,
      phase: "链接分配",
      desc: `每块末尾藏一个指针指向下一块（隐式链接）。读第 5 块：${r5("linked").how}——见下方指针追逐，读盘 ${r5("linked").reads} 次。只能顺序访问，随机访问退化为 O(n)；但无外部碎片、易增长。改进：FAT 把所有指针集中成表（显式链接），查表不必读盘，随机访问恢复。`,
    },
    {
      structure: "indexed", step: 0,
      phase: "索引分配",
      desc: `文件配一张索引表：逻辑块号 → 物理块号（本例 [${INDEX_TABLE.join(", ")}]，故意散布）。索引表常驻内存时读第 5 块 = 查表得 ${r5("indexed").path[0]}，一次读盘——随机访问 O(1) 且无外部碎片。代价：每文件一张索引表占内存；小文件也要一张表（浪费）、大文件一张表放不下（→ 多级索引，见下一考点）。`,
    },
    {
      structure: "indexed", step: 1,
      phase: "小结",
      desc: `读第 5 块读盘次数：连续 ${r5("seq").reads}、链接 ${r5("linked").reads}、索引（索引常驻）${r5("indexed").reads}（若索引表也在盘上则 +1）。考点：① 给结构算访问某块的读盘次数；② 顺序文件 vs 索引文件的查找复杂度；③ 三种结构的增长/碎片特性。`,
    },
  ];
  return frames;
}

export function FileStructView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const r = readCost(fr.structure, 5);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {(["seq", "linked", "indexed"] as Structure[]).map((s) => {
          const rr = readCost(s, 5);
          return (
            <div
              key={s}
              className={cn(
                "rounded-lg border px-3 py-2",
                fr.structure === s ? "border-sky-500 bg-sky-500/10" : "border-border"
              )}
            >
              <p className="font-semibold">{s === "seq" ? "连续" : s === "linked" ? "链接" : "索引"}</p>
              <p className="font-mono text-sky-600">读第 5 块 = {rr.reads} 次读盘</p>
            </div>
          );
        })}
      </div>
      {fr.structure === "linked" && fr.step === 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {r.path.map((blk, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <div className={cn("rounded-md border px-2.5 py-1.5 text-center font-mono text-xs", i === r.path.length - 1 ? "border-emerald-500 bg-emerald-500/15 font-bold" : "border-border bg-muted/40")}>
                块{blk}
                <div className="text-[10px] text-muted-foreground">{i === r.path.length - 1 ? "目标(第5块)" : `→${LINK_NEXT[blk] ?? "∅"}`}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {(fr.structure === "seq" || fr.structure === "indexed") && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-3 font-mono text-xs">
          {fr.structure === "seq" ? (
            <>逻辑块 5 → 物理块 {F_START}+4 = <b className="text-emerald-600">{r.path[0]}</b>（一次定位）</>
          ) : (
            <>索引表[5] = <b className="text-emerald-600">{r.path[0]}</b>（表在内存，读盘 1 次）</>
          )}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
