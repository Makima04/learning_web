// trans store —— 译文缓存。镜像 web/store.js getTrans/setTrans。
// 优先 window.TRANS（baked 文件），再 localStorage ew.trans.v1。
import { create } from "zustand";

const KEY = "ew.trans.v1";

function loadAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

interface TransStore {
  getTrans: (text: string) => string | undefined;
  setTrans: (text: string, zh: string) => void;
  importAll: (map: Record<string, string>) => void;
  exportAll: () => Record<string, string>;
}

export const useTrans = create<TransStore>(() => ({
  getTrans: (text) => {
    text = String(text ?? "").trim();
    if (!text) return undefined;
    if (typeof window !== "undefined" && window.TRANS && window.TRANS[text])
      return window.TRANS[text];
    return loadAll()[text] || undefined;
  },
  setTrans: (text, zh) => {
    text = String(text ?? "").trim();
    const all = loadAll();
    all[text] = zh || "";
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  },
  importAll: (map) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(map || {}));
    } catch {
      /* ignore */
    }
  },
  exportAll: () => {
    const baked =
      typeof window !== "undefined" && window.TRANS ? window.TRANS : {};
    return { ...baked, ...loadAll() };
  },
}));
