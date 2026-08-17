// 今日已学词表 —— 本地缓存 + 登录后以服务端 study_events 为准合并。
import { create } from "zustand";
import * as api from "@/lib/api";
import type { TodayItem } from "@/lib/api";
import { dayKey } from "@/lib/day";
import { scopedKey } from "@/lib/storageScope";
import { enqueueStudyEvent, flushPending, recomputePendingFromStorage } from "@/lib/syncQueue";

const KEY_BASE = "ew.todayLog.v1";

export type TodayLogType = "new" | "review";

export interface TodayLogItem {
  wordIdx: number;
  type: TodayLogType;
  /** 最近一次通过时间，用于「最近在上」排序 */
  at: number;
}

export interface TodayLog {
  dayKey: string;
  items: TodayLogItem[];
}

function storageKey() {
  return scopedKey(KEY_BASE);
}

function emptyLog(dk: string = dayKey()): TodayLog {
  return { dayKey: dk, items: [] };
}

function loadLog(): TodayLog {
  const today = dayKey();
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyLog(today);
    const parsed = JSON.parse(raw) as TodayLog;
    if (!parsed || parsed.dayKey !== today || !Array.isArray(parsed.items)) {
      return emptyLog(today);
    }
    return {
      dayKey: today,
      items: parsed.items.filter(
        (it) =>
          it &&
          typeof it.wordIdx === "number" &&
          (it.type === "new" || it.type === "review") &&
          typeof it.at === "number"
      ),
    };
  } catch {
    return emptyLog(today);
  }
}

function saveLog(log: TodayLog) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

/** 确保是今天；跨日则重置 */
function ensureToday(log: TodayLog): TodayLog {
  const today = dayKey();
  if (log.dayKey === today) return log;
  const next = emptyLog(today);
  saveLog(next);
  return next;
}

export interface TodayCounts {
  total: number;
  newCount: number;
  reviewCount: number;
}

function countsOf(items: TodayLogItem[]): TodayCounts {
  let newCount = 0;
  let reviewCount = 0;
  for (const it of items) {
    if (it.type === "new") newCount++;
    else reviewCount++;
  }
  return { total: items.length, newCount, reviewCount };
}

/** 最近在前；同时间按 wordIdx 稳定 */
export function sortRecentFirst(items: TodayLogItem[]): TodayLogItem[] {
  return items.slice().sort((a, b) => b.at - a.at || a.wordIdx - b.wordIdx);
}

function asLogType(eventType: string): TodayLogType | null {
  if (eventType === "new") return "new";
  if (eventType === "review") return "review";
  return null;
}

/**
 * 把服务端 /api/stats/today 的事件流压成去重词表。
 * 规则：同词「新」优先于「复」；at 取该词最晚 studied_at。
 */
export function logFromServerItems(day: string, serverItems: TodayItem[]): TodayLog {
  const map = new Map<number, TodayLogItem>();
  for (const raw of serverItems) {
    const type = asLogType(raw.event_type);
    if (!type) continue;
    const wordIdx = raw.word_idx;
    if (!Number.isSafeInteger(wordIdx) || wordIdx < 1) continue;
    const at = Date.parse(raw.studied_at) || 0;
    const prev = map.get(wordIdx);
    if (!prev) {
      map.set(wordIdx, { wordIdx, type, at });
      continue;
    }
    map.set(wordIdx, {
      wordIdx,
      type: prev.type === "new" || type === "new" ? "new" : "review",
      at: Math.max(prev.at, at),
    });
  }
  return { dayKey: day, items: Array.from(map.values()) };
}

interface TodayLogStore {
  log: TodayLog;
  /** 当日词条（已保证 dayKey 为今天） */
  items: () => TodayLogItem[];
  counts: () => TodayCounts;
  /** 通过一张卡时记录；同词去重，「新」优先于「复」；登录则入队 study_events */
  record: (wordIdx: number, type: TodayLogType) => void;
  /** 最近 N 条（最近在前） */
  recent: (limit: number) => TodayLogItem[];
  clear: () => void;
  rehydrate: () => void;
  /**
   * 跨设备同步：先刷出 pending study_events，再拉服务端今日事件，
   * **以服务端为准**覆盖本地词表。
   */
  syncFromServer: () => Promise<void>;
}

export const useTodayLog = create<TodayLogStore>((set, get) => ({
  log: loadLog(),

  items: () => {
    const log = ensureToday(get().log);
    if (log !== get().log) set({ log });
    return log.items;
  },

  counts: () => countsOf(get().items()),

  record: (wordIdx, type) => {
    if (!Number.isSafeInteger(wordIdx) || wordIdx < 1) return;
    let log = ensureToday(get().log);
    const now = Date.now();
    const idx = log.items.findIndex((it) => it.wordIdx === wordIdx);
    let items: TodayLogItem[];
    if (idx >= 0) {
      const prev = log.items[idx];
      // 「新」优先；刷新 at 便于最近排序
      const nextType: TodayLogType =
        prev.type === "new" || type === "new" ? "new" : "review";
      items = log.items.slice();
      items[idx] = { wordIdx, type: nextType, at: now };
    } else {
      items = [...log.items, { wordIdx, type, at: now }];
    }
    log = { dayKey: log.dayKey, items };
    set({ log });
    saveLog(log);
    // 登录：入队镜像服务端（失败可重试）；本地先写，最终以 sync 拉回的服务端为准
    if (api.isLoggedIn()) {
      enqueueStudyEvent({
        word_idx: wordIdx,
        event_type: type,
        quality: "good",
        day_key: log.dayKey,
        client_at: now,
      });
    }
  },

  recent: (limit) => {
    const n = Math.max(0, limit);
    return sortRecentFirst(get().items()).slice(0, n);
  },

  clear: () => {
    const next = emptyLog();
    set({ log: next });
    saveLog(next);
    // 丢掉未刷出的今日事件，避免重置后又被 flush 写回
    try {
      localStorage.removeItem(scopedKey("ew.sync.pending.studyEvents.v1"));
    } catch {
      /* ignore */
    }
    recomputePendingFromStorage();
  },

  rehydrate: () => set({ log: loadLog() }),

  syncFromServer: async () => {
    if (!api.isLoggedIn()) return;
    const today = dayKey();
    try {
      // 先把本机未推送的事件刷上，再拉权威数据
      await flushPending();
      const resp = await api.getToday(today);
      const serverLog = logFromServerItems(today, resp.items || []);
      set({ log: serverLog });
      saveLog(serverLog);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("todayLog syncFromServer failed:", message);
    }
  },
}));
