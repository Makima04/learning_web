// 登录后学习进度镜像写：批量 / 去抖 / 失败入队重试。
// cards 走 bulk；meta / settings 走各自 PUT。

import * as api from "@/lib/api";
import type { CardDTO } from "@/lib/api";

type PendingCards = Record<string, CardDTO>;

const KEY_CARDS = "ew.sync.pending.cards.v1";
const KEY_META = "ew.sync.pending.meta.v1";
const KEY_SETTINGS = "ew.sync.pending.settings.v1";
const KEY_STATUS = "ew.sync.status.v1";

export type SyncStatus = {
  lastOkAt: number | null;
  lastError: string | null;
  pending: boolean;
};

type Listener = (s: SyncStatus) => void;
const listeners = new Set<Listener>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let status: SyncStatus = loadStatus();

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
    /* quota */
  }
}

function loadStatus(): SyncStatus {
  return loadJSON<SyncStatus>(KEY_STATUS, {
    lastOkAt: null,
    lastError: null,
    pending: false,
  });
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  saveJSON(KEY_STATUS, status);
  listeners.forEach((fn) => fn(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function recomputePending() {
  const cards = loadJSON<PendingCards>(KEY_CARDS, {});
  const meta = loadJSON<api.MetaDTO | null>(KEY_META, null);
  const settings = loadJSON<Record<string, unknown> | null>(KEY_SETTINGS, null);
  const pending =
    Object.keys(cards).length > 0 || meta != null || settings != null;
  setStatus({ pending });
}

export function enqueueCard(idx: number, card: CardDTO) {
  if (!api.isLoggedIn()) return;
  const all = loadJSON<PendingCards>(KEY_CARDS, {});
  all[String(idx)] = card;
  saveJSON(KEY_CARDS, all);
  recomputePending();
  scheduleFlush();
}

export function enqueueMeta(meta: api.MetaDTO) {
  if (!api.isLoggedIn()) return;
  saveJSON(KEY_META, meta);
  recomputePending();
  scheduleFlush();
}

export function enqueueSettings(settings: Record<string, unknown>) {
  if (!api.isLoggedIn()) return;
  saveJSON(KEY_SETTINGS, settings);
  recomputePending();
  scheduleFlush();
}

function scheduleFlush(delayMs = 800) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, delayMs);
}

/** 立即刷出待同步项（登录后 / 上线 / 定时） */
export async function flushPending(): Promise<void> {
  if (!api.isLoggedIn() || flushing) return;
  flushing = true;
  try {
    let error: string | null = null;

    const cards = loadJSON<PendingCards>(KEY_CARDS, {});
    if (Object.keys(cards).length > 0) {
      try {
        await api.bulkCards(cards);
        localStorage.removeItem(KEY_CARDS);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const meta = loadJSON<api.MetaDTO | null>(KEY_META, null);
    if (meta) {
      try {
        await api.putMeta(meta);
        localStorage.removeItem(KEY_META);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const settings = loadJSON<Record<string, unknown> | null>(KEY_SETTINGS, null);
    if (settings) {
      try {
        await api.putSettings(settings);
        localStorage.removeItem(KEY_SETTINGS);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const stillCards = loadJSON<PendingCards>(KEY_CARDS, {});
    const stillMeta = loadJSON<api.MetaDTO | null>(KEY_META, null);
    const stillSettings = loadJSON<Record<string, unknown> | null>(KEY_SETTINGS, null);
    const pending =
      Object.keys(stillCards).length > 0 || stillMeta != null || stillSettings != null;

    if (error) {
      setStatus({ lastError: error, pending });
    } else {
      setStatus({ lastError: null, lastOkAt: Date.now(), pending });
    }
  } finally {
    flushing = false;
  }
}

// 启动时若有残留，标记 pending
recomputePending();
