import { describe, expect, it } from "vitest";
import { newCard } from "@/lib/srs";
import { completeStudy } from "./completion";

const now = Date.parse("2026-10-31T23:59:00+08:00");

describe("学习过关领域规则", () => {
  it("首次过关排到次日零点，输入保持不变", () => {
    const previous = newCard();
    const result = completeStudy(previous, true, 15, now);
    expect(previous).toEqual(newCard());
    expect(result.eventType).toBe("new");
    expect(result.card).toMatchObject({ learned: true, ivl: 1, due: Date.parse("2026-11-01T00:00:00+08:00"), updatedAt: now });
  });

  it("复习失败重学后从一天重新开始", () => {
    const previous = { ...newCard(), learned: true, state: "review" as const, ivl: 15, reps: 4 };
    const result = completeStudy(previous, false, 15, now);
    expect(result.eventType).toBe("review");
    expect(result.card).toMatchObject({ ivl: 1, ease: 2.3, lapses: 1, reps: 1 });
    expect(previous.ivl).toBe(15);
  });

  it("一次过关遵循配置上限", () => {
    const previous = { ...newCard(), learned: true, state: "review" as const, ivl: 8, reps: 3 };
    expect(completeStudy(previous, true, 14, now).card).toMatchObject({ ivl: 14, reps: 4 });
  });

  it("旧学习步骤和已学但状态为 new 的卡都迁移为有效复习卡", () => {
    expect(completeStudy({ ...newCard(), state: "learn", quiz: 1 }, false, 15, now).card)
      .toMatchObject({ state: "review", quiz: 0, ivl: 1 });
    expect(completeStudy({ ...newCard(), learned: true }, true, 15, now).card)
      .toMatchObject({ state: "review", ivl: 3, reps: 2 });
  });
});
