// study store —— 三个入口共用的「初轮评估 → 组内三轮重学」状态机。
import { create } from "zustand";
import type { Card } from "@/lib/srs";
import { answer, DAY, isMastered } from "@/lib/srs";
import { getExamples, getWords } from "@/lib/words";
import { useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import type { PassageItem, PassageWord, WordEntry } from "@/types/words";

export type StudyMode = "daily" | "passage" | "learn" | "review";
export type Assessment = "known" | "uncertain" | "unknown";
export type UiPhase =
  | "assess-front"
  | "assess-full"
  | "relearn-example"
  | "relearn-word"
  | "relearn-meaning"
  | "relearn-reveal"
  | "done"
  | "group-done"
  | "idle";

export interface QueueItem {
  idx: number;
  card: Card;
  group: "new" | "review";
  round?: 1 | 2 | 3;
  needsRelearning?: boolean;
  entry?: WordEntry & { sentences?: string[] };
}

export interface SessionStats {
  studied: number;
  newDone: number;
  reviewDone: number;
}

export interface PassageReader {
  title: string;
  body: string;
  words: string[];
  year?: number;
  variant?: string;
  label?: string;
  items?: PassageItem[];
  answers?: Record<string, string>;
  sectionType?: string;
  wordsFull?: PassageWord[];
}

interface StudyState {
  mode: StudyMode;
  queue: QueueItem[];
  qpos: number;
  sessionId: number;
  groupStart: number;
  groupInitialEnd: number;
  groupEnd: number;
  relearningStarted: boolean;
  relearnRoundEnd: number;
  relearnPending: QueueItem[];
  relearnReveal: QueueItem | null;
  relearnAnswerKnown: boolean | null;
  uiPhase: UiPhase;
  assessChoice: Assessment | null;
  sessionStats: SessionStats;
  passageSkipped: number;
  passageReader: PassageReader | null;
  reciteOrigin: { paperIdx: number; type: string } | null;

  snapshot: () => {
    due: number;
    reviewAvailable: number;
    learnDue: number;
    learn: number;
    reviewing: number;
    mastered: number;
    total: number;
    newAvailable: number;
    unseen: number;
    newToday: number;
    reviewToday: number;
    learnToday: number;
    doneToday: number;
    todayPlan: number;
  };
  buildQueue: (mode: "learn" | "review" | "daily") => void;
  startLearn: () => boolean;
  startReview: () => boolean;
  startPassage: (
    words: PassageWord[],
    origin?: { paperIdx: number; type: string } | null
  ) => boolean;
  advanceToNextGroup: () => void;
  currentItem: () => QueueItem | null;
  currentEntry: () => (WordEntry & { sentences?: string[] }) | null;
  getExample: (item: QueueItem) => string | null;
  chooseAssessment: (choice: Assessment) => void;
  assessFullNext: () => void;
  assessFullMistake: () => void;
  answerRelearning: (known: boolean) => void;
  confirmRelearning: (known: boolean) => void;
  advanceWithinGroup: () => void;
  setPassageReader: (reader: PassageReader | null) => void;
  resetSession: () => void;
}

const emptyStats = (): SessionStats => ({ studied: 0, newDone: 0, reviewDone: 0 });

function isLearned(card: Card | undefined): boolean {
  return !!card?.learned;
}

/** 已学且到期（含 due=0 的遗留数据） */
function isDue(card: Card | undefined, now: number = Date.now()): boolean {
  return isLearned(card) && (card!.due || 0) <= now;
}

function cloneCard(card?: Card): Card {
  return {
    learned: !!card?.learned,
    state: card?.state || "new",
    due: card?.due || 0,
    ivl: card?.ivl || 0,
    ease: card?.ease || 2.5,
    reps: card?.reps || 0,
    lapses: card?.lapses || 0,
    quiz: card?.quiz ?? 0,
    updatedAt: card?.updatedAt || 0,
  };
}

/**
 * 评估通过 / 三轮重学完成 → 写入间隔。
 * UI 无四键，统一按 quality=good 调度；learned 始终置 true。
 */
function savePassedCard(idx: number, previous: Card): Card {
  const now = Date.now();
  const working = cloneCard(previous);
  // 已标记 learned 但 state 仍为 new 的脏数据：按 review 推进
  if (working.learned && working.state === "new") {
    working.state = "review";
    working.ivl = Math.max(1, working.ivl || 1);
    working.reps = Math.max(1, working.reps || 0);
  }
  const { card } = answer(working, "good", now);
  card.learned = true;
  // good 理论上毕业进 review；兜底避免落在 learn
  if (card.state !== "review") {
    card.state = "review";
    card.quiz = 0;
    card.ivl = Math.max(1, card.ivl || 1);
    card.due = now + card.ivl * DAY;
  }
  card.updatedAt = now;
  useCards.getState().save(idx, card);
  return card;
}

function phaseForRound(round: 1 | 2 | 3): UiPhase {
  if (round === 1) return "relearn-example";
  if (round === 2) return "relearn-word";
  return "relearn-meaning";
}

export const useStudy = create<StudyState>((set, get) => ({
  mode: "daily",
  queue: [],
  qpos: 0,
  sessionId: 0,
  groupStart: 0,
  groupInitialEnd: 0,
  groupEnd: 0,
  relearningStarted: false,
  relearnRoundEnd: 0,
  relearnPending: [],
  relearnReveal: null,
  relearnAnswerKnown: null,
  uiPhase: "idle",
  assessChoice: null,
  sessionStats: emptyStats(),
  passageSkipped: 0,
  passageReader: null,
  reciteOrigin: null,

  snapshot: () => {
    const now = Date.now();
    const cards = useCards.getState().cards;
    const settings = useSettings.getState();
    const meta = useMeta.getState().get();
    const allWords = getWords();
    const allCards = Object.values(cards);
    const learned = allCards.filter(isLearned);
    const dueCards = learned.filter((c) => isDue(c, now));
    const learning = allCards.filter((c) => c.state === "learn");
    const learnDue = learning.filter((c) => (c.due || 0) <= now).length;
    const masteredCount = learned.filter(isMastered).length;
    const newAvailable = Math.max(0, settings.dailyNew - meta.newToday);
    const reviewAvailable = Math.min(
      dueCards.length,
      Math.max(0, settings.dailyReview - meta.reviewToday)
    );
    return {
      due: dueCards.length,
      reviewAvailable,
      learnDue,
      learn: learning.length,
      reviewing: learned.length,
      mastered: masteredCount,
      total: allWords.length,
      newAvailable,
      unseen: allWords.length - learned.length,
      newToday: meta.newToday,
      reviewToday: meta.reviewToday,
      learnToday: meta.learnToday,
      doneToday: meta.doneToday,
      todayPlan: newAvailable + reviewAvailable,
    };
  },

  buildQueue: (mode) => {
    const now = Date.now();
    const cards = useCards.getState().cards;
    const settings = useSettings.getState();
    const meta = useMeta.getState().get();
    let queue: QueueItem[] = [];

    if (mode !== "review") {
      const limit = Math.max(0, settings.dailyNew - meta.newToday);
      queue = getWords()
        .filter((word) => !isLearned(cards[word[0]]))
        .slice(0, limit)
        .map((word) => ({ idx: word[0], card: cloneCard(cards[word[0]]), group: "new" }));
    } else {
      const limit = Math.max(0, settings.dailyReview - meta.reviewToday);
      queue = Object.entries(cards)
        .filter(([, card]) => isDue(card, now))
        .sort(([, left], [, right]) => left.due - right.due)
        .slice(0, limit)
        .map(([idx, card]) => ({ idx: +idx, card: cloneCard(card), group: "review" }));
    }
    set({
      queue,
      qpos: 0,
      relearnPending: [],
      relearningStarted: false,
      relearnRoundEnd: 0,
      relearnReveal: null,
      relearnAnswerKnown: null,
    });
  },

  startLearn: () => {
    get().buildQueue("learn");
    if (!get().queue.length) {
      set({ mode: "learn", uiPhase: "done", sessionStats: emptyStats() });
      return false;
    }
    set({ mode: "learn", sessionStats: emptyStats(), passageSkipped: 0, sessionId: get().sessionId + 1 });
    get().advanceToNextGroup();
    return true;
  },

  startReview: () => {
    get().buildQueue("review");
    if (!get().queue.length) {
      set({ mode: "review", uiPhase: "done", sessionStats: emptyStats() });
      return false;
    }
    set({ mode: "review", sessionStats: emptyStats(), passageSkipped: 0, sessionId: get().sessionId + 1 });
    get().advanceToNextGroup();
    return true;
  },

  startPassage: (words, origin = null) => {
    const cards = useCards.getState().cards;
    const queue: QueueItem[] = [];
    for (const word of words) {
      const card = cards[word.idx];
      if (isLearned(card)) continue;
      const entry = [word.idx, word.english, word.senses] as WordEntry & { sentences?: string[] };
      entry.sentences = (word.sentences || []).slice(0, 5);
      queue.push({
        idx: word.idx,
        card: cloneCard(card),
        group: "new",
        entry,
      });
    }
    set({
      mode: "passage",
      queue,
      qpos: 0,
      relearnPending: [],
      relearningStarted: false,
      relearnRoundEnd: 0,
      relearnReveal: null,
      relearnAnswerKnown: null,
      passageSkipped: 0,
      reciteOrigin: origin,
      sessionStats: emptyStats(),
      sessionId: get().sessionId + 1,
    });
    if (!queue.length) {
      set({ uiPhase: "done" });
      return false;
    }
    get().advanceToNextGroup();
    return true;
  },

  advanceToNextGroup: () => {
    const { qpos, queue } = get();
    if (qpos >= queue.length) {
      set({ uiPhase: "done" });
      return;
    }
    const groupSize = useSettings.getState().groupSize || 20;
    const groupInitialEnd = Math.min(queue.length, qpos + groupSize);
    set({
      groupStart: qpos,
      groupInitialEnd,
      groupEnd: groupInitialEnd,
      relearningStarted: false,
      relearnRoundEnd: groupInitialEnd,
      relearnPending: [],
      relearnReveal: null,
      relearnAnswerKnown: null,
      assessChoice: null,
      uiPhase: "assess-front",
    });
  },

  currentItem: () => get().relearnReveal || get().queue[get().qpos] || null,

  currentEntry: () => {
    const item = get().currentItem();
    if (!item) return null;
    if (item.entry) return item.entry;
    return getWords().find((word) => word[0] === item.idx) || null;
  },

  getExample: (item) => {
    // 真题记词：只用入口文章挂在 entry 上的例句，不回落到全局索引（避免串到别年别篇）
    if (get().mode === "passage") {
      return item.entry?.sentences?.[0] || null;
    }
    if (item.entry?.sentences?.[0]) return item.entry.sentences[0];
    return getExamples(item.idx, 1)[0]?.sentence || null;
  },

  chooseAssessment: (choice) => {
    const item = get().currentItem();
    if (!item) return;
    set({ assessChoice: choice, uiPhase: "assess-full" });
  },

  assessFullNext: () => {
    const state = get();
    const item = state.currentItem();
    if (!item || !state.assessChoice) return;
    const needsRelearning = state.assessChoice !== "known";
    if (needsRelearning) {
      const pending: QueueItem = { ...item, card: cloneCard(item.card), round: 1, needsRelearning: true };
      set({ relearnPending: [...state.relearnPending, pending] });
    } else {
      const card = savePassedCard(item.idx, item.card);
      const stats = { ...state.sessionStats, studied: state.sessionStats.studied + 1 };
      if (item.group === "new") {
        useMeta.getState().bump("newToday");
        stats.newDone++;
      } else {
        useMeta.getState().bump("reviewToday");
        stats.reviewDone++;
      }
      useMeta.getState().bump("doneToday");
      const queue = [...state.queue];
      queue[state.qpos] = { ...item, card };
      set({ queue, sessionStats: stats });
    }
    set({ qpos: state.qpos + 1, assessChoice: null });
    get().advanceWithinGroup();
  },

  assessFullMistake: () => {
    const state = get();
    const item = state.currentItem();
    if (!item) return;
    const pending: QueueItem = { ...item, card: cloneCard(item.card), round: 1, needsRelearning: true };
    set({ relearnPending: [...state.relearnPending, pending], qpos: state.qpos + 1, assessChoice: null });
    get().advanceWithinGroup();
  },

  answerRelearning: (known) => {
    const state = get();
    const item = state.currentItem();
    if (!item || !item.round) return;
    set({
      relearnReveal: item,
      relearnAnswerKnown: known,
      uiPhase: "relearn-reveal",
    });
  },

  confirmRelearning: (known) => {
    const state = get();
    const item = state.relearnReveal;
    if (!item || !item.round || state.relearnAnswerKnown === null) return;
    const confirmedKnown = state.relearnAnswerKnown && known;
    const queue = [...state.queue];
    queue.splice(state.qpos, 1);
    let groupEnd = state.groupEnd - 1;
    let relearnRoundEnd = state.relearnRoundEnd - 1;
    let stats = state.sessionStats;

    if (!confirmedKnown) {
      queue.splice(relearnRoundEnd, 0, { ...item, card: cloneCard(item.card) });
      groupEnd++;
      relearnRoundEnd++;
    } else if (item.round < 3) {
      queue.splice(groupEnd, 0, {
        ...item,
        card: cloneCard(item.card),
        round: (item.round + 1) as 2 | 3,
      });
      groupEnd++;
    } else {
      const card = savePassedCard(item.idx, item.card);
      stats = { ...state.sessionStats, studied: state.sessionStats.studied + 1 };
      if (item.group === "new") {
        useMeta.getState().bump("newToday");
        stats.newDone++;
      } else {
        useMeta.getState().bump("reviewToday");
        stats.reviewDone++;
      }
      useMeta.getState().bump("doneToday");
    }

    if (state.qpos === relearnRoundEnd && state.qpos < groupEnd) {
      relearnRoundEnd = groupEnd;
    }
    set({
      queue,
      groupEnd,
      relearnRoundEnd,
      relearnReveal: null,
      relearnAnswerKnown: null,
      sessionStats: stats,
    });
    get().advanceWithinGroup();
  },

  advanceWithinGroup: () => {
    const state = get();
    if (state.qpos < state.groupInitialEnd) {
      set({ uiPhase: "assess-front" });
      return;
    }
    if (!state.relearningStarted) {
      if (state.relearnPending.length) {
        const queue = [
          ...state.queue.slice(0, state.qpos),
          ...state.relearnPending,
          ...state.queue.slice(state.qpos),
        ];
        const first = state.relearnPending[0];
        set({
          queue,
          groupEnd: state.qpos + state.relearnPending.length,
          relearningStarted: true,
          relearnRoundEnd: state.qpos + state.relearnPending.length,
          relearnPending: [],
          uiPhase: phaseForRound(first.round || 1),
        });
        return;
      }
      set({ uiPhase: state.qpos >= state.queue.length ? "done" : "group-done" });
      return;
    }
    if (state.qpos < state.groupEnd) {
      const item = state.queue[state.qpos];
      set({ uiPhase: phaseForRound(item.round || 1) });
      return;
    }
    set({ uiPhase: state.qpos >= state.queue.length ? "done" : "group-done" });
  },

  setPassageReader: (reader) => set({ passageReader: reader }),

  resetSession: () =>
    set({
      mode: "daily",
      queue: [],
      qpos: 0,
      groupStart: 0,
      groupInitialEnd: 0,
      groupEnd: 0,
      relearningStarted: false,
      relearnRoundEnd: 0,
      relearnPending: [],
      relearnReveal: null,
      relearnAnswerKnown: null,
      uiPhase: "idle",
      assessChoice: null,
      sessionStats: emptyStats(),
      passageSkipped: 0,
      sessionId: get().sessionId + 1,
    }),
}));
