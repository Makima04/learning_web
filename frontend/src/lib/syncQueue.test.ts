import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => true),
  postStudyEvent: vi.fn().mockResolvedValue({ ok: true }),
  bulkCards: vi.fn().mockResolvedValue({ ok: true }),
  putMeta: vi.fn().mockResolvedValue({ ok: true }),
  putSettings: vi.fn().mockResolvedValue({ ok: true }),
  putJournal: vi.fn().mockResolvedValue({ ok: true, skipped: false, updated_at: 1 }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { dayKey } from "@/lib/day";
import {
  enqueueCard,
  enqueueStudyEvent,
  flushPending,
  getSyncStatus,
} from "@/lib/syncQueue";

describe("syncQueue flushPending", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.postStudyEvent.mockReset().mockResolvedValue({ ok: true });
    apiMocks.bulkCards.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("single-flights concurrent flushPending calls", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    apiMocks.postStudyEvent.mockImplementation(async () => {
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
    expect(apiMocks.postStudyEvent).toHaveBeenCalledTimes(1);
  });

  it("does not drop events enqueued during an in-flight flush", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    apiMocks.postStudyEvent.mockImplementationOnce(async () => {
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

    expect(apiMocks.postStudyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ word_idx: 1 })
    );
    expect(apiMocks.postStudyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ word_idx: 2 })
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
    expect(apiMocks.postStudyEvent).toHaveBeenCalledTimes(1);
    expect(apiMocks.postStudyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ word_idx: 8, event_type: "new", client_at: 20 })
    );
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
});
