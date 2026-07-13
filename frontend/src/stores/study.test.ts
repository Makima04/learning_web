import { beforeEach, describe, expect, it, vi } from "vitest";
import { newCard } from "@/lib/srs";
import { useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
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
    expect(useCards.getState().cards[42]).toMatchObject({ learned: true, state: "review" });
    expect(useStudy.getState().sessionStats).toMatchObject({ studied: 1, newDone: 1 });
  });
});
