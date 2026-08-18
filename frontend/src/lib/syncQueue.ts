// 登录后学习进度镜像写：批量 / 去抖 / 失败入队重试。
// cards 走 bulk；meta / settings / journal 走各自 PUT；study_events 按词入队后 POST。

import * as api from "@/lib/api";
import type { CardDTO, JournalPayload, StudyEventBody } from "@/lib/api";
import { scopedKey } from "@/lib/storageScope";

type PendingCards = Record<string, CardDTO>;
/** day_key:word_idx → 事件（同词同日覆盖，避免重复刷库） */
type PendingStudyEvents = Record<string, StudyEventBody>;
type PendingJournal = { journal: JournalPayload; updated_at: number };

const BASE_CARDS = "ew.sync.pending.cards.v1";
const BASE_META = "ew.sync.pending.meta.v1";
const BASE_SETTINGS = "ew.sync.pending.settings.v1";
const BASE_STUDY_EVENTS = "ew.sync.pending.studyEvents.v1";
const BASE_JOURNAL = "ew.sync.pending.journal.v1";
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
function keyJournal() {
  return scopedKey(BASE_JOURNAL);
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
let flushInFlight: Promise<void> | null = null;
let status: SyncStatus = loadStatus();
let onJournalSkipped:
  | ((remote: JournalPayload, updatedAt: number) => void)
  | null = null;

/** PUT 被服务端判 stale 时回调，供 journal store 做条目级合并 */
export function setOnJournalSkipped(
  fn: ((remote: JournalPayload, updatedAt: number) => void) | null
) {
  onJournalSkipped = fn;
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
  const journal = loadJSON<PendingJournal | null>(keyJournal(), null);
  const pending =
    Object.keys(cards).length > 0 ||
    meta != null ||
    settings != null ||
    Object.keys(studyEvents).length > 0 ||
    journal != null;
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

/** 学习事件入队（离线可重试）；同日同词覆盖，「新」优先于「复」 */
export function enqueueStudyEvent(body: StudyEventBody) {
  if (!api.isLoggedIn()) return;
  const all = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
  const key = studyEventKey(body);
  const prev = all[key];
  if (prev) {
    const type: StudyEventBody["event_type"] =
      prev.event_type === "new" || body.event_type === "new" ? "new" : body.event_type;
    all[key] = {
      ...body,
      event_type: type,
      client_at: Math.max(prev.client_at || 0, body.client_at || 0),
    };
  } else {
    all[key] = body;
  }
  saveJSON(keyStudyEvents(), all);
  recomputePending();
  scheduleFlush();
}

/** 学习日志整包入队；失败可重试。同账号只保留最新一版。 */
export function enqueueJournal(journal: JournalPayload, updatedAt: number) {
  if (!api.isLoggedIn()) return;
  const prev = loadJSON<PendingJournal | null>(keyJournal(), null);
  if (prev && (prev.updated_at || 0) > updatedAt) return;
  saveJSON(keyJournal(), { journal, updated_at: updatedAt });
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

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function flushOnce(): Promise<void> {
  let error: string | null = null;

  const cards = loadJSON<PendingCards>(keyCards(), {});
  if (Object.keys(cards).length > 0) {
    try {
      await api.bulkCards(cards);
      const current = loadJSON<PendingCards>(keyCards(), {});
      const leftover: PendingCards = {};
      for (const [k, v] of Object.entries(current)) {
        const sent = cards[k];
        if (!sent || (v.updated_at || 0) > (sent.updated_at || 0)) leftover[k] = v;
      }
      if (Object.keys(leftover).length === 0) localStorage.removeItem(keyCards());
      else saveJSON(keyCards(), leftover);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const meta = loadJSON<api.MetaDTO | null>(keyMeta(), null);
  if (meta) {
    try {
      await api.putMeta(meta);
      const current = loadJSON<api.MetaDTO | null>(keyMeta(), null);
      if (!current || sameJson(current, meta)) localStorage.removeItem(keyMeta());
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const settings = loadJSON<Record<string, unknown> | null>(keySettings(), null);
  if (settings) {
    try {
      await api.putSettings(settings);
      const current = loadJSON<Record<string, unknown> | null>(keySettings(), null);
      if (!current || sameJson(current, settings)) localStorage.removeItem(keySettings());
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const journal = loadJSON<PendingJournal | null>(keyJournal(), null);
  if (journal) {
    try {
      const res = await api.putJournal(journal.journal, journal.updated_at);
      const current = loadJSON<PendingJournal | null>(keyJournal(), null);
      if (current && (current.updated_at || 0) > journal.updated_at) {
        // flush 期间又写入了更新的本地快照，留给下一轮
      } else if (res.skipped && res.journal) {
        try {
          localStorage.removeItem(keyJournal());
        } catch {
          /* ignore */
        }
        onJournalSkipped?.(res.journal, res.updated_at);
      } else {
        try {
          localStorage.removeItem(keyJournal());
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const studyEvents = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
  const eventKeys = Object.keys(studyEvents);
  if (eventKeys.length > 0) {
    const postedOk = new Set<string>();
    for (const k of eventKeys) {
      const body = studyEvents[k];
      try {
        await api.postStudyEvent(body);
        postedOk.add(k);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    const current = loadJSON<PendingStudyEvents>(keyStudyEvents(), {});
    const remaining: PendingStudyEvents = {};
    for (const [k, now] of Object.entries(current)) {
      if (!postedOk.has(k)) {
        remaining[k] = now;
        continue;
      }
      const sent = studyEvents[k];
      // flush 期间同 key 又入了更新事件：保留
      if (
        sent &&
        (now.client_at || 0) === (sent.client_at || 0) &&
        now.event_type === sent.event_type
      ) {
        continue;
      }
      remaining[k] = now;
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
  const stillJournal = loadJSON<PendingJournal | null>(keyJournal(), null);
  const pending =
    Object.keys(stillCards).length > 0 ||
    stillMeta != null ||
    stillSettings != null ||
    Object.keys(stillEvents).length > 0 ||
    stillJournal != null;

  if (error) {
    setStatus({ lastError: error, pending });
  } else {
    setStatus({ lastError: null, lastOkAt: Date.now(), pending });
  }
}

/** 立即刷出待同步项（登录后 / 上线 / 定时）。并发调用共用同一次 flush。 */
export function flushPending(): Promise<void> {
  if (!api.isLoggedIn()) return Promise.resolve();
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    await flushOnce();
    // 本轮期间新入队且上一轮无错误：再刷一轮（覆盖「刚过关就被 sync 撞上」）
    if (api.isLoggedIn() && getSyncStatus().pending && !getSyncStatus().lastError) {
      await flushOnce();
    }
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

// 启动时若有残留，标记 pending
recomputePending();
