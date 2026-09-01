import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDay,
  computeWeekStats,
  isDueOnOrBefore,
  isKgJournalEntry,
  mergeJournalSnapshots,
  newEntryDefaults,
  nextStepAfterPass,
  planDueEntries,
  scheduleAfterReview,
  sortDueEntries,
  weekKeyOf,
  type JournalDoc,
  type JournalEntry,
  type ReviewLog,
} from "./journal";

describe("addDays / compareDay", () => {
  it("adds days across month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("compares day keys", () => {
    expect(compareDay("2026-07-01", "2026-07-02")).toBe(-1);
    expect(compareDay("2026-07-02", "2026-07-02")).toBe(0);
  });
});

describe("newEntryDefaults", () => {
  it("carries kpId and fromKg", () => {
    const e = newEntryDefaults({
      categoryId: "cat-408",
      title: "二叉树遍历",
      body: "来自知识图谱",
      kind: "learn",
      kpId: "ds.tree.traverse",
      fromKg: true,
      createdOn: "2026-08-06",
    });
    expect(e.kpId).toBe("ds.tree.traverse");
    expect(e.fromKg).toBe(true);
    expect(e.nextReviewOn).toBe("2026-08-07");
    expect(e.step).toBe(1);
  });

  it("carries sourceItemId for 错题集", () => {
    const e = newEntryDefaults({
      id: "je-wd-ds-mcq-2.2-1",
      categoryId: "cat-408",
      title: "§2.2 #1",
      body: "stem",
      kind: "mistake",
      kpId: "ds.linear.seq",
      fromKg: true,
      sourceItemId: "ds-mcq-2.2-1",
    });
    expect(e.id).toBe("je-wd-ds-mcq-2.2-1");
    expect(e.sourceItemId).toBe("ds-mcq-2.2-1");
    expect(e.kind).toBe("mistake");
  });
});

describe("scheduleAfterReview", () => {
  it("fail resets to 1-day", () => {
    const out = scheduleAfterReview({ step: 7, lapses: 0 }, "fail", "2026-07-17");
    expect(out.step).toBe(1);
    expect(out.nextReviewOn).toBe("2026-07-18");
    expect(out.lapsesDelta).toBe(1);
    expect(out.status).toBe("active");
  });

  it("hard keeps step and reviews tomorrow", () => {
    const out = scheduleAfterReview({ step: 3, lapses: 0 }, "hard", "2026-07-17");
    expect(out.step).toBe(3);
    expect(out.nextReviewOn).toBe("2026-07-18");
  });

  it("pass advances 1→3→7→14 then archives", () => {
    expect(scheduleAfterReview({ step: 1, lapses: 0 }, "pass", "2026-07-17")).toEqual({
      step: 3,
      nextReviewOn: "2026-07-20",
      status: "active",
      lapsesDelta: 0,
    });
    expect(scheduleAfterReview({ step: 3, lapses: 0 }, "pass", "2026-07-17").step).toBe(7);
    expect(scheduleAfterReview({ step: 7, lapses: 0 }, "pass", "2026-07-17").step).toBe(14);
    expect(scheduleAfterReview({ step: 14, lapses: 0 }, "pass", "2026-07-17").status).toBe(
      "archived"
    );
  });
});

describe("nextStepAfterPass", () => {
  it("maps steps", () => {
    expect(nextStepAfterPass(1)).toBe(3);
    expect(nextStepAfterPass(14)).toBe("archive");
  });
});

describe("newEntryDefaults", () => {
  it("schedules first review for next day", () => {
    const e = newEntryDefaults({
      categoryId: "c1",
      title: "一元积分",
      body: "中值定理",
      kind: "learn",
      createdOn: "2026-07-17",
    });
    expect(e.nextReviewOn).toBe("2026-07-18");
    expect(e.step).toBe(1);
    expect(e.status).toBe("active");
  });
});

describe("sortDueEntries", () => {
  it("prioritizes first-review, then mistakes and overdue", () => {
    const base = {
      body: "",
      createdOn: "2026-07-10",
      step: 1 as const,
      status: "active" as const,
      lapses: 0,
      updatedAt: 1,
    };
    const entries: JournalEntry[] = [
      {
        ...base,
        id: "a",
        categoryId: "c",
        title: "learn today",
        kind: "learn",
        nextReviewOn: "2026-07-17",
        lastReviewedOn: "2026-07-12",
      },
      {
        ...base,
        id: "b",
        categoryId: "c",
        title: "mistake overdue",
        kind: "mistake",
        nextReviewOn: "2026-07-15",
        lastReviewedOn: "2026-07-14",
      },
      {
        ...base,
        id: "new",
        categoryId: "c",
        title: "brand new",
        kind: "learn",
        createdOn: "2026-07-16",
        nextReviewOn: "2026-07-17",
      },
      {
        ...base,
        id: "c",
        categoryId: "c",
        title: "future",
        kind: "learn",
        nextReviewOn: "2026-07-20",
      },
    ];
    const due = sortDueEntries(entries, "2026-07-17");
    // 新卡（首次）优先，其后错题，再普通复盘
    expect(due.map((e) => e.id)).toEqual(["new", "b", "a"]);
  });

  it("among first-reviews prefers newer createdOn", () => {
    const mk = (id: string, createdOn: string): JournalEntry => ({
      id,
      categoryId: "cat-math",
      title: id,
      body: "",
      kind: "learn",
      createdOn,
      nextReviewOn: "2026-07-17",
      step: 1,
      status: "active",
      lapses: 0,
      updatedAt: 1,
    });
    const due = sortDueEntries(
      [mk("older", "2026-07-14"), mk("newer", "2026-07-16")],
      "2026-07-17"
    );
    expect(due.map((e) => e.id)).toEqual(["newer", "older"]);
  });
});

describe("planDueEntries", () => {
  it("caps per category and defers the rest", () => {
    const mk = (id: string, categoryId: string, createdOn: string): JournalEntry => ({
      id,
      categoryId,
      title: id,
      body: "",
      kind: "learn",
      createdOn,
      nextReviewOn: "2026-07-17",
      step: 1,
      status: "active",
      lapses: 0,
      updatedAt: 1,
    });
    const entries = [
      mk("m1", "cat-math", "2026-07-16"),
      mk("m2", "cat-math", "2026-07-15"),
      mk("m3", "cat-math", "2026-07-14"),
      mk("m4", "cat-math", "2026-07-13"),
      mk("e1", "cat-english", "2026-07-16"),
      mk("e2", "cat-english", "2026-07-15"),
    ];
    const plan = planDueEntries(
      entries,
      { "cat-math": 3, "cat-english": 1 },
      "2026-07-17"
    );
    // 同日新建按 id 稳定排序；各类各自截断后仍保持全局优先级
    expect(plan.due.map((e) => e.id)).toEqual(["e1", "m1", "m2", "m3"]);
    expect(plan.deferred.map((e) => e.id).sort()).toEqual(["e2", "m4"]);
    expect(plan.deferredByCategory).toEqual({ "cat-math": 1, "cat-english": 1 });
  });

  it("uses default limit 3 when category unset", () => {
    const entries: JournalEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `x${i}`,
      categoryId: "cat-math",
      title: `x${i}`,
      body: "",
      kind: "learn" as const,
      createdOn: `2026-07-${10 + i}`,
      nextReviewOn: "2026-07-17",
      step: 1 as const,
      status: "active" as const,
      lapses: 0,
      updatedAt: 1,
    }));
    const plan = planDueEntries(entries, {}, "2026-07-17");
    expect(plan.due).toHaveLength(3);
    expect(plan.deferred).toHaveLength(2);
  });

  it("does not let kg cards occupy manual category slots", () => {
    const mkManual = (id: string): JournalEntry => ({
      id,
      categoryId: "cat-math",
      title: id,
      body: "",
      kind: "learn",
      createdOn: "2026-07-16",
      nextReviewOn: "2026-07-17",
      step: 1,
      status: "active",
      lapses: 0,
      updatedAt: 1,
    });
    const mkKg = (id: string, kpId: string): JournalEntry => ({
      ...mkManual(id),
      title: kpId,
      kpId,
      fromKg: true,
    });
    const entries = [
      mkKg("k1", "calc.limit.def"),
      mkKg("k2", "calc.limit.tech"),
      mkKg("k3", "calc.limit.cont"),
      mkKg("k4", "calc.limit.asymp"),
      mkManual("m1"),
      mkManual("m2"),
      mkManual("m3"),
      mkManual("m4"),
    ];
    const plan = planDueEntries(entries, { "cat-math": 3 }, "2026-07-17");
    expect(plan.due.every((e) => !isKgJournalEntry(e))).toBe(true);
    expect(plan.due).toHaveLength(3);
    expect(plan.deferred).toHaveLength(1);
    expect(plan.deferred[0]?.id).toBe("m4");
  });
});

describe("isDueOnOrBefore", () => {
  it("ignores archived", () => {
    const e = newEntryDefaults({
      categoryId: "c",
      title: "t",
      body: "",
      kind: "learn",
      createdOn: "2026-07-01",
    });
    e.status = "archived";
    e.nextReviewOn = "2026-07-01";
    expect(isDueOnOrBefore(e, "2026-07-17")).toBe(false);
  });
});

describe("weekKeyOf / computeWeekStats", () => {
  it("monday week key", () => {
    // 2026-07-17 is Friday → week starts 2026-07-13
    expect(weekKeyOf("2026-07-17")).toBe("2026-07-13");
  });

  it("aggregates week stats", () => {
    const entries: JournalEntry[] = [
      newEntryDefaults({
        id: "e1",
        categoryId: "cat-math",
        title: "积分",
        body: "",
        kind: "mistake",
        createdOn: "2026-07-14",
      }),
    ];
    const logs: ReviewLog[] = [
      { id: "l1", entryId: "e1", date: "2026-07-15", result: "fail" },
      { id: "l2", entryId: "e1", date: "2026-07-16", result: "pass" },
    ];
    const stats = computeWeekStats(entries, logs, "2026-07-13");
    expect(stats.created).toBe(1);
    expect(stats.reviewed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.byCategory["cat-math"]).toBe(1);
    expect(stats.topFailTitles[0]?.title).toBe("积分");
  });
});

describe("mergeJournalSnapshots", () => {
  const empty = (updatedAt: number): JournalDoc => ({
    categories: [
      { id: "cat-english", name: "英语", color: "#059669", order: 2 },
    ],
    entries: [],
    logs: [],
    weeklies: [],
    updatedAt,
  });

  it("keeps unique entries from both devices", () => {
    const a = empty(100);
    a.entries = [
      newEntryDefaults({
        id: "je-a",
        categoryId: "cat-english",
        title: "手机记下",
        body: "",
        kind: "learn",
        createdOn: "2026-08-16",
      }),
    ];
    const b = empty(200);
    b.entries = [
      newEntryDefaults({
        id: "je-b",
        categoryId: "cat-english",
        title: "电脑记下",
        body: "",
        kind: "mistake",
        createdOn: "2026-08-16",
      }),
    ];
    const merged = mergeJournalSnapshots(a, b);
    const ids = merged.entries.map((e) => e.id).sort();
    expect(ids).toEqual(["je-a", "je-b"]);
    expect(merged.updatedAt).toBeGreaterThanOrEqual(200);
  });

  it("prefers not dropping an entry that only one device has", () => {
    const older = empty(100);
    older.entries = [
      newEntryDefaults({
        id: "only-old",
        categoryId: "cat-english",
        title: "旧端独有",
        body: "",
        kind: "learn",
        createdOn: "2026-08-16",
      }),
    ];
    const newer = empty(300);
    newer.entries = [];
    const merged = mergeJournalSnapshots(newer, older);
    expect(merged.entries.map((e) => e.id)).toEqual(["only-old"]);
  });
});
