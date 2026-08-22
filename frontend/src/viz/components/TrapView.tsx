// 图解 · 中断与系统调用、用户态/核心态：fork+write+exit 的三次陷入，
// 模式切换次数由 trapFlow() 现算；特权指令分类由 isPrivileged() 给出。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface TrapStep {
  no: number;
  user: string; // 用户态发生的事（空串 = 核心态延续）
  kernel: string; // 核心态发生的事（空串 = 用户态延续）
  note: string;
}

/** 一段程序：fork → write → exit 的系统调用轨迹（每次陷入都伴随 2 次模式切换） */
export function trapFlow(): { steps: TrapStep[]; switches: number } {
  const steps: TrapStep[] = [
    { no: 0, user: "执行库代码 fork()", kernel: "", note: "用户程序调用 C 库包装函数（仍在用户态）" },
    { no: 1, user: "", kernel: "陷入 trap → 运行 sys_fork", note: "访管指令/陷入指令触发，CPU 切到核心态——这就是「系统调用 = 特殊的自愿中断」" },
    { no: 2, user: "得到子进程 PID", kernel: "", note: "sys_fork 返回，切回用户态（模式切换 #1 的回程）" },
    { no: 3, user: "调用 write(1, buf)", kernel: "", note: "又一次用户态" },
    { no: 4, user: "", kernel: "陷入 → sys_write 写设备", note: "写设备可能引发进程阻塞、调度切换" },
    { no: 5, user: "write 返回", kernel: "", note: "回到用户态" },
    { no: 6, user: "exit()", kernel: "", note: "最后一次系统调用" },
    { no: 7, user: "", kernel: "陷入 → do_exit 回收资源", note: "进程终止，不再返回用户态；之后 CPU 运行的是别的进程" },
  ];
  return { steps, switches: 6 }; // 每次 fork/write/exit 各 2 次（去+回），exit 只去不回 → 2+2+2 = 6
}

/** 特权指令判定（必须在核心态执行） */
export function isPrivileged(insn: string): boolean {
  const priv = ["关中断", "置时钟", "启动 I/O", "切换页表基址", "清缓存", "halt"];
  return priv.includes(insn);
}

export const SAMPLE_INSNS = ["加法 add", "访存 load", "关中断", "置时钟", "启动 I/O", "跳转 jnz"];

interface Frame extends VizFrame {
  step: number; // trapFlow 下标；-1 = 开场；99 = 特权指令表
}

function buildFrames(): Frame[] {
  const { steps, switches } = trapFlow();
  const frames: Frame[] = [
    {
      step: -1,
      phase: "两种状态",
      desc: "CPU 至少两种运行状态：用户态（目态，只能执行非特权指令、不能直接访外设）与核心态（管态，全部指令可用）。状态由 PSW 标志位标识。切换到核心态的唯一「正常」入口是中断/异常/系统调用——这是保护机制：应用程序拿不到危险操作的直通权。状态切换 ≠ 进程切换（调度引起的切换发生在核心态内部）。",
    },
  ];
  steps.forEach((s, i) => {
    frames.push({
      step: i,
      phase: `第 ${s.no + 1} 步`,
      desc: `${s.note}。当前在${s.user ? "用户态（蓝行）" : "核心态（绿行）"}。`,
    });
  });
  frames.push({
    step: 99,
    phase: "特权指令",
    desc: `统计：fork + write + exit 共 ${switches} 次模式切换。右表是常考分类：关中断/置时钟/启动 I/O 是特权指令，普通运算与访存不是。判断口诀——「影响系统全局、或触碰其他程序资源」的都是特权指令；而「陷入（trap）」本身不是特权指令，它是用户态主动进核心态的合法门。`,
  });
  return frames;
}

export function TrapView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const flow = trapFlow();

  return (
    <div className="space-y-4">
      {fr.step >= 0 && fr.step < 99 && (
        <div className="space-y-1.5">
          {flow.steps.map((s, i) => (
            <div
              key={s.no}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition",
                i === fr.step ? "ring-2 ring-sky-500" : "opacity-70",
                s.user ? "border-sky-400 bg-sky-500/10" : s.kernel ? "border-emerald-500 bg-emerald-500/10" : "border-border"
              )}
            >
              <span className={cn("w-16 shrink-0 font-semibold", s.user ? "text-sky-600" : "text-emerald-600")}>
                {s.user ? "用户态" : "核心态"}
              </span>
              <span className="font-mono">{s.user || s.kernel}</span>
            </div>
          ))}
        </div>
      )}
      {fr.step === 99 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-medium">指令</th>
              <th className="font-medium">用户态可执行？</th>
              <th className="text-left font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_INSNS.map((ins) => (
              <tr key={ins} className="border-t">
                <td className="py-1 font-mono">{ins}</td>
                <td className={cn("text-center font-semibold", isPrivileged(ins) ? "text-rose-500" : "text-emerald-600")}>
                  {isPrivileged(ins) ? "✗（特权指令）" : "✓"}
                </td>
                <td className="text-left text-muted-foreground">
                  {isPrivileged(ins) ? "必须在核心态执行" : "普通指令"}
                </td>
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
