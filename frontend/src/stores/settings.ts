// settings store —— 镜像 web/store.js DEFAULT_SETTINGS + 深合并 + 持久化 ew.set.v1。
// 账号级设置（登录后 fire-and-forget 镜像 /api/settings）；llm 不在此——LLM 仅管理员服务端配置。
import { create } from "zustand";
import * as api from "@/lib/api";

export type Direction = "en2cn" | "cn2en" | "random";

export interface Settings {
  dailyNew: number;
  dailyReview: number;
  direction: Direction;
  autoSpeak: boolean;
  speakOnWordClick: boolean;
  rate: number;
  orderSeed: number;
  groupSize: number;
}

const KEY = "ew.set.v1";

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  dailyReview: 100,
  direction: "en2cn",
  autoSpeak: true,
  speakOnWordClick: true,
  rate: 1.0,
  orderSeed: 0x9e3779b9,
  groupSize: 20,
};

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function stripLlm<T extends Record<string, any>>(s: T): T {
  const c = { ...s };
  delete c.llm;
  return c;
}

export function getSettings(): Settings {
  const raw = loadJSON<Partial<Settings>>(KEY, {});
  const clean = stripLlm(raw);
  return { ...DEFAULT_SETTINGS, ...clean };
}
export function saveSettings(s: Settings) {
  const clean = stripLlm(s);
  saveJSON(KEY, clean);
  // 登录后后台镜像写，不 await，失败静默（镜像 putSettings）
  if (api.isLoggedIn()) {
    void api
      .putSettings(clean)
      .catch((e: any) => console.warn("mirror putSettings failed:", e?.message));
  }
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  load: () => void;
  // 登录后从服务端拉取账号级设置覆盖本地（服务端权威，仅覆盖已持久化字段）
  syncFromServer: () => Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  set: (patch) => {
    const next = { ...get(), ...patch };
    saveSettings(next);
    set(next);
  },
  load: () => set(getSettings()),
  syncFromServer: async () => {
    try {
      const r = await api.getSettings();
      const remote = r && r.settings;
      if (remote && Object.keys(remote).length) {
        const merged = { ...getSettings(), ...stripLlm(remote) };
        saveSettings(merged);
        set(merged);
      }
    } catch (e: any) {
      console.warn("getSettings sync failed:", e?.message);
    }
  },
}));
