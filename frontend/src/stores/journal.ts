// journal store —— 学习日志 / 复盘板。
// 本地缓存 ew.journal.v1；登录后与服务端按条目合并（较新快照为底，补上另一端多出的条目）。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import {
  DEFAULT_CATEGORIES,
  addDays,
  computeWeekStats,
  mergeJournalSnapshots,
  newEntryDefaults,
  scheduleAfterReview,
  planDueEntries,
  sortDueEntries,
  weekKeyOf,
  type JournalCategory,
  type JournalDoc,
  type JournalEntry,
  type JournalKind,
  type ReviewLog,
  type ReviewResult,
  type WeekStats,
  type WeeklySummary,
} from "@/lib/journal";
import { dayKeyToLocalMs, mapReviewToMark } from "@/lib/kg/journalBridge";
import { enqueueJournal, setOnJournalSkipped } from "@/lib/syncQueue";
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
  /** 文档级版本（毫秒），用于与服务端 LWW 同步 */
  updatedAt: number;
}

function emptySnapshot(): JournalSnapshot {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    entries: [],
    logs: [],
    weeklies: [],
    updatedAt: 0,
  };
}

function load(): JournalSnapshot {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as Partial<JournalSnapshot>;
    return {
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length
          ? (parsed.categories as JournalCategory[])
          : DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      entries: Array.isArray(parsed.entries) ? (parsed.entries as JournalEntry[]) : [],
      logs: Array.isArray(parsed.logs) ? (parsed.logs as ReviewLog[]) : [],
      weeklies: Array.isArray(parsed.weeklies) ? (parsed.weeklies as WeeklySummary[]) : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
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
    updatedAt: s.updatedAt,
  };
}

function applyLocal(
  set: (partial: Partial<JournalStore>) => void,
  get: () => JournalStore,
  patch: Partial<JournalSnapshot>,
  options: { touch?: boolean; mirror?: boolean } = {}
) {
  const touch = options.touch !== false;
  const next: JournalSnapshot = {
    ...snapshotOf(get),
    ...patch,
    updatedAt: touch ? Date.now() : (patch.updatedAt ?? get().updatedAt),
  };
  set(next);
  persist(next);
  if (options.mirror !== false && api.isLoggedIn()) {
    enqueueJournal(payloadOf(next), next.updatedAt);
  }
}

function payloadOf(snap: JournalDoc): api.JournalPayload {
  return {
    categories: snap.categories,
    entries: snap.entries,
    logs: snap.logs,
    weeklies: snap.weeklies,
    updatedAt: snap.updatedAt,
  };
}

function normalizeRemote(payload: api.JournalPayload | null | undefined): JournalSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const categories = Array.isArray(payload.categories)
    ? (payload.categories as JournalCategory[])
    : [];
  return {
    categories: categories.length ? categories : DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    entries: Array.isArray(payload.entries) ? (payload.entries as JournalEntry[]) : [],
    logs: Array.isArray(payload.logs) ? (payload.logs as ReviewLog[]) : [],
    weeklies: Array.isArray(payload.weeklies) ? (payload.weeklies as WeeklySummary[]) : [],
    updatedAt: typeof payload.updatedAt === "number" ? payload.updatedAt : 0,
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
  /** 用快照整体替换（导入用）；登录时会镜像到服务端 */
  replaceAll: (data: Partial<JournalSnapshot>, options?: { mirror?: boolean }) => void;
  exportSnapshot: () => JournalSnapshot;
  clearAll: () => Promise<void>;
  /** 登录后：拉取服务端个人数据，与本地按条目合并，必要时上传 */
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
    const base = emptySnapshot();
    const next: JournalSnapshot = {
      categories:
        Array.isArray(data.categories) && data.categories.length
          ? data.categories
          : base.categories,
      entries: Array.isArray(data.entries) ? data.entries : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
      weeklies: Array.isArray(data.weeklies) ? data.weeklies : [],
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
    };
    set(next);
    persist(next);
    if (options?.mirror !== false && api.isLoggedIn()) {
      enqueueJournal(payloadOf(next), next.updatedAt);
    }
  },

  clearAll: async () => {
    const next = emptySnapshot();
    next.updatedAt = Date.now();
    set(next);
    persist(next);
    if (api.isLoggedIn()) {
      const res = await api.putJournal(payloadOf(next), next.updatedAt);
      if (res.skipped) {
        throw new Error("服务端日志较新，重置未写入");
      }
    }
  },

  addCategory: (name, color = "#64748b") => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const cats = get().categories;
    if (cats.some((c) => c.name === trimmed)) return null;
    const cat: JournalCategory = {
      id: `cat-${Date.now().toString(36)}`,
      name: trimmed,
      color,
      order: cats.length,
    };
    applyLocal(set, get, { categories: [...cats, cat] });
    return cat;
  },

  renameCategory: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const categories = get().categories.map((c) =>
      c.id === id ? { ...c, name: trimmed } : c
    );
    applyLocal(set, get, { categories });
  },

  removeCategory: (id) => {
    const { categories, entries } = get();
    if (entries.some((e) => e.categoryId === id && e.status === "active")) {
      return false;
    }
    if (categories.length <= 1) return false;
    applyLocal(set, get, { categories: categories.filter((c) => c.id !== id) });
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
    applyLocal(set, get, { entries: [entry, ...get().entries] });
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
      const entries = get().entries.map((e) =>
        e.id === existing.id ? { ...e, updatedAt: Date.now() } : e
      );
      applyLocal(set, get, { entries });
      return existing;
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
              updatedAt: Date.now(),
            }
          : e
      );
      applyLocal(set, get, { entries });
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
    if (changed) applyLocal(set, get, { entries });
  },

  updateEntry: (id, patch) => {
    const entries = get().entries.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() : e.title,
        body: patch.body !== undefined ? patch.body.trim() : e.body,
        updatedAt: Date.now(),
      };
    });
    applyLocal(set, get, { entries });
  },

  deleteEntry: (id) => {
    applyLocal(set, get, {
      entries: get().entries.filter((e) => e.id !== id),
      logs: get().logs.filter((l) => l.entryId !== id),
    });
  },

  archiveEntry: (id) => {
    const entries = get().entries.map((e) =>
      e.id === id
        ? { ...e, status: "archived" as const, updatedAt: Date.now() }
        : e
    );
    applyLocal(set, get, { entries });
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
    if (changed) applyLocal(set, get, { entries });
  },

  reviewEntry: (id, result, note) => {
    const today = dayKey();
    const entry = get().entries.find((e) => e.id === id);
    if (!entry || entry.status !== "active") return;

    const outcome = scheduleAfterReview(entry, result, today);
    const entries = get().entries.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        step: outcome.step,
        nextReviewOn: outcome.nextReviewOn,
        status: outcome.status,
        lapses: e.lapses + outcome.lapsesDelta,
        lastReviewedOn: today,
        updatedAt: Date.now(),
      };
    });

    const log: ReviewLog = {
      id: `jl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      entryId: id,
      date: today,
      result,
      note: note?.trim() || undefined,
    };
    applyLocal(set, get, { entries, logs: [log, ...get().logs] });

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
    applyLocal(set, get, { weeklies });
  },

  syncFromServer: async () => {
    if (!api.isLoggedIn()) return;
    const epoch = getScopeEpoch();
    try {
      const remote = await api.getJournal();
      if (!stillInScope(epoch) || !api.isLoggedIn()) return;
      const remoteUpdated = remote.updated_at || 0;
      const remoteSnap = normalizeRemote(remote.journal);
      const local = snapshotOf(get);
      const localHasData =
        local.entries.length > 0 ||
        local.logs.length > 0 ||
        local.weeklies.length > 0 ||
        local.updatedAt > 0;

      // 服务端无数据：上传本地（若有）
      if (!remoteSnap || remoteUpdated === 0) {
        if (localHasData) {
          const ts = local.updatedAt || Date.now();
          if (!local.updatedAt) {
            applyLocal(set, get, {}, { touch: true, mirror: false });
          }
          const snap = snapshotOf(get);
          await api.putJournal(
            {
              categories: snap.categories,
              entries: snap.entries,
              logs: snap.logs,
              weeklies: snap.weeklies,
              updatedAt: snap.updatedAt || ts,
            },
            snap.updatedAt || ts
          );
        }
        return;
      }

      const remoteTs = Math.max(remoteUpdated, remoteSnap.updatedAt || 0);
      const remoteNorm: JournalSnapshot = { ...remoteSnap, updatedAt: remoteTs };
      const merged = mergeJournalSnapshots(local, remoteNorm);
      set(merged);
      persist(merged);
      if (merged.updatedAt > remoteTs) {
        enqueueJournal(payloadOf(merged), merged.updatedAt);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("journal syncFromServer failed:", message);
    }
  },
}));

setOnJournalSkipped((remote, updatedAt) => {
  const forced = normalizeRemote(remote);
  if (!forced) return;
  const local = snapshotOf(useJournal.getState);
  const merged = mergeJournalSnapshots(local, { ...forced, updatedAt });
  useJournal.setState(merged);
  persist(merged);
  if (merged.updatedAt > updatedAt) {
    enqueueJournal(payloadOf(merged), merged.updatedAt);
  }
});
