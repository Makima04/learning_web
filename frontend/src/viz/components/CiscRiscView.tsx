// 图解 · CISC vs RISC：同一任务 C = A + B（A、B 在主存）。
// CISC 一条复杂指令内部要走 10 个时钟周期；RISC 拆成 4 条 load-store 指令，5 段流水 n+k-1 = 8 周期——数字现算。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

/** C = A + B 两种实现：CISC 一条指令（微程序 10 拍）vs RISC 4 条指令（5 段流水） */
export function ciscRiscCycles() {
  const riscInsns = ["lw R1, A", "lw R2, B", "add R3, R1, R2", "sw C, R3"];
  const stages = 5;
  return {
    ciscInsns: ["add C, A, B"],
    ciscCycles: 10, // 取指2 + 取A 2 + 取B 2 + 加 1 + 存C 3（变长指令、多次访存）
    riscInsns,
    riscCyclesSerial: riscInsns.length * stages, // 不流水：每条 5 拍
    riscCyclesPipe: riscInsns.length + stages - 1, // 流水：n + k - 1
    stages,
  };
}

const R = ciscRiscCycles();

interface Frame extends VizFrame {
  show: "task" | "cisc" | "risc" | "table";
}

function buildFrames(): Frame[] {
  return [
    {
      show: "task",
      phase: "任务",
      desc: "同一件事：计算 C = A + B，其中 A、B 是主存变量。CISC 的做法是一条指令搞定（一条指令干多件事）；RISC 只允许 load/store 访存，加法只对寄存器做（拆成 4 条规整的定长指令）。两种哲学，看周期账。",
    },
    {
      show: "cisc",
      phase: "CISC",
      desc: `一条指令 add C, A, B：取指（指令变长，2 拍）→ 取 A（2 拍）→ 取 B（2 拍）→ 相加（1 拍）→ 写回 C（3 拍），共 ${R.ciscCycles} 拍。指令条数少、程序短，但指令周期不规整、寻址方式复杂，难做流水线（也难做超标量）——靠微程序解释执行。`,
    },
    {
      show: "risc",
      phase: "RISC 流水",
      desc: `4 条定长指令 ${R.riscInsns.join("；")}。不流水要 ${R.riscCyclesSerial} 拍；五段流水（取指 IF / 译码 ID / 执行 EX / 访存 MEM / 写回 WB）逐拍错开，总拍数 = n + k − 1 = ${R.riscInsns.length} + ${R.stages} − 1 = ${R.riscCyclesPipe} 拍，比 CISC 的 ${R.ciscCycles} 拍省。指令定长、只有 load/store 访存、寄存器多达上百个——这些约束都是为流水线铺路。`,
    },
    {
      show: "table",
      phase: "对比",
      desc: "记对比维度：指令系统（复杂/庞大 vs 精简/固定长度）、寻址方式（多 vs 少）、通用寄存器（少 vs 多）、流水线（难 vs 易，平均 CPI 接近 1）、对主存访问（指令可访存 vs 仅 load/store）、研制周期与功耗。x86 是 CISC 外壳 + 内部翻译成类 RISC 微操作；手机 ARM、苹果 M 系是 RISC 路线。",
    },
  ];
}

function PipeGrid() {
  const names = ["IF", "ID", "EX", "MEM", "WB"];
  const total = R.riscCyclesPipe;
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px]">
        <tbody>
          {R.riscInsns.map((ins, i) => (
            <tr key={i}>
              <td className="pr-2 font-mono whitespace-nowrap text-muted-foreground">{ins}</td>
              {Array.from({ length: total }, (_, c) => {
                const st = c - i;
                const on = st >= 0 && st < names.length;
                return (
                  <td key={c} className="p-0.5">
                    <div
                      className={cn(
                        "flex h-6 w-9 items-center justify-center rounded font-mono",
                        on ? "bg-sky-500 text-white" : "bg-muted/30 text-transparent"
                      )}
                    >
                      {on ? names[st] : "·"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="pr-2 text-muted-foreground">CISC 同期</td>
            {Array.from({ length: total }, (_, c) => (
              <td key={c} className="p-0.5">
                <div className={cn("flex h-6 w-9 items-center justify-center rounded font-mono text-[10px]", c < R.ciscCycles ? "bg-amber-500/30 text-amber-700" : "bg-muted/30 text-transparent")}>
                  {c < R.ciscCycles ? "…" : "·"}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted-foreground">每列 = 1 个时钟周期；RISC {R.riscCyclesPipe} 拍 vs CISC {R.ciscCycles} 拍</p>
    </div>
  );
}

export function CiscRiscView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "task" && (
        <div className="rounded-xl border border-dashed p-4 text-center font-mono text-sm">
          C = A + B
          <div className="mt-1 text-xs text-muted-foreground">A、B 在主存 · C 要写回主存</div>
        </div>
      )}
      {fr.show === "cisc" && (
        <div className="space-y-2">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-sm">add C, A, B<span className="ml-2 text-xs text-muted-foreground">（1 条指令 · {R.ciscCycles} 拍）</span></div>
          <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
            {["取指×2", "取A×2", "取B×2", "加×1", "存C×3"].map((s) => (
              <div key={s} className="rounded bg-muted/50 px-1 py-2 font-mono">{s}</div>
            ))}
          </div>
        </div>
      )}
      {fr.show === "risc" && <PipeGrid />}
      {fr.show === "table" && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-medium">维度</th>
              <th className="font-medium">CISC</th>
              <th className="font-medium">RISC</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["指令系统", "庞大（300+），变长", "精简（<100），定长"],
              ["寻址方式", "十几种", "少（寄存器+偏移为主）"],
              ["访存指令", "多数指令可访存", "仅 load/store"],
              ["通用寄存器", "少", "多（32+）"],
              ["流水线", "难（周期不规整）", "易，CPI 接近 1"],
              ["控制方式", "微程序为主", "硬布线（组合逻辑）"],
            ].map(([k, a, b]) => (
              <tr key={k} className="border-t">
                <td className="py-1">{k}</td>
                <td className="text-center">{a}</td>
                <td className="text-center">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
