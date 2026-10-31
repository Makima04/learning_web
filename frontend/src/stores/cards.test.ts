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

import { setScopeUserId } from "@/lib/storageScope";
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
      get length() { return storage.size; },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.bulkCards.mockReset().mockResolvedValue({ ok: true });
    apiMocks.getCards.mockReset();
    apiMocks.deleteAllCards.mockReset().mockResolvedValue({ ok: true, deleted: 0 });
    apiMocks.putCard.mockReset().mockResolvedValue({ ok: true });
    setScopeUserId(null);
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

  it("does not apply remote cards after account scope switches", async () => {
    setScopeUserId(1);
    useCards.setState({ cards: { 1: card(100) } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    apiMocks.getCards.mockImplementation(async () => {
      await gate;
      return {
        cards: {
          "9": { ...card(500), updated_at: 500 },
        },
      };
    });

    const pending = useCards.getState().sync();
    setScopeUserId(null);
    release();
    await pending;

    expect(useCards.getState().cards[9]).toBeUndefined();
    expect(useCards.getState().cards[1]).toMatchObject({ updatedAt: 100 });
    expect(apiMocks.bulkCards).not.toHaveBeenCalled();
  });

  it("partial empty delta does not treat remote as empty", async () => {
    setScopeUserId(1);
    useCards.setState({ cards: { 1: card(100) } });
    localStorage.setItem(
      "ew.cards.syncCursor.v1.u1",
      JSON.stringify({ since: 100, resetAt: 0 })
    );
    apiMocks.getCards.mockResolvedValue({ cards: {}, partial: true });

    await useCards.getState().sync();

    expect(useCards.getState().cards[1]).toMatchObject({ updatedAt: 100 });
    expect(apiMocks.bulkCards).not.toHaveBeenCalled();
    expect(apiMocks.getCards).toHaveBeenCalledWith(100);
  });

  it("partial delta merges remote and pushes only dirty local cards", async () => {
    setScopeUserId(1);
    useCards.setState({ cards: { 1: card(100), 2: card(400) } });
    localStorage.setItem(
      "ew.cards.syncCursor.v1.u1",
      JSON.stringify({ since: 100, resetAt: 0 })
    );
    apiMocks.getCards.mockResolvedValue({
      cards: {
        "1": { ...card(300), updated_at: 300 },
      },
      partial: true,
    });

    await useCards.getState().sync();

    expect(useCards.getState().cards[1]).toMatchObject({ updatedAt: 300 });
    expect(useCards.getState().cards[2]).toMatchObject({ updatedAt: 400 });
    expect(apiMocks.bulkCards).toHaveBeenCalledWith({
      "2": expect.objectContaining({ updated_at: 400 }),
    });
  });

  it("aligns cached legacy review cards to midnight without changing their revision or minute steps", () => {
    const updatedAt = Date.parse("2026-10-31T20:00:00+08:00");
    const oldCard = { ...card(updatedAt), due: Date.parse("2026-11-01T20:00:00+08:00") };
    const minuteCard = { ...oldCard, state: "learn" as const, quiz: 1, due: Date.parse("2026-11-01T00:05:00+08:00") };
    localStorage.setItem("ew.cards.v1", JSON.stringify({ 1: oldCard, 2: minuteCard }));
    useCards.getState().rehydrate();

    expect(useCards.getState().cards[1]).toEqual({ ...oldCard, due: Date.parse("2026-11-01T00:00:00+08:00") });
    expect(useCards.getState().cards[2]).toEqual(minuteCard);
  });

  it("aligns legacy cards received from the server while preserving server revisions", async () => {
    const updatedAt = Date.parse("2026-10-31T20:00:00+08:00");
    apiMocks.getCards.mockResolvedValue({
      cards: { "1": { ...card(updatedAt), due: Date.parse("2026-11-01T20:00:00+08:00"), updated_at: updatedAt } },
    });
    await useCards.getState().sync();

    expect(useCards.getState().cards[1]).toMatchObject({ updatedAt, due: Date.parse("2026-11-01T00:00:00+08:00") });
    expect(apiMocks.bulkCards).not.toHaveBeenCalled();
  });

  it("aligns imported legacy cards before they enter the sync queue", () => {
    const updatedAt = Date.parse("2026-10-31T20:00:00+08:00");
    const oldCard = { ...card(updatedAt), due: Date.parse("2026-11-01T20:00:00+08:00") };
    useCards.getState().replaceAll({ 1: oldCard });

    expect(useCards.getState().cards[1]).toEqual({ ...oldCard, due: Date.parse("2026-11-01T00:00:00+08:00") });
    const pending = JSON.parse(localStorage.getItem("ew.sync.pending.cards.v1") || "{}");
    expect(pending["1"]).toMatchObject({ updated_at: updatedAt, due: Date.parse("2026-11-01T00:00:00+08:00") });
  });
});
