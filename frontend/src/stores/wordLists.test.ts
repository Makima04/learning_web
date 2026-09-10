import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  getWordLists: vi.fn(),
  bulkWordLists: vi.fn(),
  deleteWordLists: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import { setScopeUserId } from "@/lib/storageScope";
import { useWordLists } from "@/stores/wordLists";

describe("wordLists store", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    setScopeUserId(null);
    apiMocks.isLoggedIn.mockReturnValue(false);
    useWordLists.setState({ entries: {}, resetAt: 0 });
  });

  it("toggles 生词/熟词 and keeps them exclusive", () => {
    useWordLists.getState().setKind(12, "new");
    expect(useWordLists.getState().kindOf(12)).toBe("new");
    expect(useWordLists.getState().idxsOf("new")).toEqual([12]);

    useWordLists.getState().setKind(12, "known");
    expect(useWordLists.getState().kindOf(12)).toBe("known");
    expect(useWordLists.getState().idxsOf("new")).toEqual([]);
    expect(useWordLists.getState().idxsOf("known")).toEqual([12]);

    useWordLists.getState().setKind(12, "known");
    expect(useWordLists.getState().kindOf(12)).toBeNull();
  });

  it("sets() splits known vs newbie", () => {
    useWordLists.getState().setKind(1, "new");
    useWordLists.getState().setKind(2, "known");
    useWordLists.getState().setKind(3, "none");
    const { known, newbie } = useWordLists.getState().sets();
    expect([...newbie]).toEqual([1]);
    expect([...known]).toEqual([2]);
  });
});
