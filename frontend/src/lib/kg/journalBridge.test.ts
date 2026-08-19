import { describe, expect, it } from "vitest";
import type { JournalEntry } from "@/lib/journal";
import {
  dayKeyToLocalMs,
  journalCopyForKp,
  mapReviewToMark,
  planKgChapterDue,
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

  it("maps math kp into 数学分类", () => {
    const copy = journalCopyForKp("calc.limit.def");
    expect(copy?.title).toBe("极限定义与性质");
    expect(copy?.categoryId).toBe("cat-math");
    expect(copy?.body).toContain("函数·极限·连续");
  });
});

describe("planKgChapterDue", () => {
  const today = "2026-08-19";

  function kgEntry(
    id: string,
    kpId: string,
    extra: Partial<JournalEntry> = {}
  ): JournalEntry {
    return {
      id,
      categoryId: "cat-math",
      title: kpId,
      body: "",
      kind: "learn",
      createdOn: "2026-08-18",
      nextReviewOn: today,
      step: 1,
      status: "active",
      lapses: 0,
      updatedAt: 1,
      kpId,
      fromKg: true,
      ...extra,
    };
  }

  it("groups kps in the same module into one chapter card", () => {
    const plan = planKgChapterDue(
      [
        kgEntry("a", "calc.limit.def"),
        kgEntry("b", "calc.limit.tech"),
        kgEntry("c", "calc.limit.cont"),
        kgEntry("d", "calc.limit.asymp"),
      ],
      3,
      today
    );
    expect(plan.due).toHaveLength(1);
    expect(plan.due[0]?.moduleId).toBe("calc-limit");
    expect(plan.due[0]?.moduleName).toBe("函数·极限·连续");
    expect(plan.due[0]?.entries).toHaveLength(4);
    expect(plan.deferred).toHaveLength(0);
  });

  it("caps at 3 chapter cards and defers the rest", () => {
    const plan = planKgChapterDue(
      [
        kgEntry("a", "calc.limit.def", { createdOn: "2026-08-18" }),
        kgEntry("b", "calc.d1.def", { createdOn: "2026-08-17" }),
        kgEntry("c", "calc.i1.indef", { createdOn: "2026-08-16" }),
        kgEntry("d", "calc.ode.1st", { createdOn: "2026-08-15" }),
      ],
      3,
      today
    );
    expect(plan.due.map((c) => c.moduleId)).toEqual([
      "calc-limit",
      "calc-diff1",
      "calc-int1",
    ]);
    expect(plan.deferred.map((c) => c.moduleId)).toEqual(["calc-ode"]);
  });

  it("does not mix manual cards into kg chapter queue", () => {
    const manual: JournalEntry = {
      id: "m1",
      categoryId: "cat-math",
      title: "手写积分",
      body: "",
      kind: "learn",
      createdOn: "2026-08-18",
      nextReviewOn: today,
      step: 1,
      status: "active",
      lapses: 0,
      updatedAt: 1,
    };
    const plan = planKgChapterDue(
      [manual, kgEntry("a", "ds.linear.seq")],
      3,
      today
    );
    expect(plan.due).toHaveLength(1);
    expect(plan.due[0]?.moduleId).toBe("ds-linear");
    expect(plan.due[0]?.entries.every((e) => e.id !== "m1")).toBe(true);
  });

  it("limit 0 defers every chapter", () => {
    const plan = planKgChapterDue([kgEntry("a", "calc.limit.def")], 0, today);
    expect(plan.due).toHaveLength(0);
    expect(plan.deferred).toHaveLength(1);
  });
});
