// study store —— 会话队列 + UI 阶段，移植 web/app.js 背词状态机。
import { create } from "zustand";
import * as SRS from "@/lib/srs";
import type { Card, Quality } from "@/lib/srs";
import { getWords, getExamples, isStudied } from "@/lib/words";
import { useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import type { WordEntry, PassageWord } from "@/types/words";

export type StudyMode = "daily" | "passage" | "learn" | "review";
export type UiPhase =
  | "assess-front"
  | "assess-full"
  | "quiz1"
  | "quiz2-front"
  | "quiz2-back"
  | "quiz3-front"
  | "quiz3-back"
  | "review-front"
  | "review-back"
  | "done"
  | "group-done"
  | "idle";

export interface QueueItem {
  idx: number;
  card: Card;
  isNew: boolean;
  /** passage 模式挂 sentences 的 entry */
  entry?: WordEntry & { sentences?: string[] };
}

export interface SessionStats {
  again: number;
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
  items?: unknown[];
  answers?: Record<string, unknown>;
  sectionType?: string;
  wordsFull?: PassageWord[];
}

interface StudyState {
  mode: StudyMode;
  queue: QueueItem[];
  qpos: number;
  groupEnd: number;
  uiPhase: UiPhase;
  assessChoice: Quality | null;
  quizChoices: { cn: string; correct: boolean }[];
  quizLocked: boolean;
  sessionStats: SessionStats;
  passageSkipped: number;
  passageReader: PassageReader | null;
  reciteOrigin: { paperIdx: number; type: string } | null;
  flipped: boolean;
  hintVisible: boolean;

  snapshot: () => {
    due: number;
    learn: number;
    learned: number;
    total: number;
    newAvailable: number;
    unseen: number;
    newToday: number;
    reviewToday: number;
    doneToday: number;
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
  setPhase: (p: UiPhase) => void;
  setFlipped: (v: boolean) => void;
  setHintVisible: (v: boolean) => void;
  setQuizChoices: (c: { cn: string; correct: boolean }[]) => void;
  setQuizLocked: (v: boolean) => void;
  assessSubmit: (q: Quality) => void;
  assessFullNext: () => void;
  assessFullMistake: () => void;
  quiz1Answer: (i: number) => void;
  learnRate: (q: Quality) => void;
  reviewRate: (q: Quality) => void;
  handleRate: (q: Quality) => void;
  flip: () => void;
  setPassageReader: (r: PassageReader | null) => void;
  resetSession: () => void;
  /** 推进 qpos 后根据队列/组边界刷新 uiPhase */
  afterAdvance: () => void;
}

const emptyStats = (): SessionStats => ({
  again: 0,
  studied: 0,
  newDone: 0,
  reviewDone: 0,
});

function saveCard(idx: number, card: Card) {
  useCards.getState().save(idx, card);
}
function bump(field: "newToday" | "reviewToday" | "learnToday" | "doneToday", by = 1) {
  useMeta.getState().bump(field, by);
}

export const useStudy = create<StudyState>((set, get) => ({
  mode: "daily",
  queue: [],
  qpos: 0,
  groupEnd: 0,
  uiPhase: "idle",
  assessChoice: null,
  quizChoices: [],
  quizLocked: false,
  sessionStats: emptyStats(),
  passageSkipped: 0,
  passageReader: null,
  reciteOrigin: null,
  flipped: false,
  hintVisible: false,

  snapshot: () => {
    const now = Date.now();
    const all = useCards.getState().cards;
    const WORDS = getWords();
    let due = 0,
      learn = 0,
      learned = 0;
    const total = WORDS.length;
    for (const idx in all) {
      const c = all[+idx];
      if (!c) continue;
      if (c.state === "review") {
        learned++;
        if (c.due <= now) due++;
      } else if (c.state === "learn") {
        learn++;
        due++;
      }
    }
    const meta = useMeta.getState().get();
    const settings = useSettings.getState();
    const newToday = meta.newToday || 0;
    const newAvailable = Math.max(0, settings.dailyNew - newToday);
    const unseen = total - learned - learn;
    return {
      due,
      learn,
      learned,
      total,
      newAvailable,
      unseen,
      newToday,
      reviewToday: meta.reviewToday || 0,
      doneToday: meta.doneToday || 0,
    };
  },

  buildQueue: (mode) => {
    const reviewOnly = mode === "review";
    const newOnly = mode === "learn";
    const now = Date.now();
    const all = useCards.getState().cards;
    const due: number[] = [];
    for (const idx in all) {
      const c = all[+idx];
      if (!c) continue;
      if (c.state === "review" && c.due <= now) due.push(+idx);
      else if (c.state === "learn") due.push(+idx);
    }
    due.sort((a, b) => (all[a].due || 0) - (all[b].due || 0));

    const queue: QueueItem[] = [];
    if (!newOnly) {
      due.forEach((idx) =>
        queue.push({ idx, card: { ...all[idx] }, isNew: false })
      );
    }
    if (!reviewOnly) {
      const meta = useMeta.getState().get();
      const settings = useSettings.getState();
      const newRemaining = Math.max(0, settings.dailyNew - (meta.newToday || 0));
      const newWords: number[] = [];
      for (const w of getWords()) {
        if (newWords.length >= newRemaining) break;
        if (!all[w[0]]) newWords.push(w[0]);
      }
      newWords.forEach((idx) =>
        queue.push({ idx, card: SRS.newCard(), isNew: true })
      );
    }
    set({ queue, qpos: 0 });
  },

  startLearn: () => {
    get().buildQueue("learn");
    const { queue } = get();
    if (queue.length === 0) {
      set({ mode: "learn", uiPhase: "done", sessionStats: emptyStats() });
      return false;
    }
    set({
      mode: "learn",
      sessionStats: emptyStats(),
      assessChoice: null,
      flipped: false,
      hintVisible: false,
    });
    get().advanceToNextGroup();
    return true;
  },

  startReview: () => {
    get().buildQueue("review");
    const { queue } = get();
    if (queue.length === 0) {
      set({ mode: "review", uiPhase: "done", sessionStats: emptyStats() });
      return false;
    }
    set({
      mode: "review",
      sessionStats: emptyStats(),
      assessChoice: null,
      flipped: false,
      hintVisible: false,
    });
    get().advanceToNextGroup();
    return true;
  },

  startPassage: (words, origin = null) => {
    let passageSkipped = 0;
    const queue: QueueItem[] = [];
    const cards = useCards.getState().cards;
    for (const w of words) {
      const existing = cards[w.idx];
      if (existing && existing.state === "review") {
        passageSkipped++;
        continue;
      }
      const card = existing ? { ...existing } : SRS.newCard();
      const entry = [w.idx, w.english, w.senses] as WordEntry & {
        sentences?: string[];
      };
      entry.sentences = (w.sentences || []).slice(0, 5);
      queue.push({ idx: w.idx, card, isNew: !existing, entry });
    }
    set({
      mode: "passage",
      queue,
      qpos: 0,
      passageSkipped,
      reciteOrigin: origin,
      sessionStats: emptyStats(),
      assessChoice: null,
      flipped: false,
      hintVisible: false,
    });
    if (queue.length === 0) {
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
    const gs = useSettings.getState().groupSize || 20;
    const groupEnd = Math.min(queue.length, qpos + gs);
    const item = queue[qpos];
    let uiPhase: UiPhase = "assess-front";
    if (item.card.state === "new") uiPhase = "assess-front";
    else if (item.card.state === "learn") {
      const q = item.card.quiz || 1;
      uiPhase = q === 1 ? "quiz1" : q === 2 ? "quiz2-front" : "quiz3-front";
    } else uiPhase = "review-front";
    set({ groupEnd, uiPhase, flipped: false, hintVisible: false });
  },

  currentItem: () => {
    const { queue, qpos } = get();
    return queue[qpos] || null;
  },

  currentEntry: () => {
    const item = get().currentItem();
    if (!item) return null;
    if (get().mode === "passage" && item.entry) return item.entry;
    const w = getWords().find((x) => x[0] === item.idx);
    return w || null;
  },

  getExample: (item) => {
    if (get().mode === "passage" && item.entry?.sentences?.[0])
      return item.entry.sentences[0];
    const exs = getExamples(item.idx, 1);
    return exs[0]?.sentence || null;
  },

  setPhase: (p) => set({ uiPhase: p }),
  setFlipped: (v) => set({ flipped: v }),
  setHintVisible: (v) => set({ hintVisible: v }),
  setQuizChoices: (c) => set({ quizChoices: c }),
  setQuizLocked: (v) => set({ quizLocked: v }),

  assessSubmit: (q) => {
    const st = get();
    const item = st.queue[st.qpos];
    if (!item) return;
    const wasNew = item.isNew;
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    saveCard(item.idx, res.card);
    const stats = { ...st.sessionStats, studied: st.sessionStats.studied + 1 };
    if (wasNew) {
      bump("newToday", 1);
      bump("doneToday", 1);
      stats.newDone++;
    }
    const queue = [...st.queue];
    queue[st.qpos] = { ...item };
    set({
      queue,
      assessChoice: q,
      uiPhase: "assess-full",
      sessionStats: stats,
      flipped: true,
      hintVisible: false,
    });
  },

  assessFullNext: () => {
    const st = get();
    let { queue, qpos, groupEnd } = st;
    const item = queue[qpos];
    if (!item) return;
    if (item.card.state === "learn") {
      queue = [
        ...queue,
        { idx: item.idx, card: item.card, isNew: false, entry: item.entry },
      ];
      groupEnd = Math.min(queue.length, groupEnd + 1);
    }
    qpos++;
    set({ queue, qpos, groupEnd, flipped: false, hintVisible: false });
    get().afterAdvance();
  },

  assessFullMistake: () => {
    const st = get();
    let { queue, qpos, groupEnd, assessChoice } = st;
    const item = queue[qpos];
    if (!item) return;
    if (assessChoice !== "again") {
      const res = SRS.answer(item.card, "again", Date.now());
      item.card = res.card;
      saveCard(item.idx, res.card);
    }
    if (item.card.state === "learn") {
      queue = [
        ...queue,
        { idx: item.idx, card: item.card, isNew: false, entry: item.entry },
      ];
      groupEnd = Math.min(queue.length, groupEnd + 1);
    }
    qpos++;
    set({ queue, qpos, groupEnd, flipped: false, hintVisible: false });
    get().afterAdvance();
  },

  quiz1Answer: (i) => {
    const st = get();
    if (st.quizLocked) return;
    const item = st.queue[st.qpos];
    if (!item) return;
    const choice = st.quizChoices[i];
    const correct = !!(choice && choice.correct);
    set({ quizLocked: true });
    const q: Quality = correct ? "good" : "again";
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    saveCard(item.idx, res.card);
    bump("doneToday", 1);
    let queue = [...st.queue];
    queue[st.qpos] = { ...item };
    let groupEnd = st.groupEnd;
    if (item.card.state === "learn") {
      queue = [
        ...queue,
        { idx: item.idx, card: item.card, isNew: false, entry: item.entry },
      ];
      groupEnd = Math.min(queue.length, groupEnd + 1);
    }
    const stats = {
      ...st.sessionStats,
      studied: st.sessionStats.studied + 1,
    };
    setTimeout(() => {
      set({
        queue,
        qpos: st.qpos + 1,
        groupEnd,
        sessionStats: stats,
        quizLocked: false,
        flipped: false,
        hintVisible: false,
      });
      get().afterAdvance();
    }, 600);
  },

  learnRate: (q) => {
    const st = get();
    const item = st.queue[st.qpos];
    if (!item) return;
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    saveCard(item.idx, res.card);
    bump("doneToday", 1);
    let queue = [...st.queue];
    queue[st.qpos] = { ...item };
    let groupEnd = st.groupEnd;
    if (q === "again" || res.card.state === "learn") {
      queue = [
        ...queue,
        { idx: item.idx, card: res.card, isNew: false, entry: item.entry },
      ];
      groupEnd = Math.min(queue.length, groupEnd + 1);
    }
    set({
      queue,
      qpos: st.qpos + 1,
      groupEnd,
      sessionStats: {
        ...st.sessionStats,
        studied: st.sessionStats.studied + 1,
      },
      flipped: false,
      hintVisible: false,
    });
    get().afterAdvance();
  },

  reviewRate: (q) => {
    const st = get();
    const item = st.queue[st.qpos];
    if (!item) return;
    const wasNew = item.isNew;
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    saveCard(item.idx, res.card);
    const stats = {
      ...st.sessionStats,
      studied: st.sessionStats.studied + 1,
      again: st.sessionStats.again + (q === "again" ? 1 : 0),
    };
    if (wasNew) {
      bump("newToday", 1);
      stats.newDone++;
    } else {
      bump("reviewToday", 1);
      stats.reviewDone++;
    }
    bump("doneToday", 1);
    let queue = [...st.queue];
    queue[st.qpos] = { ...item };
    let groupEnd = st.groupEnd;
    if (q === "again") {
      queue = [
        ...queue,
        { idx: item.idx, card: res.card, isNew: false, entry: item.entry },
      ];
      groupEnd = Math.min(queue.length, groupEnd + 1);
    }
    set({
      queue,
      qpos: st.qpos + 1,
      groupEnd,
      sessionStats: stats,
      flipped: false,
      hintVisible: false,
    });
    get().afterAdvance();
  },

  handleRate: (q) => {
    const item = get().currentItem();
    if (!item) return;
    if (item.card.state === "new") get().assessSubmit(q);
    else if (item.card.state === "learn") get().learnRate(q);
    else get().reviewRate(q);
  },

  flip: () => {
    const st = get();
    const item = st.currentItem();
    if (!item) return;
    if (item.card.state === "new") return;
    if (item.card.state === "learn") {
      const quiz = item.card.quiz || 0;
      if (quiz === 2 && st.uiPhase === "quiz2-front")
        set({ uiPhase: "quiz2-back", flipped: true, hintVisible: false });
      else if (quiz === 3 && st.uiPhase === "quiz3-front")
        set({ uiPhase: "quiz3-back", flipped: true, hintVisible: false });
      return;
    }
    if (st.uiPhase === "review-front")
      set({ uiPhase: "review-back", flipped: true, hintVisible: false });
  },

  setPassageReader: (r) => set({ passageReader: r }),

  resetSession: () =>
    set({
      mode: "daily",
      queue: [],
      qpos: 0,
      groupEnd: 0,
      uiPhase: "idle",
      assessChoice: null,
      quizChoices: [],
      quizLocked: false,
      sessionStats: emptyStats(),
      passageSkipped: 0,
      flipped: false,
      hintVisible: false,
    }),

  afterAdvance: () => {
    const st = get();
    if (st.qpos >= st.groupEnd && st.qpos > 0 && st.groupEnd > 0) {
      set({ uiPhase: "group-done" });
      return;
    }
    if (st.qpos >= st.queue.length) {
      set({ uiPhase: "done" });
      return;
    }
    const item = st.queue[st.qpos];
    let uiPhase: UiPhase = "assess-front";
    if (item.card.state === "new") uiPhase = "assess-front";
    else if (item.card.state === "learn") {
      const q = item.card.quiz || 1;
      uiPhase = q === 1 ? "quiz1" : q === 2 ? "quiz2-front" : "quiz3-front";
    } else uiPhase = "review-front";
    set({ uiPhase, flipped: false, hintVisible: false, quizLocked: false });
  },
}));

// re-export for consumers that need isStudied
export { isStudied };
