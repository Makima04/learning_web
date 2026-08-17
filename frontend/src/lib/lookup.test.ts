import { describe, expect, it, vi } from "vitest";
import type { WordEntry } from "@/types/words";

const { lexicon } = vi.hoisted(() => ({
  lexicon: new Map<string, WordEntry>(),
}));

vi.mock("@/lib/words", () => ({
  getWordByEn: () => lexicon,
}));

import { lookupWord, restoreInflection } from "@/lib/lookup";

function add(en: string, idx: number) {
  lexicon.set(en, [idx, en, [["?", en]]]);
}

// 对照词库里会抢命中的短词 + 正确原形
for (const [en, idx] of [
  ["hop", 1],
  ["hope", 2],
  ["car", 3],
  ["care", 4],
  ["us", 5],
  ["use", 6],
  ["not", 7],
  ["note", 8],
  ["run", 9],
  ["used", 10],
  ["world", 11],
  ["found", 12],
  ["saw", 13],
  ["beginning", 14],
  ["begin", 15],
] as const) {
  add(en, idx);
}

function lemmaOf(surface: string): string | null {
  const hit = lookupWord(surface);
  return hit ? hit[1] : null;
}

describe("restoreInflection / lookupWord", () => {
  it("hoped / hoping → hope，而不是 hop", () => {
    expect(restoreInflection("hoped")).toBe("hope");
    expect(restoreInflection("hoping")).toBe("hope");
    expect(lemmaOf("hoped")).toBe("hope");
    expect(lemmaOf("hoping")).toBe("hope");
  });

  it("cared / caring → care，而不是 car", () => {
    expect(restoreInflection("cared")).toBe("care");
    expect(restoreInflection("caring")).toBe("care");
    expect(lemmaOf("cared")).toBe("care");
    expect(lemmaOf("caring")).toBe("care");
  });

  it("using → use，而不是 us", () => {
    expect(restoreInflection("using")).toBe("use");
    expect(lemmaOf("using")).toBe("use");
  });

  it("noted / noting → note，而不是 not", () => {
    expect(restoreInflection("noted")).toBe("note");
    expect(restoreInflection("noting")).toBe("note");
    expect(lemmaOf("noted")).toBe("note");
    expect(lemmaOf("noting")).toBe("note");
  });

  it("running → run（去叠字）", () => {
    expect(restoreInflection("running")).toBe("run");
    expect(lemmaOf("running")).toBe("run");
  });

  it("used 是独立词条，exact 仍返回 used", () => {
    expect(restoreInflection("used")).toBe("used");
    expect(lemmaOf("used")).toBe("used");
    expect(lemmaOf("USED")).toBe("used");
  });

  it("world's 剥所有格后命中 world", () => {
    expect(restoreInflection("world's")).toBe("world");
    expect(lemmaOf("world's")).toBe("world");
    expect(lemmaOf("World's")).toBe("world");
    expect(lemmaOf("world\u2019s")).toBe("world");
  });

  it("found / saw 保持 exact，不做不规则还原", () => {
    expect(restoreInflection("found")).toBe("found");
    expect(lemmaOf("found")).toBe("found");
    expect(restoreInflection("saw")).toBe("saw");
    expect(lemmaOf("saw")).toBe("saw");
  });

  it("beginning 是独立词条则 exact，不落到 begin", () => {
    expect(restoreInflection("beginning")).toBe("beginning");
    expect(lemmaOf("beginning")).toBe("beginning");
  });

  it("restoreInflection 与 lookupWord 共用同一套还原", () => {
    const surfaces = [
      "hoped",
      "hoping",
      "cared",
      "caring",
      "using",
      "noted",
      "noting",
      "running",
      "used",
      "world's",
      "found",
    ];
    for (const s of surfaces) {
      expect(restoreInflection(s)).toBe(lemmaOf(s));
    }
  });
});
