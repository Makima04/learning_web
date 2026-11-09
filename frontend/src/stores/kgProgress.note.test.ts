import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  getKg: vi.fn(),
  putKg: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { flushPending, getSyncStatus } from "@/lib/syncQueue";
import { useKgProgress } from "@/stores/kgProgress";
import { cs408CheckId } from "@/lib/kg/cs408Diagnostic";

describe("kgProgress itemNotes", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.isLoggedIn.mockReturnValue(false);
    apiMocks.putKg.mockClear();
    useKgProgress.setState({
      states: {},
      itemMarks: [],
      itemNotes: {},
      papers: [],
      updatedAt: 0,
    });
  });

  it("saves and clears a note without changing marks", () => {
    useKgProgress.getState().saveItemNote("q1", "  卡在递推  ");
    expect(useKgProgress.getState().itemNotes.q1).toBe("卡在递推");
    expect(useKgProgress.getState().itemMarks).toEqual([]);

    useKgProgress.getState().markItem({
      itemId: "q1",
      mark: "fail",
      primaryKpId: "ds.linear.seq",
    });
    expect(useKgProgress.getState().itemNotes.q1).toBe("卡在递推");
    expect(useKgProgress.getState().itemMarks[0]?.mark).toBe("fail");

    useKgProgress.getState().saveItemNote("q1", "   ");
    expect(useKgProgress.getState().itemNotes.q1).toBeUndefined();
    expect(useKgProgress.getState().itemMarks[0]?.mark).toBe("fail");
  });

  it("enqueues kg via syncQueue when logged in instead of fire-and-forget putKg", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    useKgProgress.getState().saveItemNote("q1", "queue me");
    expect(apiMocks.putKg).not.toHaveBeenCalled();
    expect(getSyncStatus().pending).toBe(true);
    await flushPending();
    expect(apiMocks.putKg).toHaveBeenCalledWith(
      expect.objectContaining({
        itemNotes: { q1: "queue me" },
      })
    );
    expect(getSyncStatus().pending).toBe(false);
  });

  it("技巧复测证据随学习记录入队，并能在另一设备从服务端恢复", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1794096000000);
    apiMocks.isLoggedIn.mockReturnValue(true);
    const input = { itemId: "q-technique", primaryKpId: "calc.m.ext", mark: "pass" as const };
    useKgProgress.getState().markItem(input);
    const first = useKgProgress.getState().itemMarks[0];
    clock.mockReturnValue(1794355200000);
    useKgProgress.getState().markItem(input);
    const latest = useKgProgress.getState().itemMarks[0];
    expect(latest.passStartedAt).toBe(first.ts);
    expect(latest.passTimes).toEqual([first.ts, latest.ts]);
    await flushPending();
    const remote = apiMocks.putKg.mock.calls.at(-1)![0];
    expect(remote.itemMarks).toEqual([latest]);

    // 模拟第二台设备没有本地学习缓存，采用服务端权威快照。
    localStorage.clear();
    useKgProgress.setState({ itemMarks: [], states: {}, updatedAt: 0 });
    apiMocks.getKg.mockResolvedValue({ kg: remote, updated_at: remote.updatedAt });
    await useKgProgress.getState().syncFromServer();
    expect(useKgProgress.getState().itemMarks).toEqual([latest]);
    useKgProgress.setState({ itemMarks: [] });
    useKgProgress.getState().load();
    expect(useKgProgress.getState().itemMarks).toEqual([latest]);
  });

  it("408闭卷检验不抬高图谱掌握度，结果及复测日期经队列同步到另一设备", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1794182400000);
    apiMocks.isLoggedIn.mockReturnValue(true);
    useKgProgress.getState().recordKnowledgeCheck("os.file.alloc", "application", "pass");
    const first = useKgProgress.getState().itemMarks[0];
    expect(first.itemId).toBe(cs408CheckId("os.file.alloc", "application"));
    expect(useKgProgress.getState().states).toEqual({});
    clock.mockReturnValue(first.ts + 3 * 86400000);
    useKgProgress.getState().recordKnowledgeCheck("os.file.alloc", "application", "pass");
    await flushPending();
    const remote = apiMocks.putKg.mock.calls.at(-1)![0];
    expect(remote.itemMarks[0].passStartedAt).toBe(first.ts);
    expect(remote.itemMarks[0].passTimes).toHaveLength(2);
    localStorage.clear();
    useKgProgress.setState({ itemMarks: [], states: {}, updatedAt: 0 });
    apiMocks.getKg.mockResolvedValue({ kg: remote, updated_at: remote.updatedAt });
    await useKgProgress.getState().syncFromServer();
    expect(useKgProgress.getState().itemMarks).toEqual(remote.itemMarks);
    expect(useKgProgress.getState().states).toEqual({});
  });
});
