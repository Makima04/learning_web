import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => true),
  postStudyEvent: vi.fn().mockResolvedValue({ ok: true }),
  postStudyEventsBulk: vi.fn().mockResolvedValue({ ok: true }),
  bulkCards: vi.fn().mockResolvedValue({ ok: true }),
  putMeta: vi.fn().mockResolvedValue({ ok: true }),
  putSettings: vi.fn().mockResolvedValue({ ok: true }),
  putKg: vi.fn().mockResolvedValue({ ok: true }),
  putPolitics: vi.fn().mockResolvedValue({ ok: true }),
  bulkJournal: vi.fn().mockResolvedValue({ ok: true }),
  bulkWordLists: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { dayKey } from "@/lib/day";
import { setScopeUserId } from "@/lib/storageScope";
import {
  discardPendingKgIfNotNewer,
  discardPendingPoliticsIfNotNewer,
  enqueueCard,
  enqueueJournalRows,
  enqueueKg,
  enqueueMeta,
  enqueuePolitics,
  enqueueStudyEvent,
  enqueueWordListItem,
  flushPending,
  getSyncStatus,
  recomputePendingFromStorage,
} from "@/lib/syncQueue";

describe("syncQueue flushPending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setScopeUserId(null);
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return storage.size; },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.postStudyEvent.mockReset().mockResolvedValue({ ok: true });
    apiMocks.postStudyEventsBulk.mockReset().mockResolvedValue({ ok: true });
    apiMocks.bulkCards.mockReset().mockResolvedValue({ ok: true });
    apiMocks.putMeta.mockReset().mockResolvedValue({ ok: true });
    apiMocks.putSettings.mockReset().mockResolvedValue({ ok: true });
    apiMocks.putKg.mockReset().mockResolvedValue({ ok: true });
    apiMocks.putPolitics.mockReset().mockResolvedValue({ ok: true });
    apiMocks.bulkJournal.mockReset().mockResolvedValue({ ok: true });
    apiMocks.bulkWordLists.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([false, true])("stops old-account requests after a scope change (failure=%s)", async (fails) => {
    setScopeUserId(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    apiMocks.bulkCards.mockImplementationOnce(async () => {
      await gate;
      if (fails) throw new Error("offline");
      return { ok: true };
    });
    enqueueCard(1, { state: "review", due: 1, ivl: 1, ease: 2.5, reps: 1, lapses: 0 });
    enqueueMeta({ day_key: dayKey(), new_today: 1 });
    const flushing = flushPending();
    setScopeUserId(2);
    recomputePendingFromStorage();
    release();
    await flushing;

    expect(apiMocks.putMeta).not.toHaveBeenCalled();
    expect(localStorage.getItem("ew.sync.pending.meta.v1.u1")).not.toBeNull();
    expect(getSyncStatus().pending).toBe(false);
  });

  it("starts a separate flush for the new account while the old request is pending", async () => {
    setScopeUserId(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    apiMocks.putKg.mockImplementationOnce(async () => { await gate; return { ok: true }; });
    enqueueKg({ updatedAt: 1 });
    const oldFlush = flushPending();
    setScopeUserId(2);
    recomputePendingFromStorage();
    enqueueMeta({ day_key: dayKey(), new_today: 2 });
    const newFlush = flushPending();
    const shared = newFlush === oldFlush;
    release();
    await Promise.all([oldFlush, newFlush]);

    expect(shared).toBe(false);
    expect(apiMocks.putMeta).toHaveBeenCalledWith({ day_key: dayKey(), new_today: 2 });
    expect(getSyncStatus().pending).toBe(false);
  });

  it("stops between bulk chunks when the account changes", async () => {
    setScopeUserId(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    apiMocks.bulkJournal.mockImplementationOnce(async () => { await gate; return { ok: true }; });
    enqueueJournalRows({
      weeklies: Array.from({ length: 2001 }, (_, i) => ({ week_key: `w-${i}`, note: "n", updated_at: 1 })),
    });
    const flushing = flushPending();
    setScopeUserId(2);
    recomputePendingFromStorage();
    release();
    await flushing;

    expect(apiMocks.bulkJournal).toHaveBeenCalledTimes(1);
    const pending = JSON.parse(localStorage.getItem("ew.sync.pending.journal.v1.u1") || "{}");
    expect(pending.weeklies["w-2000"]).toBeDefined();
  });

  it("keeps a word-list edit made at the same millisecond during upload", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    apiMocks.bulkWordLists.mockImplementationOnce(async () => { await gate; return { ok: true }; });
    enqueueWordListItem(1, { kind: "new", updated_at: 10 });
    const flushing = flushPending();
    enqueueWordListItem(1, { kind: "known", updated_at: 10 });
    release();
    await flushing;

    expect(apiMocks.bulkWordLists).toHaveBeenLastCalledWith({ "1": { kind: "known", updated_at: 10 } });
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps a card edit with the same timestamp during upload", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    apiMocks.bulkCards.mockImplementationOnce(async () => { await gate; return { ok: true }; });
    const card = { state: "review", due: 1, ivl: 1, ease: 2.5, reps: 1, lapses: 0, updated_at: 10 };
    enqueueCard(1, card);
    const flushing = flushPending();
    enqueueCard(1, { ...card, reps: 2 });
    release();
    await flushing;

    expect(apiMocks.bulkCards).toHaveBeenLastCalledWith({ "1": { ...card, reps: 2 } });
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps a quality change with the same timestamp during event upload", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    apiMocks.postStudyEventsBulk.mockImplementationOnce(async () => { await gate; return { ok: true }; });
    const event = { word_idx: 1, event_type: "review" as const, quality: "good" as const, day_key: dayKey(), client_at: 10 };
    enqueueStudyEvent(event);
    const flushing = flushPending();
    enqueueStudyEvent({ ...event, quality: "hard" });
    release();
    await flushing;

    expect(apiMocks.postStudyEventsBulk).toHaveBeenLastCalledWith([{ ...event, quality: "hard" }]);
    expect(getSyncStatus().pending).toBe(false);
  });

  it.each(["entries", "logs", "categories", "weeklies"] as const)(
    "keeps same-timestamp journal changes during upload (%s)", async (kind) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      apiMocks.bulkJournal.mockImplementationOnce(async () => { await gate; return { ok: true }; });
      const before = kind === "weeklies"
        ? { week_key: "w-1", note: "before", updated_at: 10 }
        : { id: "row-1", entry_id: "entry-1", deleted: false, updated_at: 10 };
      const after = kind === "weeklies"
        ? { ...before, note: "after" }
        : { ...before, deleted: true };
      enqueueJournalRows({ [kind]: [before] });
      const flushing = flushPending();
      enqueueJournalRows({ [kind]: [after] });
      release();
      await flushing;

      expect(apiMocks.bulkJournal).toHaveBeenCalledTimes(2);
      expect(apiMocks.bulkJournal).toHaveBeenLastCalledWith(expect.objectContaining({
        [kind]: [expect.objectContaining(kind === "weeklies" ? { note: "after" } : { deleted: true })],
      }));
      expect(getSyncStatus().pending).toBe(false);
    }
  );

  it("single-flights concurrent flushPending calls", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    apiMocks.postStudyEventsBulk.mockImplementation(async () => {
      await gate;
      return { ok: true };
    });

    enqueueStudyEvent({
      word_idx: 1,
      event_type: "new",
      quality: "good",
      day_key: dayKey(),
      client_at: 1,
    });

    const a = flushPending();
    const b = flushPending();
    release();
    await Promise.all([a, b]);
    expect(apiMocks.postStudyEventsBulk).toHaveBeenCalledTimes(1);
  });

  it("does not drop events enqueued during an in-flight flush", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    apiMocks.postStudyEventsBulk.mockImplementationOnce(async () => {
      await firstGate;
      return { ok: true };
    });

    enqueueStudyEvent({
      word_idx: 1,
      event_type: "new",
      quality: "good",
      day_key: dayKey(),
      client_at: 1,
    });

    const flushing = flushPending();
    enqueueStudyEvent({
      word_idx: 2,
      event_type: "review",
      quality: "good",
      day_key: dayKey(),
      client_at: 2,
    });
    releaseFirst();
    await flushing;

    expect(apiMocks.postStudyEventsBulk).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ word_idx: 1 })])
    );
    expect(apiMocks.postStudyEventsBulk).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ word_idx: 2 })])
    );
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps new when later review overwrites the same pending key", async () => {
    const day = dayKey();
    enqueueStudyEvent({
      word_idx: 8,
      event_type: "new",
      quality: "good",
      day_key: day,
      client_at: 10,
    });
    enqueueStudyEvent({
      word_idx: 8,
      event_type: "review",
      quality: "good",
      day_key: day,
      client_at: 20,
    });
    await flushPending();
    expect(apiMocks.postStudyEventsBulk).toHaveBeenCalledTimes(1);
    expect(apiMocks.postStudyEventsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ word_idx: 8, event_type: "new", client_at: 20 }),
    ]);
  });

  it("returns lastError when bulkCards fails instead of pretending success", async () => {
    apiMocks.bulkCards.mockRejectedValueOnce(new Error("boom"));
    enqueueCard(1, {
      learned: true,
      state: "review",
      due: 1,
      ivl: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      quiz: 0,
      updated_at: 1,
    });
    const st = await flushPending();
    expect(st.lastError).toMatch(/boom/);
    expect(st.pending).toBe(true);
  });

  it("flushes pending word-list items in bulk", async () => {
    enqueueWordListItem(12, { kind: "new", updated_at: 1 });
    enqueueWordListItem(12, { kind: "known", updated_at: 2 });
    await flushPending();
    expect(apiMocks.bulkWordLists).toHaveBeenCalledTimes(1);
    expect(apiMocks.bulkWordLists).toHaveBeenCalledWith({
      "12": { kind: "known", updated_at: 2 },
    });
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps the newer journal row and posts a tombstone in bulk", async () => {
    enqueueJournalRows({
      entries: [{ id: "manual-1", updated_at: 1, deleted: false, entry: { id: "manual-1" } as never }],
    });
    enqueueJournalRows({
      entries: [{ id: "manual-1", updated_at: 2, deleted: true }],
    });
    enqueueJournalRows({
      entries: [{ id: "manual-1", updated_at: 1, deleted: false, entry: { id: "manual-1" } as never }],
    });
    await flushPending();
    expect(apiMocks.bulkJournal).toHaveBeenCalledTimes(1);
    expect(apiMocks.bulkJournal).toHaveBeenCalledWith({
      entries: [{ id: "manual-1", updated_at: 2, deleted: true }],
      logs: [],
      categories: [],
      weeklies: [],
    });
    expect(getSyncStatus().pending).toBe(false);
  });

  it("chunks journal bulk posts so each request stays within 2000 rows", async () => {
    enqueueJournalRows({
      weeklies: Array.from({ length: 2001 }, (_, i) => ({
        week_key: `w-${i}`,
        note: "n",
        updated_at: i + 1,
      })),
    });
    await flushPending();
    expect(apiMocks.bulkJournal).toHaveBeenCalledTimes(2);
    const sizes = apiMocks.bulkJournal.mock.calls.map((call) => {
      const body = call[0] as {
        entries: unknown[];
        logs: unknown[];
        categories: unknown[];
        weeklies: unknown[];
      };
      return body.entries.length + body.logs.length + body.categories.length + body.weeklies.length;
    });
    expect(sizes).toEqual([2000, 1]);
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps journal rows for retry when bulk fails", async () => {
    apiMocks.bulkJournal.mockRejectedValueOnce(new Error("nope"));
    enqueueJournalRows({
      entries: [{ id: "manual-1", updated_at: 3, deleted: true }],
    });
    const failed = await flushPending();
    expect(failed.lastError).toMatch(/nope/);
    expect(failed.pending).toBe(true);
    apiMocks.bulkJournal.mockResolvedValue({ ok: true });
    const ok = await flushPending();
    expect(ok.pending).toBe(false);
    expect(apiMocks.bulkJournal).toHaveBeenLastCalledWith({
      entries: [{ id: "manual-1", updated_at: 3, deleted: true }],
      logs: [],
      categories: [],
      weeklies: [],
    });
  });

  it("flushes pending kg whole-doc and keeps newer mid-flight version", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    apiMocks.putKg.mockImplementationOnce(async () => {
      await gate;
      return { ok: true };
    });

    const v1 = { states: {}, itemMarks: [], itemNotes: {}, papers: [], updatedAt: 1 };
    const v2 = { ...v1, updatedAt: 2, itemNotes: { q1: "n" } };
    enqueueKg(v1);
    const flushing = flushPending();
    enqueueKg(v2);
    release();
    await flushing;

    expect(apiMocks.putKg).toHaveBeenCalledWith(v1);
    // mid-flight 更新后二次 flush 刷出 v2
    expect(apiMocks.putKg).toHaveBeenCalledWith(v2);
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps kg pending for retry when putKg fails", async () => {
    apiMocks.putKg.mockRejectedValueOnce(new Error("kg-down"));
    enqueueKg({ states: {}, itemMarks: [], itemNotes: {}, papers: [], updatedAt: 9 });
    const failed = await flushPending();
    expect(failed.lastError).toMatch(/kg-down/);
    expect(failed.pending).toBe(true);
    apiMocks.putKg.mockResolvedValue({ ok: true });
    const ok = await flushPending();
    expect(ok.pending).toBe(false);
    expect(apiMocks.putKg).toHaveBeenLastCalledWith(
      expect.objectContaining({ updatedAt: 9 })
    );
  });

  it("flushes pending politics whole-doc", async () => {
    const doc = {
      drafts: {},
      attempts: [],
      lastQuestionId: null,
      xiaoMarks: {},
      lastXiaoKpId: null,
      updatedAt: 5,
    };
    enqueuePolitics(doc);
    await flushPending();
    expect(apiMocks.putPolitics).toHaveBeenCalledTimes(1);
    expect(apiMocks.putPolitics).toHaveBeenCalledWith(doc);
    expect(getSyncStatus().pending).toBe(false);
  });

  it("discards stale kg/politics pending when server is newer", () => {
    enqueueKg({ states: {}, itemMarks: [], itemNotes: {}, papers: [], updatedAt: 10 });
    enqueuePolitics({
      drafts: {},
      attempts: [],
      lastQuestionId: null,
      xiaoMarks: {},
      lastXiaoKpId: null,
      updatedAt: 10,
    });
    expect(getSyncStatus().pending).toBe(true);
    discardPendingKgIfNotNewer(20);
    discardPendingPoliticsIfNotNewer(20);
    expect(getSyncStatus().pending).toBe(false);
  });

  it("keeps kg pending when local pending is newer than server", () => {
    enqueueKg({ states: {}, itemMarks: [], itemNotes: {}, papers: [], updatedAt: 30 });
    discardPendingKgIfNotNewer(20);
    expect(getSyncStatus().pending).toBe(true);
  });
});
