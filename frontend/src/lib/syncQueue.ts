// 登录后学习进度镜像写：批量 / 去抖 / 失败入队重试。
// cards 走 bulk；meta / settings 走各自 PUT；study_events 按词入队后 POST。

import * as api from "@/lib/api";
import type { CardDTO, StudyEventBody } from "@/lib/api";
import { scopedKey } from "@/lib/storageScope";

type PendingCards = Record<string, CardDTO>;
/** day_key:word_idx → 事件（同词同日覆盖，避免重复刷库） */
type PendingStudyEvents = Record<string, StudyEventBody>;

const BASE_CARDS = "ew.sync.pending.cards.v1";
const BASE_META = "ew.sync.pending.meta.v1";
const BASE_SETTINGS = "ew.sync.pending.settings.v1";
const BASE_STUDY_EVENTS = "ew.sync.pending.studyEvents.v1";
const BASE_STATUS = "ew.sync.status.v1";

function keyCards() {
  return scopedKey(BASE_CARDS);
}
function keyMeta() {
  return scopedKey(BASE_META);
}
function keySettings() {
  return scopedKey(BASE_SETTINGS);
}
function keyStudyEvents() {
  return scopedKey(BASE_STUDY_EVENTS);
}
function keyStatus() {
  return scopedKey(BASE_STATUS);
}

function studyEventKey(body: StudyEventBody): string {
  return `${body.day_key}:${body.word_idx}`;
}

export type SyncStatus = {
  lastOkAt: number | null;
  lastError: string | null;
  pending: boolean;
};

type Listener = (s: SyncStatus) => void;
const listeners = new Set<Listener>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let status: SyncStatus = loadStatus();

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
    /* quota */
  }
}

function loadStatus(): SyncStatus {
  return loadJSON<SyncStatus>(keyStatus(), {
    lastOkAt: null,
    lastError: null,
    pending: false,
  });
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  saveJSON(keyStatus(), status);
  listeners.forEach((fn) => fn(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function recomputePending() {
  const cards = loadJSON<PendingCards>(keyCards(), {});
  const meta = loadJSON<api.MetaDTO | null>(keyMeta(), null);
  const settings = loadJSON<Record<string, unknown> | null>(keySettings(), null);
  const studyEvents = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
  const pending =
    Object.keys(cards).length > 0 ||
    meta != null ||
    settings != null ||
    Object.keys(studyEvents).length > 0;
  setStatus({ pending });
}

/** 切换账号作用域后重算 pending / status */
export function recomputePendingFromStorage() {
  status = loadStatus();
  recomputePending();
  listeners.forEach((fn) => fn(status));
}

export function clearPendingCards() {
  try {
    localStorage.removeItem(keyCards());
  } catch {
    /* ignore */
  }
  recomputePending();
}

export function enqueueCard(idx: number, card: CardDTO) {
  if (!api.isLoggedIn()) return;
  const all = loadJSON<PendingCards>(keyCards(), {});
  all[String(idx)] = card;
  saveJSON(keyCards(), all);
  recomputePending();
  scheduleFlush();
}

export function enqueueMeta(meta: api.MetaDTO) {
  if (!api.isLoggedIn()) return;
  saveJSON(keyMeta(), meta);
  recomputePending();
  scheduleFlush();
}

export function enqueueSettings(settings: Record<string, unknown>) {
  if (!api.isLoggedIn()) return;
  saveJSON(keySettings(), settings);
  recomputePending();
  scheduleFlush();
}

/** 学习事件入队（离线可重试）；同日同词覆盖，减少重复 INSERT */
export function enqueueStudyEvent(body: StudyEventBody) {
  if (!api.isLoggedIn()) return;
  const all = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
  all[studyEventKey(body)] = body;
  saveJSON(keyStudyEvents(), all);
  recomputePending();
  scheduleFlush();
}

function scheduleFlush(delayMs = 800) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, delayMs);
}

/** 立即刷出待同步项（登录后 / 上线 / 定时） */
export async function flushPending(): Promise<void> {
  if (!api.isLoggedIn() || flushing) return;
  flushing = true;
  try {
    let error: string | null = null;

    const cards = loadJSON<PendingCards>(keyCards(), {});
    if (Object.keys(cards).length > 0) {
      try {
        await api.bulkCards(cards);
        localStorage.removeItem(keyCards());
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const meta = loadJSON<api.MetaDTO | null>(keyMeta(), null);
    if (meta) {
      try {
        await api.putMeta(meta);
        localStorage.removeItem(keyMeta());
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const settings = loadJSON<Record<string, unknown> | null>(keySettings(), null);
    if (settings) {
      try {
        await api.putSettings(settings);
        localStorage.removeItem(keySettings());
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const studyEvents = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
    const eventKeys = Object.keys(studyEvents);
    if (eventKeys.length > 0) {
      const remaining: PendingStudyEvents = { ...studyEvents };
      for (const k of eventKeys) {
        const body = studyEvents[k];
        try {
          await api.postStudyEvent(body);
          delete remaining[k];
        } catch (e: unknown) {
          error = e instanceof Error ? e.message : String(e);
          // 后续事件仍尝试；失败项留在 remaining
        }
      }
      if (Object.keys(remaining).length === 0) {
        try {
          localStorage.removeItem(keyStudyEvents());
        } catch {
          /* ignore */
        }
      } else {
        saveJSON(keyStudyEvents(), remaining);
      }
    }

    const stillCards = loadJSON<PendingCards>(keyCards(), {});
    const stillMeta = loadJSON<api.MetaDTO | null>(keyMeta(), null);
    const stillSettings = loadJSON<Record<string, unknown> | null>(keySettings(), null);
    const stillEvents = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
    const pending =
      Object.keys(stillCards).length > 0 ||
      stillMeta != null ||
      stillSettings != null ||
      Object.keys(stillEvents).length > 0;

    if (error) {
      setStatus({ lastError: error, pending });
    } else {
      setStatus({ lastError: null, lastOkAt: Date.now(), pending });
    }
  } finally {
    flushing = false;
  }
}

// 启动时若有残留，标记 pending
recomputePending();
