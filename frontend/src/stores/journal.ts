// journal store —— 学习日志 / 复盘板。
// 本地缓存 ew.journal.v1。未登录只写本机。
// 登录后按条同步：同一 id 比较 updated_at，较新者获胜。删除是墓碑，不会整包覆盖，
// 也不会把「另一份里多出来、但已被更新墓碑删掉」的 id 补回来。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey, dayKeyStartMs } from "@/lib/day";
import {
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
  type EntryStatus,
  type JournalKind,
  type JournalLogTombstone,
  type JournalTombstone,
  type ReviewLog,
  type ReviewResult,
  type WeekStats,
  type WeeklySummary,
} from "@/lib/journal";
import {
  buildMirrorDiff,
  buryLogsUnderEntries,
  categoriesFromRows,
  emptySnapshot,
  finiteAt,
  loadCategories,
  reconcileEntries,
  reconcileLogs,
  remoteCategoryRows,
  remoteEntryRows,
  remoteLogRows,
  remoteWeeklyRows,
  rowsToBulk,
  snapshotFromPartial,
  syncCategoryRows,
  syncEntryRows,
  syncLogRows,
  syncWeeklyRows,
  type JournalSnapshot,
} from "@/lib/journalSync";
import { mapReviewToMark } from "@/lib/kg/journalBridge";
import { emitStoreEvent } from "@/stores/storeEvents";
import { clearPendingJournal, enqueueJournalRows } from "@/lib/syncQueue";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";

export type { JournalSnapshot };

const KEY_BASE = "ew.journal.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
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

/** 只把这次相对上一份本地状态变过的行入队。 */
function mirrorDiff(prev: JournalSnapshot, next: JournalSnapshot) {
  if (!api.isLoggedIn()) return;
  const body = buildMirrorDiff(prev, next);
  if (body) enqueueJournalRows(body);
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
    status?: EntryStatus;
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
  /** 永久学会 / 复习计划切换；重新入队从明日第 1 天开始，不修改作答履历。 */
  setEntryReviewStatus: (id: string, status: EntryStatus) => void;
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
      status: input.status,
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

  setEntryReviewStatus: (id, status) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry || entry.status === status) return;
    const entries = get().entries.map((e) => e.id !== id ? e : {
      ...e,
      status,
      ...(status === "active" ? { step: 1 as const, nextReviewOn: addDays(dayKey(), 1) } : {}),
      updatedAt: Math.max(Date.now(), e.updatedAt + 1),
    });
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

    // 关联考点：经事件总线通知图谱回写熟练度，并用日志下次复盘日对齐 due
    if (entry.kpId) {
      const mark = mapReviewToMark(result);
      const dueMs = dayKeyStartMs(outcome.nextReviewOn);
      emitStoreEvent("journal:reviewed", {
        kpId: entry.kpId,
        mark,
        dueMs: dueMs > 0 ? dueMs : undefined,
        ivl: outcome.step,
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
