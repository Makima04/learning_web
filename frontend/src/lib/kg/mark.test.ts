import { describe, expect, it } from "vitest";
import { applyItemMark, applyMarkToKp, markCovered, newKpState } from "./mark";

describe("applyMarkToKp", () => {
  it("fail resets due and marks weak", () => {
    const now = 1_000_000;
    const s = applyMarkToKp(newKpState(now), "fail", { now });
    expect(s.status).toBe("weak");
    expect(s.due).toBe(now);
    expect(s.lapses).toBe(1);
    expect(s.covered).toBe(true);
  });

  it("pass grows interval", () => {
    const now = 1_000_000;
    let s = applyMarkToKp(newKpState(now), "pass", { now });
    expect(s.ivl).toBeGreaterThan(0);
    expect(s.due).toBeGreaterThan(now);
    const ivl1 = s.ivl;
    s = applyMarkToKp(s, "pass", { now: now + 86400000 });
    expect(s.ivl).toBeGreaterThanOrEqual(ivl1);
  });

  it("skip does not change confidence", () => {
    const base = newKpState();
    base.confidence = 0.5;
    const s = applyMarkToKp(base, "skip");
    expect(s.confidence).toBe(0.5);
  });
});

describe("applyItemMark", () => {
  it("writes primary and secondary; force weak on detail marks", () => {
    const now = 5_000;
    const next = applyItemMark(
      {},
      "ds.graph.sp",
      ["ds.graph.store"],
      "fuzzy",
      ["ds.graph.store"],
      now
    );
    expect(next["ds.graph.sp"].lastMark).toBe("fuzzy");
    expect(next["ds.graph.store"].status).toBe("weak");
  });
});

describe("markCovered", () => {
  it("sets learning on first cover", () => {
    const s = markCovered(undefined, true, 1);
    expect(s.covered).toBe(true);
    expect(s.status).toBe("learning");
  });
});
