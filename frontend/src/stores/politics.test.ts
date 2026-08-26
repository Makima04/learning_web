import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  getPolitics: vi.fn(),
  putPolitics: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { usePolitics } from "./politics";

describe("politics store", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.isLoggedIn.mockReturnValue(false);
    apiMocks.putPolitics.mockClear();
    usePolitics.setState({
      drafts: {},
      attempts: [],
      lastQuestionId: null,
      updatedAt: 0,
    });
  });

  it("saves draft locally and records last question", () => {
    usePolitics.getState().saveDraft("2024-34", "1", "实践决定认识");
    const s = usePolitics.getState();
    expect(s.drafts["2024-34"]?.answers["1"]).toBe("实践决定认识");
    expect(s.lastQuestionId).toBe("2024-34");
    expect(s.updatedAt).toBeGreaterThan(0);
  });

  it("submitQuestion scores by checked points and keeps one attempt per question", () => {
    const ans = {
      "1": "实践决定认识。要从感性认识上升到理性认识，去粗取精。材料中只调查不研究得不出科学观点。",
      "2": "矛盾普遍性与特殊性。从个别到一般，解剖麻雀，举一反三解决一类问题。",
    };
    const a1 = usePolitics.getState().submitQuestion("2024-34", ans, {});
    expect(a1).toBeTruthy();
    expect(a1!.score).toBeGreaterThan(0);
    expect(a1!.maxScore).toBe(10);

    usePolitics.getState().submitQuestion("2024-34", ans, { "1": [], "2": [] });
    expect(usePolitics.getState().attempts.filter((x) => x.questionId === "2024-34")).toHaveLength(1);
    expect(usePolitics.getState().attempts[0]!.score).toBe(0);
  });

  it("unknown question returns null", () => {
    expect(usePolitics.getState().submitQuestion("nope", {}, {})).toBeNull();
  });
});
