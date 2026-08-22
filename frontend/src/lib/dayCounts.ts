// 每日学习词数历史 —— 热力图 / 连续天数的数据源。
// 访客本地记（scoped localStorage）；登录后与服务端 /api/stats/daily 按「逐日取大」合并展示。
import { dayKey } from "@/lib/day";
import { scopedKey } from "@/lib/storageScope";

const KEY_BASE = "ew.dayCounts.v1";

/** dayKey(YYYY-MM-DD) -> 当日学习词数（去重词数，与 todayLog items 同口径） */
export type DayCounts = Record<string, number>;

/** 历史最多保留 400 天，避免 localStorage 无界增长 */
const MAX_DAYS = 400;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(d: string): d is string {
  return DAY_KEY_RE.test(d);
}

function loadRaw(): DayCounts | null {
  try {
    const raw = localStorage.getItem(scopedKey(KEY_BASE));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: DayCounts = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isValidDay(k)) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
      out[k] = Math.floor(v);
    }
    return out;
  } catch {
    return null;
  }
}

export function loadDayCounts(): DayCounts {
  return loadRaw() || {};
}

function saveDayCounts(counts: DayCounts) {
  try {
    localStorage.setItem(scopedKey(KEY_BASE), JSON.stringify(counts));
  } catch {
    /* ignore */
  }
}

/** 覆盖今日计数（todayLog 变更后调用；count 可为 0 表示当日清零） */
export function noteTodayCount(count: number) {
  const counts = loadDayCounts();
  const today = dayKey();
  if (counts[today] === count) return;
  counts[today] = Math.max(0, Math.floor(count));
  trimToWindow(counts);
  saveDayCounts(counts);
}

/** 只保留最近 MAX_DAYS 天，旧天数丢弃 */
function trimToWindow(counts: DayCounts) {
  const keys = Object.keys(counts).filter(isValidDay).sort();
  if (keys.length <= MAX_DAYS) return;
  const cutoff = keys[keys.length - MAX_DAYS];
  for (const k of keys) {
    if (k < cutoff) delete counts[k];
  }
}

/** 本地日期平移：dayKey 加/减 N 天（本地时区） */
export function shiftDay(dk: string, deltaDays: number): string {
  const m = DAY_KEY_RE.exec(dk);
  if (!m) return dk;
  const [y, mo, d] = dk.split("-").map(Number);
  const date = new Date(y, mo - 1, d + deltaDays);
  return dayKey(date.getTime());
}

export interface Streaks {
  /** 连续学习天数：今天还没学不打断（昨天可为链头） */
  current: number;
  /** 区间内最长连续天数 */
  longest: number;
}

/** 与后端 compute_streaks 同语义：今日或昨日有记录即可作为链头往前数 */
export function computeStreaks(counts: DayCounts, today: string): Streaks {
  const active = Object.keys(counts)
    .filter((k) => isValidDay(k) && counts[k] > 0)
    .sort();
  if (active.length === 0) return { current: 0, longest: 0 };

  // 最长连续段
  let longest = 1;
  let run = 1;
  for (let i = 1; i < active.length; i++) {
    if (shiftDay(active[i - 1], 1) === active[i]) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // 当前连续：今天有则从今天起算，否则昨天有则从昨天起算
  let head = active[active.length - 1] === today ? today : null;
  if (!head && shiftDay(active[active.length - 1], 1) === today) {
    head = active[active.length - 1];
  }
  if (!head) return { current: 0, longest };
  let current = 0;
  const set = new Set(active);
  let cursor = head;
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest: Math.max(longest, current) };
}

/** 两份逐日计数合并：同一天取大（服务端聚合与本地记录互为补充） */
export function mergeDayCounts(a: DayCounts, b: DayCounts): DayCounts {
  const out: DayCounts = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!isValidDay(k)) continue;
    out[k] = Math.max(out[k] || 0, v);
  }
  return out;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

/** 生成 [from, to] 连续区间热力图数据，缺的天补 0 */
export function buildHeatmapDays(counts: DayCounts, from: string, to: string): HeatmapDay[] {
  if (from > to) return [];
  const out: HeatmapDay[] = [];
  // 防御：区间异常大时截断，避免死循环
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 800) {
    out.push({ date: cursor, count: counts[cursor] || 0 });
    cursor = shiftDay(cursor, 1);
    guard += 1;
  }
  return out;
}

/** 以 today 为终点往回取 N 天的起止 dayKey */
export function rangeEndingToday(today: string, days: number): { from: string; to: string } {
  const n = Math.max(1, Math.floor(days));
  return { from: shiftDay(today, -(n - 1)), to: today };
}
