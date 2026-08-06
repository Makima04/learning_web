import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/srs";
import { summarizePassageWords } from "@/stores/study";
import type { PassageWord } from "@/types/words";

function word(idx: number, en = `w${idx}`): PassageWord {
  return {
    idx,
    english: en,
    senses: [["n.", "义"]],
    sentences: [`${en} is used here.`],
  };
}

function card(partial: Partial<Card>): Card {
  return {
    learned: false,
    state: "new",
    due: 0,
    ivl: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    quiz: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("summarizePassageWords", () => {
  const now = 1_700_000_000_000;

  it("优先判为 learn（有未学）", () => {
    const words = [word(1), word(2), word(3)];
    const cards = {
      1: card({ learned: true, state: "review", due: now - 1 }),
      2: card({ learned: false }),
    };
    const s = summarizePassageWords(words, cards, now);
    expect(s.kind).toBe("learn");
    expect(s.unlearned).toBe(2); // 2 未学 + 3 无卡
    expect(s.due).toBe(1);
    expect(s.learned).toBe(1);
  });

  it("全学完有到期 → review", () => {
    const words = [word(1), word(2)];
    const cards = {
      1: card({ learned: true, state: "review", due: now - 10 }),
      2: card({ learned: true, state: "review", due: now + 86_400_000 }),
    };
    const s = summarizePassageWords(words, cards, now);
    expect(s.kind).toBe("review");
    expect(s.due).toBe(1);
    expect(s.unlearned).toBe(0);
    expect(s.learned).toBe(2);
  });

  it("学完且无到期 → list", () => {
    const words = [word(1), word(2)];
    const cards = {
      1: card({ learned: true, state: "review", due: now + 1 }),
      2: card({ learned: true, state: "review", due: now + 2 }),
    };
    const s = summarizePassageWords(words, cards, now);
    expect(s.kind).toBe("list");
    expect(s.due).toBe(0);
    expect(s.learned).toBe(2);
  });
});
