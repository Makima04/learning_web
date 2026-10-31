import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  flushPending: vi.fn(),
  pulls: {
    cards: vi.fn(),
    meta: vi.fn(),
    settings: vi.fn(),
    journal: vi.fn(),
    kg: vi.fn(),
    politics: vi.fn(),
    todayLog: vi.fn(),
    wordLists: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ isLoggedIn: () => true }));
vi.mock("@/lib/syncQueue", () => ({ flushPending: mocks.flushPending }));
vi.mock("@/stores/cards", () => ({ useCards: { getState: () => ({ sync: mocks.pulls.cards }) } }));
vi.mock("@/stores/meta", () => ({ useMeta: { getState: () => ({ syncMeta: mocks.pulls.meta }) } }));
vi.mock("@/stores/settings", () => ({ useSettings: { getState: () => ({ syncFromServer: mocks.pulls.settings }) } }));
vi.mock("@/stores/journal", () => ({ useJournal: { getState: () => ({ syncFromServer: mocks.pulls.journal }) } }));
vi.mock("@/stores/kgProgress", () => ({ useKgProgress: { getState: () => ({ syncFromServer: mocks.pulls.kg }) } }));
vi.mock("@/stores/politics", () => ({ usePolitics: { getState: () => ({ syncFromServer: mocks.pulls.politics }) } }));
vi.mock("@/stores/todayLog", () => ({ useTodayLog: { getState: () => ({ syncFromServer: mocks.pulls.todayLog }) } }));
vi.mock("@/stores/wordLists", () => ({ useWordLists: { getState: () => ({ syncFromServer: mocks.pulls.wordLists }) } }));

import { syncAccountData } from "@/lib/accountSync";
import { setScopeUserId } from "@/lib/storageScope";

describe("syncAccountData account isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flushPending.mockReset().mockResolvedValue(undefined);
    setScopeUserId(1);
  });

  it("shares concurrent syncs within the same account", async () => {
    const first = syncAccountData();
    const second = syncAccountData();
    await Promise.all([first, second]);

    expect(second).toBe(first);
    for (const pull of Object.values(mocks.pulls)) expect(pull).toHaveBeenCalledTimes(1);
  });

  it("keeps local projections while a pending transaction failed to upload", async () => {
    mocks.flushPending.mockResolvedValue({ pending:true, lastError:"offline" });
    await syncAccountData();
    for (const pull of Object.values(mocks.pulls)) expect(pull).not.toHaveBeenCalled();
  });

  it("syncs the new account independently and keeps its lock when the old sync finishes", async () => {
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    mocks.flushPending
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseOld = resolve; }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseNew = resolve; }));
    const oldSync = syncAccountData();
    setScopeUserId(2);
    const newSync = syncAccountData();
    const separate = newSync !== oldSync;
    releaseOld();
    await oldSync;
    const joined = syncAccountData();
    releaseNew?.();
    await Promise.all([newSync, joined]);

    expect(separate).toBe(true);
    expect(joined).toBe(newSync);
    for (const pull of Object.values(mocks.pulls)) expect(pull).toHaveBeenCalledTimes(1);
  });
});
