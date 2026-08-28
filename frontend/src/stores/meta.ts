// meta store —— 每日计数器，本地时区 YYYY-MM-DD；登录后入队镜像 /api/meta。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";
import { enqueueMeta, recomputePendingFromStorage } from "@/lib/syncQueue";

const KEY_BASE = "ew.meta.v1";
const RESET_AT_BASE = "ew.meta.resetAt.v1";
const PENDING_META_BASE = "ew.sync.pending.meta.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
}

function resetAtKey() {
  return scopedKey(RESET_AT_BASE);
}

function loadProgressResetAt(): number {
  try {
    const n = Number(localStorage.getItem(resetAtKey()) || "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveProgressResetAt(ts: number) {
  try {
    if (ts > 0) localStorage.setItem(resetAtKey(), String(ts));
  } catch {
    /* ignore */
  }
}

/** 服务端 progress_reset.reset_at → 毫秒；无则 0 */
function parseResetAt(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw) {
    const n = Date.parse(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function clearPendingMeta() {
  try {
    localStorage.removeItem(scopedKey(PENDING_META_BASE));
  } catch {
    /* ignore */
  }
  recomputePendingFromStorage();
}

export interface Meta {
  dayKey: string;
  newToday: number;
  reviewToday: number;
  learnToday: number;
  doneToday: number;
  created: number;
}

function loadMeta(): Meta {
  const today = dayKey();
  let meta: Meta | null = null;
  try {
    meta = JSON.parse(localStorage.getItem(storageKey()) || "null");
  } catch {
    meta = null;
  }
  if (!meta || meta.dayKey !== today) {
    meta = {
      dayKey: today,
      newToday: 0,
      reviewToday: 0,
      learnToday: 0,
      doneToday: 0,
      created: meta ? meta.created : Date.now(),
    };
    saveMeta(meta);
  }
  return meta;
}
function saveMeta(meta: Meta) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

function mirrorMeta(meta: Meta) {
  enqueueMeta({
    day_key: meta.dayKey,
    new_today: meta.newToday,
    review_today: meta.reviewToday,
    learn_today: meta.learnToday,
    done_today: meta.doneToday,
    client_at: Date.now(),
  });
}

interface MetaStore {
  meta: Meta;
  get: () => Meta;
  bump: (field: "newToday" | "reviewToday" | "learnToday" | "doneToday", by?: number) => number;
  replace: (m: Meta) => void;
  /** skipMirror：服务端已权威置 0，不再走 GREATEST 回写 */
  reset: (opts?: { skipMirror?: boolean }) => void;
  rehydrate: () => void;
  syncMeta: () => Promise<void>;
}

export const useMeta = create<MetaStore>((set, get) => ({
  meta: loadMeta(),
  get: () => {
    const today = dayKey();
    const m = get().meta;
    if (m.dayKey !== today) {
      const reset: Meta = {
        dayKey: today,
        newToday: 0,
        reviewToday: 0,
        learnToday: 0,
        doneToday: 0,
        created: m.created,
      };
      set({ meta: reset });
      saveMeta(reset);
      return reset;
    }
    return m;
  },
  bump: (field, by = 1) => {
    const meta = get().get();
    const next = { ...meta, [field]: (meta[field] || 0) + by };
    set({ meta: next });
    saveMeta(next);
    mirrorMeta(next);
    return next[field];
  },
  replace: (m) => {
    set({ meta: m });
    saveMeta(m);
    if (api.isLoggedIn()) mirrorMeta(m);
  },
  reset: (opts) => {
    // 强制当日计数归零（loadMeta 同日会保留旧计数，不能用于清空）
    const today = dayKey();
    const prev = get().meta;
    const m: Meta = {
      dayKey: today,
      newToday: 0,
      reviewToday: 0,
      learnToday: 0,
      doneToday: 0,
      created: prev?.created || Date.now(),
    };
    set({ meta: m });
    saveMeta(m);
    clearPendingMeta();
    if (opts?.skipMirror) {
      // 服务端刚权威清空：记下时间，避免随后 GREATEST 把旧额度拉回
      saveProgressResetAt(Date.now());
      return;
    }
    if (api.isLoggedIn()) mirrorMeta(m);
  },
  rehydrate: () => set({ meta: loadMeta() }),
  syncMeta: async () => {
    const epoch = getScopeEpoch();
    try {
      const localMeta = get().get();
      const today = dayKey();
      // 先拉 reset_at：若刚被权威清空，采用远端 0，不要 PUT 旧计数（GREATEST 会救活额度）
      const rm = await api.getMeta(today);
      if (!stillInScope(epoch)) return;
      const resetAt = parseResetAt(rm.reset_at);
      const seen = loadProgressResetAt();
      if (resetAt > seen) {
        saveProgressResetAt(resetAt);
        const rmMeta = rm.meta;
        const adopted: Meta = {
          ...localMeta,
          dayKey: (rmMeta && rmMeta.day_key) || today,
          newToday: rmMeta?.new_today ?? 0,
          reviewToday: rmMeta?.review_today ?? 0,
          learnToday: rmMeta?.learn_today ?? 0,
          doneToday: rmMeta?.done_today ?? 0,
        };
        set({ meta: adopted });
        saveMeta(adopted);
        return;
      }
      // 日常多端合并：先推本地（服务端 GREATEST），再拉回
      await api.putMeta({
        day_key: localMeta.dayKey,
        new_today: localMeta.newToday,
        review_today: localMeta.reviewToday,
        learn_today: localMeta.learnToday,
        done_today: localMeta.doneToday,
        client_at: Date.now(),
      });
      if (!stillInScope(epoch)) return;
      const rm2 = await api.getMeta(today);
      if (!stillInScope(epoch)) return;
      if (rm2 && rm2.meta && rm2.meta.day_key === localMeta.dayKey) {
        const rmMeta = rm2.meta;
        const merged: Meta = {
          ...localMeta,
          dayKey: rmMeta.day_key!,
          newToday: Math.max(localMeta.newToday, rmMeta.new_today ?? 0),
          reviewToday: Math.max(localMeta.reviewToday, rmMeta.review_today ?? 0),
          learnToday: Math.max(localMeta.learnToday, rmMeta.learn_today ?? 0),
          doneToday: Math.max(localMeta.doneToday, rmMeta.done_today ?? 0),
        };
        set({ meta: merged });
        saveMeta(merged);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("getMeta sync failed:", message);
      if (stillInScope(epoch)) mirrorMeta(get().get());
    }
  },
}));
