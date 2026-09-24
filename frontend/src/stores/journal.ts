// journal store —— 学习日志 / 复盘板。
// 本地缓存 ew.journal.v1。未登录只写本机。
// 登录后按条同步：同一 id 比较 updated_at，较新者获胜。删除是墓碑，不会整包覆盖，
// 也不会把「另一份里多出来、但已被更新墓碑删掉」的 id 补回来。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import {
  DEFAULT_CATEGORIES,
  addDays,
  computeWeekStats,
  mergeLwwRows,
  newEntryDefaults,
  planDueEntries,
  scheduleAfterReview,
  sortDueEntries,
  unionLogTombstones,
  unionTombstones,
  weekKeyOf,
  type JournalCategory,
  type JournalEntry,
  type JournalKind,
  type JournalLogTombstone,
  type JournalTombstone,
  type LwwRow,
  type ReviewLog,
  type ReviewResult,
  type WeekStats,
  type WeeklySummary,
} from "@/lib/journal";
import { dayKeyToLocalMs, mapReviewToMark } from "@/lib/kg/journalBridge";
import { clearPendingJournal, enqueueJournalRows } from "@/lib/syncQueue";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";

const KEY_BASE = "ew.journal.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
}

export interface JournalSnapshot {
  categories: JournalCategory[];
  entries: JournalEntry[];
  logs: ReviewLog[];
  weeklies: WeeklySummary[];
  /** 已删除条目。刷新后仍在，同步时挡住把刚删的笔记补回 */
  deleted: JournalTombstone[];
  /** 已删除的复盘记录 */
  deletedLogs: JournalLogTombstone[];
  /** 已删除的分类 */
  deletedCategories: JournalTombstone[];
  /** 服务端清空水位；不晚于它的本地条不再上传 */
  resetAt: number;
  updatedAt: number;
}

function emptySnapshot(): JournalSnapshot {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    entries: [],
    logs: [],
    weeklies: [],
    deleted: [],
    deletedLogs: [],
    deletedCategories: [],
    resetAt: 0,
    updatedAt: 0,
  };
}

function finiteAt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

/** 正文不比墓碑新就丢掉；改过的条目留着，并撤掉更旧的墓碑。 */
function reconcileEntries(
  entries: JournalEntry[],
  deleted: JournalTombstone[]
): { entries: JournalEntry[]; deleted: JournalTombstone[] } {
  const tombAt = new Map<string, number>();
  for (const tomb of deleted) {
    const prev = tombAt.get(tomb.id);
    if (prev == null || tomb.at > prev) tombAt.set(tomb.id, tomb.at);
  }
  const live: JournalEntry[] = [];
  for (const entry of entries) {
    const at = tombAt.get(entry.id);
    if (at != null && at >= (entry.updatedAt || 0)) continue;
    live.push(entry);
    if (at != null) tombAt.delete(entry.id);
  }
  return {
    entries: live,
    deleted: unionTombstones([...tombAt.entries()].map(([id, at]) => ({ id, at }))),
  };
}

function reconcileLogs(
  logs: ReviewLog[],
  deletedLogs: JournalLogTombstone[]
): { logs: ReviewLog[]; deletedLogs: JournalLogTombstone[] } {
  const tombs = new Map<string, JournalLogTombstone>();
  for (const tomb of deletedLogs) {
    const prev = tombs.get(tomb.id);
    if (!prev || tomb.at >= prev.at) tombs.set(tomb.id, tomb);
  }
  const live: ReviewLog[] = [];
  for (const log of logs) {
    const tomb = tombs.get(log.id);
    const at = log.updatedAt || 0;
    if (tomb && tomb.at >= at) continue;
    live.push(log);
    if (tomb && at > tomb.at) tombs.delete(log.id);
  }
  return { logs: live, deletedLogs: unionLogTombstones([...tombs.values()]) };
}

function loadCategories(
  raw: JournalCategory[] | undefined,
  deletedCategories: JournalTombstone[]
): JournalCategory[] {
  if (raw && raw.length) return raw;
  if (deletedCategories.length) {
    return DEFAULT_CATEGORIES.filter((c) => !deletedCategories.some((t) => t.id === c.id)).map(
      (c) => ({ ...c })
    );
  }
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}

function load(): JournalSnapshot {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as Partial<JournalSnapshot>;
    const deletedCategories = unionTombstones(
      Array.isArray(parsed.deletedCategories) ? parsed.deletedCategories : []
    );
    const entrySplit = reconcileEntries(
      Array.isArray(parsed.entries) ? parsed.entries : [],
      unionTombstones(Array.isArray(parsed.deleted) ? parsed.deleted : [])
    );
    const logSplit = reconcileLogs(
      Array.isArray(parsed.logs) ? parsed.logs : [],
      unionLogTombstones(Array.isArray(parsed.deletedLogs) ? parsed.deletedLogs : [])
    );
    return {
      categories: loadCategories(
        Array.isArray(parsed.categories) ? parsed.categories : undefined,
        deletedCategories
      ),
      entries: entrySplit.entries,
      logs: logSplit.logs,
      weeklies: Array.isArray(parsed.weeklies) ? parsed.weeklies : [],
      deleted: entrySplit.deleted,
      deletedLogs: logSplit.deletedLogs,
      deletedCategories,
      resetAt: finiteAt(parsed.resetAt) > 0 ? finiteAt(parsed.resetAt) : 0,
      updatedAt: finiteAt(parsed.updatedAt),
    };
  } catch {
    return emptySnapshot();
  }
}

function persist(state: JournalSnapshot) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

function snapshotOf(get: () => JournalStore): JournalSnapshot {
  const s = get();
  return {
    categories: s.categories,
    entries: s.entries,
    logs: s.logs,
    weeklies: s.weeklies,
    deleted: s.deleted,
    deletedLogs: s.deletedLogs,
    deletedCategories: s.deletedCategories,
    resetAt: s.resetAt,
    updatedAt: s.updatedAt,
  };
}

function indexEntries(snap: JournalSnapshot): Map<string, LwwRow<JournalEntry>> {
  const map = new Map<string, LwwRow<JournalEntry>>();
  for (const entry of snap.entries) {
    map.set(entry.id, {
      id: entry.id,
      updatedAt: entry.updatedAt || 0,
      deleted: false,
      value: entry,
    });
  }
  for (const tomb of snap.deleted) {
    const prev = map.get(tomb.id);
    if (!prev || tomb.at >= prev.updatedAt) {
      map.set(tomb.id, { id: tomb.id, updatedAt: tomb.at || 0, deleted: true });
    }
  }
  return map;
}

function indexLogs(snap: JournalSnapshot): Map<string, LwwRow<ReviewLog>> {
  const map = new Map<string, LwwRow<ReviewLog>>();
  for (const log of snap.logs) {
    map.set(log.id, {
      id: log.id,
      updatedAt: log.updatedAt || 0,
      deleted: false,
      value: log,
      entryId: log.entryId,
    });
  }
  for (const tomb of snap.deletedLogs) {
    const prev = map.get(tomb.id);
    if (!prev || tomb.at >= prev.updatedAt) {
      map.set(tomb.id, {
        id: tomb.id,
        updatedAt: tomb.at || 0,
        deleted: true,
        entryId: tomb.entryId,
      });
    }
  }
  return map;
}

function indexCategories(snap: JournalSnapshot): Map<string, LwwRow<JournalCategory>> {
  const map = new Map<string, LwwRow<JournalCategory>>();
  for (const category of snap.categories) {
    map.set(category.id, {
      id: category.id,
      updatedAt: category.updatedAt || 0,
      deleted: false,
      value: category,
    });
  }
  for (const tomb of snap.deletedCategories) {
    const prev = map.get(tomb.id);
    if (!prev || tomb.at >= prev.updatedAt) {
      map.set(tomb.id, { id: tomb.id, updatedAt: tomb.at || 0, deleted: true });
    }
  }
  return map;
}

function sameRow(prev: LwwRow<unknown> | undefined, next: LwwRow<unknown>): boolean {
  return !!prev && prev.updatedAt === next.updatedAt && prev.deleted === next.deleted;
}

/** 只把这次相对上一份本地状态变过的行入队。 */
function mirrorDiff(prev: JournalSnapshot, next: JournalSnapshot) {
  if (!api.isLoggedIn()) return;
  const resetAt = next.resetAt || 0;
  const body: api.JournalBulkBody = { entries: [], logs: [], categories: [], weeklies: [] };

  const prevEntries = indexEntries(prev);
  for (const row of indexEntries(next).values()) {
    if (sameRow(prevEntries.get(row.id), row)) continue;
    if (row.updatedAt <= resetAt) continue;
    if (row.deleted) {
      body.entries.push({ id: row.id, updated_at: row.updatedAt, deleted: true });
    } else if (row.value) {
      body.entries.push({
        id: row.id,
        updated_at: row.updatedAt,
        deleted: false,
        entry: row.value,
      });
    }
  }

  const prevLogs = indexLogs(prev);
  for (const row of indexLogs(next).values()) {
    if (sameRow(prevLogs.get(row.id), row)) continue;
    if (row.updatedAt <= resetAt) continue;
    const entryId = row.entryId || row.value?.entryId || "";
    if (row.deleted) {
      body.logs.push({
        id: row.id,
        entry_id: entryId,
        updated_at: row.updatedAt,
        deleted: true,
      });
    } else if (row.value) {
      body.logs.push({
        id: row.id,
        entry_id: row.value.entryId,
        updated_at: row.updatedAt,
        deleted: false,
        log: row.value,
      });
    }
  }

  const prevCategories = indexCategories(prev);
  for (const row of indexCategories(next).values()) {
    if (sameRow(prevCategories.get(row.id), row)) continue;
    if (row.updatedAt <= resetAt) continue;
    if (row.deleted) {
      body.categories.push({ id: row.id, updated_at: row.updatedAt, deleted: true });
    } else if (row.value) {
      body.categories.push({
        id: row.id,
        updated_at: row.updatedAt,
        deleted: false,
        category: row.value,
      });
    }
  }

  const prevWeeklies = new Map(prev.weeklies.map((w) => [w.weekKey, w]));
  for (const weekly of next.weeklies) {
    const old = prevWeeklies.get(weekly.weekKey);
    if (old && old.updatedAt === weekly.updatedAt && old.note === weekly.note) continue;
    if ((weekly.updatedAt || 0) <= resetAt) continue;
    body.weeklies.push({
      week_key: weekly.weekKey,
      note: weekly.note,
      updated_at: weekly.updatedAt || 0,
    });
  }

  if (
    body.entries.length ||
    body.logs.length ||
    body.categories.length ||
    body.weeklies.length
  ) {
    enqueueJournalRows(body);
  }
}

function commit(
  set: (partial: Partial<JournalStore>) => void,
  get: () => JournalStore,
  patch: Partial<JournalSnapshot>,
  mirror = true
) {
  const prev = snapshotOf(get);
  const next: JournalSnapshot = { ...prev, ...patch, updatedAt: Date.now() };
  set(next);
  persist(next);
  if (mirror) mirrorDiff(prev, next);
}

function isStockCategory(category: JournalCategory): boolean {
  if (category.updatedAt && category.updatedAt > 0) return false;
  const found = DEFAULT_CATEGORIES.find((item) => item.id === category.id);
  return (
    !!found &&
    found.name === category.name &&
    found.color === category.color &&
    found.order === category.order
  );
}

function logClock(log: ReviewLog): number {
  if (log.updatedAt && log.updatedAt > 0) return log.updatedAt;
  const [y, m, d] = log.date.split("-").map(Number);
  if (y && m && d) {
    const ms = new Date(y, m - 1, d).getTime();
    if (ms > 0) return ms;
  }
  return 1;
}

/** 参与同步的本地行。没写过时钟的旧数据给一个很早的时间，好在服务端还没有时推一次。 */
function syncEntryRows(snap: JournalSnapshot): LwwRow<JournalEntry>[] {
  const map = new Map<string, LwwRow<JournalEntry>>();
  for (const entry of snap.entries) {
    const updatedAt = entry.updatedAt > 0 ? entry.updatedAt : 1;
    map.set(entry.id, {
      id: entry.id,
      updatedAt,
      deleted: false,
      value: { ...entry, updatedAt },
    });
  }
  for (const tomb of snap.deleted) {
    const at = tomb.at > 0 ? tomb.at : 1;
    const prev = map.get(tomb.id);
    if (!prev || at >= prev.updatedAt) {
      map.set(tomb.id, { id: tomb.id, updatedAt: at, deleted: true });
    }
  }
  return [...map.values()];
}

function syncLogRows(snap: JournalSnapshot): LwwRow<ReviewLog>[] {
  const map = new Map<string, LwwRow<ReviewLog>>();
  for (const log of snap.logs) {
    const updatedAt = logClock(log);
    map.set(log.id, {
      id: log.id,
      updatedAt,
      deleted: false,
      value: { ...log, updatedAt },
      entryId: log.entryId,
    });
  }
  for (const tomb of snap.deletedLogs) {
    const at = tomb.at > 0 ? tomb.at : 1;
    const prev = map.get(tomb.id);
    if (!prev || at >= prev.updatedAt) {
      map.set(tomb.id, {
        id: tomb.id,
        updatedAt: at,
        deleted: true,
        entryId: tomb.entryId,
      });
    }
  }
  return [...map.values()];
}

function syncCategoryRows(snap: JournalSnapshot): LwwRow<JournalCategory>[] {
  const map = new Map<string, LwwRow<JournalCategory>>();
  for (const category of snap.categories) {
    if (isStockCategory(category)) continue;
    const updatedAt = category.updatedAt && category.updatedAt > 0 ? category.updatedAt : 1;
    map.set(category.id, {
      id: category.id,
      updatedAt,
      deleted: false,
      value: { ...category, updatedAt },
    });
  }
  for (const tomb of snap.deletedCategories) {
    const at = tomb.at > 0 ? tomb.at : 1;
    const prev = map.get(tomb.id);
    if (!prev || at >= prev.updatedAt) {
      map.set(tomb.id, { id: tomb.id, updatedAt: at, deleted: true });
    }
  }
  return [...map.values()];
}

function syncWeeklyRows(snap: JournalSnapshot): LwwRow<WeeklySummary>[] {
  return snap.weeklies.map((weekly) => {
    const updatedAt = weekly.updatedAt > 0 ? weekly.updatedAt : 1;
    return {
      id: weekly.weekKey,
      updatedAt,
      deleted: false,
      value: { ...weekly, updatedAt },
    };
  });
}

function remoteEntryRows(rows: api.JournalEntrySyncRow[] | undefined): LwwRow<JournalEntry>[] {
  if (!Array.isArray(rows)) return [];
  const out: LwwRow<JournalEntry>[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    const updatedAt = finiteAt(row.updated_at);
    if (row.deleted) {
      out.push({ id: row.id, updatedAt, deleted: true });
      continue;
    }
    if (!row.entry || typeof row.entry !== "object") continue;
    out.push({
      id: row.id,
      updatedAt,
      deleted: false,
      value: { ...row.entry, id: row.id, updatedAt: updatedAt || row.entry.updatedAt || 0 },
    });
  }
  return out;
}

function remoteLogRows(rows: api.JournalLogSyncRow[] | undefined): LwwRow<ReviewLog>[] {
  if (!Array.isArray(rows)) return [];
  const out: LwwRow<ReviewLog>[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    const updatedAt = finiteAt(row.updated_at);
    const entryId =
      typeof row.entry_id === "string" && row.entry_id
        ? row.entry_id
        : row.log?.entryId || "";
    if (row.deleted) {
      out.push({ id: row.id, updatedAt, deleted: true, entryId });
      continue;
    }
    if (!row.log || typeof row.log !== "object") continue;
    out.push({
      id: row.id,
      updatedAt,
      deleted: false,
      entryId: row.log.entryId || entryId,
      value: {
        ...row.log,
        id: row.id,
        entryId: row.log.entryId || entryId,
        updatedAt,
      },
    });
  }
  return out;
}

function remoteCategoryRows(
  rows: api.JournalCategorySyncRow[] | undefined
): LwwRow<JournalCategory>[] {
  if (!Array.isArray(rows)) return [];
  const out: LwwRow<JournalCategory>[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    const updatedAt = finiteAt(row.updated_at);
    if (row.deleted) {
      out.push({ id: row.id, updatedAt, deleted: true });
      continue;
    }
    if (!row.category || typeof row.category !== "object") continue;
    out.push({
      id: row.id,
      updatedAt,
      deleted: false,
      value: { ...row.category, id: row.id, updatedAt },
    });
  }
  return out;
}

function remoteWeeklyRows(rows: api.JournalWeeklySyncRow[] | undefined): LwwRow<WeeklySummary>[] {
  if (!Array.isArray(rows)) return [];
  const out: LwwRow<WeeklySummary>[] = [];
  for (const row of rows) {
    if (!row || typeof row.week_key !== "string" || !row.week_key) continue;
    const updatedAt = finiteAt(row.updated_at);
    out.push({
      id: row.week_key,
      updatedAt,
      deleted: false,
      value: {
        weekKey: row.week_key,
        note: typeof row.note === "string" ? row.note : "",
        updatedAt,
      },
    });
  }
  return out;
}

function dedupePush<T>(rows: LwwRow<T>[]): LwwRow<T>[] {
  const map = new Map<string, LwwRow<T>>();
  for (const row of rows) {
    const prev = map.get(row.id);
    if (
      !prev ||
      row.updatedAt > prev.updatedAt ||
      (row.updatedAt === prev.updatedAt && row.deleted && !prev.deleted)
    ) {
      map.set(row.id, row);
    }
  }
  return [...map.values()];
}

/** 条目墓碑不旧于复盘记录时，记录也改成墓碑，避免删了笔记又把复盘补回来。 */
function buryLogsUnderEntries(
  merged: { kept: LwwRow<ReviewLog>[]; push: LwwRow<ReviewLog>[] },
  entryTombAt: Map<string, number>
): { kept: LwwRow<ReviewLog>[]; push: LwwRow<ReviewLog>[] } {
  const kept: LwwRow<ReviewLog>[] = [];
  const extra: LwwRow<ReviewLog>[] = [];
  for (const row of merged.kept) {
    const entryId = row.entryId || row.value?.entryId || "";
    const tombAt = entryId ? entryTombAt.get(entryId) : undefined;
    if (tombAt != null && !row.deleted && row.updatedAt <= tombAt) {
      const tomb: LwwRow<ReviewLog> = {
        id: row.id,
        updatedAt: tombAt,
        deleted: true,
        entryId,
      };
      kept.push(tomb);
      extra.push(tomb);
    } else {
      kept.push(row);
    }
  }
  return { kept, push: dedupePush([...merged.push, ...extra]) };
}

function rowsToBulk(parts: {
  entries: LwwRow<JournalEntry>[];
  logs: LwwRow<ReviewLog>[];
  categories: LwwRow<JournalCategory>[];
  weeklies: LwwRow<WeeklySummary>[];
}): api.JournalBulkBody {
  const body: api.JournalBulkBody = { entries: [], logs: [], categories: [], weeklies: [] };
  for (const row of parts.entries) {
    if (row.deleted) body.entries.push({ id: row.id, updated_at: row.updatedAt, deleted: true });
    else if (row.value) {
      body.entries.push({
        id: row.id,
        updated_at: row.updatedAt,
        deleted: false,
        entry: row.value,
      });
    }
  }
  for (const row of parts.logs) {
    const entryId = row.entryId || row.value?.entryId || "";
    if (row.deleted) {
      body.logs.push({
        id: row.id,
        entry_id: entryId,
        updated_at: row.updatedAt,
        deleted: true,
      });
    } else if (row.value) {
      body.logs.push({
        id: row.id,
        entry_id: row.value.entryId,
        updated_at: row.updatedAt,
        deleted: false,
        log: row.value,
      });
    }
  }
  for (const row of parts.categories) {
    if (row.deleted) {
      body.categories.push({ id: row.id, updated_at: row.updatedAt, deleted: true });
    } else if (row.value) {
      body.categories.push({
        id: row.id,
        updated_at: row.updatedAt,
        deleted: false,
        category: row.value,
      });
    }
  }
  for (const row of parts.weeklies) {
    if (!row.value) continue;
    body.weeklies.push({
      week_key: row.value.weekKey,
      note: row.value.note,
      updated_at: row.updatedAt,
    });
  }
  return body;
}

function categoriesFromRows(kept: LwwRow<JournalCategory>[]): JournalCategory[] {
  const live = kept
    .flatMap((row) => (!row.deleted && row.value ? [row.value] : []))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (live.length) return live;
  const tombIds = new Set(kept.filter((row) => row.deleted).map((row) => row.id));
  if (tombIds.size) {
    return DEFAULT_CATEGORIES.filter((c) => !tombIds.has(c.id)).map((c) => ({ ...c }));
  }
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}

function snapshotFromPartial(data: Partial<JournalSnapshot>, resetAt: number): JournalSnapshot {
  const base = emptySnapshot();
  const stamp = finiteAt(data.updatedAt) > 0 ? finiteAt(data.updatedAt) : Date.now();
  const categories = (
    Array.isArray(data.categories) && data.categories.length ? data.categories : base.categories
  ).map((category) => ({
    ...category,
    updatedAt: Math.max(category.updatedAt || 0, stamp),
  }));
  const entrySplit = reconcileEntries(
    (Array.isArray(data.entries) ? data.entries : []).map((entry) => ({
      ...entry,
      updatedAt: Math.max(entry.updatedAt || 0, stamp),
    })),
    Array.isArray(data.deleted) ? data.deleted : []
  );
  const logSplit = reconcileLogs(
    (Array.isArray(data.logs) ? data.logs : []).map((log) => ({
      ...log,
      updatedAt: Math.max(log.updatedAt || 0, stamp),
    })),
    Array.isArray(data.deletedLogs) ? data.deletedLogs : []
  );
  return {
    categories,
    entries: entrySplit.entries,
    logs: logSplit.logs,
    weeklies: (Array.isArray(data.weeklies) ? data.weeklies : []).map((weekly) => ({
      ...weekly,
      updatedAt: Math.max(weekly.updatedAt || 0, stamp),
    })),
    deleted: entrySplit.deleted,
    deletedLogs: logSplit.deletedLogs,
    deletedCategories: unionTombstones(
      Array.isArray(data.deletedCategories) ? data.deletedCategories : []
    ),
    resetAt,
    updatedAt: stamp,
  };
}

interface JournalStore extends JournalSnapshot {
  addCategory: (name: string, color?: string) => JournalCategory | null;
  renameCategory: (id: string, name: string) => void;
  removeCategory: (id: string) => boolean;
  addEntry: (input: {
    id?: string;
    categoryId: string;
    title: string;
    body: string;
    kind?: JournalKind;
    kpId?: string;
    fromKg?: boolean;
    sourceItemId?: string;
  }) => JournalEntry | null;
  /** 错题集：同一 sourceItemId 仅一条 active */
  collectWrongItem: (input: {
    id?: string;
    sourceItemId: string;
    kpId: string;
    title: string;
    body: string;
    categoryId: string;
  }) => JournalEntry | null;
  uncollectWrongItem: (sourceItemId: string) => void;
  /** 图谱「已学」入队：同一 kpId 仅保留一条 active */
  addEntryFromKg: (input: {
    kpId: string;
    title: string;
    body: string;
    categoryId: string;
  }) => JournalEntry | null;
  updateEntry: (
    id: string,
    patch: Partial<Pick<JournalEntry, "title" | "body" | "kind" | "categoryId">>
  ) => void;
  deleteEntry: (id: string) => void;
  archiveEntry: (id: string) => void;
  /** 归档某考点关联的全部 active 日志（取消已学） */
  archiveEntriesByKpId: (kpId: string) => void;
  reviewEntry: (id: string, result: ReviewResult, note?: string) => void;
  /** 全部到期（未截断）。需要按分类上限时用 planDue。 */
  dueEntries: (today?: string) => JournalEntry[];
  /** 按分类每日上限截断后的手写今日队列（不含图谱卡）。 */
  planDue: (limits?: Record<string, number> | null, today?: string) => ReturnType<typeof planDueEntries>;
  entriesByCategory: (categoryId: string | "all") => JournalEntry[];
  getWeekly: (weekKey?: string) => {
    weekKey: string;
    summary: WeeklySummary | null;
    stats: WeekStats;
  };
  saveWeeklyNote: (note: string, weekKey?: string) => void;
  rehydrate: () => void;
  /** 用快照整体替换（导入用）；登录时按条入队，不整包 PUT */
  replaceAll: (data: Partial<JournalSnapshot>, options?: { mirror?: boolean }) => void;
  exportSnapshot: () => JournalSnapshot;
  clearAll: () => Promise<void>;
  /** 登录后拉取服务端按条结果，和本地按 updated_at 合并 */
  syncFromServer: () => Promise<void>;
}

const initial = load();

export const useJournal = create<JournalStore>((set, get) => ({
  ...initial,

  rehydrate: () => {
    set(load());
  },

  exportSnapshot: () => snapshotOf(get),

  replaceAll: (data, options) => {
    const prev = snapshotOf(get);
    const next = snapshotFromPartial(data, prev.resetAt);
    set(next);
    persist(next);
    if (options?.mirror !== false) mirrorDiff(prev, next);
  },

  clearAll: async () => {
    if (api.isLoggedIn()) {
      const res = await api.deleteJournal();
      const resetAt = finiteAt(res.reset_at) > 0 ? finiteAt(res.reset_at) : Date.now();
      clearPendingJournal();
      const next = emptySnapshot();
      next.resetAt = resetAt;
      next.updatedAt = resetAt;
      set(next);
      persist(next);
      return;
    }
    const next = emptySnapshot();
    set(next);
    persist(next);
  },

  addCategory: (name, color = "#64748b") => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const cats = get().categories;
    if (cats.some((c) => c.name === trimmed)) return null;
    const now = Date.now();
    const cat: JournalCategory = {
      id: `cat-${now.toString(36)}`,
      name: trimmed,
      color,
      order: cats.length,
      updatedAt: now,
    };
    commit(set, get, { categories: [...cats, cat] });
    return cat;
  },

  renameCategory: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    const categories = get().categories.map((c) =>
      c.id === id ? { ...c, name: trimmed, updatedAt: now } : c
    );
    commit(set, get, { categories });
  },

  removeCategory: (id) => {
    const { categories, entries } = get();
    if (entries.some((e) => e.categoryId === id && e.status === "active")) {
      return false;
    }
    if (categories.length <= 1) return false;
    const now = Date.now();
    commit(set, get, {
      categories: categories.filter((c) => c.id !== id),
      deletedCategories: unionTombstones(get().deletedCategories, [{ id, at: now }]),
    });
    return true;
  },

  addEntry: (input) => {
    const title = input.title.trim();
    if (!title) return null;
    // 分类不存在时兜底：仍允许创建（图谱默认 cat-math/cat-408）
    let categoryId = input.categoryId;
    if (!get().categories.some((c) => c.id === categoryId)) {
      if (get().categories[0]) categoryId = get().categories[0].id;
      else return null;
    }
    const entry = newEntryDefaults({
      id: input.id,
      categoryId,
      title,
      body: input.body || "",
      kind: input.kind || "learn",
      kpId: input.kpId,
      fromKg: input.fromKg,
      sourceItemId: input.sourceItemId,
    });
    commit(set, get, { entries: [entry, ...get().entries] });
    return entry;
  },

  addEntryFromKg: (input) => {
    const kpId = input.kpId.trim();
    if (!kpId) return null;
    const existing = get().entries.find(
      (e) => e.kpId === kpId && e.status === "active" && !e.sourceItemId
    );
    if (existing) {
      // 已在队列：轻触更新时间，不重复入队
      const now = Date.now();
      const entries = get().entries.map((e) =>
        e.id === existing.id ? { ...e, updatedAt: now } : e
      );
      commit(set, get, { entries });
      return { ...existing, updatedAt: now };
    }
    return get().addEntry({
      categoryId: input.categoryId,
      title: input.title,
      body: input.body,
      kind: "learn",
      kpId,
      fromKg: true,
    });
  },

  collectWrongItem: (input) => {
    const sourceItemId = input.sourceItemId.trim();
    const kpId = input.kpId.trim();
    if (!sourceItemId || !kpId) return null;
    const existing = get().entries.find((e) => e.sourceItemId === sourceItemId);
    if (existing?.status === "active") return existing;
    if (existing) {
      const today = dayKey();
      const now = Date.now();
      const entries = get().entries.map((e) =>
        e.id === existing.id
          ? {
              ...e,
              status: "active" as const,
              kind: "mistake" as const,
              step: 1 as const,
              nextReviewOn: addDays(today, 1),
              kpId,
              fromKg: true,
              sourceItemId,
              title: input.title.trim() || e.title,
              body: input.body.trim(),
              updatedAt: now,
            }
          : e
      );
      commit(set, get, { entries });
      return entries.find((e) => e.id === existing.id) || existing;
    }
    return get().addEntry({
      id: input.id,
      categoryId: input.categoryId,
      title: input.title,
      body: input.body,
      kind: "mistake",
      kpId,
      fromKg: true,
      sourceItemId,
    });
  },

  uncollectWrongItem: (sourceItemId) => {
    const id = sourceItemId.trim();
    if (!id) return;
    const now = Date.now();
    let changed = false;
    const entries = get().entries.map((e) => {
      if (e.sourceItemId !== id || e.status !== "active") return e;
      changed = true;
      return { ...e, status: "archived" as const, updatedAt: now };
    });
    if (changed) commit(set, get, { entries });
  },

  updateEntry: (id, patch) => {
    const now = Date.now();
    const entries = get().entries.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() : e.title,
        body: patch.body !== undefined ? patch.body.trim() : e.body,
        updatedAt: now,
      };
    });
    commit(set, get, { entries });
  },

  deleteEntry: (id) => {
    const now = Date.now();
    const doomed = get().logs.filter((l) => l.entryId === id);
    commit(set, get, {
      entries: get().entries.filter((e) => e.id !== id),
      logs: get().logs.filter((l) => l.entryId !== id),
      deleted: unionTombstones(get().deleted, [{ id, at: now }]),
      deletedLogs: unionLogTombstones(
        get().deletedLogs,
        doomed.map((log) => ({ id: log.id, entryId: log.entryId, at: now }))
      ),
    });
  },

  archiveEntry: (id) => {
    const now = Date.now();
    const entries = get().entries.map((e) =>
      e.id === id ? { ...e, status: "archived" as const, updatedAt: now } : e
    );
    commit(set, get, { entries });
  },

  archiveEntriesByKpId: (kpId) => {
    const now = Date.now();
    let changed = false;
    const entries = get().entries.map((e) => {
      if (e.kpId !== kpId || e.status !== "active") return e;
      if (e.sourceItemId) return e; // 错题集不随取消已学消失
      changed = true;
      return { ...e, status: "archived" as const, updatedAt: now };
    });
    if (changed) commit(set, get, { entries });
  },

  reviewEntry: (id, result, note) => {
    const today = dayKey();
    const entry = get().entries.find((e) => e.id === id);
    if (!entry || entry.status !== "active") return;

    const outcome = scheduleAfterReview(entry, result, today);
    const now = Date.now();
    const entries = get().entries.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        step: outcome.step,
        nextReviewOn: outcome.nextReviewOn,
        status: outcome.status,
        lapses: e.lapses + outcome.lapsesDelta,
        lastReviewedOn: today,
        updatedAt: now,
      };
    });

    const log: ReviewLog = {
      id: `jl-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      entryId: id,
      date: today,
      result,
      note: note?.trim() || undefined,
      updatedAt: now,
    };
    commit(set, get, { entries, logs: [log, ...get().logs] });

    // 关联考点：回写图谱熟练度，并用日志下次复盘日对齐 due
    if (entry.kpId) {
      const mark = mapReviewToMark(result);
      const dueMs = dayKeyToLocalMs(outcome.nextReviewOn);
      const kpId = entry.kpId;
      // 动态 import 避免 journal ↔ kgProgress 模块循环
      void import("@/stores/kgProgress").then(({ useKgProgress }) => {
        useKgProgress.getState().applyExternalMark(kpId, mark, {
          dueMs: dueMs > 0 ? dueMs : undefined,
          ivl: outcome.step,
        });
      });
    }
  },

  dueEntries: (today = dayKey()) => sortDueEntries(get().entries, today),
  planDue: (limits, today = dayKey()) => planDueEntries(get().entries, limits, today),

  entriesByCategory: (categoryId) => {
    const list = get().entries;
    const filtered =
      categoryId === "all" ? list : list.filter((e) => e.categoryId === categoryId);
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  getWeekly: (weekKey = weekKeyOf()) => {
    const summary = get().weeklies.find((w) => w.weekKey === weekKey) || null;
    const stats = computeWeekStats(get().entries, get().logs, weekKey);
    return { weekKey, summary, stats };
  },

  saveWeeklyNote: (note, weekKey = weekKeyOf()) => {
    const weeklies = [...get().weeklies];
    const idx = weeklies.findIndex((w) => w.weekKey === weekKey);
    const row: WeeklySummary = {
      weekKey,
      note: note.trim(),
      updatedAt: Date.now(),
    };
    if (idx >= 0) weeklies[idx] = row;
    else weeklies.unshift(row);
    commit(set, get, { weeklies });
  },

  syncFromServer: async () => {
    if (!api.isLoggedIn()) return;
    const epoch = getScopeEpoch();
    try {
      const remote = await api.getJournal();
      if (!stillInScope(epoch) || !api.isLoggedIn()) return;
      const local = snapshotOf(get);
      const resetAt = Math.max(local.resetAt || 0, finiteAt(remote.reset_at));

      const entryMerge = mergeLwwRows(
        syncEntryRows(local),
        remoteEntryRows(remote.entries),
        resetAt
      );
      const entryTombAt = new Map<string, number>();
      const entries: JournalEntry[] = [];
      const deleted: JournalTombstone[] = [];
      for (const row of entryMerge.kept) {
        if (row.deleted) {
          deleted.push({ id: row.id, at: row.updatedAt });
          entryTombAt.set(row.id, row.updatedAt);
          continue;
        }
        if (row.value) entries.push(row.value);
      }

      const logMerge = buryLogsUnderEntries(
        mergeLwwRows(syncLogRows(local), remoteLogRows(remote.logs), resetAt),
        entryTombAt
      );
      const logs: ReviewLog[] = [];
      const deletedLogs: JournalLogTombstone[] = [];
      for (const row of logMerge.kept) {
        if (row.deleted) {
          const entryId = row.entryId || "";
          if (entryId) deletedLogs.push({ id: row.id, entryId, at: row.updatedAt });
          continue;
        }
        if (row.value) logs.push(row.value);
      }

      const categoryMerge = mergeLwwRows(
        syncCategoryRows(local),
        remoteCategoryRows(remote.categories),
        resetAt
      );
      const deletedCategories: JournalTombstone[] = [];
      for (const row of categoryMerge.kept) {
        if (row.deleted) deletedCategories.push({ id: row.id, at: row.updatedAt });
      }

      const weeklyMerge = mergeLwwRows(
        syncWeeklyRows(local),
        remoteWeeklyRows(remote.weeklies),
        resetAt
      );
      const weeklies = weeklyMerge.kept.flatMap((row) =>
        !row.deleted && row.value ? [row.value] : []
      );

      const entrySplit = reconcileEntries(entries, deleted);
      const logSplit = reconcileLogs(logs, deletedLogs);
      const next: JournalSnapshot = {
        categories: categoriesFromRows(categoryMerge.kept),
        entries: entrySplit.entries,
        logs: logSplit.logs,
        weeklies,
        deleted: entrySplit.deleted,
        deletedLogs: logSplit.deletedLogs,
        deletedCategories: unionTombstones(deletedCategories),
        resetAt,
        updatedAt: Math.max(local.updatedAt || 0, resetAt),
      };
      if (!stillInScope(epoch) || !api.isLoggedIn()) return;
      set(next);
      persist(next);
      const body = rowsToBulk({
        entries: entryMerge.push,
        logs: logMerge.push,
        categories: categoryMerge.push,
        weeklies: weeklyMerge.push,
      });
      if (
        body.entries.length ||
        body.logs.length ||
        body.categories.length ||
        body.weeklies.length
      ) {
        enqueueJournalRows(body);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("journal syncFromServer failed:", message);
    }
  },
}));
