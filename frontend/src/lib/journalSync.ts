// 学习日志纯函数同步层：快照结构、墓碑合并、增量 diff 与 LWW 行转换。
// 不依赖 Zustand store，方便单测与独立演进。
import type * as api from "@/lib/api";
import { dayKeyStartMs } from "@/lib/day";
import {
  DEFAULT_CATEGORIES,
  unionLogTombstones,
  unionTombstones,
  type JournalCategory,
  type JournalEntry,
  type JournalLogTombstone,
  type JournalTombstone,
  type LwwRow,
  type ReviewLog,
  type WeeklySummary,
} from "@/lib/journal";

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

export function emptySnapshot(): JournalSnapshot {
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

export function finiteAt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

/** 正文不比墓碑新就丢掉；改过的条目留着，并撤掉更旧的墓碑。 */
export function reconcileEntries(
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

export function reconcileLogs(
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

export function loadCategories(
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

/** 计算两次快照之间的增量变更载荷，供登录态同步队列按条上传。 */
export function buildMirrorDiff(
  prev: JournalSnapshot,
  next: JournalSnapshot
): api.JournalBulkBody | null {
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
    return body;
  }
  return null;
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
  const ms = dayKeyStartMs(log.date);
  if (ms > 0) return ms;
  return 1;
}

/** 参与同步的本地行。没写过时钟的旧数据给一个很早的时间，好在服务端还没有时推一次。 */
export function syncEntryRows(snap: JournalSnapshot): LwwRow<JournalEntry>[] {
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

export function syncLogRows(snap: JournalSnapshot): LwwRow<ReviewLog>[] {
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

export function syncCategoryRows(snap: JournalSnapshot): LwwRow<JournalCategory>[] {
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

export function syncWeeklyRows(snap: JournalSnapshot): LwwRow<WeeklySummary>[] {
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

export function remoteEntryRows(
  rows: api.JournalEntrySyncRow[] | undefined
): LwwRow<JournalEntry>[] {
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

export function remoteLogRows(rows: api.JournalLogSyncRow[] | undefined): LwwRow<ReviewLog>[] {
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

export function remoteCategoryRows(
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

export function remoteWeeklyRows(
  rows: api.JournalWeeklySyncRow[] | undefined
): LwwRow<WeeklySummary>[] {
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
export function buryLogsUnderEntries(
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

export function rowsToBulk(parts: {
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

export function categoriesFromRows(kept: LwwRow<JournalCategory>[]): JournalCategory[] {
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

export function snapshotFromPartial(
  data: Partial<JournalSnapshot>,
  resetAt: number
): JournalSnapshot {
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
