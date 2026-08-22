// 图解 · 散列查找：除留余数 H(k)=k%11。线性探测（开放定址）逐格后移找空位；
// 链地址法把同义词串成链。同一组关键字，两种处理的冲突与 ASL 当场算出来对比。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const HASH_KEYS = [15, 38, 61, 84, 27, 57, 40];
export const HASH_M = 11;

/** 线性探测：返回每个关键字的落位 + 探查次数 */
export function linearProbe(keys: number[], m: number): { pos: number; probes: number }[] {
  const table: (number | null)[] = Array.from({ length: m }, () => null);
  const res: { pos: number; probes: number }[] = [];
  for (const k of keys) {
    let h = k % m;
    let probes = 0;
    for (;;) {
      probes++;
      if (table[h] === null) {
        table[h] = k;
        res.push({ pos: h, probes });
        break;
      }
      h = (h + 1) % m;
    }
  }
  return res;
}

/** 链地址法：桶 → 同义词链 */
export function chainHash(keys: number[], m: number): number[][] {
  const buckets: number[][] = Array.from({ length: m }, () => []);
  for (const k of keys) buckets[k % m]!.push(k);
  return buckets;
}

/** 成功查找 ASL（按各元素探查/链上位置平均） */
export const asl = (costs: number[]): number => costs.reduce((a, b) => a + b, 0) / costs.length;

interface HFrame extends VizFrame {
  /** 线性探测：与 table 同步的展示（null 空格） */
  table: (number | null)[];
  hiCell: number | null;
  probes: number;
  /** 链地址 */
  buckets: number[][] | null;
  hiBucket: number | null;
}

function buildLinearFrames(): HFrame[] {
  const frames: HFrame[] = [];
  const table: (number | null)[] = Array.from({ length: HASH_M }, () => null);
  const snap = (desc: string, phase: string, hiCell: number | null, probes: number) =>
    frames.push({ desc, phase, table: [...table], hiCell, probes, buckets: null, hiBucket: null });

  snap(
    `表长 m=${HASH_M}，散列函数 H(k) = k % ${HASH_M}（除留余数：p 取不大于表长的最大素数最佳，这里直接 11）。开放定址法：算出的位置被占就向后逐格探查 ${"H(k)+1, H(k)+2, …（模表长绕回）"}。`,
    "初始",
    null,
    0
  );
  const placements = linearProbe(HASH_KEYS, HASH_M);
  HASH_KEYS.forEach((k, i) => {
    const h0 = k % HASH_M;
    const { pos, probes } = placements[i]!;
    if (probes === 1) {
      table[pos] = k;
      snap(`插 ${k}：H = ${k} % ${HASH_M} = ${h0}，空位，直接放入（比较 1 次）。`, `插 ${k}`, pos, 1);
    } else {
      for (let s = 0; s < probes - 1; s++) {
        const cell = (h0 + s) % HASH_M;
        snap(`插 ${k}：H = ${h0}，但 ${table[cell]} 占着 → 冲突！线性探测向后看一格。`, `冲突·${k}`, cell, s + 1);
      }
      table[pos] = k;
      snap(
        `探到 ${(pos - 1 + HASH_M) % HASH_M} 的下一格 ${pos}，空 → 放入 ${k}（本元素共探查 ${probes} 次）。冲突的堆积（本位、连片占位）正是线性探测的弱点：越挤越慢，删除只能打「墓碑」标记不能真删。`,
        `落位·${k}`,
        pos,
        probes
      );
    }
  });
  const costs = placements.map((p) => p.probes);
  snap(
    `全部落位。成功查找 ASL = (1+1+1+1+${costs[4]}+1+${costs[6]})/7 = ${asl(costs).toFixed(2)}（${costs.reduce((a, b) => a + b, 0)}/7）。失败 ASL 要从每个散列地址出发数到空位（最多 m 次），失败一般比成功贵。装填因子 α = n/m 越大冲突越凶——ASL 是 α 的函数，与表长无直接关系。`,
    "完成",
    null,
    0
  );
  return frames;
}

function buildChainFrames(): HFrame[] {
  const frames: HFrame[] = [];
  const buckets: number[][] = Array.from({ length: HASH_M }, () => []);
  const snap = (desc: string, phase: string, hiBucket: number | null) =>
    frames.push({ desc, phase, table: [], hiCell: null, probes: 0, buckets: buckets.map((b) => [...b]), hiBucket });

  snap(
    `链地址法：表本身不存关键字，每个槽是一个链表头；H(k) 相同的同义词依次头插/尾插进链。同样的 ${HASH_KEYS.length} 个关键字、同一个 H(k)=k%${HASH_M}。`,
    "初始",
    null
  );
  const final = chainHash(HASH_KEYS, HASH_M);
  let costSum = 0;
  HASH_KEYS.forEach((k) => {
    const h = k % HASH_M;
    buckets[h]!.push(k);
    const cost = buckets[h]!.indexOf(k) + 1;
    costSum += cost;
    snap(
      cost === 1
        ? `插 ${k}：H = ${h}，链空，成为首元（查找比较 1 次）。`
        : `插 ${k}：H = ${h}，链上已有 ${buckets[h]!.slice(0, -1).join("→")}，尾插到链尾（查找要比较 ${cost} 次）。链地址不怕堆积，删除直接摘链结点，α > 1 也只是链变长。`,
      `插 ${k}`,
      h
    );
  });
  const costs = HASH_KEYS.map((k) => final[k % HASH_M]!.indexOf(k) + 1);
  snap(
    `完成。链地址成功 ASL = ${costs.join("+")}/7 = ${asl(costs).toFixed(2)}（${costSum}/7），比线性探测的 12/7 略省；更重要的是删除方便、无堆积。ASL 依然随 α 增长。常考：给关键字序列和 H(k)，画出两种处理的散列表并算成功/失败 ASL。`,
    "完成",
    null
  );
  return frames;
}

type Mode = "线性探测" | "链地址";

export function HashView() {
  const [mode, setMode] = useState<Mode>("线性探测");
  const frames = useMemo(() => (mode === "线性探测" ? buildLinearFrames() : buildChainFrames()), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["线性探测", "链地址"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === "线性探测" ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">散列表 0..{HASH_M - 1}（黄 = 本步探查位置）</p>
          <div className="flex flex-wrap gap-1.5">
            {fr.table.map((v, i) => (
              <div
                key={i}
                className={cn(
                  "w-12 overflow-hidden rounded-md border text-center",
                  fr.hiCell === i ? "border-amber-500 bg-amber-500 text-white" : "border-border bg-muted/40"
                )}
              >
                <div className="bg-muted text-[10px] text-muted-foreground">{i}</div>
                <div className="py-0.5 font-mono text-sm font-bold">{v ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">链地址（黄 = 本步插入的桶）</p>
          <div className="space-y-1">
            {(fr.buckets ?? []).map((chain, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={cn("w-6 rounded border text-center font-mono text-xs", fr.hiBucket === i ? "border-amber-500 bg-amber-500 text-white" : "border-border bg-muted/50 text-muted-foreground")}>
                  {i}
                </span>
                {chain.length === 0 ? (
                  <span className="text-xs text-muted-foreground">∧</span>
                ) : (
                  chain.map((k) => (
                    <span key={k} className="rounded border border-border bg-sky-500/20 px-1.5 py-0.5 font-mono text-xs font-bold">
                      {k}
                    </span>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
