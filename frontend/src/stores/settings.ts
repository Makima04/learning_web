// settings store —— 镜像 web/store.js DEFAULT_SETTINGS + 深合并 + 持久化 ew.set.v1。
// 账号级设置（登录后 fire-and-forget 镜像 /api/settings）；llm 不在此——LLM 仅管理员服务端配置。
import { create } from "zustand";
import * as api from "@/lib/api";
import { scopedKey } from "@/lib/storageScope";
import { enqueueSettings } from "@/lib/syncQueue";

export type Direction = "en2cn" | "cn2en" | "random";

/** 数学轨：数二界面只展示数二考点 */
export type MathTrackSetting = "math1" | "math2";

export interface Settings {
  dailyNew: number;
  dailyReview: number;
  direction: Direction;
  autoSpeak: boolean;
  speakOnWordClick: boolean;
  rate: number;
  orderSeed: number;
  groupSize: number;
  /** 数一 / 数二 */
  mathTrack: MathTrackSetting;
  /** 知识图谱入口是否显示 408 */
  enableCs408: boolean;
  /** 知识图谱入口是否显示数学 */
  enableMath: boolean;
}

const KEY_BASE = "ew.set.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  dailyReview: 100,
  direction: "en2cn",
  autoSpeak: true,
  speakOnWordClick: true,
  rate: 1.0,
  orderSeed: 0x9e3779b9,
  groupSize: 20,
  mathTrack: "math1",
  enableCs408: true,
  enableMath: true,
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
  const raw = loadJSON<Partial<Settings>>(storageKey(), {});
  const clean = stripLlm(raw);
  return { ...DEFAULT_SETTINGS, ...clean };
}
export function saveSettings(s: Settings) {
  const clean = stripLlm(s);
  saveJSON(storageKey(), clean);
  // 登录后入队批量镜像，失败可重试
  if (api.isLoggedIn()) {
    enqueueSettings(clean as unknown as Record<string, unknown>);
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
      const local = getSettings();
      // 远端填默认缺口，本地当前值优先；再写回账号
      const preferLocal = {
        ...DEFAULT_SETTINGS,
        ...(remote ? stripLlm(remote) : {}),
        ...local,
      };
      saveJSON(storageKey(), stripLlm(preferLocal));
      set(preferLocal);
      enqueueSettings(stripLlm(preferLocal) as unknown as Record<string, unknown>);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("getSettings sync failed:", message);
      enqueueSettings(getSettings() as unknown as Record<string, unknown>);
    }
  },
}));
