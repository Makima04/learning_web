// 生词表 / 熟词表：本地即时写 + 登录后入队，以服务端为权威。
// 一词只能在其中一个表；kind=none 是跨设备删除墓碑。
import { create } from "zustand";
import * as api from "@/lib/api";
import type { WordListKind } from "@/lib/api";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";
import { clearPendingWordLists, enqueueWordListItem, enqueueWordLists } from "@/lib/syncQueue";

const KEY_BASE = "ew.wordLists.v1";

export type { WordListKind };

export interface WordListEntry {
  kind: WordListKind;
  updatedAt: number;
}

interface Snapshot {
  entries: Record<number, WordListEntry>;
  resetAt: number;
}

function storageKey() {
  return scopedKey(KEY_BASE);
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

function emptySnapshot(): Snapshot {
  return { entries: {}, resetAt: 0 };
}

function parseResetAt(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw) {
    const n = Date.parse(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function load(): Snapshot {
  const raw = loadJSON<Partial<Snapshot> | Record<string, WordListEntry>>(storageKey(), {});
  if (!raw || typeof raw !== "object") return emptySnapshot();
  if ("entries" in raw || "resetAt" in raw) {
    const src = raw as Partial<Snapshot>;
    const entries: Record<number, WordListEntry> = {};
    if (src.entries && typeof src.entries === "object") {
      for (const [k, v] of Object.entries(src.entries)) {
        const idx = Number(k);
        if (!Number.isSafeInteger(idx) || !v) continue;
        if (v.kind !== "new" && v.kind !== "known" && v.kind !== "none") continue;
        entries[idx] = {
          kind: v.kind,
          updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
        };
      }
    }
    return {
      entries,
      resetAt: typeof src.resetAt === "number" && src.resetAt > 0 ? src.resetAt : 0,
    };
  }
  return emptySnapshot();
}

function persist(snap: Snapshot) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(snap));
  } catch {
    /* quota */
  }
}

function toSets(entries: Record<number, WordListEntry>): {
  known: Set<number>;
  newbie: Set<number>;
} {
  const known = new Set<number>();
  const newbie = new Set<number>();
  for (const [k, v] of Object.entries(entries)) {
    if (v.kind === "known") known.add(+k);
    else if (v.kind === "new") newbie.add(+k);
  }
  return { known, newbie };
}

interface WordListsStore extends Snapshot {
  kindOf: (idx: number) => "new" | "known" | null;
  sets: () => { known: Set<number>; newbie: Set<number> };
  idxsOf: (kind: "new" | "known") => number[];
  setKind: (idx: number, kind: WordListKind) => void;
  rehydrate: () => void;
  clearAll: () => Promise<void>;
  syncFromServer: () => Promise<void>;
}

const initial = load();

export const useWordLists = create<WordListsStore>((set, get) => ({
  ...initial,

  kindOf: (idx) => {
    const kind = get().entries[idx]?.kind;
    return kind === "new" || kind === "known" ? kind : null;
  },

  sets: () => toSets(get().entries),

  idxsOf: (kind) => {
    const out: number[] = [];
    for (const [k, v] of Object.entries(get().entries)) {
      if (v.kind === kind) out.push(+k);
    }
    out.sort((a, b) => a - b);
    return out;
  },

  setKind: (idx, kind) => {
    if (!Number.isSafeInteger(idx) || idx < 1) return;
    const now = Date.now();
    const prev = get().entries[idx];
    const nextKind: WordListKind =
      prev?.kind === kind && kind !== "none" ? "none" : kind;
    const entries = { ...get().entries, [idx]: { kind: nextKind, updatedAt: now } };
    const snap: Snapshot = { entries, resetAt: get().resetAt };
    set(snap);
    persist(snap);
    enqueueWordListItem(idx, { kind: nextKind, updated_at: now });
  },

  rehydrate: () => set(load()),

  clearAll: async () => {
    if (api.isLoggedIn()) {
      await api.deleteWordLists();
    }
    const snap = emptySnapshot();
    snap.resetAt = Date.now();
    set(snap);
    try {
      localStorage.removeItem(storageKey());
    } catch {
      /* ignore */
    }
    clearPendingWordLists();
  },

  syncFromServer: async () => {
    if (!api.isLoggedIn()) return;
    const epoch = getScopeEpoch();
    const remote = await api.getWordLists();
    if (!stillInScope(epoch) || !api.isLoggedIn()) return;

    const resetAt = Math.max(get().resetAt, parseResetAt(remote.reset_at));
    const remoteItems = remote.items || {};
    const local = get().entries;
    const merged: Record<number, WordListEntry> = {};
    const toPush: Record<string, api.WordListItemDTO> = {};

    const keys = new Set<string>([...Object.keys(local), ...Object.keys(remoteItems)]);
    for (const k of keys) {
      const idx = +k;
      if (!Number.isSafeInteger(idx)) continue;
      const loc = local[idx];
      const rem = remoteItems[k];
      const lu = loc?.updatedAt ?? 0;
      const ru = rem?.updated_at ?? 0;
      if (lu > resetAt && lu > ru && loc) {
        merged[idx] = loc;
        toPush[k] = { kind: loc.kind, updated_at: loc.updatedAt };
      } else if (rem && ru > resetAt) {
        merged[idx] = { kind: rem.kind, updatedAt: ru };
      } else if (loc && lu > resetAt) {
        merged[idx] = loc;
        toPush[k] = { kind: loc.kind, updated_at: loc.updatedAt };
      }
    }

    const snap: Snapshot = { entries: merged, resetAt };
    if (!stillInScope(epoch)) return;
    set(snap);
    persist(snap);
    if (Object.keys(toPush).length > 0) enqueueWordLists(toPush);
  },
}));
