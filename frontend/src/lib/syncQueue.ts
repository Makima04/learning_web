// 登录后学习进度镜像写：批量 / 去抖 / 失败入队重试。
// cards 走 bulk；meta / settings / journal 走各自 PUT；study_events 按词入队后 POST。

import * as api from "@/lib/api";
import type { CardDTO, JournalPayload, StudyEventBody, WordListItemDTO } from "@/lib/api";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";

const STUDY_EVENT_CHUNK = 200;
const WORD_LIST_CHUNK = 500;

type PendingCards = Record<string, CardDTO>;
/** day_key:word_idx → 事件（同词同日覆盖，避免重复刷库） */
type PendingStudyEvents = Record<string, StudyEventBody>;
type PendingJournal = { journal: JournalPayload; updated_at: number };
type PendingWordLists = Record<string, WordListItemDTO>;

const BASE_CARDS = "ew.sync.pending.cards.v1";
const BASE_META = "ew.sync.pending.meta.v1";
const BASE_SETTINGS = "ew.sync.pending.settings.v1";
const BASE_STUDY_EVENTS = "ew.sync.pending.studyEvents.v1";
const BASE_JOURNAL = "ew.sync.pending.journal.v1";
const BASE_WORD_LISTS = "ew.sync.pending.wordLists.v1";
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
function keyWordLists() {
  return scopedKey(BASE_WORD_LISTS);
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
let flushInFlight: Promise<SyncStatus> | null = null;
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
  const wordLists = loadJSON<PendingWordLists>(keyWordLists(), {});
  const pending =
    Object.keys(cards).length > 0 ||
    meta != null ||
    settings != null ||
    Object.keys(studyEvents).length > 0 ||
    journal != null ||
    Object.keys(wordLists).length > 0;
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
export function enqueueWordListItem(idx: number, item: WordListItemDTO) {
  enqueueWordLists({ [String(idx)]: item });
}

export function enqueueWordLists(items: Record<string, WordListItemDTO>) {
  if (!api.isLoggedIn()) return;
  const all = loadJSON<PendingWordLists>(keyWordLists(), {});
  for (const [k, v] of Object.entries(items)) {
    const prev = all[k];
    if (!prev || (v.updated_at || 0) >= (prev.updated_at || 0)) all[k] = v;
  }
  saveJSON(keyWordLists(), all);
  recomputePending();
  scheduleFlush();
}

export function clearPendingWordLists() {
  try {
    localStorage.removeItem(keyWordLists());
  } catch {
    /* ignore */
  }
  recomputePending();
}

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
  const epoch = getScopeEpoch();
  // 登出会切作用域：读写都钉在本轮开始时的 key 上，避免写进访客缓存
  const cardsKey = keyCards();
  const metaKey = keyMeta();
  const settingsKey = keySettings();
  const journalKey = keyJournal();
  const eventsKey = keyStudyEvents();
  const wordListsKey = keyWordLists();
  const statusKey = keyStatus();

  const cards = loadJSON<PendingCards>(cardsKey, {});
  if (Object.keys(cards).length > 0) {
    try {
      await api.bulkCards(cards);
      const current = loadJSON<PendingCards>(cardsKey, {});
      const leftover: PendingCards = {};
      for (const [k, v] of Object.entries(current)) {
        const sent = cards[k];
        if (!sent || (v.updated_at || 0) > (sent.updated_at || 0)) leftover[k] = v;
      }
      if (Object.keys(leftover).length === 0) localStorage.removeItem(cardsKey);
      else saveJSON(cardsKey, leftover);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const meta = loadJSON<api.MetaDTO | null>(metaKey, null);
  if (meta) {
    try {
      await api.putMeta(meta);
      const current = loadJSON<api.MetaDTO | null>(metaKey, null);
      if (!current || sameJson(current, meta)) localStorage.removeItem(metaKey);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const settings = loadJSON<Record<string, unknown> | null>(settingsKey, null);
  if (settings) {
    try {
      await api.putSettings(settings);
      const current = loadJSON<Record<string, unknown> | null>(settingsKey, null);
      if (!current || sameJson(current, settings)) localStorage.removeItem(settingsKey);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const journal = loadJSON<PendingJournal | null>(journalKey, null);
  if (journal) {
    try {
      const res = await api.putJournal(journal.journal, journal.updated_at);
      const current = loadJSON<PendingJournal | null>(journalKey, null);
      if (current && (current.updated_at || 0) > journal.updated_at) {
        // flush 期间又写入了更新的本地快照，留给下一轮
      } else if (res.skipped && res.journal) {
        try {
          localStorage.removeItem(journalKey);
        } catch {
          /* ignore */
        }
        if (stillInScope(epoch)) onJournalSkipped?.(res.journal, res.updated_at);
      } else {
        try {
          localStorage.removeItem(journalKey);
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const studyEvents = loadJSON<PendingStudyEvents>(eventsKey, {});
  const eventKeys = Object.keys(studyEvents);
  if (eventKeys.length > 0) {
    const postedOk = new Set<string>();
    for (let i = 0; i < eventKeys.length; i += STUDY_EVENT_CHUNK) {
      const chunkKeys = eventKeys.slice(i, i + STUDY_EVENT_CHUNK);
      const chunk = chunkKeys.map((k) => studyEvents[k]);
      try {
        await api.postStudyEventsBulk(chunk);
        for (const k of chunkKeys) postedOk.add(k);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    const current = loadJSON<PendingStudyEvents>(eventsKey, {});
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
        localStorage.removeItem(eventsKey);
      } catch {
        /* ignore */
      }
    } else {
      saveJSON(eventsKey, remaining);
    }
  }

  const wordLists = loadJSON<PendingWordLists>(wordListsKey, {});
  const wordListKeys = Object.keys(wordLists);
  if (wordListKeys.length > 0) {
    const postedOk = new Set<string>();
    for (let i = 0; i < wordListKeys.length; i += WORD_LIST_CHUNK) {
      const chunkKeys = wordListKeys.slice(i, i + WORD_LIST_CHUNK);
      const chunk: PendingWordLists = {};
      for (const k of chunkKeys) chunk[k] = wordLists[k];
      try {
        await api.bulkWordLists(chunk);
        for (const k of chunkKeys) postedOk.add(k);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    const current = loadJSON<PendingWordLists>(wordListsKey, {});
    const leftover: PendingWordLists = {};
    for (const [k, v] of Object.entries(current)) {
      if (!postedOk.has(k)) {
        leftover[k] = v;
        continue;
      }
      const sent = wordLists[k];
      if (!sent || (v.updated_at || 0) > (sent.updated_at || 0)) leftover[k] = v;
    }
    if (Object.keys(leftover).length === 0) {
      try {
        localStorage.removeItem(wordListsKey);
      } catch {
        /* ignore */
      }
    } else {
      saveJSON(wordListsKey, leftover);
    }
  }

  const stillCards = loadJSON<PendingCards>(cardsKey, {});
  const stillMeta = loadJSON<api.MetaDTO | null>(metaKey, null);
  const stillSettings = loadJSON<Record<string, unknown> | null>(settingsKey, null);
  const stillEvents = loadJSON<PendingStudyEvents>(eventsKey, {});
  const stillJournal = loadJSON<PendingJournal | null>(journalKey, null);
  const stillWordLists = loadJSON<PendingWordLists>(wordListsKey, {});
  const pending =
    Object.keys(stillCards).length > 0 ||
    stillMeta != null ||
    stillSettings != null ||
    Object.keys(stillEvents).length > 0 ||
    stillJournal != null ||
    Object.keys(stillWordLists).length > 0;

  if (!stillInScope(epoch)) return;

  const next: SyncStatus = error
    ? { ...status, lastError: error, pending }
    : { ...status, lastError: null, lastOkAt: Date.now(), pending };
  status = next;
  saveJSON(statusKey, status);
  listeners.forEach((fn) => fn(status));
}

/** 立即刷出待同步项（登录后 / 上线 / 定时）。并发调用共用同一次 flush。 */
export function flushPending(): Promise<SyncStatus> {
  if (!api.isLoggedIn()) return Promise.resolve(getSyncStatus());
  if (flushInFlight) return flushInFlight;

  const epoch = getScopeEpoch();
  flushInFlight = (async () => {
    await flushOnce();
    // 本轮期间新入队且上一轮无错误：再刷一轮（覆盖「刚过关就被 sync 撞上」）
    if (
      api.isLoggedIn() &&
      stillInScope(epoch) &&
      getSyncStatus().pending &&
      !getSyncStatus().lastError
    ) {
      await flushOnce();
    }
    return getSyncStatus();
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

// 启动时若有残留，标记 pending
recomputePending();
