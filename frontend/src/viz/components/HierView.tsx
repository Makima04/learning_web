// 图解 · 层次结构与冯·诺依曼：五大部件框图 + 「取指→译码→执行」在部件间的流动。
// 程序 LDA 10 / ADD 32 / STA 200：ACC 最终 42，每条指令都经历取指（控制器从存储器取）+ 执行（运算器/存储器）。
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

export interface VnInsn {
  op: "LDA" | "ADD" | "STA";
  arg: number; // LDA/ADD：立即数；STA：主存地址
}

export const VN_PROG: VnInsn[] = [
  { op: "LDA", arg: 10 },
  { op: "ADD", arg: 32 },
  { op: "STA", arg: 200 },
];

/** 跑一遍程序：返回每条指令的周期数与最终 ACC / M[200]（帧/测试都以此为准，不手写结论） */
export function vnRun(prog: VnInsn[]): { acc: number; ir: string[]; mem200: number; cycles: number } {
  let acc = 0;
  let mem200 = 0;
  const ir: string[] = [];
  let cycles = 0;
  for (const in_ of prog) {
    ir.push(`${in_.op} ${in_.arg}`);
    cycles += 2; // 取指 + 执行
    if (in_.op === "LDA") acc = in_.arg;
    else if (in_.op === "ADD") acc += in_.arg;
    else mem200 = acc;
  }
  return { acc, ir, mem200, cycles };
}

interface Frame extends VizFrame {
  /** 高亮的部件 id */
  hot: string[];
  pc: number;
  ir: string;
  acc: number;
  m200: number;
}

function buildFrames(): Frame[] {
  const r = vnRun(VN_PROG);
  const f = (desc: string, phase: string, hot: string[], pc: number, ir: string, acc: number, m200: number): Frame => ({
    desc, phase, hot, pc, ir, acc, m200,
  });
  const frames: Frame[] = [];
  frames.push(
    f(
      "冯·诺依曼结构：运算器 + 控制器 = CPU；再加存储器、输入设备、输出设备。实线是数据流，虚线是控制流（控制器发号施令）。程序和数据同存于存储器，「存储程序」是它与手工接线计算机的本质区别。",
      "结构", ["cu", "alu", "mem", "in", "out"], 0, "—", 0, 0
    ),
    f(
      "程序 LDA 10 / ADD 32 / STA 200 通过输入设备装入存储器（蓝色格子），从 0 号单元开始存放。下面逐指令演示「取指 → 执行」。",
      "装入", ["in", "mem"], 0, "—", 0, 0
    )
  );
  let acc = 0;
  let m200 = 0;
  VN_PROG.forEach((in_, i) => {
    frames.push(
      f(
        `取指：PC = ${i}，控制器把该地址发往存储器，取出的指令「${in_.op} ${in_.arg}」送入 IR，同时 PC 自动加 1（指向 ${i + 1}）。任何指令都要先经过这一步——这就是「指令周期 = 取指周期 + 执行周期」。`,
        `取指 ${in_.op}`, ["cu", "mem"], i, `${in_.op} ${in_.arg}`, acc, m200
      )
    );
    if (in_.op === "STA") {
      m200 = acc;
      frames.push(
        f(
          `执行 STA：把 ACC 的值 ${acc} 写入主存 ${in_.arg} 号单元（数据流：运算器 → 存储器）。最终 M[200] = ${m200}。`,
          "执行 STA", ["alu", "mem"], i + 1, `${in_.op} ${in_.arg}`, acc, m200
        )
      );
    } else {
      acc = in_.op === "LDA" ? in_.arg : acc + in_.arg;
      frames.push(
        f(
          in_.op === "LDA"
            ? `执行 LDA：立即数 ${in_.arg} 直接来自指令（取指时已带回），经运算器送 ACC = ${acc}。`
            : `执行 ADD：操作数 ${in_.arg} 与 ACC(${acc - in_.arg}) 在运算器相加，结果 ${acc} 写回 ACC。`,
          `执行 ${in_.op}`, ["cu", "alu"], i + 1, `${in_.op} ${in_.arg}`, acc, m200
        )
      );
    }
  });
  frames.push(
    f(
      `程序执行完毕：共 ${r.cycles} 个机器周期，ACC = ${r.acc}，M[200] = ${r.mem200}。结果经输出设备呈现（输出）。层次上看：程序员看到的是「指令集」（ISA），往下才由数字电路实现——上层是下层的抽象，这是贯穿计组的主线。`,
      "完成", ["out", "mem"], 3, "—", r.acc, r.mem200
    )
  );
  return frames;
}

const BOXES: Record<string, { x: number; y: number; w: number; h: number; label: string; sub?: string }> = {
  cu: { x: 40, y: 40, w: 120, h: 52, label: "控制器 CU", sub: "取指·译码·发控制信号" },
  alu: { x: 40, y: 140, w: 120, h: 52, label: "运算器 ALU", sub: "算逻运算·ACC" },
  mem: { x: 230, y: 90, w: 120, h: 52, label: "存储器", sub: "程序 + 数据同存" },
  in: { x: 40, y: 232, w: 120, h: 44, label: "输入设备" },
  out: { x: 230, y: 232, w: 120, h: 44, label: "输出设备" },
};
const CTRL_LINE = "#94a3b8";

export function HierView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const hot = new Set(fr.hot);

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 390 288" className="w-full">
        {/* 数据流（实线）与控制流（虚线） */}
        <line x1="160" y1="66" x2="230" y2="106" stroke={C.line} strokeWidth="1.6" />
        <line x1="230" y1="126" x2="160" y2="166" stroke={C.line} strokeWidth="1.6" />
        <line x1="100" y1="232" x2="100" y2="196" stroke={C.line} strokeWidth="1.6" />
        <line x1="290" y1="196" x2="290" y2="232" stroke={C.line} strokeWidth="1.6" />
        <line x1="230" y1="142" x2="230" y2="196" stroke={C.line} strokeWidth="1.6" opacity="0" />
        <path d="M170,66 L215,96" stroke={CTRL_LINE} strokeWidth="1.4" strokeDasharray="4 3" fill="none" />
        <path d="M170,166 L215,136" stroke={CTRL_LINE} strokeWidth="1.4" strokeDasharray="4 3" fill="none" />
        <path d="M60,232 L52,140" stroke={CTRL_LINE} strokeWidth="1.4" strokeDasharray="4 3" fill="none" opacity="0" />
        <text x="316" y="86" fontSize="10" fill={C.text}>实线 = 数据流</text>
        <text x="316" y="100" fontSize="10" fill={CTRL_LINE}>虚线 = 控制流</text>
        {Object.entries(BOXES).map(([id, b]) => {
          const on = hot.has(id);
          return (
            <g key={id}>
              <rect
                x={b.x} y={b.y} width={b.w} height={b.h} rx="10"
                fill={on ? C.active : C.node}
                stroke={on ? C.active : "#94a3b8"}
                strokeWidth={on ? 2 : 1}
              />
              <text x={b.x + b.w / 2} y={b.y + (b.sub ? 24 : 28)} textAnchor="middle" fontSize="13" fontWeight="700" fill={on ? "#fff" : C.nodeText}>
                {b.label}
              </text>
              {b.sub && (
                <text x={b.x + b.w / 2} y={b.y + 40} textAnchor="middle" fontSize="9" fill={on ? "#e0f2fe" : C.text}>
                  {b.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ["PC", fr.pc],
          ["IR", fr.ir],
          ["ACC", fr.acc],
          ["M[200]", fr.m200],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border bg-muted/40 px-2.5 py-1.5">
            <span className="text-muted-foreground">{k} = </span>
            <span className="font-mono font-bold">{String(v)}</span>
          </div>
        ))}
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
