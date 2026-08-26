import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  postStudyEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api", () => apiMocks);

import { dayKey } from "@/lib/day";
import { DAY, newCard } from "@/lib/srs";
import { setScopeUserId } from "@/lib/storageScope";
import { flushPending } from "@/lib/syncQueue";
import { useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { sessionBar, useStudy } from "@/stores/study";
import type { QueueItem } from "@/stores/study";
import { useTodayLog } from "@/stores/todayLog";

function phaseForTestRound(round: 1 | 2 | 3 | 4) {
  if (round === 1) return "relearn-example" as const;
  if (round === 2) return "relearn-word" as const;
  if (round === 3) return "relearn-meaning" as const;
  return "relearn-cloze" as const;
}

function startRelearning(round: 1 | 2 | 3 | 4) {
  const item: QueueItem = {
    idx: 42,
    card: newCard(),
    group: "new",
    round,
    needsRelearning: true,
    entry: [42, "proportion", [["n.", "比例"]]],
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
    currentExample: "The homeless make up a large proportion of the population.",
    lastExampleByIdx: {},
    cloze:
      round === 4
        ? {
            sentence: "The homeless make up a large proportion of the population.",
            options: ["proportion", "proposal", "property", "prospect"],
            correct: "proportion",
          }
        : null,
    uiPhase: phaseForTestRound(round),
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
    // 完型抽干扰项依赖词库（node 环境无 window，挂到 globalThis）
    const g = globalThis as typeof globalThis & {
      WORDS?: unknown[];
      PAPERS?: unknown[];
    };
    (globalThis as { window?: unknown }).window = globalThis;
    g.WORDS = [
      [42, "proportion", [["n.", "比例"]]],
      [2, "proposal", [["n.", "提议"]]],
      [3, "property", [["n.", "财产"]]],
      [4, "prospect", [["n.", "前景"]]],
      [5, "provide", [["v.", "提供"]]],
      [6, "abandon", [["v.", "放弃"]]],
      [7, "ability", [["n.", "能力"]]],
      [8, "absolute", [["adj.", "绝对的"]]],
    ];
    g.PAPERS = [];
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
    useSettings.setState({ dailyNew: 20, dailyReview: 100, enableCloze: false });
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

  it("with cloze off, third round saves the card instead of advancing", () => {
    startRelearning(3);

    useStudy.getState().answerRelearning(true);
    useStudy.getState().confirmRelearning(true);

    const saved = useCards.getState().cards[42];
    expect(saved).toMatchObject({ learned: true, state: "review", ivl: 1, reps: 1 });
    expect(useStudy.getState().sessionStats).toMatchObject({ studied: 1, newDone: 1 });
    expect(useStudy.getState().queue).toHaveLength(0);
  });

  it("with cloze on, third round advances to cloze round four instead of saving", () => {
    useSettings.setState({ enableCloze: true });
    startRelearning(3);

    useStudy.getState().answerRelearning(true);
    expect(useCards.getState().cards[42]).toBeUndefined();
    expect(useStudy.getState().sessionStats.studied).toBe(0);

    useStudy.getState().confirmRelearning(true);
    expect(useCards.getState().cards[42]).toBeUndefined();
    expect(useStudy.getState().queue[0].round).toBe(4);
    expect(useStudy.getState().uiPhase).toBe("relearn-cloze");
    expect(useStudy.getState().cloze?.correct).toBe("proportion");
    expect(useStudy.getState().cloze?.options).toHaveLength(4);
    expect(useStudy.getState().cloze?.options).toContain("proportion");
  });

  it("does not pass the fourth cloze round until the user continues", () => {
    useSettings.setState({ enableCloze: true });
    startRelearning(4);

    useStudy.getState().answerCloze("proportion");
    expect(useCards.getState().cards[42]).toBeUndefined();
    expect(useStudy.getState()).toMatchObject({
      uiPhase: "relearn-reveal",
      relearnAnswerKnown: true,
    });
    expect(useStudy.getState().sessionStats.studied).toBe(0);

    useStudy.getState().confirmRelearning(true);
    const saved = useCards.getState().cards[42];
    expect(saved).toMatchObject({ learned: true, state: "review", ivl: 1, reps: 1 });
    expect(saved.due).toBeGreaterThan(Date.now());
    expect(saved.due).toBeLessThanOrEqual(Date.now() + DAY + 1000);
    expect(useStudy.getState().sessionStats).toMatchObject({ studied: 1, newDone: 1 });
    expect(apiMocks.postStudyEvent).not.toHaveBeenCalled();
  });

  it("cloze wrong answer requeues the same round", () => {
    useSettings.setState({ enableCloze: true });
    startRelearning(4);
    useStudy.getState().answerCloze("proposal");
    expect(useStudy.getState().relearnAnswerKnown).toBe(false);
    useStudy.getState().confirmRelearning(false);
    expect(useCards.getState().cards[42]).toBeUndefined();
    expect(useStudy.getState().queue[0].round).toBe(4);
    expect(useStudy.getState().uiPhase).toBe("relearn-cloze");
  });

  it("enqueues study event when logged in after pass", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    useSettings.setState({ enableCloze: true });
    startRelearning(4);
    useStudy.getState().answerCloze("proportion");
    useStudy.getState().confirmRelearning(true);
    await flushPending();
    expect(apiMocks.postStudyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        word_idx: 42,
        event_type: "new",
        quality: "good",
      })
    );
  });

  it("lets word B stay on round 1 after A advances to round 2", () => {
    const a: QueueItem = {
      idx: 1,
      card: newCard(),
      group: "new",
      round: 1,
      needsRelearning: true,
      entry: [1, "alpha", [["n.", "甲"]]],
    };
    const b: QueueItem = {
      idx: 2,
      card: newCard(),
      group: "new",
      round: 1,
      needsRelearning: true,
      entry: [2, "beta", [["n.", "乙"]]],
    };
    useStudy.setState({
      mode: "learn",
      queue: [a, b],
      qpos: 0,
      groupStart: 0,
      groupInitialEnd: 0,
      groupEnd: 2,
      relearningStarted: true,
      relearnRoundEnd: 2,
      relearnPending: [],
      relearnReveal: null,
      relearnAnswerKnown: null,
      currentExample: "alpha sentence",
      lastExampleByIdx: {},
      cloze: null,
      uiPhase: "relearn-example",
      assessChoice: null,
      sessionStats: { studied: 0, newDone: 0, reviewDone: 0 },
      sessionTotal: 2,
    });

    useStudy.getState().answerRelearning(true);
    useStudy.getState().confirmRelearning(true);

    const s = useStudy.getState();
    expect(s.queue.map((q) => [q.idx, q.round])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(s.uiPhase).toBe("relearn-example");
    expect(s.currentItem()?.idx).toBe(2);
    expect(s.sessionStats.studied).toBe(0);
  });

  it("does not count 不认识 as studied; sessionBar stays put", () => {
    const item: QueueItem = {
      idx: 8,
      card: newCard(),
      group: "new",
      entry: [8, "absolute", [["adj.", "绝对的"]]],
    };
    useStudy.setState({
      mode: "learn",
      queue: [item],
      qpos: 0,
      groupStart: 0,
      groupInitialEnd: 1,
      groupEnd: 1,
      relearningStarted: false,
      relearnRoundEnd: 1,
      relearnPending: [],
      relearnReveal: null,
      relearnAnswerKnown: null,
      currentExample: null,
      lastExampleByIdx: {},
      cloze: null,
      uiPhase: "assess-front",
      assessChoice: null,
      sessionStats: { studied: 0, newDone: 0, reviewDone: 0 },
      sessionTotal: 1,
    });
    useStudy.getState().chooseAssessment("unknown");
    useStudy.getState().assessFullNext();
    const s = useStudy.getState();
    expect(s.sessionStats.studied).toBe(0);
    // 组评估结束会把 pending 倒进主队列，但未过关，studied 仍为 0
    expect(s.relearningStarted).toBe(true);
    expect(s.queue.some((q) => q.idx === 8 && q.round === 1)).toBe(true);
    expect(sessionBar(s.sessionStats.studied, s.sessionTotal)).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
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
    useTodayLog.setState({ log: { dayKey: dayKey(), items: [] } });
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

  it("buildQueue continues after daily plan is full (soft cap)", () => {
    const now = Date.now();
    // 今日计划已满（dayKey 必须是今天，否则 meta.get 会跨日清零）
    useMeta.setState({
      meta: {
        dayKey: dayKey(),
        newToday: 20,
        reviewToday: 100,
        learnToday: 0,
        doneToday: 120,
        created: 0,
      },
    });
    useSettings.setState({ dailyNew: 20, dailyReview: 100 });
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
          quiz: 0,
          updatedAt: now,
        },
      },
    });
    // 复习：计划满仍可刷到期卡
    useStudy.getState().buildQueue("review");
    expect(useStudy.getState().queue.map((q) => q.idx)).toEqual([1]);

    const snap = useStudy.getState().snapshot();
    expect(snap.canReview).toBe(true);
    expect(snap.reviewAvailable).toBe(0); // 计划剩余为 0
    expect(snap.newAvailable).toBe(0);
    // 固定分母：不因「剩余为 0」把 todayPlan 压成 0
    expect(snap.newGoal).toBe(20);
    expect(snap.reviewGoal).toBe(100);
    expect(snap.todayPlan).toBe(120);
    expect(snap.planDone).toBe(120);
  });

  it("snapshot keeps full daily plan when only review remains (not remaining-as-total)", () => {
    const now = Date.now();
    // 复现截图场景：新词 quota 已满并超学，复习一个没做，到期很多
    useMeta.setState({
      meta: {
        dayKey: dayKey(),
        newToday: 77,
        reviewToday: 0,
        learnToday: 0,
        doneToday: 77,
        created: 0,
      },
    });
    useSettings.setState({ dailyNew: 20, dailyReview: 100 });
    const cards: Record<number, ReturnType<typeof newCard> & { learned: boolean }> = {};
    for (let i = 1; i <= 150; i++) {
      cards[i] = {
        learned: true,
        state: "review",
        due: now - 1,
        ivl: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
        quiz: 0,
        updatedAt: now,
      };
    }
    useCards.setState({ cards });

    const snap = useStudy.getState().snapshot();
    expect(snap.newAvailable).toBe(0);
    expect(snap.reviewAvailable).toBe(100);
    // 旧 bug：todayPlan = 0+100=100，doneToday=77 → 误显示 77/100 且「新词计划完成」像是指 100
    expect(snap.newGoal).toBe(20);
    expect(snap.reviewGoal).toBe(100);
    expect(snap.todayPlan).toBe(120);
    expect(snap.planDone).toBe(20); // 新词封顶 20 + 复习 0
    expect(snap.doneToday).toBe(77);
  });

  it("snapshot uses todayLog counts when they exceed meta GREATEST", () => {
    useMeta.setState({
      meta: {
        dayKey: dayKey(),
        newToday: 10,
        reviewToday: 5,
        learnToday: 0,
        doneToday: 15,
        created: 0,
      },
    });
    useTodayLog.setState({
      log: {
        dayKey: dayKey(),
        items: [
          ...Array.from({ length: 12 }, (_, i) => ({
            wordIdx: i + 1,
            type: "new" as const,
            at: i,
          })),
          ...Array.from({ length: 8 }, (_, i) => ({
            wordIdx: i + 100,
            type: "review" as const,
            at: i,
          })),
        ],
      },
    });
    const snap = useStudy.getState().snapshot();
    expect(snap.newToday).toBe(12);
    expect(snap.reviewToday).toBe(8);
    expect(snap.doneToday).toBe(20);
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

  it("review that needs relearning resets interval to 1 day", () => {
    const now = Date.now();
    const card = {
      learned: true,
      state: "review" as const,
      due: now - 1,
      ivl: 21,
      ease: 2.5,
      reps: 5,
      lapses: 0,
      quiz: 0,
      updatedAt: now - 1000,
    };
    useCards.setState({ cards: { 9: card } });
    useSettings.setState({ enableCloze: false });
    const item: QueueItem = {
      idx: 9,
      card: { ...card },
      group: "review",
      round: 3,
      needsRelearning: true,
      entry: [9, "abandon", [["v.", "放弃"]]],
    };
    useStudy.setState({
      mode: "review",
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
      currentExample: "He had to abandon the plan.",
      lastExampleByIdx: {},
      cloze: null,
      uiPhase: "relearn-meaning",
      assessChoice: null,
      sessionStats: { studied: 0, newDone: 0, reviewDone: 0 },
    });
    useStudy.getState().answerRelearning(true);
    useStudy.getState().confirmRelearning(true);
    const saved = useCards.getState().cards[9];
    expect(saved).toMatchObject({
      learned: true,
      state: "review",
      ivl: 1,
      reps: 1,
      lapses: 1,
      ease: 2.3,
      quiz: 0,
    });
    expect(saved.due).toBeGreaterThanOrEqual(now + DAY - 2000);
    expect(saved.due).toBeLessThanOrEqual(now + DAY + 2000);
    expect(useStudy.getState().sessionStats).toMatchObject({ studied: 1, reviewDone: 1 });
  });
});
