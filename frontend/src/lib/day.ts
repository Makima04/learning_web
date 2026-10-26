// 「一天」的边界统一按 **北京时间（UTC+8）0 点**，与设备本地时区无关。
// 全应用只在这里换算日期：dayKey / 日平移 / 日期起点都要走本模块，
// 别再用 new Date(y, m-1, d) 这类吃设备时区的写法。
// 后端 meta.day_key、study_events.day_key、/api/stats/* 都按这套字符串对齐。
const DAY = 86400000;

/** 北京时间相对 UTC 的偏移（分钟）：东八区 = 480 */
export const DAY_TZ_OFFSET_MIN = 8 * 60;

const TZ_MS = DAY_TZ_OFFSET_MIN * 60000;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 时间戳 → 北京时间的 YYYY-MM-DD */
export function dayKey(ts: number = Date.now()): string {
  // 先平移到东八区，再用 UTC 取值：等价于「北京时间的年月日」，且不受设备时区/夏令时影响
  const d = new Date(ts + TZ_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → 北京时间当天 0 点的时间戳（ms）；格式非法返回 0 */
export function dayKeyStartMs(day: string): number {
  const m = DAY_KEY_RE.exec(day);
  if (!m) return 0;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return 0;
  const ms = Date.UTC(y, mo - 1, d) - TZ_MS;
  return Number.isFinite(ms) ? ms : 0;
}

/** dayKey 加减天数（纯日期运算，不依赖设备时区） */
export function shiftDayKey(day: string, deltaDays: number): string {
  const start = dayKeyStartMs(day);
  if (!start) return day;
  return dayKey(start + deltaDays * DAY);
}

/** dayKey 是星期几：0=周日 …… 6=周六（北京时间） */
export function weekdayOf(day: string): number {
  const start = dayKeyStartMs(day);
  if (!start) return 0;
  return new Date(start + TZ_MS).getUTCDay();
}

/** 时间戳 → 北京时间当天的分钟数（0..1439） */
export function minutesOfDay(ts: number = Date.now()): number {
  const d = new Date(ts + TZ_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export { DAY };
