import { describe, expect, it } from "vitest";
import {
  DAY_TZ_OFFSET_MIN,
  dayKey,
  dayKeyStartMs,
  minutesOfDay,
  shiftDayKey,
  weekdayOf,
} from "./day";

// 「一天」的边界固定为北京时间 0 点：设备在哪个时区都不该影响结果。
describe("dayKey（北京时间日界）", () => {
  it("北京 0 点整属于新的一天", () => {
    // 2026-08-06 00:00 +08:00 = 2026-08-05T16:00Z
    const midnight = Date.UTC(2026, 7, 5, 16, 0, 0);
    expect(dayKey(midnight)).toBe("2026-08-06");
  });

  it("北京 0 点前一毫秒仍算前一天", () => {
    const before = Date.UTC(2026, 7, 5, 16, 0, 0) - 1;
    expect(dayKey(before)).toBe("2026-08-05");
  });

  it("UTC 同一天但北京已跨日", () => {
    // 2026-08-05T16:30Z = 北京 2026-08-06 00:30
    expect(dayKey(Date.UTC(2026, 7, 5, 16, 30, 0))).toBe("2026-08-06");
  });

  it("偏移量就是东八区", () => {
    expect(DAY_TZ_OFFSET_MIN).toBe(480);
  });
});

describe("dayKeyStartMs / shiftDayKey", () => {
  it("dayKey 起点落在北京 0 点", () => {
    expect(dayKeyStartMs("2026-08-06")).toBe(Date.UTC(2026, 7, 5, 16, 0, 0));
    expect(dayKey(dayKeyStartMs("2026-08-06"))).toBe("2026-08-06");
  });

  it("非法 dayKey 返回 0", () => {
    expect(dayKeyStartMs("2026-8-6")).toBe(0);
    expect(dayKeyStartMs("")).toBe(0);
  });

  it("跨月跨年平移", () => {
    expect(shiftDayKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("weekdayOf / minutesOfDay", () => {
  it("按北京时间取星期", () => {
    // 2026-08-06 是周四
    expect(weekdayOf("2026-08-06")).toBe(4);
  });

  it("北京时间分钟数", () => {
    // 2026-08-05T16:30Z = 北京 00:30
    expect(minutesOfDay(Date.UTC(2026, 7, 5, 16, 30, 0))).toBe(30);
  });
});
