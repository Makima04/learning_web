/**
 * 更新面板的检查结果新鲜度。
 *
 * 服务端只缓存最近一次 `check` 的结果，页面加载时读到的是旧快照：
 * 如果不动手点「检查更新」，两天前的结论也会被当成「当前已是最新」展示。
 * 这里给出统一的过期判定，面板据此显示检查时间、自动复查。
 */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface CheckFreshness {
  /** 相对时间文案，如「3 分钟前」「尚未检查」。 */
  label: string;
  /** 已过期（或从未检查），不能据此宣称「已是最新」。 */
  stale: boolean;
}

function relative(age: number): string {
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function checkFreshness(checkedAt: string | null | undefined, now = Date.now()): CheckFreshness {
  const at = checkedAt ? Date.parse(checkedAt) : Number.NaN;
  if (Number.isNaN(at)) return { label: "尚未检查", stale: true };
  // 服务器时钟略快时 age 可能为负，按「刚刚」处理。
  const age = Math.max(0, now - at);
  return { label: relative(age), stale: age > STALE_AFTER_MS };
}
