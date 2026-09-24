// 登录后学习进度镜像写：批量 / 去抖 / 失败入队重试。
// cards、生词表、学习日志按条 bulk；meta / settings 走 PUT；study_events 按词入队后 POST。

import * as api from "@/lib/api";
import type {
  CardDTO,
  JournalBulkBody,
  JournalCategorySyncRow,
  JournalEntrySyncRow,
  JournalLogSyncRow,
  JournalWeeklySyncRow,
  StudyEventBody,
  WordListItemDTO,
} from "@/lib/api";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";

const STUDY_EVENT_CHUNK = 200;
const WORD_LIST_CHUNK = 500;
/** POST /api/journal/bulk 四类合计上限 */
const JOURNAL_CHUNK = 2000;

type PendingCards = Record<string, CardDTO>;
/** day_key:word_idx → 事件（同词同日覆盖，避免重复刷库） */
type PendingStudyEvents = Record<string, StudyEventBody>;
type PendingJournal = {
  entries: Record<string, JournalEntrySyncRow>;
  logs: Record<string, JournalLogSyncRow>;
  categories: Record<string, JournalCategorySyncRow>;
  weeklies: Record<string, JournalWeeklySyncRow>;
};
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
  const journal = loadPendingJournal(keyJournal());
  const wordLists = loadJSON<PendingWordLists>(keyWordLists(), {});
  const pending =
    Object.keys(cards).length > 0 ||
    meta != null ||
    settings != null ||
    Object.keys(studyEvents).length > 0 ||
    journalPendingCount(journal) > 0 ||
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

function emptyPendingJournal(): PendingJournal {
  return { entries: {}, logs: {}, categories: {}, weeklies: {} };
}

function journalPendingCount(pending: PendingJournal): number {
  return (
    Object.keys(pending.entries).length +
    Object.keys(pending.logs).length +
    Object.keys(pending.categories).length +
    Object.keys(pending.weeklies).length
  );
}

function keepNewerRow<T extends { updated_at: number; deleted?: boolean }>(
  prev: T | undefined,
  next: T
): T {
  if (!prev) return next;
  if (next.updated_at > prev.updated_at) return next;
  if (next.updated_at < prev.updated_at) return prev;
  // 同一时刻：后写入的为准；墓碑优先于正文，避免删了又被补回
  if (next.deleted && !prev.deleted) return next;
  if (prev.deleted && !next.deleted) return prev;
  return next;
}

/** 旧版整包队列展开成按条，避免升级后把待传日志丢掉。 */
function migrateOldJournalPending(raw: {
  journal?: Record<string, unknown>;
  updated_at?: number;
}): PendingJournal {
  const journal = raw.journal || {};
  const docAt = typeof raw.updated_at === "number" && raw.updated_at > 0 ? raw.updated_at : 1;
  const pending = emptyPendingJournal();
  const tombAt = new Map<string, number>();
  const deleted = Array.isArray(journal.deleted) ? journal.deleted : [];
  for (const item of deleted) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; at?: unknown };
    if (typeof row.id !== "string" || !row.id) continue;
    tombAt.set(row.id, typeof row.at === "number" && row.at > 0 ? row.at : docAt);
  }
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  for (const item of entries) {
    if (!item || typeof item !== "object") continue;
    const entry = item as { id?: unknown; updatedAt?: unknown };
    if (typeof entry.id !== "string" || !entry.id) continue;
    const ts =
      typeof entry.updatedAt === "number" && entry.updatedAt > 0 ? entry.updatedAt : docAt;
    const tomb = tombAt.get(entry.id);
    if (tomb != null && tomb >= ts) continue;
    pending.entries[entry.id] = {
      id: entry.id,
      updated_at: ts,
      deleted: false,
      entry: item as JournalEntrySyncRow["entry"],
    };
  }
  for (const [id, at] of tombAt) {
    const prev = pending.entries[id];
    if (prev && prev.updated_at > at) continue;
    pending.entries[id] = { id, updated_at: at > 0 ? at : docAt, deleted: true };
  }
  const logs = Array.isArray(journal.logs) ? journal.logs : [];
  for (const item of logs) {
    if (!item || typeof item !== "object") continue;
    const log = item as { id?: unknown; entryId?: unknown; updatedAt?: unknown };
    if (typeof log.id !== "string" || !log.id) continue;
    const entryId = typeof log.entryId === "string" ? log.entryId : "";
    const ts = typeof log.updatedAt === "number" && log.updatedAt > 0 ? log.updatedAt : docAt;
    const tomb = entryId ? tombAt.get(entryId) : undefined;
    if (tomb != null && ts <= tomb) {
      pending.logs[log.id] = {
        id: log.id,
        entry_id: entryId,
        updated_at: tomb,
        deleted: true,
      };
    } else {
      pending.logs[log.id] = {
        id: log.id,
        entry_id: entryId,
        updated_at: ts,
        deleted: false,
        log: item as JournalLogSyncRow["log"],
      };
    }
  }
  const categories = Array.isArray(journal.categories) ? journal.categories : [];
  for (const item of categories) {
    if (!item || typeof item !== "object") continue;
    const category = item as { id?: unknown; updatedAt?: unknown };
    if (typeof category.id !== "string" || !category.id) continue;
    const ts =
      typeof category.updatedAt === "number" && category.updatedAt > 0
        ? category.updatedAt
        : docAt;
    pending.categories[category.id] = {
      id: category.id,
      updated_at: ts,
      deleted: false,
      category: item as JournalCategorySyncRow["category"],
    };
  }
  const weeklies = Array.isArray(journal.weeklies) ? journal.weeklies : [];
  for (const item of weeklies) {
    if (!item || typeof item !== "object") continue;
    const weekly = item as { weekKey?: unknown; note?: unknown; updatedAt?: unknown };
    if (typeof weekly.weekKey !== "string" || !weekly.weekKey) continue;
    const ts =
      typeof weekly.updatedAt === "number" && weekly.updatedAt > 0 ? weekly.updatedAt : docAt;
    pending.weeklies[weekly.weekKey] = {
      week_key: weekly.weekKey,
      note: typeof weekly.note === "string" ? weekly.note : "",
      updated_at: ts,
    };
  }
  return pending;
}

function normalizePendingJournal(raw: unknown): PendingJournal {
  const pending = emptyPendingJournal();
  if (!raw || typeof raw !== "object") return pending;
  const obj = raw as Partial<PendingJournal>;
  if (obj.entries && typeof obj.entries === "object") {
    for (const row of Object.values(obj.entries)) {
      if (!row || typeof row.id !== "string" || !row.id) continue;
      pending.entries[row.id] = keepNewerRow(pending.entries[row.id], row);
    }
  }
  if (obj.logs && typeof obj.logs === "object") {
    for (const row of Object.values(obj.logs)) {
      if (!row || typeof row.id !== "string" || !row.id) continue;
      pending.logs[row.id] = keepNewerRow(pending.logs[row.id], row);
    }
  }
  if (obj.categories && typeof obj.categories === "object") {
    for (const row of Object.values(obj.categories)) {
      if (!row || typeof row.id !== "string" || !row.id) continue;
      pending.categories[row.id] = keepNewerRow(pending.categories[row.id], row);
    }
  }
  if (obj.weeklies && typeof obj.weeklies === "object") {
    for (const row of Object.values(obj.weeklies)) {
      if (!row || typeof row.week_key !== "string" || !row.week_key) continue;
      pending.weeklies[row.week_key] = keepNewerRow(pending.weeklies[row.week_key], row);
    }
  }
  return pending;
}

function loadPendingJournal(key: string): PendingJournal {
  const raw = loadJSON<unknown>(key, null);
  if (!raw || typeof raw !== "object") return emptyPendingJournal();
  const obj = raw as { journal?: unknown; entries?: unknown };
  if (obj.journal && typeof obj.journal === "object" && !obj.entries) {
    const migrated = migrateOldJournalPending(
      raw as { journal?: Record<string, unknown>; updated_at?: number }
    );
    saveJSON(key, migrated);
    return migrated;
  }
  return normalizePendingJournal(raw);
}

function acceptJournalRow<T extends { updated_at: number; deleted?: boolean }>(
  prev: T | undefined,
  next: T
): boolean {
  if (!prev) return true;
  if (next.updated_at > prev.updated_at) return true;
  if (next.updated_at < prev.updated_at) return false;
  if (next.deleted && !prev.deleted) return true;
  if (prev.deleted && !next.deleted) return false;
  return true;
}

/** 学习日志按条入队。同一 id 只留 updated_at 更新的一条，失败可重试。 */
export function enqueueJournalRows(parts: Partial<JournalBulkBody>) {
  if (!api.isLoggedIn()) return;
  const key = keyJournal();
  const all = loadPendingJournal(key);
  let changed = false;
  for (const row of parts.entries || []) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    if (!acceptJournalRow(all.entries[row.id], row)) continue;
    all.entries[row.id] = row.deleted
      ? { id: row.id, updated_at: row.updated_at, deleted: true }
      : row;
    changed = true;
  }
  for (const row of parts.logs || []) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    if (!acceptJournalRow(all.logs[row.id], row)) continue;
    all.logs[row.id] = row.deleted
      ? {
          id: row.id,
          entry_id: row.entry_id,
          updated_at: row.updated_at,
          deleted: true,
        }
      : row;
    changed = true;
  }
  for (const row of parts.categories || []) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    if (!acceptJournalRow(all.categories[row.id], row)) continue;
    all.categories[row.id] = row.deleted
      ? { id: row.id, updated_at: row.updated_at, deleted: true }
      : row;
    changed = true;
  }
  for (const row of parts.weeklies || []) {
    if (!row || typeof row.week_key !== "string" || !row.week_key) continue;
    if (!acceptJournalRow(all.weeklies[row.week_key], row)) continue;
    all.weeklies[row.week_key] = row;
    changed = true;
  }
  if (!changed) return;
  saveJSON(key, all);
  recomputePending();
  scheduleFlush();
}

export function clearPendingJournal() {
  try {
    localStorage.removeItem(keyJournal());
  } catch {
    /* ignore */
  }
  recomputePending();
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

  const journal = loadPendingJournal(journalKey);
  if (journalPendingCount(journal) > 0) {
    type Piece =
      | { kind: "entries"; id: string }
      | { kind: "logs"; id: string }
      | { kind: "categories"; id: string }
      | { kind: "weeklies"; id: string };
    const pieces: Piece[] = [
      ...Object.keys(journal.entries).map((id) => ({ kind: "entries" as const, id })),
      ...Object.keys(journal.logs).map((id) => ({ kind: "logs" as const, id })),
      ...Object.keys(journal.categories).map((id) => ({ kind: "categories" as const, id })),
      ...Object.keys(journal.weeklies).map((id) => ({ kind: "weeklies" as const, id })),
    ];
    const posted = new Set<string>();
    for (let i = 0; i < pieces.length; i += JOURNAL_CHUNK) {
      const slice = pieces.slice(i, i + JOURNAL_CHUNK);
      const body: JournalBulkBody = { entries: [], logs: [], categories: [], weeklies: [] };
      for (const piece of slice) {
        if (piece.kind === "entries") body.entries.push(journal.entries[piece.id]);
        else if (piece.kind === "logs") body.logs.push(journal.logs[piece.id]);
        else if (piece.kind === "categories") body.categories.push(journal.categories[piece.id]);
        else body.weeklies.push(journal.weeklies[piece.id]);
      }
      try {
        await api.bulkJournal(body);
        for (const piece of slice) posted.add(`${piece.kind}:${piece.id}`);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    const current = loadPendingJournal(journalKey);
    const leftover = emptyPendingJournal();
    for (const [id, row] of Object.entries(current.entries)) {
      if (!posted.has(`entries:${id}`)) leftover.entries[id] = row;
      else {
        const sent = journal.entries[id];
        if (!sent || row.updated_at > sent.updated_at) leftover.entries[id] = row;
      }
    }
    for (const [id, row] of Object.entries(current.logs)) {
      if (!posted.has(`logs:${id}`)) leftover.logs[id] = row;
      else {
        const sent = journal.logs[id];
        if (!sent || row.updated_at > sent.updated_at) leftover.logs[id] = row;
      }
    }
    for (const [id, row] of Object.entries(current.categories)) {
      if (!posted.has(`categories:${id}`)) leftover.categories[id] = row;
      else {
        const sent = journal.categories[id];
        if (!sent || row.updated_at > sent.updated_at) leftover.categories[id] = row;
      }
    }
    for (const [id, row] of Object.entries(current.weeklies)) {
      if (!posted.has(`weeklies:${id}`)) leftover.weeklies[id] = row;
      else {
        const sent = journal.weeklies[id];
        if (!sent || row.updated_at > sent.updated_at) leftover.weeklies[id] = row;
      }
    }
    if (journalPendingCount(leftover) === 0) {
      try {
        localStorage.removeItem(journalKey);
      } catch {
        /* ignore */
      }
    } else {
      saveJSON(journalKey, leftover);
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
  const stillJournal = loadPendingJournal(journalKey);
  const stillWordLists = loadJSON<PendingWordLists>(wordListsKey, {});
  const pending =
    Object.keys(stillCards).length > 0 ||
    stillMeta != null ||
    stillSettings != null ||
    Object.keys(stillEvents).length > 0 ||
    journalPendingCount(stillJournal) > 0 ||
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
