// 图解 · 经典同步：读者-写者（读者优先）。count 记录在场读者数，第一个读者锁 rw、
// 最后一个读者解 rw；写者在 count>0 期间始终进不来——「读写互斥、读读并行」看得见。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export type RwEvent = { who: "R" | "W"; id: number; act: "enter" | "leave" | "request" };
export const RW_EVENTS: RwEvent[] = [
  { who: "R", id: 1, act: "enter" },
  { who: "R", id: 2, act: "enter" },
  { who: "W", id: 1, act: "request" }, // 被挡
  { who: "R", id: 1, act: "leave" },
  { who: "R", id: 2, act: "leave" }, // count 归零 → 唤醒写者
  { who: "W", id: 1, act: "leave" },
  { who: "W", id: 2, act: "request" },
  { who: "W", id: 2, act: "leave" },
];

export interface RwState {
  count: number;
  rw: number;
  mutex: number;
  writerActive: boolean;
  writerWaiting: boolean;
  activeReaders: number[];
}

/** 读者优先模拟 */
export function rwSim(events: RwEvent[]): { frames: RwState[]; writerBlockedRounds: number } {
  const st: RwState = { count: 0, rw: 1, mutex: 1, writerActive: false, writerWaiting: false, activeReaders: [] };
  const frames: RwState[] = [{ ...st, activeReaders: [] }];
  let writerBlockedRounds = 0;
  for (const ev of events) {
    if (ev.who === "R") {
      if (ev.act === "enter") {
        st.mutex = 0;
        st.count++;
        st.activeReaders.push(ev.id);
        if (st.count === 1) st.rw = 0; // 第一个读者锁住 rw
        st.mutex = 1;
        frames.push({ ...st, activeReaders: [...st.activeReaders] });
      } else {
        st.mutex = 0;
        st.count--;
        st.activeReaders = st.activeReaders.filter((x) => x !== ev.id);
        if (st.count === 0 && st.writerWaiting) {
          st.rw = 0; // 最后一个读者走，唤醒写者
          st.writerWaiting = false;
          st.writerActive = true;
        } else if (st.count === 0) st.rw = 1;
        st.mutex = 1;
        frames.push({ ...st, activeReaders: [...st.activeReaders] });
      }
    } else {
      if (ev.act === "request") {
        if (st.rw === 1 && st.count === 0) {
          st.rw = 0;
          st.writerActive = true;
        } else {
          writerBlockedRounds++;
          st.writerWaiting = true;
        }
        frames.push({ ...st, activeReaders: [...st.activeReaders] });
      } else {
        st.rw = 1;
        st.writerActive = false;
        frames.push({ ...st, activeReaders: [...st.activeReaders] });
      }
    }
  }
  return { frames, writerBlockedRounds };
}

interface RwFrame extends VizFrame {
  st: RwState;
}

function buildRwFrames(): RwFrame[] {
  const { frames: states, writerBlockedRounds } = rwSim(RW_EVENTS);
  const frames: RwFrame[] = [];
  const descFor = (ev: RwEvent, st: RwState): { desc: string; phase: string } => {
    if (ev.who === "R" && ev.act === "enter") {
      return st.count > 1
        ? { desc: `读者 ${ev.id} 进：P(mutex) 保护 count；count=${st.count}>1，不用动 rw（已有读者在，读读并行 ✓）。`, phase: `读 ${ev.id} 进` }
        : { desc: `读者 ${ev.id} 进：count 从 0 → 1，第一个读者 P(rw) 把门锁上——写者从此进不来。这是「第一个读者代所有读者锁门」。`, phase: `读 ${ev.id} 进` };
    }
    if (ev.who === "R" && ev.act === "leave") {
      return st.count === 0
        ? { desc: `读者 ${ev.id} 出：count 归 0，最后一个读者 V(rw) 开门${st.writerActive ? "——唤醒等着的写者" : ""}。`, phase: `读 ${ev.id} 出` }
        : { desc: `读者 ${ev.id} 出：count=${st.count} 还有读者，门继续锁着。`, phase: `读 ${ev.id} 出` };
    }
    if (ev.who === "W" && ev.act === "request") {
      return st.writerActive
        ? { desc: `写者 ${ev.id} 请求：P(rw) 拿到锁，开始写（此时无读者）。`, phase: `写 ${ev.id} 进` }
        : { desc: `写者 ${ev.id} 请求：P(rw) 上 rw=0，被挡在门外等待（读者优先：只要有读者，写者就一直等，可能饿死）。`, phase: `写 ${ev.id} 阻塞` };
    }
    return { desc: `写者 ${ev.id} 写完：V(rw) 开门，下一个竞争者（读或写）可以进了。`, phase: `写 ${ev.id} 出` };
  };
  RW_EVENTS.forEach((ev, i) => {
    const st = states[i + 1]!;
    const { desc, phase } = descFor(ev, st);
    frames.push({ desc, phase, st });
  });
  frames.push({
    desc: `收尾：写者累计被挡 ${writerBlockedRounds} 轮。要点：count 的读改写必须套 mutex；「第一个读者锁门、最后一个读者开门」避免读者反复碰 rw。写者优先/读写公平的变体再加一个信号量（如 w=1，让写者插队/排队）即可。哲学家用五支筷子、理发师、吸烟者……都是同一套「信号量 + 管程」骨架，见生产者-消费者演示。`,
    phase: "完成",
    st: states.at(-1)!,
  });
  return frames;
}

export function RwView() {
  const frames = useMemo(buildRwFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx]!;
  const st = fr.st;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {st.activeReaders.map((id) => (
          <span key={id} className="rounded border border-emerald-600 bg-emerald-600/15 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            读{id} 读中
          </span>
        ))}
        {st.writerActive && (
          <span className="rounded border border-amber-500 bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
            写1 写中
          </span>
        )}
        {st.writerWaiting && !st.writerActive && (
          <span className="rounded border border-rose-500 bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-600 dark:text-rose-400">
            写者等待中…
          </span>
        )}
        {st.activeReaders.length === 0 && !st.writerActive && !st.writerWaiting && (
          <span className="text-xs text-muted-foreground">（无人访问）</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 font-mono text-xs">
        <div className="w-20 overflow-hidden rounded-md border border-border text-center">
          <div className="bg-muted text-[10px] text-muted-foreground">count</div>
          <div className="py-0.5 font-bold">{st.count}</div>
        </div>
        <div className="w-20 overflow-hidden rounded-md border border-border text-center">
          <div className="bg-muted text-[10px] text-muted-foreground">rw</div>
          <div className={cn("py-0.5 font-bold", st.rw === 0 && "text-amber-600 dark:text-amber-400")}>{st.rw}</div>
        </div>
        <div className="w-20 overflow-hidden rounded-md border border-border text-center">
          <div className="bg-muted text-[10px] text-muted-foreground">mutex</div>
          <div className="py-0.5 font-bold">{st.mutex}</div>
        </div>
      </div>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
