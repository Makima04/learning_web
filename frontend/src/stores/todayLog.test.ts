import { beforeEach, describe, expect, it, vi } from "vitest";
import { dayKey } from "@/lib/day";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  getToday: vi.fn(),
  postStudyEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { logFromServerItems, mergeTodayLogs, useTodayLog } from "@/stores/todayLog";

describe("todayLog", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.isLoggedIn.mockReturnValue(false);
    apiMocks.getToday.mockReset();
    apiMocks.postStudyEvent.mockClear();
    useTodayLog.setState({ log: { dayKey: dayKey(), items: [] } });
  });

  it("records and dedupes by wordIdx with new preferred", () => {
    const store = useTodayLog.getState();
    store.record(10, "review");
    store.record(10, "new");
    store.record(20, "new");
    store.record(20, "review");

    const items = useTodayLog.getState().items();
    expect(items).toHaveLength(2);
    const byIdx = Object.fromEntries(items.map((i) => [i.wordIdx, i.type]));
    expect(byIdx[10]).toBe("new");
    expect(byIdx[20]).toBe("new");
  });

  it("counts and recent order", () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 1000;
      return now;
    });

    const store = useTodayLog.getState();
    store.record(1, "new");
    store.record(2, "review");
    store.record(3, "new");

    const counts = useTodayLog.getState().counts();
    expect(counts).toEqual({ total: 3, newCount: 2, reviewCount: 1 });

    const recent = useTodayLog.getState().recent(2);
    expect(recent).toHaveLength(2);
    // 最近写入的在前
    expect(recent[0].wordIdx).toBe(3);
    expect(recent[1].wordIdx).toBe(2);
  });

  it("logFromServerItems dedupes and prefers new", () => {
    const day = "2026-07-29";
    const log = logFromServerItems(day, [
      {
        word_idx: 1,
        english: "",
        event_type: "review",
        quality: "good",
        studied_at: "2026-07-29T01:00:00.000Z",
      },
      {
        word_idx: 1,
        english: "",
        event_type: "new",
        quality: "good",
        studied_at: "2026-07-29T02:00:00.000Z",
      },
      {
        word_idx: 2,
        english: "",
        event_type: "learn",
        quality: "good",
        studied_at: "2026-07-29T03:00:00.000Z",
      },
      {
        word_idx: 3,
        english: "",
        event_type: "review",
        quality: "good",
        studied_at: "2026-07-29T04:00:00.000Z",
      },
    ]);
    expect(log.dayKey).toBe(day);
    expect(log.items).toHaveLength(2);
    const byIdx = Object.fromEntries(log.items.map((i) => [i.wordIdx, i]));
    expect(byIdx[1].type).toBe("new");
    expect(byIdx[1].at).toBe(Date.parse("2026-07-29T02:00:00.000Z"));
    expect(byIdx[3].type).toBe("review");
  });

  it("mergeTodayLogs keeps local-only words on top of server", () => {
    const day = "2026-07-29";
    const merged = mergeTodayLogs(
      { dayKey: day, items: [{ wordIdx: 7, type: "review", at: 2 }] },
      { dayKey: day, items: [{ wordIdx: 99, type: "new", at: 3 }] }
    );
    const byIdx = Object.fromEntries(merged.items.map((i) => [i.wordIdx, i.type]));
    expect(byIdx[7]).toBe("review");
    expect(byIdx[99]).toBe("new");
  });

  it("syncFromServer keeps local words that server has not returned yet", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    const today = dayKey();
    useTodayLog.getState().record(99, "new");
    expect(useTodayLog.getState().items().some((i) => i.wordIdx === 99)).toBe(true);

    apiMocks.getToday.mockResolvedValue({
      items: [
        {
          word_idx: 7,
          english: "",
          event_type: "review",
          quality: "good",
          studied_at: "2026-07-29T10:00:00.000Z",
        },
      ],
      summary: { new: 0, review: 1, learn: 0, done: 1 },
    });

    await useTodayLog.getState().syncFromServer();

    const items = useTodayLog.getState().items();
    const byIdx = Object.fromEntries(items.map((i) => [i.wordIdx, i.type]));
    expect(byIdx[7]).toBe("review");
    expect(byIdx[99]).toBe("new");
    expect(useTodayLog.getState().log.dayKey).toBe(today);
    expect(apiMocks.getToday).toHaveBeenCalledWith(today);
  });

  it("syncFromServer replays local items when server today is empty", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    useTodayLog.getState().record(5, "new");
    apiMocks.getToday.mockResolvedValue({
      items: [],
      summary: { new: 0, review: 0, learn: 0, done: 0 },
    });

    await useTodayLog.getState().syncFromServer();

    expect(apiMocks.postStudyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ word_idx: 5, event_type: "new" })
    );
    expect(useTodayLog.getState().items().some((i) => i.wordIdx === 5)).toBe(true);
  });
});
