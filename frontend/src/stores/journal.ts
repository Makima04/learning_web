// journal store —— 学习日志 / 复盘板。
// 本地缓存 ew.journal.v1；登录后以服务端 user_journal 为个人权威数据（LWW by updatedAt）。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import {
  DEFAULT_CATEGORIES,
  computeWeekStats,
  newEntryDefaults,
  scheduleAfterReview,
  sortDueEntries,
  weekKeyOf,
  type JournalCategory,
  type JournalEntry,
  type JournalKind,
  type ReviewLog,
  type ReviewResult,
  type WeekStats,
  type WeeklySummary,
} from "@/lib/journal";

const KEY = "ew.journal.v1";

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
    const raw = localStorage.getItem(KEY);
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
    localStorage.setItem(KEY, JSON.stringify(state));
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
    void api
      .putJournal(
        {
          categories: next.categories,
          entries: next.entries,
          logs: next.logs,
          weeklies: next.weeklies,
          updatedAt: next.updatedAt,
        },
        next.updatedAt
      )
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        console.warn("mirror putJournal failed:", message);
      });
  }
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
    categoryId: string;
    title: string;
    body: string;
    kind?: JournalKind;
  }) => JournalEntry | null;
  updateEntry: (
    id: string,
    patch: Partial<Pick<JournalEntry, "title" | "body" | "kind" | "categoryId">>
  ) => void;
  deleteEntry: (id: string) => void;
  archiveEntry: (id: string) => void;
  reviewEntry: (id: string, result: ReviewResult, note?: string) => void;
  dueEntries: (today?: string) => JournalEntry[];
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
  clearAll: () => void;
  /** 登录后：拉取服务端个人数据，LWW 合并，必要时上传本地 */
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
      void api
        .putJournal(
          {
            categories: next.categories,
            entries: next.entries,
            logs: next.logs,
            weeklies: next.weeklies,
            updatedAt: next.updatedAt,
          },
          next.updatedAt
        )
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          console.warn("mirror putJournal failed:", message);
        });
    }
  },

  clearAll: () => {
    const next = emptySnapshot();
    next.updatedAt = Date.now();
    set(next);
    persist(next);
    if (api.isLoggedIn()) {
      void api
        .putJournal(
          {
            categories: next.categories,
            entries: [],
            logs: [],
            weeklies: [],
            updatedAt: next.updatedAt,
          },
          next.updatedAt
        )
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          console.warn("mirror putJournal failed:", message);
        });
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
    if (!get().categories.some((c) => c.id === input.categoryId)) return null;
    const entry = newEntryDefaults({
      categoryId: input.categoryId,
      title,
      body: input.body || "",
      kind: input.kind || "learn",
    });
    applyLocal(set, get, { entries: [entry, ...get().entries] });
    return entry;
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
  },

  dueEntries: (today = dayKey()) => sortDueEntries(get().entries, today),

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
    try {
      const remote = await api.getJournal();
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
      const localTs = local.updatedAt || 0;

      if (remoteTs >= localTs) {
        // 服务端更新：覆盖本地缓存
        const next: JournalSnapshot = {
          ...remoteSnap,
          updatedAt: remoteTs,
        };
        set(next);
        persist(next);
        return;
      }

      // 本地更新：推到服务端
      const res = await api.putJournal(
        {
          categories: local.categories,
          entries: local.entries,
          logs: local.logs,
          weeklies: local.weeklies,
          updatedAt: localTs,
        },
        localTs
      );
      if (res.skipped && res.journal) {
        const forced = normalizeRemote(res.journal);
        if (forced) {
          const next: JournalSnapshot = {
            ...forced,
            updatedAt: res.updated_at || remoteTs,
          };
          set(next);
          persist(next);
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("journal syncFromServer failed:", message);
    }
  },
}));
