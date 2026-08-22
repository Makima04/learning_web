// 图解 · 数据通路：单周期 MIPS 风格，四类指令（add/lw/sw/beq）各自点亮哪些部件。
// 部件集合由 datapathFlow() 给出（测试断言），帧只做可视化。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export type Comp = "PC" | "IM" | "RF" | "ALU" | "DM" | "MUX";

export interface InsnPath {
  insn: string;
  kind: string;
  comps: Comp[];
  write?: string; // 写回的寄存器
  note: string;
}

/** 四类指令经过的部件与效果 */
export function datapathFlow(): InsnPath[] {
  return [
    {
      insn: "add R1, R2, R3", kind: "R 型（运算）",
      comps: ["PC", "IM", "RF", "ALU", "RF"],
      write: "R1",
      note: "两寄存器读出 → ALU 相加 → 写回 RF。不访数据存储器。",
    },
    {
      insn: "lw R1, 8(R2)", kind: "取数",
      comps: ["PC", "IM", "RF", "ALU", "DM", "RF"],
      write: "R1",
      note: "基址 8+(R2) 由 ALU 算出 → 当地址访 DM → 数据写回 R1。",
    },
    {
      insn: "sw R1, 8(R2)", kind: "存数",
      comps: ["PC", "IM", "RF", "ALU", "DM"],
      write: undefined,
      note: "ALU 算地址，RF 读出 R1 送 DM 写入。不写回寄存器堆。",
    },
    {
      insn: "beq R1, R2, offset", kind: "分支",
      comps: ["PC", "IM", "RF", "ALU", "PC"],
      write: undefined,
      note: "两寄存器比较（ALU 减法判零）→ 相等则下地址 MUX 选 PC+4+offset。分支目标地址也由 ALU 预先算好。",
    },
  ];
}

interface Frame extends VizFrame {
  step: number; // -1 开场；0..3 各指令
}

const BOX: Record<Comp, [number, number, string]> = {
  // [x, y, label]
  PC: [30, 100, "PC"],
  IM: [140, 100, "指令\n存储器"],
  RF: [270, 100, "寄存器堆\nRF"],
  ALU: [270, 210, "ALU"],
  DM: [400, 100, "数据\n存储器"],
  MUX: [140, 210, "MUX"],
};
const PATHS: [Comp, Comp][] = [
  ["PC", "IM"], ["IM", "RF"], ["RF", "ALU"], ["ALU", "DM"], ["DM", "RF"],
  ["PC", "MUX"], ["MUX", "PC"], ["ALU", "MUX"],
];
const CENTER: Record<Comp, [number, number]> = Object.fromEntries(
  Object.entries(BOX).map(([k, [x, y, label]]) => {
    void label;
    return [k, [x + 50, y + 28]];
  })
) as Record<Comp, [number, number]>;

function buildFrames(): Frame[] {
  const paths = datapathFlow();
  const frames: Frame[] = [
    {
      step: -1,
      phase: "全景",
      desc: "单周期数据通路的核心部件：PC（下条指令地址）→ 指令存储器 → 寄存器堆 RF → ALU → 数据存储器 DM，MUX 负责在「PC+4」与「分支目标」之间选下地址。每条指令一个时钟周期，周期长度以最慢指令（lw）为准——这是单周期的代价。下面四条典型指令各点亮自己的数据流。",
    },
  ];
  paths.forEach((ip, i) => {
    frames.push({
      step: i,
      phase: `${ip.insn}（${ip.kind}）`,
      desc: `${ip.note}${ip.write ? ` 写回 ${ip.write}。` : " 无写回。"}点亮部件：${[...new Set(ip.comps)].join(" → ")}。数据在部件间走的路 = 该指令的「数据通路」；控制器按 OP/Func 字段产生各部件的 control 信号（RegWrite / ALUOp / MemRead / Branch…）`,
    });
  });
  return frames;
}

export function DatapathView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const hot = new Set(fr.step >= 0 ? datapathFlow()[fr.step]!.comps : []);

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 500 290" className="w-full">
        {PATHS.map(([f, t], i) => {
          const [x1, y1] = CENTER[f];
          const [x2, y2] = CENTER[t];
          const on = hot.has(f) && hot.has(t);
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={on ? C.active : C.line}
              strokeWidth={on ? 2.4 : 1.2}
              opacity={on ? 1 : 0.45}
            />
          );
        })}
        {(Object.entries(BOX) as [Comp, [number, number, string]][]).map(([id, [x, y, label]]) => {
          const on = hot.has(id);
          return (
            <g key={id}>
              <rect
                x={x} y={y} width={100} height={56} rx={8}
                fill={on ? C.active : C.node}
                stroke={on ? C.active : "#94a3b8"}
                strokeWidth={on ? 2 : 1}
              />
              {label.split("\n").map((ln, k) => (
                <text key={k} x={x + 50} y={y + 24 + k * 14} textAnchor="middle" fontSize="12" fontWeight={700} fill={on ? "#fff" : C.nodeText}>
                  {ln}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
