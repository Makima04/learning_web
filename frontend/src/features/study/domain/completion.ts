import { answer, dueAfterDays, resetReviewToFirstDay, type Card } from "@/lib/srs";

export interface StudyCompletion {
  card: Card;
  eventType: "new" | "review";
}

/** 学习过关的唯一调度入口；不读 store、不写缓存，输入卡片不会被修改。 */
export function completeStudy(previous: Card, firstPass: boolean, maxIvl: number, now: number): StudyCompletion {
  const working = { ...previous };
  const wasLearned = !!working.learned;
  if (wasLearned && working.state === "new") {
    working.state = "review";
    working.ivl = Math.max(1, working.ivl || 1);
    working.reps = Math.max(1, working.reps || 0);
  }
  const card = !firstPass && wasLearned
    ? resetReviewToFirstDay(working, now)
    : answer(working, "good", now, maxIvl).card;
  card.learned = true;
  // 兼容旧 learn 卡：组内全部重学通过后直接进入按天复习。
  if (card.state !== "review") {
    card.state = "review";
    card.quiz = 0;
    card.ivl = Math.max(1, card.ivl || 1);
    card.due = dueAfterDays(card.ivl, now);
  }
  card.updatedAt = now;
  return { card, eventType: wasLearned ? "review" : "new" };
}
