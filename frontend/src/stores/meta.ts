// meta store —— 每日计数器，本地时区 YYYY-MM-DD 跨日重置；登录后 fire-and-forget 镜像 /api/meta。
// 镜像 web/store.js getMeta / bumpMeta / sync（meta 部分）。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";

const KEY = "ew.meta.v1";

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
    meta = JSON.parse(localStorage.getItem(KEY) || "null");
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
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
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
    // 访问时若跨日重置
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
    if (api.isLoggedIn()) {
      void api
        .putMeta({
          day_key: next.dayKey,
          new_today: next.newToday,
          review_today: next.reviewToday,
          learn_today: next.learnToday,
          done_today: next.doneToday,
        })
        .catch((e: any) => console.warn("mirror putMeta failed:", e?.message));
    }
    return next[field];
  },
  replace: (m) => {
    set({ meta: m });
    saveMeta(m);
  },
  reset: () => {
    const m = loadMeta();
    set({ meta: m });
  },
  rehydrate: () => set({ meta: loadMeta() }),
  syncMeta: async () => {
    try {
      // 传本地 dayKey 给服务端：让 meta_get 按客户端当天查，避免跨时区不对称
      const rm = await api.getMeta(dayKey());
      if (rm && rm.meta) {
        const rmMeta = rm.meta;
        const localMeta = get().meta;
        if (rmMeta.day_key === localMeta.dayKey) {
          // 同一天：remote 覆盖本地
          const merged: Meta = {
            ...localMeta,
            dayKey: rmMeta.day_key!,
            newToday: rmMeta.new_today ?? localMeta.newToday,
            reviewToday: rmMeta.review_today ?? localMeta.reviewToday,
            learnToday: rmMeta.learn_today ?? localMeta.learnToday,
            doneToday: rmMeta.done_today ?? localMeta.doneToday,
          };
          set({ meta: merged });
          saveMeta(merged);
        }
        // 不同 dayKey：保留本地当前日
      }
    } catch (e: any) {
      console.warn("getMeta sync failed:", e?.message);
    }
  },
}));
