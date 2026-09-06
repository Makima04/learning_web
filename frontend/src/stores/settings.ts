// settings store —— 镜像 web/store.js DEFAULT_SETTINGS + 深合并 + 持久化 ew.set.v1。
// 账号级设置（登录后 fire-and-forget 镜像 /api/settings）；llm 不在此——LLM 仅管理员服务端配置。
import { create } from "zustand";
import * as api from "@/lib/api";
import { getScopeEpoch, scopedKey, stillInScope } from "@/lib/storageScope";
import { enqueueSettings } from "@/lib/syncQueue";
import {
  DEFAULT_SRS_MAX_IVL,
  isSrsMaxIvl,
  type SrsMaxIvl,
} from "@/lib/srs";

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
  /**
   * 重学是否启用第 4 轮完型填空（例句挖空四选一）。
   * 默认关闭：只做例句 / 词形 / 释义三轮。
   */
  enableCloze: boolean;
  /** 英语复习间隔上限（天）：14 或 15。答对后不再拉更长。 */
  srsMaxIvl: SrsMaxIvl;
  /**
   * 学习日志：各分类每日复盘上限（张）。
   * 未出现的分类键使用 DEFAULT_JOURNAL_CATEGORY_DAILY_REVIEW（3）。
   * 仅对手写卡片生效；图谱按 journalKgChapterDailyLimit 计章。
   */
  journalDailyReviewLimits: Record<string, number>;
  /** 知识图谱每日章节大卡上限。默认 3。 */
  journalKgChapterDailyLimit: number;
  /** 每日背词提醒（浏览器通知，应用打开期间生效）。默认关闭。 */
  reminderEnabled: boolean;
  /** 提醒时间 HH:MM（本地时区）。默认 08:30。 */
  reminderTime: string;
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
  enableCloze: false,
  srsMaxIvl: DEFAULT_SRS_MAX_IVL,
  journalDailyReviewLimits: {},
  journalKgChapterDailyLimit: 3,
  reminderEnabled: false,
  reminderTime: "08:30",
};

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

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

/** 规范化分类每日上限表；非法项丢弃。 */
function normalizeJournalLimits(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!id || typeof raw !== "number" || !Number.isFinite(raw)) continue;
    out[id] = Math.max(0, Math.min(100, Math.floor(raw)));
  }
  return out;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 规范化提醒时间；非法值回落 undefined（不覆盖默认）。 */
function normalizeReminderTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().slice(0, 5); // time input 偶尔带秒（HH:MM:SS）
  return HHMM_RE.test(v) ? v : undefined;
}

function pickSettingValue(key: keyof Settings, value: unknown): unknown {
  if (key === "journalDailyReviewLimits") return normalizeJournalLimits(value);
  if (key === "journalKgChapterDailyLimit") {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(20, Math.floor(value)));
  }
  if (key === "reminderTime") return normalizeReminderTime(value);
  if (key === "reminderEnabled") return typeof value === "boolean" ? value : undefined;
  if (key === "srsMaxIvl") {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const n = Math.floor(value);
    return isSrsMaxIvl(n) ? n : undefined;
  }
  return value;
}

/** 只取已写出的字段；没有 key / 空对象视为「用户没改过」，不能当成本地权威。 */
function readPersistedPatch(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const clean = stripLlm(parsed as Record<string, unknown>);
    const patch: Partial<Settings> = {};
    for (const k of SETTING_KEYS) {
      if (clean[k] === undefined) continue;
      const next = pickSettingValue(k, clean[k]);
      if (next !== undefined) (patch as Record<string, unknown>)[k] = next;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
}

function asRemotePatch(remote: unknown): Partial<Settings> | null {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return null;
  const clean = stripLlm(remote as Record<string, unknown>);
  const patch: Partial<Settings> = {};
  for (const k of SETTING_KEYS) {
    if (clean[k] === undefined) continue;
    const next = pickSettingValue(k, clean[k]);
    if (next !== undefined) (patch as Record<string, unknown>)[k] = next;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function getSettings(): Settings {
  const persisted = readPersistedPatch() || {};
  return { ...DEFAULT_SETTINGS, ...persisted };
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
  // 登录后以服务端为权威拉取账号级设置；未持久化的默认值不得覆盖远端，纯拉取不整包回写
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
    const epoch = getScopeEpoch();
    try {
      const r = await api.getSettings();
      if (!stillInScope(epoch)) return;
      const remotePatch = asRemotePatch(r && r.settings);
      const localPatch = readPersistedPatch();

      if (remotePatch) {
        // 服务端权威：远端填默认缺口。未持久化的默认值不覆盖远端。
        const next: Settings = { ...DEFAULT_SETTINGS, ...remotePatch };
        const fill: Partial<Settings> = {};
        if (localPatch) {
          for (const k of SETTING_KEYS) {
            if (remotePatch[k] === undefined && localPatch[k] !== undefined) {
              (fill as Record<string, unknown>)[k] = localPatch[k];
            }
          }
        }
        const merged: Settings = { ...next, ...fill };
        // 只持久化远端 + 本地补丁，不把默认值写进 storage 冒充「用户改过」
        saveJSON(storageKey(), stripLlm({ ...remotePatch, ...fill }));
        set(merged);
        // 纯拉取不整包 enqueue；仅补远端缺字段时入队
        if (Object.keys(fill).length > 0) {
          enqueueSettings(stripLlm(merged) as unknown as Record<string, unknown>);
        }
        return;
      }

      if (localPatch) {
        // 远端为空，本地确有用户持久化过的设置：补上去并入队
        const next: Settings = { ...DEFAULT_SETTINGS, ...localPatch };
        saveJSON(storageKey(), stripLlm(next));
        set(next);
        enqueueSettings(stripLlm(next) as unknown as Record<string, unknown>);
        return;
      }

      // 两边都空：保持默认，不写 localStorage、不回写云端
      set({ ...DEFAULT_SETTINGS });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("getSettings sync failed:", message);
      // 拉取失败也不要把未持久化的默认值打到云端
      if (stillInScope(epoch) && readPersistedPatch()) {
        enqueueSettings(getSettings() as unknown as Record<string, unknown>);
      }
    }
  },
}));
