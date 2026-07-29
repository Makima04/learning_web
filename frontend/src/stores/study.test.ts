import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  postStudyEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { DAY, newCard } from "@/lib/srs";
import { setScopeUserId } from "@/lib/storageScope";
import { useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import type { QueueItem } from "@/stores/study";

function startRelearning(round: 1 | 2 | 3) {
  const item: QueueItem = {
    idx: 42,
    card: newCard(),
    group: "new",
    round,
    needsRelearning: true,
  };
  useStudy.setState({
    mode: "learn",
    queue: [item],
    qpos: 0,
    groupStart: 0,
    groupInitialEnd: 0,
    groupEnd: 1,
    relearningStarted: true,
    relearnRoundEnd: 1,
    relearnPending: [],
    relearnReveal: null,
    relearnAnswerKnown: null,
    uiPhase: round === 1 ? "relearn-example" : round === 2 ? "relearn-word" : "relearn-meaning",
    assessChoice: null,
    sessionStats: { studied: 0, newDone: 0, reviewDone: 0 },
  });
}

describe("relearning confirmation", () => {
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
    apiMocks.postStudyEvent.mockClear();
    useCards.setState({ cards: {} });
    useMeta.setState({
      meta: {
        dayKey: "2026-07-13",
        newToday: 0,
        reviewToday: 0,
        learnToday: 0,
        doneToday: 0,
        created: 0,
      },
    });
    useSettings.setState({ dailyNew: 20, dailyReview: 100 });
  });

  it("keeps a known answer provisional and allows correcting it", () => {
    startRelearning(1);

    useStudy.getState().answerRelearning(true);
    expect(useStudy.getState()).toMatchObject({
      uiPhase: "relearn-reveal",
      relearnAnswerKnown: true,
      qpos: 0,
    });
    expect(useStudy.getState().queue[0].round).toBe(1);

    useStudy.getState().confirmRelearning(false);
    expect(useStudy.getState()).toMatchObject({
      uiPhase: "relearn-example",
      relearnReveal: null,
      relearnAnswerKnown: null,
    });
    expect(useStudy.getState().queue[0].round).toBe(1);

    useStudy.getState().answerRelearning(true);
    useStudy.getState().confirmRelearning(true);
    expect(useStudy.getState()).toMatchObject({ uiPhase: "relearn-word" });
    expect(useStudy.getState().queue[0].round).toBe(2);
  });

  it("does not pass the third round until the user continues", () => {
    startRelearning(3);

    useStudy.getState().answerRelearning(true);
    expect(useCards.getState().cards[42]).toBeUndefined();
    expect(useStudy.getState().sessionStats.studied).toBe(0);

    useStudy.getState().confirmRelearning(true);
    const saved = useCards.getState().cards[42];
    expect(saved).toMatchObject({ learned: true, state: "review", ivl: 1, reps: 1 });
    expect(saved.due).toBeGreaterThan(Date.now());
    expect(saved.due).toBeLessThanOrEqual(Date.now() + DAY + 1000);
    expect(useStudy.getState().sessionStats).toMatchObject({ studied: 1, newDone: 1 });
    expect(apiMocks.postStudyEvent).not.toHaveBeenCalled();
  });

  it("posts study event when logged in after pass", () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    startRelearning(3);
    useStudy.getState().answerRelearning(true);
    useStudy.getState().confirmRelearning(true);
    expect(apiMocks.postStudyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        word_idx: 42,
        event_type: "new",
        quality: "good",
      })
    );
  });
});

describe("review due filter + snapshot", () => {
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
    apiMocks.postStudyEvent.mockClear();
    useCards.setState({ cards: {} });
    useMeta.setState({
      meta: {
        dayKey: "2026-07-13",
        newToday: 0,
        reviewToday: 0,
        learnToday: 0,
        doneToday: 0,
        created: 0,
      },
    });
    useSettings.setState({ dailyNew: 20, dailyReview: 100 });
  });

  it("buildQueue(review) only includes due learned cards", () => {
    const now = Date.now();
    useCards.setState({
      cards: {
        1: {
          learned: true,
          state: "review",
          due: now - 1000,
          ivl: 1,
          ease: 2.5,
          reps: 1,
          lapses: 0,
          quiz: 0,
          updatedAt: now,
        },
        2: {
          learned: true,
          state: "review",
          due: now + 7 * DAY,
          ivl: 7,
          ease: 2.5,
          reps: 2,
          lapses: 0,
          quiz: 0,
          updatedAt: now,
        },
      },
    });
    useStudy.getState().buildQueue("review");
    const idxs = useStudy.getState().queue.map((q) => q.idx);
    expect(idxs).toEqual([1]);
  });

  it("snapshot counts due and mastered separately from reviewing", () => {
    const now = Date.now();
    useCards.setState({
      cards: {
        1: {
          learned: true,
          state: "review",
          due: now - 1,
          ivl: 1,
          ease: 2.5,
          reps: 1,
          lapses: 0,
        },
        2: {
          learned: true,
          state: "review",
          due: now + DAY,
          ivl: 20,
          ease: 2.5,
          reps: 5,
          lapses: 0,
        },
      },
    });
    const snap = useStudy.getState().snapshot();
    expect(snap.due).toBe(1);
    expect(snap.reviewAvailable).toBe(1);
    expect(snap.reviewing).toBe(2);
    expect(snap.mastered).toBe(1); // card 2: reps>=4 && ivl>=14
  });

  it("second good review grows interval beyond 1 day", () => {
    const now = Date.now();
    const card = {
      learned: true,
      state: "review" as const,
      due: now - 1,
      ivl: 2,
      ease: 2.5,
      reps: 2,
      lapses: 0,
      quiz: 0,
      updatedAt: now - 1000,
    };
    useCards.setState({ cards: { 9: card } });
    useStudy.setState({
      mode: "review",
      queue: [{ idx: 9, card: { ...card }, group: "review" }],
      qpos: 0,
      groupStart: 0,
      groupInitialEnd: 1,
      groupEnd: 1,
      relearningStarted: false,
      relearnRoundEnd: 0,
      relearnPending: [],
      relearnReveal: null,
      relearnAnswerKnown: null,
      uiPhase: "assess-front",
      assessChoice: null,
      sessionStats: { studied: 0, newDone: 0, reviewDone: 0 },
    });
    useStudy.getState().chooseAssessment("known");
    useStudy.getState().assessFullNext();
    const saved = useCards.getState().cards[9];
    // good on review: ivl = round(2 * 2.5) = 5
    expect(saved.ivl).toBe(5);
    expect(saved.due).toBeGreaterThanOrEqual(now + 5 * DAY - 2000);
    expect(saved.reps).toBe(3);
  });
});
