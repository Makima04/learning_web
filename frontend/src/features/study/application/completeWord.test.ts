import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => true),
  postStudyCompletions: vi.fn().mockResolvedValue({ ok: true }),
  getCards: vi.fn(), bulkCards: vi.fn(), getToday: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);
import { completeWord } from "./completeWord";
import { newCard } from "@/lib/srs";
import { dayKey } from "@/lib/day";
import { setScopeUserId } from "@/lib/storageScope";
import { flushPending } from "@/lib/syncQueue";
import { useCards } from "@/stores/cards";
import { useTodayLog } from "@/stores/todayLog";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";

describe("学习完成应用服务", () => {
  let storage: Map<string,string>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storage = new Map();
    vi.stubGlobal("localStorage", {
      get length() { return storage.size; },
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key,value),
      removeItem: (key: string) => storage.delete(key),
    });
    setScopeUserId(1);
    useCards.setState({ cards: {} });
    useTodayLog.setState({ log: { dayKey: dayKey(), items: [] } });
    useMeta.getState().rehydrate();
    useSettings.setState({ srsMaxIvl: 15 });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("只排入一个完整事务，不额外镜像卡片、事件和计数", async () => {
    completeWord(1,newCard(),true);
    const keys = Array.from(storage.keys()).filter((key) => key.includes("sync.pending"));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain("completions.v1.u1:");
    expect(useMeta.getState().meta).toMatchObject({ newToday: 1, doneToday: 1 });
    await flushPending();
    expect(apiMocks.postStudyCompletions).toHaveBeenCalledOnce();
    expect(apiMocks.postStudyCompletions).toHaveBeenCalledWith([expect.objectContaining({ word_idx:1, event_type:"new" })]);
  });

  it("命令持久化失败时不更新本地学习结果", () => {
    const original = localStorage.setItem;
    vi.spyOn(localStorage,"setItem").mockImplementation((key,value) => {
      if (key.includes("completions")) throw new Error("quota");
      original(key,value);
    });
    expect(() => completeWord(1,newCard(),true)).toThrow(/保存失败/);
    expect(useCards.getState().cards).toEqual({});
    expect(useTodayLog.getState().log.items).toEqual([]);
    expect(useMeta.getState().meta.doneToday).toBe(0);
  });

  it("长会话中使用最新卡片，避免拿初始快照回退调度", () => {
    useCards.setState({ cards: { 1: { ...newCard(), learned:true, state:"review", ivl:8, reps:3 } } });
    expect(completeWord(1,newCard(),true)).toMatchObject({ ivl:15, reps:4 });
    expect(useMeta.getState().meta.reviewToday).toBe(1);
  });

  it("失败的学习事务不能经旧卡片同步或词表回放提前入账", async () => {
    completeWord(1,newCard(),true);
    apiMocks.getCards.mockResolvedValue({ cards:{} });
    await useCards.getState().sync();
    expect(apiMocks.bulkCards).not.toHaveBeenCalled();
    await useTodayLog.getState().syncFromServer({ skipFlush:true });
    expect(apiMocks.getToday).not.toHaveBeenCalled();
  });
});
