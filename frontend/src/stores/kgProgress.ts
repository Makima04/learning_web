// 知识图谱用户进度：本地即时写 + 登录后经 syncQueue 镜像 /api/kg（服务端权威）
import { create } from "zustand";
import * as api from "@/lib/api";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";
import { discardPendingKgIfNotNewer, enqueueKg } from "@/lib/syncQueue";
import { applyItemMark, applyMarkToKp, markCovered } from "@/lib/kg/mark";
import { nextPracticeMark } from "@/lib/kg/techniqueTraining";
import { findKp } from "@/data/kg";
import { journalCopyForKp } from "@/lib/kg/journalBridge";
import { upsertItemNotes } from "@/lib/kg/itemNote";
import {
  ATTEMPTS_LIMIT,
  SESSIONS_LIMIT,
  dueFor,
  nextReviewStep,
  type ExamAttempt,
  type ExamSession,
} from "@/lib/kg/examAttempts";
import type {
  MarkLevel,
  PredictPaper,
  UserItemMark,
  UserKpState,
} from "@/lib/kg/types";

const KEY_BASE = "ew.kg.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
}

export interface KgDoc {
  states: Record<string, UserKpState>;
  itemMarks: UserItemMark[];
  /** 题目思路备注（itemId → 文本），与会/模糊/不会独立 */
  itemNotes: Record<string, string>;
  papers: PredictPaper[];
  /** 408 真题逐题作答记录（随 /api/kg 整包同步） */
  attempts: ExamAttempt[];
  /** 收藏的真题 itemId */
  favorites: string[];
  /** 练习 / 模考会话，用于复盘 */
  examSessions: ExamSession[];
  /** 文档版本 ms */
  updatedAt: number;
}

function emptyDoc(): KgDoc {
  return {
    states: {},
    itemMarks: [],
    itemNotes: {},
    papers: [],
    attempts: [],
    favorites: [],
    examSessions: [],
    updatedAt: 0,
  };
}

function toPayload(doc: KgDoc): KgDoc {
  return {
    states: doc.states,
    itemMarks: doc.itemMarks,
    itemNotes: doc.itemNotes ?? {},
    papers: doc.papers,
    attempts: doc.attempts ?? [],
    favorites: doc.favorites ?? [],
    examSessions: doc.examSessions ?? [],
    updatedAt: doc.updatedAt,
  };
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function loadDoc(): KgDoc {
  const raw = loadJSON<Partial<KgDoc>>(storageKey(), {});
  return {
    states: raw.states ?? {},
    itemMarks: raw.itemMarks ?? [],
    itemNotes: raw.itemNotes ?? {},
    papers: raw.papers ?? [],
    attempts: raw.attempts ?? [],
    favorites: raw.favorites ?? [],
    examSessions: raw.examSessions ?? [],
    updatedAt: raw.updatedAt ?? 0,
  };
}

function persist(doc: KgDoc) {
  const payload = toPayload(doc);
  saveJSON(storageKey(), payload);
  // 登录后入队批量镜像，失败可重试（scheduleFlush 去抖）
  enqueueKg(payload);
}

interface KgStore extends KgDoc {
  load: () => void;
  setCovered: (kpId: string, covered: boolean) => void;
  setModuleCovered: (kpIds: string[], covered: boolean) => void;
  markItem: (args: {
    itemId: string;
    mark: MarkLevel;
    primaryKpId: string;
    secondaryKpIds?: string[];
    weakKpIds?: string[];
  }) => void;
  /** 思路备注：不改变掌握度，空文本则删除 */
  saveItemNote: (itemId: string, note: string) => void;
  /**
   * 外部（学习日志复盘）回写考点：applyMarkToKp + 可选对齐 due/ivl。
   * 与 markItem 共用同一套熟练度增量。
   */
  applyExternalMark: (
    kpId: string,
    mark: MarkLevel,
    opts?: { dueMs?: number; ivl?: number; now?: number }
  ) => void;
  savePaper: (paper: PredictPaper) => void;
  /** 408 真题：提交一次作答，自动推进 1/3/7/14 复习队列 */
  recordAttempt: (args: {
    itemId: string;
    year: number;
    n: number;
    kind: "mcq" | "big";
    book: string;
    chosen?: string;
    outcome: ExamAttempt["outcome"];
    sessionId?: string;
    now?: number;
  }) => void;
  toggleFavorite: (itemId: string) => void;
  saveExamSession: (session: ExamSession) => void;
  finishExamSession: (id: string, durationMs: number, now?: number) => void;
  syncFromServer: () => Promise<void>;
  replaceAll: (doc: KgDoc) => void;
  clearAll: () => void;
}

/** 图谱已学 → 学习日志入队（动态 import 避免 store 循环） */
function enqueueJournalForKp(kpId: string) {
  // 408 / 数学复习只走错题集，不因「已学」再挂一张考点卡
  const subj = findKp(kpId)?.book.subject;
  if (subj === "cs408" || subj === "math") return;
  const copy = journalCopyForKp(kpId);
  if (!copy) return;
  void import("@/stores/journal").then(({ useJournal }) => {
    useJournal.getState().addEntryFromKg({
      kpId,
      title: copy.title,
      body: copy.body,
      categoryId: copy.categoryId,
    });
  });
}

function archiveJournalForKp(kpId: string) {
  void import("@/stores/journal").then(({ useJournal }) => {
    useJournal.getState().archiveEntriesByKpId(kpId);
  });
}

export const useKgProgress = create<KgStore>((set, get) => ({
  ...emptyDoc(),

  load: () => set(loadDoc()),

  setCovered: (kpId, covered) => {
    const now = Date.now();
    const states = {
      ...get().states,
      [kpId]: markCovered(get().states[kpId], covered, now),
    };
    const doc: KgDoc = { ...get(), states, updatedAt: now };
    persist(doc);
    set(doc);
    if (covered) enqueueJournalForKp(kpId);
    else archiveJournalForKp(kpId);
  },

  setModuleCovered: (kpIds, covered) => {
    const now = Date.now();
    const states = { ...get().states };
    for (const id of kpIds) {
      states[id] = markCovered(states[id], covered, now);
    }
    const doc: KgDoc = { ...get(), states, updatedAt: now };
    persist(doc);
    set(doc);
    for (const id of kpIds) {
      if (covered) enqueueJournalForKp(id);
      else archiveJournalForKp(id);
    }
  },

  markItem: ({ itemId, mark, primaryKpId, secondaryKpIds = [], weakKpIds = [] }) => {
    const now = Date.now();
    const states = applyItemMark(
      get().states,
      primaryKpId,
      secondaryKpIds,
      mark,
      weakKpIds,
      now
    );
    const itemMarks = [
      ...get().itemMarks.filter((m) => m.itemId !== itemId),
      nextPracticeMark(get().itemMarks.find((m) => m.itemId === itemId), itemId, mark, now, weakKpIds),
    ].slice(-20000);
    const doc: KgDoc = { ...get(), states, itemMarks, updatedAt: now };
    persist(doc);
    set(doc);
  },

  saveItemNote: (itemId, note) => {
    const itemNotes = upsertItemNotes(get().itemNotes ?? {}, itemId, note);
    if (itemNotes === get().itemNotes) return;
    const now = Date.now();
    const doc: KgDoc = { ...get(), itemNotes, updatedAt: now };
    persist(doc);
    set(doc);
  },

  applyExternalMark: (kpId, mark, opts = {}) => {
    const now = opts.now ?? Date.now();
    let next = applyMarkToKp(get().states[kpId], mark, {
      role: "primary",
      now,
    });
    // 调度以学习日志为准：用 nextReviewOn / step 覆盖 SM-2 的 due/ivl
    if (opts.dueMs != null && opts.dueMs > 0) next = { ...next, due: opts.dueMs };
    if (opts.ivl != null && opts.ivl > 0) next = { ...next, ivl: opts.ivl };
    const states = { ...get().states, [kpId]: next };
    const doc: KgDoc = { ...get(), states, updatedAt: now };
    persist(doc);
    set(doc);
  },

  savePaper: (paper) => {
    const now = Date.now();
    const papers = [paper, ...get().papers.filter((p) => p.id !== paper.id)].slice(0, 20);
    const doc: KgDoc = { ...get(), papers, updatedAt: now };
    persist(doc);
    set(doc);
  },

  recordAttempt: (args) => {
    const now = args.now ?? Date.now();
    const prev = get()
      .attempts.filter((a) => a.itemId === args.itemId)
      .at(-1);
    const reviewStep = nextReviewStep(prev?.reviewStep, args.outcome);
    const record: ExamAttempt = {
      itemId: args.itemId,
      year: args.year,
      n: args.n,
      kind: args.kind,
      book: args.book,
      chosen: args.chosen,
      outcome: args.outcome,
      sessionId: args.sessionId,
      reviewStep,
      dueMs: dueFor(now, reviewStep),
      ts: now,
    };
    const attempts = [...get().attempts, record].slice(-ATTEMPTS_LIMIT);
    const doc: KgDoc = { ...get(), attempts, updatedAt: now };
    persist(doc);
    set(doc);
  },

  toggleFavorite: (itemId) => {
    const cur = get().favorites ?? [];
    const favorites = cur.includes(itemId)
      ? cur.filter((x) => x !== itemId)
      : [...cur, itemId];
    const now = Date.now();
    const doc: KgDoc = { ...get(), favorites, updatedAt: now };
    persist(doc);
    set(doc);
  },

  saveExamSession: (session) => {
    const examSessions = [
      session,
      ...get().examSessions.filter((s) => s.id !== session.id),
    ].slice(0, SESSIONS_LIMIT);
    const now = Date.now();
    const doc: KgDoc = { ...get(), examSessions, updatedAt: now };
    persist(doc);
    set(doc);
  },

  finishExamSession: (id, durationMs, now) => {
    const t = now ?? Date.now();
    const examSessions = get().examSessions.map((s) =>
      s.id === id ? { ...s, finishedAt: t, durationMs } : s
    );
    const doc: KgDoc = { ...get(), examSessions, updatedAt: t };
    persist(doc);
    set(doc);
  },

  syncFromServer: async () => {
    if (!api.isLoggedIn()) return;
    const epoch = getScopeEpoch();
    try {
      const r = await api.getKg();
      if (!stillInScope(epoch) || !api.isLoggedIn()) return;
      const remote = r?.kg as KgDoc | null | undefined;
      const local = loadDoc();
      if (!remote || !remote.updatedAt) {
        if (local.updatedAt > 0) {
          enqueueKg(toPayload(local));
        }
        if (!stillInScope(epoch)) return;
        set(local);
        return;
      }
      // 服务端权威：远端更新则覆盖；否则入队推本地（flush 由 accountSync 负责）
      if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        const doc: KgDoc = {
          states: remote.states ?? {},
          itemMarks: remote.itemMarks ?? [],
          itemNotes: remote.itemNotes ?? {},
          papers: remote.papers ?? [],
          attempts: remote.attempts ?? [],
          favorites: remote.favorites ?? [],
          examSessions: remote.examSessions ?? [],
          updatedAt: remote.updatedAt ?? 0,
        };
        saveJSON(storageKey(), doc);
        discardPendingKgIfNotNewer(doc.updatedAt);
        set(doc);
      } else {
        enqueueKg(toPayload(local));
        if (!stillInScope(epoch)) return;
        set(local);
      }
    } catch (e) {
      console.warn("kg sync failed:", e);
      if (stillInScope(epoch)) set(loadDoc());
    }
  },

  replaceAll: (doc) => {
    const next: KgDoc = {
      ...emptyDoc(),
      ...doc,
      itemNotes: doc.itemNotes ?? {},
      updatedAt: Date.now(),
    };
    persist(next);
    set(next);
  },

  clearAll: () => {
    const doc = emptyDoc();
    doc.updatedAt = Date.now();
    persist(doc);
    set(doc);
  },
}));
