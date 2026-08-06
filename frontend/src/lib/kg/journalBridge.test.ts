import { describe, expect, it } from "vitest";
import {
  dayKeyToLocalMs,
  journalCopyForKp,
  mapReviewToMark,
} from "./journalBridge";
import { applyMarkToKp, newKpState } from "./mark";

describe("mapReviewToMark", () => {
  it("maps journal results to kg marks", () => {
    expect(mapReviewToMark("pass")).toBe("pass");
    expect(mapReviewToMark("hard")).toBe("fuzzy");
    expect(mapReviewToMark("fail")).toBe("fail");
  });
});

describe("dayKeyToLocalMs", () => {
  it("parses local midnight", () => {
    const ms = dayKeyToLocalMs("2026-08-06");
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(0);
  });
});

describe("journal review → mastery", () => {
  it("pass increases confidence after cover", () => {
    const now = 1_000_000;
    let s = newKpState(now);
    s = applyMarkToKp(s, mapReviewToMark("pass"), { now });
    expect(s.confidence).toBeGreaterThan(0);
    expect(s.covered).toBe(true);
    const c1 = s.confidence;
    s = applyMarkToKp(s, mapReviewToMark("pass"), { now: now + 86400000 });
    expect(s.confidence).toBeGreaterThan(c1);
  });

  it("fail decreases confidence and marks weak", () => {
    const now = 1_000_000;
    let s = applyMarkToKp(newKpState(now), "pass", { now });
    const c0 = s.confidence;
    s = applyMarkToKp(s, mapReviewToMark("fail"), { now: now + 1000 });
    expect(s.confidence).toBeLessThan(c0);
    expect(s.status).toBe("weak");
  });
});

describe("journalCopyForKp", () => {
  it("returns null for unknown kp", () => {
    expect(journalCopyForKp("no.such.kp")).toBeNull();
  });
});
