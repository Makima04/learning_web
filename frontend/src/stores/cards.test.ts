import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "@/lib/srs";

const apiMocks = vi.hoisted(() => ({
  bulkCards: vi.fn(),
  getCards: vi.fn(),
  deleteAllCards: vi.fn(),
  isLoggedIn: vi.fn(() => true),
  putCard: vi.fn(),
}));

vi.mock("@/lib/api", () => apiMocks);

import { useCards } from "@/stores/cards";

function card(updatedAt: number, learned = true): Card {
  return {
    learned,
    state: learned ? "review" : "new",
    due: updatedAt + 1_000,
    ivl: learned ? 2 : 0,
    ease: 2.5,
    reps: learned ? 2 : 0,
    lapses: 0,
    quiz: 0,
    updatedAt,
  };
}

describe("cards sync", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.bulkCards.mockReset().mockResolvedValue({ ok: true });
    apiMocks.getCards.mockReset();
    apiMocks.deleteAllCards.mockReset().mockResolvedValue({ ok: true, deleted: 0 });
    apiMocks.putCard.mockReset().mockResolvedValue({ ok: true });
    useCards.setState({ cards: {} });
  });

  it("clearAll deletes remote cards when logged in", async () => {
    useCards.setState({ cards: { 1: card(100) } });
    await useCards.getState().clearAll();
    expect(useCards.getState().cards).toEqual({});
    expect(apiMocks.deleteAllCards).toHaveBeenCalledOnce();
  });

  it("clearAll skips remote delete when logged out", async () => {
    apiMocks.isLoggedIn.mockReturnValue(false);
    useCards.setState({ cards: { 1: card(100) } });
    await useCards.getState().clearAll();
    expect(useCards.getState().cards).toEqual({});
    expect(apiMocks.deleteAllCards).not.toHaveBeenCalled();
    apiMocks.isLoggedIn.mockReturnValue(true);
  });

  it("uses newer remote cards while preserving local-only cards", async () => {
    useCards.setState({ cards: { 1: card(100), 2: card(200) } });
    apiMocks.getCards.mockResolvedValue({
      cards: {
        "1": { ...card(300), updated_at: 300 },
        "3": { ...card(250), updated_at: 250 },
      },
    });

    await useCards.getState().sync();

    expect(useCards.getState().cards).toMatchObject({
      1: { updatedAt: 300 },
      2: { updatedAt: 200 },
      3: { updatedAt: 250 },
    });
    expect(apiMocks.bulkCards).toHaveBeenCalledOnce();
    expect(apiMocks.bulkCards).toHaveBeenCalledWith({
      "2": expect.objectContaining({ updated_at: 200 }),
    });
  });

  it("pushes a newer local card instead of replacing it", async () => {
    useCards.setState({ cards: { 7: card(700) } });
    apiMocks.getCards.mockResolvedValue({
      cards: { "7": { ...card(600), updated_at: 600 } },
    });

    await useCards.getState().sync();

    expect(useCards.getState().cards[7]).toMatchObject({ updatedAt: 700 });
    expect(apiMocks.bulkCards).toHaveBeenCalledWith({
      "7": expect.objectContaining({ updated_at: 700 }),
    });
  });
});
