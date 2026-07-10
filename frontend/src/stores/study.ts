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
  | "quiz1-front"
  | "quiz1-back"
  | "quiz2"
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
  sessionId: number;
  groupStart: number;
  groupEnd: number;
  /** 当前组是否已完成首轮，并开始处理本组忘记词。 */
  groupRelearningStarted: boolean;
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
  setPhase: (p: UiPhase) => void;
  setFlipped: (v: boolean) => void;
  setHintVisible: (v: boolean) => void;
  setQuizChoices: (c: { cn: string; correct: boolean }[]) => void;
  setQuizLocked: (v: boolean) => void;
  assessSubmit: (q: Quality) => void;
  assessFullNext: () => void;
  assessFullMistake: () => void;
  quiz2Answer: (i: number) => void;
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
  card.updatedAt = Date.now();
  useCards.getState().save(idx, card);
}
function bump(field: "newToday" | "reviewToday" | "learnToday" | "doneToday", by = 1) {
  useMeta.getState().bump(field, by);
}

export const useStudy = create<StudyState>((set, get) => ({
  mode: "daily",
  queue: [],
  qpos: 0,
  sessionId: 0,
  groupStart: 0,
  groupEnd: 0,
  groupRelearningStarted: false,
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
    let reviewDue = 0,
      learnDue = 0,
      learn = 0,
      reviewing = 0,
      mastered = 0;
    const total = WORDS.length;
    for (const idx in all) {
      const c = all[+idx];
      if (!c) continue;
      if (c.state === "review") {
        reviewing++;
        if (SRS.isMastered(c)) mastered++;
        if (c.due <= now) reviewDue++;
      } else if (c.state === "learn") {
        learn++;
        if (c.due <= now) learnDue++;
      }
    }
    const meta = useMeta.getState().get();
    const settings = useSettings.getState();
    const newToday = meta.newToday || 0;
    const newAvailable = Math.max(0, settings.dailyNew - newToday);
    const reviewAvailable = Math.min(
      reviewDue,
      Math.max(0, settings.dailyReview - (meta.reviewToday || 0))
    );
    const unseen = total - reviewing - learn;
    return {
      due: reviewDue + learnDue,
      reviewAvailable,
      learnDue,
      learn,
      reviewing,
      mastered,
      total,
      newAvailable,
      unseen,
      newToday,
      reviewToday: meta.reviewToday || 0,
      learnToday: meta.learnToday || 0,
      doneToday: meta.doneToday || 0,
      todayPlan:
        Math.min(settings.dailyNew, newToday + newAvailable) +
        (meta.reviewToday || 0) +
        (meta.learnToday || 0) +
        learnDue +
        reviewAvailable,
    };
  },

  buildQueue: (mode) => {
    const reviewOnly = mode === "review";
    const newOnly = mode === "learn";
    const now = Date.now();
    const all = useCards.getState().cards;
    const learningDue: number[] = [];
    const reviewDue: number[] = [];
    for (const idx in all) {
      const c = all[+idx];
      if (!c) continue;
      if (c.state === "learn" && c.due <= now) learningDue.push(+idx);
      else if (c.state === "review" && c.due <= now) reviewDue.push(+idx);
    }
    learningDue.sort((a, b) => (all[a].due || 0) - (all[b].due || 0));
    reviewDue.sort(
      (a, b) =>
        (all[a].due || 0) - (all[b].due || 0) ||
        (all[b].lapses || 0) - (all[a].lapses || 0)
    );

    const queue: QueueItem[] = [];
    learningDue.forEach((idx) =>
      queue.push({ idx, card: { ...all[idx] }, isNew: false })
    );
    if (!newOnly) {
      const meta = useMeta.getState().get();
      const settings = useSettings.getState();
      const reviewRemaining = Math.max(
        0,
        settings.dailyReview - (meta.reviewToday || 0)
      );
      reviewDue.slice(0, reviewRemaining).forEach((idx) =>
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
    set({ queue, qpos: 0, groupRelearningStarted: false });
  },

  startLearn: () => {
    get().buildQueue("learn");
    const { queue } = get();
    if (queue.length === 0) {
      set({
        mode: "learn",
        uiPhase: "done",
        sessionStats: emptyStats(),
        sessionId: get().sessionId + 1,
      });
      return false;
    }
    set({
      mode: "learn",
      sessionStats: emptyStats(),
      assessChoice: null,
      flipped: false,
      hintVisible: false,
      sessionId: get().sessionId + 1,
    });
    get().advanceToNextGroup();
    return true;
  },

  startReview: () => {
    get().buildQueue("review");
    const { queue } = get();
    if (queue.length === 0) {
      set({
        mode: "review",
        uiPhase: "done",
        sessionStats: emptyStats(),
        sessionId: get().sessionId + 1,
      });
      return false;
    }
    set({
      mode: "review",
      sessionStats: emptyStats(),
      assessChoice: null,
      flipped: false,
      hintVisible: false,
      sessionId: get().sessionId + 1,
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
      groupRelearningStarted: false,
      passageSkipped,
      reciteOrigin: origin,
      sessionStats: emptyStats(),
      assessChoice: null,
      flipped: false,
      hintVisible: false,
      sessionId: get().sessionId + 1,
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
      uiPhase = q === 1 ? "quiz1-front" : q === 2 ? "quiz2" : "quiz3-front";
    } else uiPhase = "review-front";
    set({
      groupEnd,
      groupStart: qpos,
      groupRelearningStarted: false,
      uiPhase,
      flipped: false,
      hintVisible: false,
    });
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
    const { queue, qpos } = st;
    const item = queue[qpos];
    if (!item) return;
    set({ queue, qpos: qpos + 1, flipped: false, hintVisible: false });
    get().afterAdvance();
  },

  assessFullMistake: () => {
    const st = get();
    const { queue, qpos, assessChoice } = st;
    const item = queue[qpos];
    if (!item) return;
    if (assessChoice !== "again") {
      const res = SRS.answer(item.card, "again", Date.now());
      item.card = res.card;
      saveCard(item.idx, res.card);
    }
    set({ queue, qpos: qpos + 1, flipped: false, hintVisible: false });
    get().afterAdvance();
  },

  quiz2Answer: (i) => {
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
    bump("learnToday", 1);
    bump("doneToday", 1);
    let queue = [...st.queue];
    queue[st.qpos] = { ...item };
    let groupEnd = st.groupEnd;
    if (
      item.card.state === "learn" &&
      item.card.due <= Date.now() &&
      st.groupRelearningStarted
    ) {
      queue = [
        ...queue.slice(0, groupEnd),
        { idx: item.idx, card: item.card, isNew: false, entry: item.entry },
        ...queue.slice(groupEnd),
      ];
      groupEnd++;
    }
    const stats = {
      ...st.sessionStats,
      studied: st.sessionStats.studied + 1,
    };
    const sessionId = st.sessionId;
    setTimeout(() => {
      if (get().sessionId !== sessionId) return;
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
    bump("learnToday", 1);
    bump("doneToday", 1);
    let queue = [...st.queue];
    queue[st.qpos] = { ...item };
    let groupEnd = st.groupEnd;
    if (
      st.groupRelearningStarted &&
      res.card.state === "learn" &&
      res.card.due <= Date.now()
    ) {
      queue = [
        ...queue.slice(0, groupEnd),
        { idx: item.idx, card: res.card, isNew: false, entry: item.entry },
        ...queue.slice(groupEnd),
      ];
      groupEnd++;
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
    if (
      q === "again" &&
      res.card.state === "learn" &&
      res.card.due <= Date.now() &&
      st.groupRelearningStarted
    ) {
      queue = [
        ...queue.slice(0, groupEnd),
        { idx: item.idx, card: res.card, isNew: false, entry: item.entry },
        ...queue.slice(groupEnd),
      ];
      groupEnd++;
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
      if (quiz === 1 && st.uiPhase === "quiz1-front")
        set({ uiPhase: "quiz1-back", flipped: true, hintVisible: false });
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
      sessionId: get().sessionId + 1,
      groupStart: 0,
      groupEnd: 0,
      groupRelearningStarted: false,
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
      if (!st.groupRelearningStarted) {
        const relearning = st.queue
          .slice(st.groupStart, st.groupEnd)
          .filter((item) => item.card.state === "learn" && item.card.due <= Date.now())
          .map((item) => ({
            ...item,
            card: { ...item.card },
            isNew: false,
          }));
        if (relearning.length > 0) {
          const queue = [
            ...st.queue.slice(0, st.qpos),
            ...relearning,
            ...st.queue.slice(st.qpos),
          ];
          set({
            queue,
            groupEnd: st.qpos + relearning.length,
            groupRelearningStarted: true,
          });
          get().afterAdvance();
          return;
        }
      }
      set({ uiPhase: st.qpos >= st.queue.length ? "done" : "group-done" });
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
      uiPhase = q === 1 ? "quiz1-front" : q === 2 ? "quiz2" : "quiz3-front";
    } else uiPhase = "review-front";
    set({ uiPhase, flipped: false, hintVisible: false, quizLocked: false });
  },
}));

// re-export for consumers that need isStudied
export { isStudied };
