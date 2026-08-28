// 知识图谱用户进度：本地即时写 + 登录后镜像 /api/kg（服务端权威）
import { create } from "zustand";
import * as api from "@/lib/api";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";
import { applyItemMark, applyMarkToKp, markCovered } from "@/lib/kg/mark";
import { journalCopyForKp } from "@/lib/kg/journalBridge";
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
  papers: PredictPaper[];
  /** 文档版本 ms */
  updatedAt: number;
}

function emptyDoc(): KgDoc {
  return { states: {}, itemMarks: [], papers: [], updatedAt: 0 };
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
    papers: raw.papers ?? [],
    updatedAt: raw.updatedAt ?? 0,
  };
}

function persist(doc: KgDoc) {
  saveJSON(storageKey(), doc);
  if (api.isLoggedIn()) {
    void api.putKg(doc).catch((e) => {
      console.warn("putKg failed:", e);
    });
  }
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
  syncFromServer: () => Promise<void>;
  replaceAll: (doc: KgDoc) => void;
  clearAll: () => void;
}

/** 图谱已学 → 学习日志入队（动态 import 避免 store 循环） */
function enqueueJournalForKp(kpId: string) {
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
      { itemId, mark, weakKpIds, ts: now },
    ].slice(-500);
    const doc: KgDoc = { ...get(), states, itemMarks, updatedAt: now };
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
          await api.putKg(local);
        }
        if (!stillInScope(epoch)) return;
        set(local);
        return;
      }
      // 服务端权威：远端更新则覆盖；否则推本地
      if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        const doc: KgDoc = {
          states: remote.states ?? {},
          itemMarks: remote.itemMarks ?? [],
          papers: remote.papers ?? [],
          updatedAt: remote.updatedAt ?? 0,
        };
        saveJSON(storageKey(), doc);
        set(doc);
      } else {
        await api.putKg(local);
        if (!stillInScope(epoch)) return;
        set(local);
      }
    } catch (e) {
      console.warn("kg sync failed:", e);
      if (stillInScope(epoch)) set(loadDoc());
    }
  },

  replaceAll: (doc) => {
    const next = { ...emptyDoc(), ...doc, updatedAt: Date.now() };
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
