// srs.ts — 间隔重复状态机（Anki 风格简化 SM-2），逐行移植自 web/srs.js。
// 状态住在每个 card 对象上，按天排期统一使用北京时间零点。
// 底层保留时间学习步骤；学习页面另走组内重学，完成后再更新间隔。
// quiz（1/2/3）表示下一次待完成的学习步骤。
import { DAY, dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";

export { DAY };
export const MINUTE = 60000;
export const LEARN_STEPS = [10 * MINUTE, DAY, 3 * DAY] as const;

export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const EASE_INIT = 2.5;

/** 英语复习间隔上限（天）。答对后 ivl 不超过此值。 */
export const SRS_MAX_IVL_OPTIONS = [14, 15] as const;
export type SrsMaxIvl = (typeof SRS_MAX_IVL_OPTIONS)[number];
export const DEFAULT_SRS_MAX_IVL: SrsMaxIvl = 15;

export function isSrsMaxIvl(value: number): value is SrsMaxIvl {
  return (SRS_MAX_IVL_OPTIONS as readonly number[]).includes(value);
}

export type CardState = "new" | "learn" | "review";
export type Quality = "again" | "hard" | "good" | "easy";

export interface Card {
  /** 是否已完成首次学习；用于区分新词组与复习组。 */
  learned?: boolean;
  state: CardState;
  due: number;
  ivl: number;
  ease: number;
  reps: number;
  lapses: number;
  /** 0/undefined=无待办练习，1/2/3=待做第 N 次学习步骤 */
  quiz?: number;
  /** 本地最后一次写入时间，用于跨设备合并。 */
  updatedAt?: number;
}

/** 从本次学习所在的北京时间日期起平移，间隔 1 天即次日 0 点。 */
export function dueAfterDays(days: number, now: number = Date.now()): number {
  return dayKeyStartMs(shiftDayKey(dayKey(now), days));
}

function isDayBased(card: Pick<Card, "state" | "quiz">): boolean {
  return card.state === "review" || (card.state === "learn" && (card.quiz || 0) >= 2);
}

/** 兼容旧卡的具体到期时刻；分钟级步骤及 due=0 的遗留数据保持原值。 */
export function normalizeCardDue(card: Pick<Card, "state" | "quiz" | "due">): number {
  return isDayBased(card) && card.due > 0
    ? dayKeyStartMs(dayKey(card.due))
    : card.due;
}

function clampEase(e: number): number {
  return Math.max(EASE_MIN, Math.min(EASE_MAX, e));
}
function round(x: number): number {
  return Math.round(x);
}

export function clampIvl(ivl: number, maxIvl: number = DEFAULT_SRS_MAX_IVL): number {
  const n = Math.max(1, round(ivl));
  if (!maxIvl || maxIvl <= 0) return n;
  return Math.min(maxIvl, n);
}

// 新建空卡。
export function newCard(): Card {
  return {
    learned: false,
    state: "new",
    due: 0,
    ivl: 0,
    ease: EASE_INIT,
    reps: 0,
    lapses: 0,
    quiz: 0,
  };
}

export function isMastered(card: Card): boolean {
  return card.state === "review" && card.reps >= 4 && card.ivl >= 14;
}

/**
 * 复习未一次过关：间隔打回 1 天，从记忆曲线第一天重走。
 * 难度略降（与 again 遗忘一致），reps 记为新曲线的第 1 次成功复习。
 */
export function resetReviewToFirstDay(card: Card, now: number = Date.now()): Card {
  card.state = "review";
  card.quiz = 0;
  card.learned = true;
  card.lapses = (card.lapses || 0) + 1;
  card.reps = 1;
  card.ivl = 1;
  card.ease = clampEase(card.ease - 0.2);
  card.due = dueAfterDays(1, now);
  return card;
}

function scheduleLearn(card: Card, quiz: number, now: number) {
  card.state = "learn";
  card.quiz = quiz;
  const interval = LEARN_STEPS[quiz - 1];
  card.due = interval >= DAY ? dueAfterDays(interval / DAY, now) : now + interval;
}

// 答题。q ∈ {again, hard, good, easy}。**就地改 card**（旧 rate() 依赖此）。
// 返回 { card, interval } —— interval 是人类可读的间隔预览字符串。
export function answer(
  card: Card,
  q: Quality,
  now: number = Date.now(),
  maxIvl: number = DEFAULT_SRS_MAX_IVL
): { card: Card; interval: string } {
  card = card || newCard();

  if (card.state === "new") {
    if (q === "again" || q === "hard") {
      // 模糊 / 不认识 / 记错了：10 分钟后开始第 1 次学习步骤。
      scheduleLearn(card, 1, now);
    } else if (q === "good") {
      // 认识：直接毕业进 review
      card.state = "review";
      card.reps = 1;
      card.ivl = 1;
      card.quiz = 0;
      card.due = dueAfterDays(1, now);
    } else {
      // easy
      card.state = "review";
      card.reps = 1;
      card.ivl = 4;
      card.quiz = 0;
      card.ease = clampEase(card.ease + 0.15);
      card.due = dueAfterDays(4, now);
    }
  } else if (card.state === "learn") {
    // quiz=1→2→3；每次答对后安排下一时间步骤，第三步答对后毕业。
    if (q === "again") {
      scheduleLearn(card, 1, now);
    } else if (q === "hard") {
      scheduleLearn(card, 1, now);
    } else if (q === "good") {
      if ((card.quiz || 0) >= 3) {
        card.state = "review";
        card.reps = Math.max(1, card.reps);
        card.ivl = 7;
        card.quiz = 0;
        card.due = dueAfterDays(card.ivl, now);
      } else {
        scheduleLearn(card, (card.quiz || 0) + 1, now);
      }
    } else {
      // easy -> 提前毕业
      card.state = "review";
      card.reps = Math.max(1, card.reps);
      card.ivl = 4;
      card.quiz = 0;
      card.ease = clampEase(card.ease + 0.15);
      card.due = dueAfterDays(4, now);
    }
  } else {
    // review
    if (q === "again") {
      card.lapses++;
      card.reps = 0;
      card.ease = clampEase(card.ease - 0.2);
      scheduleLearn(card, 1, now);
    } else {
      let factor: number;
      if (q === "hard") {
        factor = 1.2;
        card.ease = clampEase(card.ease - 0.15);
      } else if (q === "good") {
        factor = card.ease;
      } else {
        factor = card.ease * 1.3;
        card.ease = clampEase(card.ease + 0.15);
      }
      card.ivl = clampIvl(card.ivl * factor, maxIvl);
      card.reps++;
      card.quiz = 0;
      card.due = dueAfterDays(card.ivl, now);
    }
  }
  return { card, interval: describe(card, now) };
}

// 人类可读的「刚排定的间隔」预览。
export function describe(card: Card, now: number = Date.now()): string {
  const due = normalizeCardDue(card);
  const ms = due - now;
  if (ms <= 0) return "现在";
  if (isDayBased(card)) {
    const days = round((due - dayKeyStartMs(dayKey(now))) / DAY);
    return days + "天";
  }
  if (ms < DAY) return Math.max(1, round(ms / MINUTE)) + "分";
  return round(ms / DAY) + "天";
}

// 预览「若答 q 会得到的间隔」，不改原 card。
export function preview(
  card: Card | null,
  q: Quality,
  now: number = Date.now(),
  maxIvl: number = DEFAULT_SRS_MAX_IVL
): string {
  const clone = JSON.parse(JSON.stringify(card || newCard())) as Card;
  answer(clone, q, now, maxIvl);
  return describe(clone, now);
}
