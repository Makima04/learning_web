// meta store —— 每日计数器，本地时区 YYYY-MM-DD；登录后入队镜像 /api/meta。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import { scopedKey } from "@/lib/storageScope";
import { enqueueMeta } from "@/lib/syncQueue";

const KEY_BASE = "ew.meta.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
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
  });
}

interface MetaStore {
  meta: Meta;
  get: () => Meta;
  bump: (field: "newToday" | "reviewToday" | "learnToday" | "doneToday", by?: number) => number;
  replace: (m: Meta) => void;
  reset: () => void;
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
  reset: () => {
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
    if (api.isLoggedIn()) mirrorMeta(m);
  },
  rehydrate: () => set({ meta: loadMeta() }),
  syncMeta: async () => {
    try {
      const localMeta = get().get();
      // 先推本地（服务端 GREATEST 合并）
      await api.putMeta({
        day_key: localMeta.dayKey,
        new_today: localMeta.newToday,
        review_today: localMeta.reviewToday,
        learn_today: localMeta.learnToday,
        done_today: localMeta.doneToday,
      });
      const rm = await api.getMeta(dayKey());
      if (rm && rm.meta && rm.meta.day_key === localMeta.dayKey) {
        const rmMeta = rm.meta;
        const merged: Meta = {
          ...localMeta,
          dayKey: rmMeta.day_key!,
          // 取较大值，与服务端 GREATEST 一致
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
      mirrorMeta(get().get());
    }
  },
}));
