import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDay,
  computeWeekStats,
  isDueOnOrBefore,
  mergeJournalSnapshots,
  newEntryDefaults,
  nextStepAfterPass,
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
  it("prioritizes mistakes and overdue", () => {
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
      },
      {
        ...base,
        id: "b",
        categoryId: "c",
        title: "mistake overdue",
        kind: "mistake",
        nextReviewOn: "2026-07-15",
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
    expect(due.map((e) => e.id)).toEqual(["b", "a"]);
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
