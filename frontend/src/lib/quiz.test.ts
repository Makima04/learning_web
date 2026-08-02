import { beforeEach, describe, expect, it } from "vitest";
import {
  blankTargetHtml,
  buildClozeOptions,
  pickDistractors,
  pickFromPool,
} from "@/lib/quiz";

describe("pickFromPool", () => {
  it("returns null for empty pool", () => {
    expect(pickFromPool([])).toBeNull();
  });

  it("returns the only item", () => {
    expect(pickFromPool(["only"])).toBe("only");
  });

  it("avoids last used when alternatives exist", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(pickFromPool(["a", "b"], "a")!);
    }
    expect(seen.has("b")).toBe(true);
    expect(seen.has("a")).toBe(false);
  });
});

describe("pickDistractors / buildClozeOptions", () => {
  beforeEach(() => {
    const g = globalThis as typeof globalThis & {
      WORDS?: unknown[];
      PAPERS?: unknown[];
    };
    // vitest node 环境：挂 window 供 getWords() 读取
    (globalThis as { window?: unknown }).window = globalThis;
    g.WORDS = [
      [1, "proportion", [["n.", "比例"]]],
      [2, "proposal", [["n.", "提议"]]],
      [3, "property", [["n.", "财产"]]],
      [4, "prospect", [["n.", "前景"]]],
      [5, "provide", [["v.", "提供"]]],
      [6, "abandon", [["v.", "放弃"]]],
      [7, "ability", [["n.", "能力"]]],
      [8, "absolute", [["adj.", "绝对的"]]],
    ];
    g.PAPERS = [];
  });

  it("returns three distinct distractors not equal to correct", () => {
    const d = pickDistractors(1, "proportion", 3, [2, 3, 4]);
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    expect(d.map((x) => x.toLowerCase())).not.toContain("proportion");
  });

  it("buildClozeOptions has four items including correct", () => {
    const opts = buildClozeOptions(1, "proportion", [2, 3, 4, 5]);
    expect(opts).toHaveLength(4);
    expect(opts).toContain("proportion");
    expect(new Set(opts.map((o) => o.toLowerCase())).size).toBe(4);
  });
});

describe("blankTargetHtml", () => {
  const esc = (s: unknown) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  it("blanks the target word in sentence", () => {
    const html = blankTargetHtml("A large proportion of people.", "proportion", esc);
    expect(html).toContain("______");
    expect(html).not.toMatch(/>proportion</i);
  });

  it("appends blank when target missing", () => {
    const html = blankTargetHtml("No target here.", "proportion", esc);
    expect(html).toContain("______");
    expect(html).toContain("No target here.");
  });
});
