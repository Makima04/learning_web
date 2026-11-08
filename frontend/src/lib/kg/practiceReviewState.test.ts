import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  bulkJournal: vi.fn().mockResolvedValue({ ok: true }),
  getJournal: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import { addDays } from "@/lib/journal";
import { dayKey } from "@/lib/day";
import { flushPending, getSyncStatus, recomputePendingFromStorage } from "@/lib/syncQueue";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { countPoolDrill, learnQueueFrom, reviewQueueFrom, type WangdaoItem } from "./wangdao408";
import { setWangdaoReviewStatus, toggleWangdaoCollect } from "./wangdaoPractice";

const question: WangdaoItem = {
  id: "ll-base-1-mcq-1", source: "lilin880", book: "calc", kind: "mcq",
  section: "1", qno: 1, kp_ids: ["calc.limit.fn"], stem: "函数极限",
};

function clearJournal() {
  useJournal.setState({ entries: [], logs: [], weeklies: [], deleted: [], deletedLogs: [], deletedCategories: [], resetAt: 0, updatedAt: 0 });
}

describe("题目永久学会与复习计划切换", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // UTC 16 点以后已是北京时间次日，确保复习日期使用项目统一日界。
    vi.setSystemTime(new Date("2026-11-08T17:00:00Z"));
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.isLoggedIn.mockReturnValue(false);
    apiMocks.bulkJournal.mockReset().mockResolvedValue({ ok: true });
    apiMocks.getJournal.mockReset();
    clearJournal();
    useKgProgress.setState({ states: {}, itemMarks: [{ itemId: question.id, mark: "pass", ts: 1 }] });
    recomputePendingFromStorage();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("以前只点过会的题可重新入队，明日到期，再切回永久学会", () => {
    setWangdaoReviewStatus(question, "active");
    const [entry] = useJournal.getState().entries;
    expect(entry).toMatchObject({ sourceItemId: question.id, status: "active", step: 1, nextReviewOn: "2026-11-10" });
    expect(countPoolDrill([question], useKgProgress.getState().itemMarks, [entry])).toEqual({ total: 1, learn: 0, review: 0, waiting: 1 });
    expect(reviewQueueFrom([question], [entry], "2026-11-10")).toEqual([question]);

    setWangdaoReviewStatus(question, "archived");
    const entries = useJournal.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: entry.id, status: "archived" });
    expect(reviewQueueFrom([question], entries, "2026-12-01")).toEqual([]);
    expect(learnQueueFrom([question], [], entries)).toEqual([]);
    expect(countPoolDrill([question], [], entries).learn).toBe(0);
    expect(useJournal.getState().logs).toEqual([]);
    expect(useKgProgress.getState().itemMarks).toEqual([{ itemId: question.id, mark: "pass", ts: 1 }]);
    expect(useKgProgress.getState().states).toEqual({});
  });

  it("切换保留原条目、备注、遗忘次数和履历，只重置重新入队的间隔", () => {
    setWangdaoReviewStatus(question, "active");
    const original = {
      ...useJournal.getState().entries[0], step: 7 as const, lapses: 3,
      nextReviewOn: "2026-11-15", body: "保留我的错因", lastReviewedOn: "2026-11-08",
    };
    const log = { id: "log-1", entryId: original.id, result: "hard" as const, date: "2026-11-08", updatedAt: 1 };
    useJournal.setState({ entries: [original], logs: [log] });
    toggleWangdaoCollect(question, false);
    expect(useJournal.getState().entries[0]).toMatchObject({ ...original, status: "archived", updatedAt: original.updatedAt + 1 });
    toggleWangdaoCollect(question, true);
    const restored = useJournal.getState().entries[0];
    expect(restored).toEqual({ ...original, status: "active", step: 1, nextReviewOn: addDays(dayKey(), 1), updatedAt: original.updatedAt + 2 });
    expect(useJournal.getState().logs).toEqual([log]);
    vi.advanceTimersByTime(2 * 86400000);
    setWangdaoReviewStatus(question, "active");
    expect(useJournal.getState().entries[0]).toEqual(restored);
  });

  it("未作答也能手动设为永久学会，不伪造作答记录，刷新后仍退出新学队列", () => {
    useKgProgress.setState({ itemMarks: [] });
    setWangdaoReviewStatus(question, "archived");
    useJournal.setState({ entries: [] });
    useJournal.getState().rehydrate();
    expect(useJournal.getState().entries[0]?.status).toBe("archived");
    expect(learnQueueFrom([question], [], useJournal.getState().entries)).toEqual([]);
    expect(useKgProgress.getState().itemMarks).toEqual([]);
    expect(useJournal.getState().logs).toEqual([]);
  });

  it("两种切换均进入可重试队列，并能从服务端恢复到另一设备", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    for (const status of ["archived", "active"] as const) {
      vi.advanceTimersByTime(1);
      setWangdaoReviewStatus(question, status);
      expect(getSyncStatus().pending).toBe(true);
      apiMocks.bulkJournal.mockRejectedValueOnce(new Error("offline"));
      await flushPending();
      expect(getSyncStatus().pending).toBe(true);
      await flushPending();
      expect(getSyncStatus().pending).toBe(false);
      const batch = apiMocks.bulkJournal.mock.calls.at(-1)![0];
      expect(batch.entries).toHaveLength(1);
      expect(batch.entries[0]).toMatchObject({ deleted: false, entry: { sourceItemId: question.id, status } });

      // 第二台设备无本地缓存，经服务端按条结果恢复。
      localStorage.clear();
      clearJournal();
      apiMocks.getJournal.mockResolvedValue({ ...batch, reset_at: 0 });
      await useJournal.getState().syncFromServer();
      expect(useJournal.getState().entries).toEqual([batch.entries[0].entry]);
    }
  });

});
