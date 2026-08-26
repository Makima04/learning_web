// 考研政治主观题练习：本地即时写 + 登录后镜像 /api/politics（服务端权威）
import { create } from "zustand";
import * as api from "@/lib/api";
import { maxOfPart, scorePart } from "@/lib/politics/score";
import { questionById } from "@/lib/politics/questions";
import type { PoliticsDoc, QuestionAttempt, QuestionDraft } from "@/lib/politics/types";
import { scopedKey } from "@/lib/storageScope";

const KEY_BASE = "ew.politics.v1";
const MAX_ATTEMPTS = 80;

function storageKey() {
  return scopedKey(KEY_BASE);
}

function emptyDoc(): PoliticsDoc {
  return { drafts: {}, attempts: [], lastQuestionId: null, updatedAt: 0 };
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
    /* ignore quota */
  }
}

function normalizeDoc(raw: Partial<PoliticsDoc> | null | undefined): PoliticsDoc {
  return {
    drafts: raw?.drafts && typeof raw.drafts === "object" ? raw.drafts : {},
    attempts: Array.isArray(raw?.attempts) ? raw.attempts : [],
    lastQuestionId: typeof raw?.lastQuestionId === "string" ? raw.lastQuestionId : null,
    updatedAt: typeof raw?.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function loadDoc(): PoliticsDoc {
  return normalizeDoc(loadJSON<Partial<PoliticsDoc>>(storageKey(), {}));
}

let putTimer: ReturnType<typeof setTimeout> | null = null;

function persist(doc: PoliticsDoc, flush = false) {
  saveJSON(storageKey(), doc);
  if (!api.isLoggedIn()) return;
  if (putTimer) {
    clearTimeout(putTimer);
    putTimer = null;
  }
  const send = () => {
    void api.putPolitics(doc).catch((e) => {
      console.warn("putPolitics failed:", e);
    });
  };
  if (flush) {
    send();
    return;
  }
  putTimer = setTimeout(send, 800);
}

function newAttemptId() {
  return `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface PoliticsStore extends PoliticsDoc {
  load: () => void;
  saveDraft: (questionId: string, partId: string, text: string) => void;
  submitQuestion: (
    questionId: string,
    answers: Record<string, string>,
    checkedByPart: Record<string, string[]>
  ) => QuestionAttempt | null;
  syncFromServer: () => Promise<void>;
  replaceAll: (doc: PoliticsDoc) => void;
  clearAll: () => void;
}

export const usePolitics = create<PoliticsStore>((set, get) => ({
  ...emptyDoc(),

  load: () => set(loadDoc()),

  saveDraft: (questionId, partId, text) => {
    const now = Date.now();
    const prev = get().drafts[questionId];
    const draft: QuestionDraft = {
      questionId,
      answers: { ...(prev?.answers ?? {}), [partId]: text },
      updatedAt: now,
    };
    const doc: PoliticsDoc = {
      drafts: { ...get().drafts, [questionId]: draft },
      attempts: get().attempts,
      lastQuestionId: questionId,
      updatedAt: now,
    };
    persist(doc);
    set(doc);
  },

  submitQuestion: (questionId, answers, checkedByPart) => {
    const q = questionById(questionId);
    if (!q) return null;
    const now = Date.now();
    const parts = q.parts.map((p) => {
      const answer = (answers[p.id] || "").trim();
      const auto = scorePart(answer, p);
      const checked = checkedByPart[p.id] ?? auto.hitIds;
      const checkedSet = new Set(checked);
      const score = p.scorePoints.reduce((s, sp) => (checkedSet.has(sp.id) ? s + sp.score : s), 0);
      return {
        partId: p.id,
        answer,
        checkedIds: checked,
        autoHitIds: auto.hitIds,
        score,
        maxScore: maxOfPart(p),
        missingMaterial: auto.missingMaterial,
        at: now,
      };
    });
    const attempt: QuestionAttempt = {
      id: newAttemptId(),
      questionId,
      parts,
      score: parts.reduce((s, p) => s + p.score, 0),
      maxScore: parts.reduce((s, p) => s + p.maxScore, 0),
      at: now,
    };
    const drafts = { ...get().drafts };
    const draft: QuestionDraft = {
      questionId,
      answers,
      updatedAt: now,
    };
    drafts[questionId] = draft;
    const doc: PoliticsDoc = {
      drafts,
      attempts: [attempt, ...get().attempts.filter((a) => a.questionId !== questionId)].slice(
        0,
        MAX_ATTEMPTS
      ),
      lastQuestionId: questionId,
      updatedAt: now,
    };
    persist(doc, true);
    set(doc);
    return attempt;
  },

  syncFromServer: async () => {
    if (!api.isLoggedIn()) return;
    try {
      const r = await api.getPolitics();
      const remote = normalizeDoc(r?.politics as Partial<PoliticsDoc> | null);
      const local = loadDoc();
      if (!remote.updatedAt) {
        if (local.updatedAt > 0) {
          await api.putPolitics(local);
        }
        set(local);
        return;
      }
      if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        saveJSON(storageKey(), remote);
        set(remote);
      } else {
        await api.putPolitics(local);
        set(local);
      }
    } catch (e) {
      console.warn("politics sync failed:", e);
      set(loadDoc());
    }
  },

  replaceAll: (doc) => {
    const next = { ...emptyDoc(), ...normalizeDoc(doc), updatedAt: Date.now() };
    persist(next, true);
    set(next);
  },

  clearAll: () => {
    const doc = emptyDoc();
    doc.updatedAt = Date.now();
    persist(doc, true);
    set(doc);
  },
}));
