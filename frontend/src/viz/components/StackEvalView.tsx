// 图解 · 栈与表达式求值：中缀转后缀（操作符栈）+ 后缀表达式求值（操作数栈），考试两种手算各配一段动画
import { useMemo, useState } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

type Mode = "转后缀" | "求值";

interface Frame extends VizFrame {
  tokens: string[];
  cursor: number;
  stack: string[];
  stackLabel: string;
  output: string[];
  outputLabel: string;
}

const EXPR = ["1", "+", "2", "*", "3", "-", "4", "/", "2"];
const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** 中缀 → 后缀（纯函数，供动画与单测共用） */
export function toPostfix(tokens: string[]): string[] {
  const stack: string[] = [];
  const output: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t)) {
      output.push(t);
    } else {
      while (stack.length && PREC[stack[stack.length - 1]] >= PREC[t]) {
        output.push(stack.pop()!);
      }
      stack.push(t);
    }
  }
  while (stack.length) output.push(stack.pop()!);
  return output;
}

/** 中缀转后缀逐步动画：操作数直出；运算符入栈前弹出栈内优先级 ≥ 自己的 */
export function buildPostfixFrames(tokens: string[]): Frame[] {
  const frames: Frame[] = [];
  const stack: string[] = [];
  const output: string[] = [];
  const snap = (desc: string, cursor: number, phase?: string) =>
    frames.push({
      desc,
      phase,
      tokens,
      cursor,
      stack: [...stack],
      stackLabel: "操作符栈",
      output: [...output],
      outputLabel: "输出（后缀）",
    });

  snap("中缀表达式 1+2*3-4/2。从左往右扫描：操作数直接输出；运算符入栈前，要把栈里优先级不低于它的先弹出去。", -1, "开始");
  tokens.forEach((t, i) => {
    if (/\d/.test(t)) {
      output.push(t);
      snap(`读入操作数 ${t}：直接输出。`, i);
    } else {
      while (stack.length && PREC[stack[stack.length - 1]] >= PREC[t]) {
        const top = stack.pop()!;
        output.push(top);
        snap(`读入 ${t}：栈顶 ${top} 的优先级 ≥ ${t}，先弹出 ${top} 输出。`, i);
      }
      stack.push(t);
      snap(
        stack.length > 1
          ? `栈顶已比 ${t} 低，${t} 入栈（栈内自底向上优先级递增）。`
          : `栈已空，${t} 入栈。`,
        i
      );
    }
  });
  while (stack.length) {
    const top = stack.pop()!;
    output.push(top);
    snap(`扫描结束：栈内剩余运算符依次弹出输出（先弹 ${top}）。`, tokens.length - 1, "收尾");
  }
  snap(
    `后缀表达式：${output.join(" ")}。优先级高的 * / 紧跟在两个操作数之后，不再需要括号和优先级规则。`,
    tokens.length,
    "完成"
  );
  return frames;
}

/** 后缀求值逐步动画：一个操作数栈足矣 */
export function buildEvalFrames(tokens: string[]): Frame[] {
  const frames: Frame[] = [];
  const stack: string[] = [];
  const snap = (desc: string, cursor: number, phase?: string) =>
    frames.push({
      desc,
      phase,
      tokens,
      cursor,
      stack: [...stack],
      stackLabel: "操作数栈",
      output: [],
      outputLabel: "",
    });

  snap(`求后缀表达式 ${tokens.join(" ")} 的值：从左往右扫，操作数入栈，运算符出栈两个数算一个。`, -1, "开始");
  tokens.forEach((t, i) => {
    if (/\d/.test(t)) {
      stack.push(t);
      snap(`读入 ${t}：操作数，入栈。`, i);
    } else {
      const b = stack.pop()!;
      const a = stack.pop()!;
      const v = t === "+" ? +a + +b : t === "-" ? +a - +b : t === "*" ? +a * +b : +a / +b;
      stack.push(String(v));
      snap(`读入 ${t}：弹出 ${b} 和 ${a}，计算 ${a} ${t} ${b} = ${v}，结果入栈。后弹出的 ${a} 是左操作数，减法和除法顺序不能反。`, i);
    }
  });
  snap(`结束：栈中只剩 ${stack[0]}，即表达式的值。整个过程没有优先级判断，一遍扫完。`, tokens.length, "完成");
  return frames;
}

function TokenRow({ tokens, cursor }: { tokens: string[]; cursor: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tokens.map((t, i) => (
        <span
          key={i}
          className={cn(
            "grid h-8 min-w-8 place-items-center rounded-md border px-1 font-mono text-sm font-semibold",
            i === cursor
              ? "border-primary bg-primary text-primary-foreground"
              : i < cursor
                ? "border-transparent bg-muted text-muted-foreground"
                : "border-border text-foreground"
          )}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function StackEvalView() {
  const [mode, setMode] = useState<Mode>("转后缀");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["转后缀", "求值"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "转后缀" ? "中缀 → 后缀" : "后缀求值"}
          </button>
        ))}
      </div>
      <StackEvalDemo key={mode} mode={mode} />
    </div>
  );
}

/** 播放器随模式 key 重挂载，切模式自然回到第 0 步 */
function StackEvalDemo({ mode }: { mode: Mode }) {
  const frames = useMemo(
    () => (mode === "转后缀" ? buildPostfixFrames(EXPR) : buildEvalFrames(toPostfix(EXPR))),
    [mode]
  );
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">输入（高亮为当前读到的符号）</p>
            <TokenRow tokens={fr.tokens} cursor={fr.cursor} />
          </div>
          {/* 栈：底朝下，只画顶栏颜色 */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{fr.stackLabel}（栈顶在上）</p>
            <div className="flex min-h-[96px] w-28 flex-col-reverse gap-1 rounded-lg border border-dashed p-1.5">
              {fr.stack.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">空</p>
              )}
              {fr.stack.map((s, i) => (
                <span
                  key={i}
                  className="grid h-8 place-items-center rounded-md font-mono text-sm font-bold text-white"
                  style={{
                    background: i === fr.stack.length - 1 ? C.active : "#64748b",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {fr.outputLabel && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{fr.outputLabel}</p>
            <TokenRow tokens={fr.output} cursor={-2} />
          </div>
        )}
        <StepDesc frame={fr} />
        <VizControls p={p} />
    </div>
  );
}
