import { describe, expect, it } from "vitest";
import { checkFreshness, STALE_AFTER_MS } from "@/features/system-update/freshness";

const NOW = Date.parse("2026-11-02T12:00:00Z");

describe("checkFreshness", () => {
  it("从未检查过视为过期，不能宣称已是最新", () => {
    expect(checkFreshness(undefined, NOW)).toEqual({ label: "尚未检查", stale: true });
    expect(checkFreshness(null, NOW).stale).toBe(true);
    expect(checkFreshness("not-a-date", NOW).stale).toBe(true);
  });

  it("两天前（44 小时）的检查结果必须过期（线上误报场景）", () => {
    const state = checkFreshness("2026-10-31T15:31:43.176974+00:00", NOW);
    expect(state).toEqual({ label: "1 天前", stale: true });
  });

  it("30 分钟内的结果算新鲜", () => {
    expect(checkFreshness("2026-11-02T11:55:00Z", NOW)).toEqual({ label: "5 分钟前", stale: false });
    expect(checkFreshness(new Date(NOW - STALE_AFTER_MS).toISOString(), NOW).stale).toBe(false);
    expect(checkFreshness(new Date(NOW - STALE_AFTER_MS - 1000).toISOString(), NOW).stale).toBe(true);
  });

  it("时钟偏差导致的未来时间按刚刚处理", () => {
    expect(checkFreshness("2026-11-02T12:05:00Z", NOW)).toEqual({ label: "刚刚", stale: false });
  });

  it("小时与天数的文案", () => {
    expect(checkFreshness("2026-11-02T09:00:00Z", NOW).label).toBe("3 小时前");
    expect(checkFreshness("2026-10-30T12:00:00Z", NOW).label).toBe("3 天前");
  });
});
