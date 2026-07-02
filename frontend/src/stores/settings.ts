// settings store —— 镜像 web/store.js DEFAULT_SETTINGS + 深合并 + 持久化 ew.set.v1。
import { create } from "zustand";

export type Direction = "en2cn" | "cn2en" | "random";

export interface LlmSettings {
  url: string;
  key: string;
  model: string;
}

export interface Settings {
  dailyNew: number;
  direction: Direction;
  autoSpeak: boolean;
  rate: number;
  orderSeed: number;
  llm: LlmSettings;
}

const KEY = "ew.set.v1";

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  direction: "en2cn",
  autoSpeak: true,
  rate: 1.0,
  orderSeed: 0x9e3779b9,
  llm: { url: "", key: "", model: "" },
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

export function getSettings(): Settings {
  const saved = loadJSON<Partial<Settings>>(KEY, {});
  const merged: Settings = { ...DEFAULT_SETTINGS, ...saved };
  merged.llm = { ...DEFAULT_SETTINGS.llm, ...(saved.llm || {}) };
  return merged;
}
export function saveSettings(s: Settings) {
  saveJSON(KEY, s);
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  load: () => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  set: (patch) => {
    const next = { ...get(), ...patch };
    saveSettings(next);
    set(next);
  },
  load: () => set(getSettings()),
}));
