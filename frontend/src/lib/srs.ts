// srs.ts — 间隔重复状态机（Anki 风格简化 SM-2），逐行移植自 web/srs.js。
// 纯函数无依赖。状态住在每个 card 对象上。
// 新词走「评估 + 3 个时间学习步骤」流程，避免同一会话连续答对造成的
// 虚假熟练感。quiz（1/2/3）表示下一次待完成的学习步骤。

export const DAY = 86400000;
export const MINUTE = 60000;
export const LEARN_STEPS = [10 * MINUTE, DAY, 3 * DAY] as const;

export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const EASE_INIT = 2.5;

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

function clampEase(e: number): number {
  return Math.max(EASE_MIN, Math.min(EASE_MAX, e));
}
function round(x: number): number {
  return Math.round(x);
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

function scheduleLearn(card: Card, quiz: number, now: number) {
  card.state = "learn";
  card.quiz = quiz;
  card.due = now + LEARN_STEPS[quiz - 1];
}

// 答题。q ∈ {again, hard, good, easy}。**就地改 card**（旧 rate() 依赖此）。
// 返回 { card, interval } —— interval 是人类可读的间隔预览字符串。
export function answer(
  card: Card,
  q: Quality,
  now: number = Date.now()
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
      card.due = now + 1 * DAY;
    } else {
      // easy
      card.state = "review";
      card.reps = 1;
      card.ivl = 4;
      card.quiz = 0;
      card.ease = clampEase(card.ease + 0.15);
      card.due = now + 4 * DAY;
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
        card.due = now + card.ivl * DAY;
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
      card.due = now + 4 * DAY;
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
      card.ivl = Math.max(1, round(card.ivl * factor));
      card.reps++;
      card.quiz = 0;
      card.due = now + card.ivl * DAY;
    }
  }
  return { card, interval: describe(card, now) };
}

// 人类可读的「刚排定的间隔」预览。
export function describe(card: Card, now: number = Date.now()): string {
  if (card.state === "learn") {
    const ms = card.due - now;
    if (ms <= 0) return "现在";
    if (ms < DAY) return Math.max(1, round(ms / MINUTE)) + "分";
    return round(ms / DAY) + "天";
  }
  const ms = card.due - now;
  if (ms < 0) return "现在";
  if (ms < DAY) {
    const m = Math.max(1, round(ms / 60000));
    return m + "分";
  }
  const d = round(ms / DAY);
  if (d === 1) return "1天";
  return d + "天";
}

// 预览「若答 q 会得到的间隔」，不改原 card。
export function preview(
  card: Card | null,
  q: Quality,
  now: number = Date.now()
): string {
  const clone = JSON.parse(JSON.stringify(card || newCard())) as Card;
  answer(clone, q, now);
  return describe(clone, now);
}
