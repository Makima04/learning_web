// 图解 · PV 操作：生产者-消费者（缓冲区 3）。信号量 mutex/empty/full 的值随 P/V 实时变化，
// 缓冲区满时生产者真的被阻塞，直到消费者 V(empty) 才唤醒。
import { useMemo } from "react";
import { Cells, StepDesc, VizControls, VizFrame, usePlayer, type CellItem } from "@/viz/player";

export const PV_N = 3;
export type PvOp = { who: "P" | "C"; label?: string };
export const PV_OPS: PvOp[] = [
  { who: "P" }, { who: "P" }, { who: "P" },
  { who: "P" }, // 第 4 个生产者：empty=0 → 阻塞
  { who: "C" }, // 消费 → 唤醒阻塞的生产者
  { who: "C" },
];

export interface PvState {
  mutex: number;
  empty: number;
  full: number;
  buf: (string | null)[];
  blocked: "P" | "C" | null;
  log: string[];
}

/** 生产者-消费者模拟（互斥 P 的顺序错了会死锁——本实现按正确顺序） */
export function pvSim(n: number, ops: PvOp[]): { frames: PvState[]; blockedCount: number } {
  const st: PvState = { mutex: 1, empty: n, full: 0, buf: Array.from({ length: n }, () => null), blocked: null, log: [] };
  const frames: PvState[] = [{ ...st, buf: [...st.buf], log: [] }];
  let produced = 0;
  let blockedCount = 0;
  const enq = (v: string) => {
    const i = st.buf.indexOf(null);
    st.buf[i] = v;
  };
  const deq = (): string => {
    const i = st.buf.findIndex((x) => x !== null);
    const v = st.buf[i]!;
    st.buf[i] = null;
    return v;
  };
  for (const op of ops) {
    if (op.who === "P") {
      if (st.empty === 0) {
        blockedCount++;
        st.log.push(`P(empty)：empty=0 → 生产者阻塞（进等待队列，让出 CPU）`);
        st.blocked = "P";
        frames.push({ ...st, buf: [...st.buf], log: [...st.log] });
        continue;
      }
      st.empty--;
      st.log.push(`P(empty) → empty=${st.empty}；P(mutex) → mutex=0；放入产品 ${String.fromCharCode(97 + produced)}`);
      st.mutex--;
      enq(String.fromCharCode(97 + produced));
      produced++;
      st.mutex++;
      st.full++;
      st.blocked = null;
      st.log.push(`V(mutex) → mutex=1；V(full) → full=${st.full}`);
      frames.push({ ...st, buf: [...st.buf], log: [...st.log] });
    } else {
      if (st.full === 0) {
        st.log.push(`C：P(full)：full=0 → 消费者阻塞`);
        st.blocked = "C";
        frames.push({ ...st, buf: [...st.buf], log: [...st.log] });
        continue;
      }
      st.full--;
      const v = deq();
      st.empty++;
      const woke = st.blocked === "P";
      st.log.push(`C：P(full) → full=${st.full}；P(mutex)；取走产品 ${v}；V(mutex)；V(empty) → empty=${st.empty}${woke ? "——唤醒阻塞的生产者" : ""}`);
      if (woke) {
        // 被唤醒的生产者立刻完成放入
        st.empty--;
        enq(String.fromCharCode(97 + produced));
        produced++;
        st.mutex--;
        st.mutex++;
        st.full++;
        st.blocked = null;
        st.log.push(`被唤醒的生产者：P(empty) → empty=${st.empty}；P(mutex)；放入产品 ${String.fromCharCode(97 + produced - 1)}；V(mutex)；V(full) → full=${st.full}`);
      }
      frames.push({ ...st, buf: [...st.buf], log: [...st.log] });
    }
  }
  return { frames, blockedCount };
}

interface PvFrame extends VizFrame {
  st: PvState;
}

function buildPvFrames(): PvFrame[] {
  const { frames: states, blockedCount } = pvSim(PV_N, PV_OPS);
  const frames: PvFrame[] = [];
  states.forEach((st, i) => {
    frames.push({
      desc:
        i === 0
          ? "生产者-消费者：缓冲区容量 3。三个信号量分工：mutex=1 管互斥（任一时刻只能有一个人动缓冲区）；empty=3 数空位（生产者要抢一个）；full=0 数产品（消费者要抢一个）。P 是申请（值减 1，<0 就睡），V 是释放（值加 1，有等待者就唤醒一个）。"
          : st.log.slice(-2).join("；"),
      phase: i === 0 ? "初始" : st.blocked ? "阻塞" : PV_OPS[Math.min(i - 1, PV_OPS.length - 1)]?.who === "P" ? "生产" : "消费",
      st,
    });
  });
  frames.push({
    desc: `演完：生产者被阻塞 ${blockedCount} 次、都被消费者的 V(empty) 及时唤醒。两条铁律：① P 操作的顺序不能乱——必须先 P(资源) 再 P(mutex)，反过来缓冲区满时「占着 mutex 等 empty」就死锁；② V 的顺序无所谓（只增不减，不会阻塞）。单缓冲推广到 n 格、多生产多消费，框架不变。`,
    phase: "完成",
    st: states.at(-1)!,
  });
  return frames;
}

export function PvView() {
  const frames = useMemo(buildPvFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const cells: CellItem[] = fr.st.buf.map((v, i) => ({
    label: i + 1,
    v: v ?? "—",
    state: v ? "done" : "dim",
  }));
  const sem = (name: string, val: number) => (
    <div className="w-20 overflow-hidden rounded-md border border-border text-center">
      <div className="bg-muted text-[10px] text-muted-foreground">{name}</div>
      <div className={cnSem(val)}>{val}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">缓冲区（容量 {PV_N}）</p>
          <Cells items={cells} w="w-12" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sem("mutex", fr.st.mutex)}
          {sem("empty", fr.st.empty)}
          {sem("full", fr.st.full)}
          {fr.st.blocked && (
            <span className="self-center rounded bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-600 dark:text-rose-400">
              {fr.st.blocked === "P" ? "生产者阻塞中…" : "消费者阻塞中…"}
            </span>
          )}
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}

function cnSem(v: number) {
  return v === 0
    ? "py-0.5 font-mono text-sm font-bold text-amber-600 dark:text-amber-400"
    : "py-0.5 font-mono text-sm font-bold";
}
