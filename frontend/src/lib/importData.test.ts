import { describe, expect, it } from "vitest";
import { parseImportData } from "./importData";

describe("parseImportData", () => {
  it("accepts and sanitizes a valid export", () => {
    const result = parseImportData(
      JSON.stringify({
        cards: {
          12: {
            learned: true,
            state: "review",
            due: 1_700_000_000_000,
            ivl: 14,
            ease: 2.5,
            reps: 4,
            lapses: 1,
            quiz: 0,
            updatedAt: 1_700_000_000_000,
            ignored: "value",
          },
        },
        settings: { rate: 1.2, direction: "random", ignored: true },
      })
    );

    expect(result.cards?.[12]).toEqual({
      learned: true,
      state: "review",
      due: 1_700_000_000_000,
      ivl: 14,
      ease: 2.5,
      reps: 4,
      lapses: 1,
      quiz: 0,
      updatedAt: 1_700_000_000_000,
    });
    expect(result.settings).toEqual({ rate: 1.2, direction: "random" });
  });

  it("rejects settings with the wrong type", () => {
    expect(() => parseImportData(JSON.stringify({ settings: { rate: "fast" } }))).toThrow(
      "语速必须是数字"
    );
  });

  it("rejects malformed card state", () => {
    expect(() =>
      parseImportData(
        JSON.stringify({
          cards: {
            1: { state: "done", due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 },
          },
        })
      )
    ).toThrow("卡片 1 的状态无效");
  });

  it("rejects card indexes outside the 6550-word corpus", () => {
    expect(() => parseImportData(JSON.stringify({ cards: { 6551: {} } }))).toThrow(
      "卡片索引 6551 无效"
    );
  });
});
