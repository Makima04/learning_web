// study store —— 三个入口共用的「初轮评估 → 组内重学」状态机。
// 重学默认三轮（例句 / 词形 / 释义）；设置 enableCloze 后末轮加完型填空必过。
// 一词必须按 1→2→3 做完才过关；词与词不同步，A 在第 1 测时 B 可以已在第 2/3 测。
import { create } from "zustand";
import type { Card } from "@/lib/srs";
import { answer, DAY, isMastered } from "@/lib/srs";
import {
  buildClozeOptions,
  examplePoolFor,
  pickFromPool,
  type ClozeQuiz,
} from "@/lib/quiz";
import { getWords } from "@/lib/words";
import { useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { useTodayLog } from "@/stores/todayLog";
import type { PassageItem, PassageWord, WordEntry } from "@/types/words";

export type StudyMode = "daily" | "passage" | "learn" | "review";
export type Assessment = "known" | "uncertain" | "unknown";
export type RelearnRound = 1 | 2 | 3 | 4;
/** 真题模块点击后打开的类型 */
export type PassageOpenKind = "learn" | "review" | "list";
export type UiPhase =
  | "assess-front"
  | "assess-full"
  | "relearn-example"
  | "relearn-word"
  | "relearn-meaning"
  | "relearn-cloze"
  | "relearn-reveal"
  | "done"
  | "group-done"
  | "idle";

export interface QueueItem {
  idx: number;
  card: Card;
  group: "new" | "review";
  round?: RelearnRound;
  needsRelearning?: boolean;
  entry?: WordEntry & { sentences?: string[] };
}

export type { ClozeQuiz };

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
  /** 当前卡锁定的例句（轮换后钉住，避免 re-render 抖动） */
  currentExample: string | null;
  /** 词 idx → 上次例句，用于轮换避开 */
  lastExampleByIdx: Record<number, string>;
  /** 第 4 轮完型题（进入 relearn-cloze 时生成） */
  cloze: ClozeQuiz | null;
  uiPhase: UiPhase;
  assessChoice: Assessment | null;
  sessionStats: SessionStats;
  /** 本场评估词数（不含重学副本），顶栏进度分母 */
  sessionTotal: number;
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
    /** 词库里还有未学词，可继续学（不受今日计划硬截断） */
    canLearn: boolean;
    /** 还有到期卡，可继续复习（不受今日计划硬截断） */
    canReview: boolean;
    newToday: number;
    reviewToday: number;
    learnToday: number;
    doneToday: number;
    /** 今日新词计划上限（受设置与剩余未学词约束） */
    newGoal: number;
    /** 今日复习计划上限（受设置与到期量约束） */
    reviewGoal: number;
    /** 今日计划总量（固定分母，不随剩余变化） */
    todayPlan: number;
    /** 今日计划内已完成量（封顶到各自 goal） */
    planDone: number;
  };
  buildQueue: (mode: "learn" | "review" | "daily") => void;
  startLearn: () => boolean;
  startReview: () => boolean;
  startPassage: (
    words: PassageWord[],
    origin?: { paperIdx: number; type: string } | null
  ) => boolean;
  /**
   * 真题模块入口：优先学未学词 → 到期复习本篇词 → 否则词表浏览。
   * 返回实际打开的类型（供 UI 跳转 / 文案）。
   */
  openPassageSection: (
    words: PassageWord[],
    origin?: { paperIdx: number; type: string } | null
  ) => PassageOpenKind;
  /** 只复习本篇中到期的词（无到期则 false） */
  startPassageReview: (
    words: PassageWord[],
    origin?: { paperIdx: number; type: string } | null
  ) => boolean;
  /** 本篇词表回顾（组结算同款列表，不进入答题） */
  browsePassageWords: (
    words: PassageWord[],
    origin?: { paperIdx: number; type: string } | null
  ) => void;
  advanceToNextGroup: () => void;
  currentItem: () => QueueItem | null;
  currentEntry: () => (WordEntry & { sentences?: string[] }) | null;
  getExample: (item?: QueueItem | null) => string | null;
  /** 为当前卡刷新例句（池内轮换）；pin 到 currentExample */
  refreshExample: (item?: QueueItem | null) => string | null;
  chooseAssessment: (choice: Assessment) => void;
  assessFullNext: () => void;
  assessFullMistake: () => void;
  answerRelearning: (known: boolean) => void;
  /** 第 4 轮完型：点选英文选项 */
  answerCloze: (selected: string) => void;
  confirmRelearning: (known: boolean) => void;
  advanceWithinGroup: () => void;
  setPassageReader: (reader: PassageReader | null) => void;
  resetSession: () => void;
}

const emptyStats = (): SessionStats => ({ studied: 0, newDone: 0, reviewDone: 0 });

/** 顶栏进度：只计已过关词，点「不认识」不 +1 */
export function sessionBar(studied: number, total: number): {
  done: number;
  total: number;
  percent: number;
} {
  const t = Math.max(0, total);
  const d = Math.max(0, Math.min(studied, t || studied));
  return { done: d, total: t, percent: t ? (d / t) * 100 : 0 };
}

function isLearned(card: Card | undefined): boolean {
  return !!card?.learned;
}

/** 已学且到期（含 due=0 的遗留数据） */
function isDue(card: Card | undefined, now: number = Date.now()): boolean {
  return isLearned(card) && (card!.due || 0) <= now;
}

function passageEntry(word: PassageWord): WordEntry & { sentences?: string[] } {
  const entry = [word.idx, word.english, word.senses] as WordEntry & {
    sentences?: string[];
  };
  entry.sentences = (word.sentences || []).slice(0, 5);
  return entry;
}

/** 统计本篇：未学 / 到期复习 / 已学数（供列表卡文案） */
export function summarizePassageWords(
  words: PassageWord[],
  cards: Record<number, Card | undefined>,
  now: number = Date.now()
): {
  total: number;
  learned: number;
  unlearned: number;
  due: number;
  kind: PassageOpenKind;
} {
  let learned = 0;
  let unlearned = 0;
  let due = 0;
  for (const w of words) {
    const c = cards[w.idx];
    if (!isLearned(c)) {
      unlearned++;
    } else {
      learned++;
      if (isDue(c, now)) due++;
    }
  }
  const kind: PassageOpenKind =
    unlearned > 0 ? "learn" : due > 0 ? "review" : "list";
  return { total: words.length, learned, unlearned, due, kind };
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
 * 评估通过 / 四轮重学完成 → 写入间隔。
 * UI 无四键，统一按 quality=good 调度；learned 始终置 true。
 */
function savePassedCard(idx: number, previous: Card): Card {
  const now = Date.now();
  const wasLearned = !!previous.learned;
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
  // 今日词表：本地即时可见；登录时 record 内入队 study_events，sync 以服务端为准
  const eventType = wasLearned ? "review" : "new";
  useTodayLog.getState().record(idx, eventType);
  return card;
}

/** 开启完型时 4 轮，否则 3 轮（到释义结束即过关） */
function maxRelearnRounds(): 3 | 4 {
  return useSettings.getState().enableCloze ? 4 : 3;
}

function phaseForRound(round: RelearnRound): UiPhase {
  if (round === 1) return "relearn-example";
  if (round === 2) return "relearn-word";
  if (round === 3) return "relearn-meaning";
  return "relearn-cloze";
}

function entryEnglish(item: QueueItem): string {
  if (item.entry?.[1]) return item.entry[1];
  return getWords().find((w) => w[0] === item.idx)?.[1] || "";
}

function buildClozeQuiz(
  item: QueueItem,
  mode: StudyMode,
  sentence: string | null,
  preferIdxs: number[]
): ClozeQuiz {
  const correct = entryEnglish(item);
  return {
    sentence,
    options: buildClozeOptions(item.idx, correct, preferIdxs),
    correct,
  };
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
  currentExample: null,
  lastExampleByIdx: {},
  cloze: null,
  uiPhase: "idle",
  assessChoice: null,
  sessionStats: emptyStats(),
  sessionTotal: 0,
  passageSkipped: 0,
  passageReader: null,
  reciteOrigin: null,

  snapshot: () => {
    const now = Date.now();
    const cards = useCards.getState().cards;
    const settings = useSettings.getState();
    const meta = useMeta.getState().get();
    const logCounts = useTodayLog.getState().counts();
    // 多端时 todayLog 是去重并集，meta 是 GREATEST；取较大值避免计划偏低
    const newToday = Math.max(meta.newToday, logCounts.newCount);
    const reviewToday = Math.max(meta.reviewToday, logCounts.reviewCount);
    const doneToday = Math.max(meta.doneToday, logCounts.total);
    const allWords = getWords();
    const allCards = Object.values(cards);
    const learned = allCards.filter(isLearned);
    const dueCards = learned.filter((c) => isDue(c, now));
    const learning = allCards.filter((c) => c.state === "learn");
    const learnDue = learning.filter((c) => (c.due || 0) <= now).length;
    const masteredCount = learned.filter(isMastered).length;
    // 今日计划剩余（软目标，排队仍可超学）
    const newAvailable = Math.max(0, settings.dailyNew - newToday);
    const reviewAvailable = Math.min(
      dueCards.length,
      Math.max(0, settings.dailyReview - reviewToday)
    );
    const unseen = Math.max(0, allWords.length - learned.length);
    // 固定分母：已学 + 仍可计入今日计划的量，避免「剩余当总量」导致进度/文案误导
    // 例：新词 quota 已满后只剩 100 复习时，旧逻辑会把 todayPlan 变成 100，
    // 再和 doneToday 混算，出现「没学满 100 新词却显示计划完成 + 77/100」。
    // newGoal：设置上限，且不超过「今日已学新词 + 仍未学」（词库耗尽时缩 goal）
    const newGoal = Math.min(settings.dailyNew, newToday + unseen);
    const reviewGoal = Math.min(
      settings.dailyReview,
      reviewToday + dueCards.length
    );
    const planDone =
      Math.min(newToday, newGoal) + Math.min(reviewToday, reviewGoal);
    return {
      due: dueCards.length,
      reviewAvailable,
      learnDue,
      learn: learning.length,
      reviewing: learned.length,
      mastered: masteredCount,
      total: allWords.length,
      newAvailable,
      unseen,
      canLearn: unseen > 0,
      canReview: dueCards.length > 0,
      newToday,
      reviewToday,
      learnToday: meta.learnToday,
      doneToday,
      newGoal,
      reviewGoal,
      todayPlan: newGoal + reviewGoal,
      planDone,
    };
  },

  buildQueue: (mode) => {
    const now = Date.now();
    const cards = useCards.getState().cards;
    const settings = useSettings.getState();
    const meta = useMeta.getState().get();
    let queue: QueueItem[] = [];

    if (mode !== "review") {
      // 软目标：计划内取剩余；计划已满仍可按 dailyNew 再开一批
      const planLeft = Math.max(0, settings.dailyNew - meta.newToday);
      const limit = planLeft > 0 ? planLeft : Math.max(1, settings.dailyNew);
      queue = getWords()
        .filter((word) => !isLearned(cards[word[0]]))
        .slice(0, limit)
        .map((word) => ({ idx: word[0], card: cloneCard(cards[word[0]]), group: "new" }));
    } else {
      const planLeft = Math.max(0, settings.dailyReview - meta.reviewToday);
      const limit = planLeft > 0 ? planLeft : Math.max(1, settings.dailyReview);
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
      currentExample: null,
      cloze: null,
    });
  },

  startLearn: () => {
    get().buildQueue("learn");
    if (!get().queue.length) {
      set({ mode: "learn", uiPhase: "done", sessionStats: emptyStats(), sessionTotal: 0 });
      return false;
    }
    set({
      mode: "learn",
      sessionStats: emptyStats(),
      sessionTotal: get().queue.length,
      passageSkipped: 0,
      sessionId: get().sessionId + 1,
      lastExampleByIdx: {},
    });
    get().advanceToNextGroup();
    return true;
  },

  startReview: () => {
    get().buildQueue("review");
    if (!get().queue.length) {
      set({ mode: "review", uiPhase: "done", sessionStats: emptyStats(), sessionTotal: 0 });
      return false;
    }
    set({
      mode: "review",
      sessionStats: emptyStats(),
      sessionTotal: get().queue.length,
      passageSkipped: 0,
      sessionId: get().sessionId + 1,
      lastExampleByIdx: {},
    });
    get().advanceToNextGroup();
    return true;
  },

  startPassage: (words, origin = null) => {
    const cards = useCards.getState().cards;
    const queue: QueueItem[] = [];
    for (const word of words) {
      const card = cards[word.idx];
      if (isLearned(card)) continue;
      queue.push({
        idx: word.idx,
        card: cloneCard(card),
        group: "new",
        entry: passageEntry(word),
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
      currentExample: null,
      cloze: null,
      lastExampleByIdx: {},
      passageSkipped: 0,
      reciteOrigin: origin,
      sessionStats: emptyStats(),
      sessionTotal: queue.length,
      sessionId: get().sessionId + 1,
    });
    if (!queue.length) {
      set({ uiPhase: "done" });
      return false;
    }
    get().advanceToNextGroup();
    return true;
  },

  startPassageReview: (words, origin = null) => {
    const cards = useCards.getState().cards;
    const now = Date.now();
    const queue: QueueItem[] = words
      .filter((word) => isDue(cards[word.idx], now))
      .sort(
        (a, b) => (cards[a.idx]?.due || 0) - (cards[b.idx]?.due || 0)
      )
      .map((word) => ({
        idx: word.idx,
        card: cloneCard(cards[word.idx]),
        group: "review" as const,
        entry: passageEntry(word),
      }));
    set({
      mode: "passage",
      queue,
      qpos: 0,
      relearnPending: [],
      relearningStarted: false,
      relearnRoundEnd: 0,
      relearnReveal: null,
      relearnAnswerKnown: null,
      currentExample: null,
      cloze: null,
      lastExampleByIdx: {},
      passageSkipped: 0,
      reciteOrigin: origin,
      sessionStats: emptyStats(),
      sessionTotal: queue.length,
      sessionId: get().sessionId + 1,
    });
    if (!queue.length) {
      set({ uiPhase: "done" });
      return false;
    }
    get().advanceToNextGroup();
    return true;
  },

  browsePassageWords: (words, origin = null) => {
    const cards = useCards.getState().cards;
    const queue: QueueItem[] = words.map((word) => {
      const card = cards[word.idx];
      return {
        idx: word.idx,
        card: cloneCard(card),
        group: (isLearned(card) ? "review" : "new") as "new" | "review",
        entry: passageEntry(word),
      };
    });
    // 直接进结算词表：qpos 置末 + group 覆盖全文，复用 SettleView
    set({
      mode: "passage",
      queue,
      qpos: queue.length,
      groupStart: 0,
      groupInitialEnd: queue.length,
      groupEnd: queue.length,
      relearnPending: [],
      relearningStarted: false,
      relearnRoundEnd: queue.length,
      relearnReveal: null,
      relearnAnswerKnown: null,
      currentExample: null,
      cloze: null,
      lastExampleByIdx: {},
      passageSkipped: 0,
      reciteOrigin: origin,
      sessionStats: emptyStats(),
      sessionTotal: queue.length,
      sessionId: get().sessionId + 1,
      assessChoice: null,
      uiPhase: "done",
    });
  },

  openPassageSection: (words, origin = null) => {
    const cards = useCards.getState().cards;
    const summary = summarizePassageWords(words, cards);
    if (summary.kind === "learn") {
      get().startPassage(words, origin);
      return "learn";
    }
    if (summary.kind === "review") {
      get().startPassageReview(words, origin);
      return "review";
    }
    get().browsePassageWords(words, origin);
    return "list";
  },

  advanceToNextGroup: () => {
    const { qpos, queue } = get();
    if (qpos >= queue.length) {
      set({ uiPhase: "done", currentExample: null, cloze: null });
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
      cloze: null,
      uiPhase: "assess-front",
    });
    get().refreshExample(queue[qpos]);
  },

  currentItem: () => get().relearnReveal || get().queue[get().qpos] || null,

  currentEntry: () => {
    const item = get().currentItem();
    if (!item) return null;
    if (item.entry) return item.entry;
    return getWords().find((word) => word[0] === item.idx) || null;
  },

  getExample: (item) => {
    const state = get();
    // 优先当前钉住的例句（与当前卡一致时）
    const cur = item ?? state.currentItem();
    if (cur && state.currentExample != null) {
      const at = state.relearnReveal || state.queue[state.qpos];
      if (at && at.idx === cur.idx) return state.currentExample;
    }
    if (!cur) return null;
    const pool = examplePoolFor(cur.idx, state.mode, cur.entry?.sentences);
    return pickFromPool(pool, state.lastExampleByIdx[cur.idx]) || pool[0] || null;
  },

  refreshExample: (item) => {
    const state = get();
    const cur = item ?? state.currentItem();
    if (!cur) {
      set({ currentExample: null });
      return null;
    }
    const pool = examplePoolFor(cur.idx, state.mode, cur.entry?.sentences);
    const sentence = pickFromPool(pool, state.lastExampleByIdx[cur.idx]);
    const lastExampleByIdx = { ...state.lastExampleByIdx };
    if (sentence) lastExampleByIdx[cur.idx] = sentence;
    set({ currentExample: sentence, lastExampleByIdx });
    return sentence;
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
    if (!item || !item.round || item.round === 4) return;
    set({
      relearnReveal: item,
      relearnAnswerKnown: known,
      uiPhase: "relearn-reveal",
      cloze: null,
    });
  },

  answerCloze: (selected) => {
    const state = get();
    const item = state.currentItem();
    if (!item || item.round !== 4 || !state.cloze) return;
    const known = selected.toLowerCase() === state.cloze.correct.toLowerCase();
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
    let stats = state.sessionStats;

    if (!confirmedKnown) {
      // 未过：同轮挂到本组重学队尾，不挡其他词升轮
      queue.splice(groupEnd, 0, { ...item, card: cloneCard(item.card) });
      groupEnd++;
    } else if (item.round < maxRelearnRounds()) {
      // 下一测挂队尾：该词必须 1→2→3，但不必等整组同轮结束
      queue.splice(groupEnd, 0, {
        ...item,
        card: cloneCard(item.card),
        round: (item.round + 1) as RelearnRound,
      });
      groupEnd++;
    } else {
      savePassedCard(item.idx, item.card);
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

    set({
      queue,
      groupEnd,
      relearnRoundEnd: groupEnd,
      relearnReveal: null,
      relearnAnswerKnown: null,
      cloze: null,
      sessionStats: stats,
    });
    get().advanceWithinGroup();
  },

  advanceWithinGroup: () => {
    const state = get();
    if (state.qpos < state.groupInitialEnd) {
      set({ uiPhase: "assess-front", cloze: null });
      get().refreshExample(state.queue[state.qpos]);
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
        const round = (first.round || 1) as RelearnRound;
        const phase = phaseForRound(round);
        const preferIdxs = queue.map((q) => q.idx);
        let cloze: ClozeQuiz | null = null;
        const example = get().refreshExample(first);
        if (round === 4) {
          cloze = buildClozeQuiz(first, state.mode, example, preferIdxs);
        }
        set({
          queue,
          groupEnd: state.qpos + state.relearnPending.length,
          relearningStarted: true,
          relearnRoundEnd: state.qpos + state.relearnPending.length,
          relearnPending: [],
          uiPhase: phase,
          cloze,
        });
        return;
      }
      // 始终先 group-done 回顾词表（含最后一组），再由 advanceToNextGroup 决定 done
      set({ uiPhase: "group-done", cloze: null, currentExample: null });
      return;
    }
    if (state.qpos < state.groupEnd) {
      const item = state.queue[state.qpos];
      const round = (item.round || 1) as RelearnRound;
      const phase = phaseForRound(round);
      const example = get().refreshExample(item);
      let cloze: ClozeQuiz | null = null;
      if (round === 4) {
        cloze = buildClozeQuiz(
          item,
          state.mode,
          example,
          state.queue.map((q) => q.idx)
        );
      }
      set({ uiPhase: phase, cloze });
      return;
    }
    set({ uiPhase: "group-done", cloze: null, currentExample: null });
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
      currentExample: null,
      lastExampleByIdx: {},
      cloze: null,
      uiPhase: "idle",
      assessChoice: null,
      sessionStats: emptyStats(),
      sessionTotal: 0,
      passageSkipped: 0,
      reciteOrigin: null,
      sessionId: get().sessionId + 1,
    }),
}));
