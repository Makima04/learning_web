// 图解 · 指令流水线：五段 IF/ID/EX/MEM/WB。理想 5 条指令 9 个周期；
// load-use 数据冒险（即使有转发）也要插 1 个气泡 → 10 个周期。周期图逐拍揭示重叠与冒险。
import { useMemo, useState } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export const PIPE_INSNS = [
  "LW  R1, 0(R2)",
  "ADD R3, R1, R4",
  "SUB R5, R6, R7",
  "AND R8, R9, R10",
  "OR  R11,R12,R13",
];
const STAGES = ["IF", "ID", "EX", "MEM", "WB"];

export interface PipeCell {
  i: number; // 指令号 0-based
  c: number; // 周期 1-based
  stage: string; // 五段之一或 "*"(气泡)
}

/** 排期：loadUse=true 时 I2 依赖 I1 的 load——ID 后插 1 拍气泡，I3 起 ID 段顺延（IF 不受阻） */
export function pipelineSchedule(loadUse: boolean): { cells: PipeCell[]; cycles: number } {
  const cells: PipeCell[] = [];
  const n = PIPE_INSNS.length;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < STAGES.length; s++) {
      let c = 1 + i + s;
      if (loadUse) {
        if (i === 1 && s >= 2) c += 1; // I2 的 EX 起晚一拍
        if (i >= 2 && s >= 1) c += 1; // I3 起 ID 起晚一拍
      }
      cells.push({ i, c, stage: STAGES[s]! });
    }
  }
  if (loadUse) cells.push({ i: 1, c: 4, stage: "*" }); // 周期 4：EX 部件的气泡
  const cycles = 5 + n - 1 + (loadUse ? 1 : 0);
  return { cells, cycles };
}

interface PFrame extends VizFrame {
  /** 已揭示到的周期 */
  upto: number;
  cycles: number;
}

function buildPipelineFrames(loadUse: boolean): PFrame[] {
  const frames: PFrame[] = [];
  const { cycles } = pipelineSchedule(loadUse);
  const snap = (desc: string, phase: string, upto: number) =>
    frames.push({ desc, phase, upto, cycles });

  snap(
    `五段流水线把一条指令切成 ${STAGES.join("→")}，各段独立部件。重叠执行：第 k 条取指时，第 k-1 条在译码……像流水线工厂。n 条指令理想周期数 = 5 + (n−1) = ${5 + PIPE_INSNS.length - 1}（第一条走完 5 拍，之后每拍流出一条）。吞吐率 ≈ 1 条/拍。`,
    "初始",
    0
  );
  for (let c = 1; c <= cycles; c++) {
    const isStall = loadUse && c === 4;
    snap(
      isStall
        ? "周期 4：ADD 需要 R1，而 LW 的数据要到 MEM 段末（周期 4 结束）才就绪——load-use 冒险，即使有「MEM→EX 转发」也差一拍。ADD 在 ID 段停一拍（插气泡 *），后面指令全体顺延。"
        : `周期 ${c}：对角线推进。${c === 1 ? "第一条 LW 开始取指。" : c === cycles ? "最后一条 OR 写回，全部完成。" : "每条指令沿对角线前进一格。"}`,
      isStall ? "冒险·气泡" : `周期 ${c}`,
      c
    );
  }
  snap(
    `完成：理想 ${5 + PIPE_INSNS.length - 1} 拍${loadUse ? `，带一个 load-use 冒险 ${cycles} 拍` : ""}。三类冒险：① 结构（部件冲突，重复资源/停顿解决）；② 数据（RAW，转发/暂停解决——本例是唯一转发救不了的 load-use）；③ 控制（分支改变 PC，分支预测/延迟槽解决）。超标量 = 多条流水并行发射；动态调度乱序执行。大题常给指令序列画时空图、算加速比。`,
    "完成",
    cycles
  );
  return frames;
}

const STAGE_COLOR: Record<string, string> = {
  IF: "bg-sky-500 text-white",
  ID: "bg-emerald-600 text-white",
  EX: "bg-amber-500 text-white",
  MEM: "bg-violet-500 text-white",
  WB: "bg-rose-500 text-white",
  "*": "bg-muted text-muted-foreground border border-dashed",
};

type Mode = "理想" | "load-use";

export function PipelineView() {
  const [mode, setMode] = useState<Mode>("理想");
  const frames = useMemo(() => buildPipelineFrames(mode === "load-use"), [mode]);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const { cells } = pipelineSchedule(mode === "load-use");
  const cellAt = (i: number, c: number) => cells.find((x) => x.i === i && x.c === c);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["理想", "load-use"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "理想" ? "理想（无冒险）" : "load-use 冒险"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-center font-mono text-xs">
          <thead>
            <tr>
              <th className="p-1" />
              {Array.from({ length: fr.cycles }, (_, k) => k + 1).map((c) => (
                <th key={c} className={cn("w-10 p-1", fr.upto === c ? "text-foreground font-bold" : "text-muted-foreground")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PIPE_INSNS.map((ins, i) => (
              <tr key={i}>
                <th className="whitespace-nowrap p-1 pr-2 text-left text-muted-foreground">{ins}</th>
                {Array.from({ length: fr.cycles }, (_, k) => k + 1).map((c) => {
                  const cell = cellAt(i, c);
                  const show = c <= fr.upto;
                  return (
                    <td key={c} className="border border-border/50 p-0.5">
                      {cell && show ? (
                        <span className={cn("inline-block w-full rounded px-1 py-0.5 font-bold", STAGE_COLOR[cell.stage])}>
                          {cell.stage}
                        </span>
                      ) : (
                        <span className="text-transparent">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
