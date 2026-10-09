import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  getKg: vi.fn(),
  putKg: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { flushPending, getSyncStatus } from "@/lib/syncQueue";
import { useKgProgress } from "@/stores/kgProgress";

describe("kgProgress itemNotes", () => {
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
});
