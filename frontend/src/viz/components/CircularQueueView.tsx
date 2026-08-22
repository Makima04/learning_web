// 图解 · 循环队列：判空判满是考点核心（牺牲一个存储单元），环形数组上推 front/rear
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

const M = 8; // 数组容量
const R = 108; // 环半径
const CX = 160;
const CY = 130;

type SlotState = "empty" | "used" | "new" | "freed" | "full";

interface Frame extends VizFrame {
  slots: (string | null)[]; // 元素
  states: SlotState[];
  front: number;
  rear: number;
}

type Op = { kind: "enq"; ch: string } | { kind: "deq" };

export type QueueOp = Op;

/** 入队判满用「牺牲一个单元」：队满条件 (rear+1)%m == front，实际容量 m-1 */
export function buildCircularQueueFrames(ops: Op[]): Frame[] {
  const slots: (string | null)[] = Array(M).fill(null);
  let front = 0;
  let rear = 0;
  const frames: Frame[] = [];
  const snap = (desc: string, phase: string, states?: SlotState[], f = front, r = rear): void => {
    frames.push({
      desc,
      phase,
      slots: [...slots],
      states: states ?? slots.map((s) => (s == null ? "empty" : "used")),
      front: f,
      rear: r,
    });
  };

  snap(
    `初始空队：front = rear = 0。容量 m=${M} 的数组，队头 front 指向队首元素，队尾 rear 指向下一个待插入位置（指向队尾元素的下一格）。`,
    "初始"
  );

  for (const op of ops) {
    if (op.kind === "enq") {
      const nxt = (rear + 1) % M;
      if (nxt === front) {
        snap(
          `入队 ${op.ch}：先判满，(rear+1)%m = (${rear}+1)%${M} = ${nxt} == front，队满！这就是「牺牲一个单元」判满法——数组 8 格最多存 7 个元素。若不牺牲这格，队满和队空都是 front==rear，无法区分。`,
          "队满",
          slots.map((s) => (s == null ? "empty" : "full"))
        );
        continue;
      }
      slots[rear] = op.ch;
      const states: SlotState[] = slots.map((s) => (s == null ? "empty" : "used"));
      states[rear] = "new";
      snap(
        `入队 ${op.ch}：放在 rear=${rear} 处，然后 rear = (rear+1)%m = ${nxt}（取模让 rear 从 7 回绕到 0，这就是「循环」的由来）。`,
        "入队",
        states
      );
      rear = nxt;
    } else {
      if (front === rear) {
        snap(`出队：front == rear，队空，无元素可出。`, "队空");
        continue;
      }
      const ch = slots[front]!;
      const states: SlotState[] = slots.map((s) => (s == null ? "empty" : "used"));
      states[front] = "freed";
      snap(
        `出队 ${ch}：取走 front=${front} 处元素，然后 front = (front+1)%m = ${(front + 1) % M}。注意出队只移动下标，不搬移元素。`,
        "出队",
        states
      );
      slots[front] = null;
      front = (front + 1) % M;
    }
  }
  return frames;
}

const OPS: Op[] = [
  { kind: "enq", ch: "a" },
  { kind: "enq", ch: "b" },
  { kind: "enq", ch: "c" },
  { kind: "deq" },
  { kind: "enq", ch: "d" },
  { kind: "enq", ch: "e" },
  { kind: "enq", ch: "f" },
  { kind: "enq", ch: "g" },
  { kind: "enq", ch: "h" },
  { kind: "enq", ch: "i" }, // 触发队满
  { kind: "deq" },
];

const FILL: Record<SlotState, string> = {
  empty: "transparent",
  used: C.node,
  new: C.active,
  freed: C.bad,
  full: C.warn,
};
const TXT: Record<SlotState, string> = {
  empty: C.text,
  used: C.nodeText,
  new: C.activeText,
  freed: C.badText,
  full: C.warnText,
};

function slotPos(i: number) {
  // 从正上方顺时针排列
  const ang = (-90 + (360 / M) * i) * (Math.PI / 180);
  return { x: CX + R * Math.cos(ang), y: CY + R * Math.sin(ang) };
}

export function CircularQueueView() {
  const frames = useMemo(() => buildCircularQueueFrames(OPS), []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const count = fr.slots.filter((s) => s != null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row">
        <svg viewBox="0 0 320 270" className="w-full md:w-[46%]">
          {Array.from({ length: M }, (_, i) => {
            const { x, y } = slotPos(i);
            const st = fr.states[i];
            return (
              <g key={i}>
                <rect
                  x={x - 17}
                  y={y - 15}
                  width={34}
                  height={30}
                  rx={6}
                  fill={FILL[st]}
                  stroke={st === "empty" ? "#94a3b8" : "#64748b"}
                  strokeWidth={st === "empty" ? 1 : 1.4}
                  strokeDasharray={st === "empty" ? "4 3" : undefined}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={600}
                  fill={fr.slots[i] ? TXT[st] : "#94a3b8"}
                >
                  {fr.slots[i] ?? i}
                </text>
                <text x={x} y={y + 32} textAnchor="middle" fontSize={10} fill={C.text}>
                  [{i}]
                </text>
              </g>
            );
          })}
          {(["front", "rear"] as const).map((label) => {
            const idx = fr[label];
            const ang = (-90 + (360 / M) * idx) * (Math.PI / 180);
            const ax = CX + (R + 36) * 0.62 * Math.cos(ang);
            const ay = CY + (R + 36) * 0.62 * Math.sin(ang);
            const color = label === "front" ? C.done : C.bad;
            return (
              <g key={label}>
                <line x1={ax} y1={ay} x2={ax + Math.cos(ang) * 12} y2={ay + Math.sin(ang) * 12} stroke={color} strokeWidth={2} />
                <circle cx={ax} cy={ay} r={11} fill={color} />
                <text x={ax} y={ay + 3.5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700}>
                  {label === "front" ? "F" : "R"}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-2 text-xs text-muted-foreground">
          <div className="rounded-lg border p-3 font-mono text-[13px] leading-7 text-foreground">
            队空：front == rear
            <br />
            队满：(rear+1) % m == front（牺牲一格）
            <br />
            入队：Q[rear]=x; rear=(rear+1)%m
            <br />
            出队：x=Q[front]; front=(front+1)%m
            <br />
            长度：(rear-front+m) % m ={" "}
            <span className="font-bold text-primary">{(fr.rear - fr.front + M) % M}</span>
          </div>
          <p>
            当前队内 {count} 个元素，容量 {M}-1={M - 1}。考试常考：给一串操作问最终 front/rear/长度，
            或问「rear 指向队尾元素」的版本（此时判满条件要 ±1 调整）。
          </p>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
