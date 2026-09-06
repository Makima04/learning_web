import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  getKg: vi.fn(),
  putKg: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

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
});
