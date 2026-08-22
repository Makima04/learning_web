import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHeatmapDays,
  computeStreaks,
  loadDayCounts,
  mergeDayCounts,
  noteTodayCount,
  rangeEndingToday,
  shiftDay,
  type DayCounts,
} from "./dayCounts";
import { dayKey } from "./day";
import { scopedKey } from "./storageScope";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  });
});

describe("shiftDay", () => {
  it("跨月/跨年平移", () => {
    expect(shiftDay("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29"); // 闰年
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("computeStreaks", () => {
  it("空数据返回 0", () => {
    expect(computeStreaks({}, "2026-08-22")).toEqual({ current: 0, longest: 0 });
  });

  it("今天还没学不打断：昨天为链头", () => {
    const counts: DayCounts = { "2026-08-20": 5, "2026-08-21": 3 };
    expect(computeStreaks(counts, "2026-08-22")).toEqual({ current: 2, longest: 2 });
  });

  it("今天已学则链到今天", () => {
    const counts: DayCounts = { "2026-08-20": 5, "2026-08-21": 3, "2026-08-22": 7 };
    expect(computeStreaks(counts, "2026-08-22")).toEqual({ current: 3, longest: 3 });
  });

  it("前天就断了则 current 为 0", () => {
    const counts: DayCounts = { "2026-08-20": 5, "2026-08-21": 0 };
    expect(computeStreaks(counts, "2026-08-22").current).toBe(0);
  });

  it("最长段可以不是当前段", () => {
    const counts: DayCounts = {
      "2026-07-01": 1,
      "2026-07-02": 1,
      "2026-07-03": 1,
      "2026-07-04": 1,
      "2026-08-21": 1,
      "2026-08-22": 1,
    };
    expect(computeStreaks(counts, "2026-08-22")).toEqual({ current: 2, longest: 4 });
  });

  it("计数为 0 的天不参与", () => {
    const counts: DayCounts = { "2026-08-21": 4, "2026-08-22": 0 };
    expect(computeStreaks(counts, "2026-08-22")).toEqual({ current: 1, longest: 1 });
  });
});

describe("mergeDayCounts", () => {
  it("同一天取大，不同天并集", () => {
    const a: DayCounts = { "2026-08-21": 10, "2026-08-20": 3 };
    const b: DayCounts = { "2026-08-21": 6, "2026-08-19": 2 };
    expect(mergeDayCounts(a, b)).toEqual({
      "2026-08-19": 2,
      "2026-08-20": 3,
      "2026-08-21": 10,
    });
  });
});

describe("buildHeatmapDays / rangeEndingToday", () => {
  it("区间连续且缺的天补 0", () => {
    const { from, to } = rangeEndingToday("2026-08-22", 3);
    expect(from).toBe("2026-08-20");
    const days = buildHeatmapDays({ "2026-08-21": 4 }, from, to);
    expect(days).toEqual([
      { date: "2026-08-20", count: 0 },
      { date: "2026-08-21", count: 4 },
      { date: "2026-08-22", count: 0 },
    ]);
  });

  it("from > to 返回空", () => {
    expect(buildHeatmapDays({}, "2026-08-22", "2026-08-20")).toEqual([]);
  });

  it("超长区间被 800 天护栏截断", () => {
    const days = buildHeatmapDays({}, "2020-01-01", "2030-01-01");
    expect(days.length).toBe(800);
  });
});

describe("noteTodayCount 持久化", () => {
  it("写入当日计数并可在重读时取回", () => {
    noteTodayCount(7);
    expect(loadDayCounts()[dayKey()]).toBe(7);
    noteTodayCount(9);
    expect(loadDayCounts()[dayKey()]).toBe(9);
  });

  it("历史裁剪到 400 天，今天必留", () => {
    const today = dayKey();
    const bulky: Record<string, number> = {};
    for (let i = 404; i >= 0; i--) {
      bulky[shiftDay(today, -i)] = 1;
    }
    localStorage.setItem(scopedKey("ew.dayCounts.v1"), JSON.stringify(bulky));
    noteTodayCount(5);
    const counts = loadDayCounts();
    expect(Object.keys(counts).length).toBe(400);
    expect(counts[today]).toBe(5);
    expect(counts[shiftDay(today, -400)]).toBeUndefined();
  });
});
