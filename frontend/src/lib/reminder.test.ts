import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHHMM, readLastFiredDay, shouldFireReminder, startReminderLoop } from "./reminder";
import { dayKey } from "./day";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseHHMM", () => {
  it("合法 HH:MM 转分钟数", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("08:30")).toBe(510);
    expect(parseHHMM("23:59")).toBe(1439);
  });

  it("非法格式返回 null", () => {
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("8:30")).toBeNull();
    expect(parseHHMM("08:60")).toBeNull();
    expect(parseHHMM("abc")).toBeNull();
    expect(parseHHMM("")).toBeNull();
  });
});

describe("shouldFireReminder", () => {
  const at = (h: number, m: number) => new Date(2026, 7, 22, h, m, 0);

  it("到点后触发", () => {
    expect(shouldFireReminder(at(9, 0), "08:30", null)).toBe(true);
    expect(shouldFireReminder(at(8, 30), "08:30", null)).toBe(true);
  });

  it("未到点不触发", () => {
    expect(shouldFireReminder(at(7, 0), "08:30", null)).toBe(false);
    expect(shouldFireReminder(at(8, 29), "08:30", null)).toBe(false);
  });

  it("今天已触发过则不再触发", () => {
    expect(shouldFireReminder(at(9, 0), "08:30", "2026-08-22")).toBe(false);
  });

  it("昨天触发过不影响今天", () => {
    expect(shouldFireReminder(at(9, 0), "08:30", "2026-08-21")).toBe(true);
  });

  it("非法时间串永不触发", () => {
    expect(shouldFireReminder(at(23, 0), "25:99", null)).toBe(false);
  });
});

describe("startReminderLoop 配额", () => {
  const fixed = () => new Date(2026, 7, 22, 9, 0, 0); // 到点后的固定时刻

  it("通知成功后写当天已触发标记，且当天只触发一次", async () => {
    let calls = 0;
    const stop = startReminderLoop({
      intervalMs: 10,
      now: fixed,
      notify: () => {
        calls += 1;
        return true;
      },
      getEnabled: () => true,
      getTime: () => "08:30",
    });
    expect(readLastFiredDay()).toBe("2026-08-22");
    await new Promise((r) => setTimeout(r, 35));
    stop();
    expect(calls).toBe(1);
  });

  it("通知失败（权限丢失/平台不支持）不消耗当天配额", async () => {
    let calls = 0;
    const stop = startReminderLoop({
      intervalMs: 10,
      now: fixed,
      notify: () => {
        calls += 1;
        return false;
      },
      getEnabled: () => true,
      getTime: () => "08:30",
    });
    await new Promise((r) => setTimeout(r, 35));
    stop();
    expect(calls).toBeGreaterThan(1); // 没写标记，后续 tick 会重试
    expect(readLastFiredDay()).toBeNull();
  });

  it("开关关闭时到点也不触发", () => {
    let calls = 0;
    const stop = startReminderLoop({
      intervalMs: 10,
      now: fixed,
      notify: () => {
        calls += 1;
        return true;
      },
      getEnabled: () => false,
      getTime: () => "08:30",
    });
    stop();
    expect(calls).toBe(0);
    expect(readLastFiredDay()).toBeNull();
    expect(dayKey(fixed().getTime())).toBe("2026-08-22");
  });
});
