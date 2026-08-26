import { describe, expect, it } from "vitest";
import { DAY, LEARN_STEPS, answer, isMastered, newCard, resetReviewToFirstDay } from "./srs";

describe("SRS learning steps", () => {
  it("spreads an unknown new card across three timed learning steps", () => {
    const start = 1_700_000_000_000;
    const card = newCard();

    answer(card, "again", start);
    expect(card).toMatchObject({ state: "learn", quiz: 1, due: start + LEARN_STEPS[0] });

    answer(card, "good", card.due);
    expect(card).toMatchObject({ state: "learn", quiz: 2, due: start + LEARN_STEPS[0] + LEARN_STEPS[1] });

    answer(card, "good", card.due);
    expect(card).toMatchObject({ state: "learn", quiz: 3, due: start + LEARN_STEPS[0] + LEARN_STEPS[1] + LEARN_STEPS[2] });

    answer(card, "good", card.due);
    expect(card).toMatchObject({ state: "review", quiz: 0, ivl: 7 });
    expect(card.due).toBe(start + LEARN_STEPS[0] + LEARN_STEPS[1] + LEARN_STEPS[2] + 7 * DAY);
  });

  it("resets a lapsed review card to the first timed step", () => {
    const now = 1_700_000_000_000;
    const card = { ...newCard(), state: "review" as const, due: now, ivl: 21, reps: 5 };

    answer(card, "again", now);
    expect(card).toMatchObject({ state: "learn", quiz: 1, lapses: 1, due: now + LEARN_STEPS[0] });
  });

  it("resets a failed first-pass review to a 1-day interval", () => {
    const now = 1_700_000_000_000;
    const card = {
      ...newCard(),
      learned: true,
      state: "review" as const,
      due: now,
      ivl: 21,
      ease: 2.5,
      reps: 5,
    };

    resetReviewToFirstDay(card, now);
    expect(card).toMatchObject({
      state: "review",
      learned: true,
      quiz: 0,
      ivl: 1,
      reps: 1,
      lapses: 1,
      ease: 2.3,
      due: now + DAY,
    });
  });

  it("only marks sufficiently stable review cards as mastered", () => {
    expect(isMastered({ ...newCard(), state: "review", ivl: 7, reps: 4 })).toBe(false);
    expect(isMastered({ ...newCard(), state: "review", ivl: 14, reps: 4 })).toBe(true);
  });
});
