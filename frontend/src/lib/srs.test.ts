import { describe, expect, it } from "vitest";
import { LEARN_STEPS, answer, describe as describeInterval, isMastered, newCard, preview, resetReviewToFirstDay } from "./srs";

describe("SRS learning steps", () => {
  it("spreads an unknown new card across three timed learning steps", () => {
    const start = Date.parse("2026-10-31T09:00:00+08:00");
    const card = newCard();

    answer(card, "again", start);
    expect(card).toMatchObject({ state: "learn", quiz: 1, due: start + LEARN_STEPS[0] });

    answer(card, "good", card.due);
    expect(card).toMatchObject({ state: "learn", quiz: 2, due: Date.parse("2026-11-01T00:00:00+08:00") });

    answer(card, "good", card.due);
    expect(card).toMatchObject({ state: "learn", quiz: 3, due: Date.parse("2026-11-04T00:00:00+08:00") });

    answer(card, "good", card.due);
    expect(card).toMatchObject({ state: "review", quiz: 0, ivl: 7 });
    expect(card.due).toBe(Date.parse("2026-11-11T00:00:00+08:00"));
  });

  it("resets a lapsed review card to the first timed step", () => {
    const now = 1_700_000_000_000;
    const card = { ...newCard(), state: "review" as const, due: now, ivl: 21, reps: 5 };

    answer(card, "again", now);
    expect(card).toMatchObject({ state: "learn", quiz: 1, lapses: 1, due: now + LEARN_STEPS[0] });
  });

  it("resets a failed first-pass review to a 1-day interval", () => {
    const now = Date.parse("2026-10-31T23:00:00+08:00");
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
      due: Date.parse("2026-11-01T00:00:00+08:00"),
    });
  });

  it("only marks sufficiently stable review cards as mastered", () => {
    expect(isMastered({ ...newCard(), state: "review", ivl: 7, reps: 4 })).toBe(false);
    expect(isMastered({ ...newCard(), state: "review", ivl: 14, reps: 4 })).toBe(true);
  });

  it("caps review interval at maxIvl", () => {
    const now = Date.parse("2026-10-31T10:00:00+08:00");
    const card = {
      ...newCard(),
      learned: true,
      state: "review" as const,
      due: now,
      ivl: 10,
      ease: 2.5,
      reps: 3,
    };
    answer(card, "good", now, 15);
    expect(card.ivl).toBe(15);
    expect(card.due).toBe(Date.parse("2026-11-15T00:00:00+08:00"));

    const uncapped = {
      ...newCard(),
      learned: true,
      state: "review" as const,
      due: now,
      ivl: 10,
      ease: 2.5,
      reps: 3,
    };
    answer(uncapped, "good", now, 0);
    expect(uncapped.ivl).toBe(25);
    expect(uncapped.due).toBe(Date.parse("2026-11-25T00:00:00+08:00"));
  });
});

describe("SRS 北京时间零点到期", () => {
  it.each(["00:00:00", "08:00:00", "20:00:00", "23:59:59.999"])(
    "同一天 %s 学完的新词都在次日零点到期", (time) => {
      const now = Date.parse(`2026-10-31T${time}+08:00`);
      const result = answer(newCard(), "good", now);
      expect(result.card.due).toBe(Date.parse("2026-11-01T00:00:00+08:00"));
      expect(result.interval).toBe("1天");
    }
  );

  it.each([
    ["2026-12-31T23:59:59+08:00", "2027-01-01T00:00:00+08:00"],
    ["2028-02-28T12:00:00+08:00", "2028-02-29T00:00:00+08:00"],
    ["2026-10-31T16:00:00Z", "2026-11-02T00:00:00+08:00"],
  ])("跨年、闰日和 UTC 输入仍按北京时间排期：%s", (at, due) => {
    expect(answer(newCard(), "good", Date.parse(at)).card.due).toBe(Date.parse(due));
  });

  it.each(["hard", "good", "easy"] as const)("复习 %s 按对应间隔天数的零点排期", (q) => {
    const card = { ...newCard(), state: "review" as const, ivl: 2 };
    const now = Date.parse("2026-10-31T23:00:00+08:00");
    const expected = { hard: "2026-11-02", good: "2026-11-05", easy: "2026-11-07" };
    answer(card, q, now);
    expect(card.due).toBe(Date.parse(`${expected[q]}T00:00:00+08:00`));
  });

  it("十分钟学习步骤跨过午夜仍保留完整十分钟", () => {
    const now = Date.parse("2026-10-31T23:55:00+08:00");
    const result = answer(newCard(), "again", now);
    expect(result.card.due).toBe(Date.parse("2026-11-01T00:05:00+08:00"));
    expect(result.interval).toBe("10分");
  });

  it("到期瞬间显示现在，预览按日历天数显示且不修改原卡", () => {
    const now = Date.parse("2026-10-31T23:59:00+08:00");
    const card = newCard();
    expect(preview(card, "good", now)).toBe("1天");
    expect(preview(card, "easy", now)).toBe("4天");
    expect(card).toEqual(newCard());
    const scheduled = answer(card, "good", now).card;
    expect(describeInterval(scheduled, scheduled.due)).toBe("现在");
  });
});
