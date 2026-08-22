// 图解 · 栈的综合应用：括号匹配。左括号进栈，右括号找栈顶配对；三种失败各演示一种定位方式。
import { useMemo, useState } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";
import { cn } from "@/lib/utils";

const PAIR: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const OPEN = "([{";

const OK_STR = "[a+(b*c)-{d/(e+f)}]";
const BAD_STR = "[a+(b*c)}-d)";

interface BFrame extends VizFrame {
  chars: CellItem[];
  stack: CellItem[];
}

export interface BracketResult {
  ok: boolean;
  /** 失败时最先出错的下标（0-based），配对失败 / 空栈取空 / 结束栈非空 */
  errPos: number | null;
  reason: string;
}

/** 括号匹配算法本体（考试手写版），返回出错定位 */
export function matchBrackets(s: string): BracketResult {
  const st: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (OPEN.includes(ch)) st.push(ch);
    else if (ch in PAIR) {
      const top = st.pop();
      if (top !== PAIR[ch]) {
        return {
          ok: false,
          errPos: i,
          reason:
            top === undefined
              ? `读到 ${ch} 时栈已空——右括号多了/先到了`
              : `读到 ${ch}，栈顶是 ${top}——类型不匹配`,
        };
      }
    }
  }
  if (st.length > 0) return { ok: false, errPos: s.length, reason: `扫完整个串，栈里还剩 ${st.length} 个左括号没被配对` };
  return { ok: true, errPos: null, reason: "配对完整" };
}

function buildBracketFrames(s: string): BFrame[] {
  const frames: BFrame[] = [];
  const st: string[] = [];
  const chRow = (cur: number, errPos: number | null): CellItem[] =>
    s.split("").map((ch, i) => ({
      v: ch,
      state:
        i === errPos ? "bad" : i === cur ? "hi" : i < cur ? "dim" : "normal",
    }));
  const stRow = (cur: string | null): CellItem[] =>
    st.map((ch, i) => ({ v: ch, state: i === st.length - 1 && cur ? "hi" : "normal" }));

  frames.push({
    desc: "算法骨架：顺序扫描。读左括号 → 进栈；读右括号 → 弹栈顶，配得上继续，配不上立即报错；扫描结束要求栈空。栈「后进先出」恰好对应括号「最后开的最先闭」。",
    phase: "初始",
    chars: chRow(-1, null),
    stack: stRow(null),
  });
  const res = matchBrackets(s);
  let errAt: number | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (OPEN.includes(ch)) {
      st.push(ch);
      frames.push({
        desc: `读到左括号 ${ch}，进栈（现在栈：${st.join(" ")}）。它必须等「最近的、同类型的右括号」来配。`,
        phase: "左括号",
        chars: chRow(i, null),
        stack: stRow(ch),
      });
    } else if (ch in PAIR) {
      const top = st[st.length - 1];
      if (top === PAIR[ch]) {
        st.pop();
        frames.push({
          desc: `读到 ${ch}，弹栈顶 ${top}，类型匹配 ✓（配对成功就出栈，永远不再回头——这是栈题的标志：只看栈顶）。`,
          phase: "右括号",
          chars: chRow(i, null),
          stack: stRow(null),
        });
      } else {
        errAt = i;
        st.pop();
        frames.push({
          desc: `读到 ${ch}，栈顶是 ${top ?? "空"}——${
            top === undefined ? "栈已经空了，右括号先到/多了" : "类型对不上"
          }。顺序扫描在这一格就能定位错误，这是括号匹配常考的大题点：不只判对错，还要给「首次出错位置」。`,
          phase: "出错",
          chars: chRow(i, i),
          stack: stRow(null),
        });
        break;
      }
    }
  }
  if (!frames.some((f) => f.phase === "出错")) {
    if (st.length === 0) {
      frames.push({
        desc: `扫描结束栈空：${s} 括号完全匹配 ✓。时间 O(n)、空间 O(n)（最坏全是左括号）。`,
        phase: "完成",
        chars: chRow(s.length, null),
        stack: stRow(null),
      });
    } else {
      frames.push({
        desc: `扫描结束，栈里还剩 ${st.join(" ")}——左括号多了。注意这种错误的「出错位置」约定为串尾（0..n 都处理完仍不满足），三种失败要分清：配对错、右多、左多。`,
        phase: "出错",
        chars: chRow(s.length, s.length),
        stack: stRow(null),
      });
    }
  }
  void res;
  void errAt;
  return frames;
}

type Mode = "匹配成功" | "失败定位";

export function StackApplyView() {
  const [mode, setMode] = useState<Mode>("匹配成功");
  const frames = useMemo(
    () => buildBracketFrames(mode === "匹配成功" ? OK_STR : BAD_STR),
    [mode]
  );
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["匹配成功", "失败定位"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "匹配成功" ? "匹配成功" : "失败定位"}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">输入串（红色 = 首次出错位置）</p>
          <Cells items={fr.chars} w="w-8" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">栈（右侧为栈顶）</p>
          {fr.stack.length === 0 ? (
            <p className="text-xs text-muted-foreground">（空栈）</p>
          ) : (
            <Cells items={fr.stack} w="w-8" />
          )}
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
