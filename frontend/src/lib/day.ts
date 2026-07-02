// 本地时区 YYYY-MM-DD —— 「天」的边界。与旧版 store.dayKey / 后端 meta.day_key 一致。
const DAY = 86400000;

export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export { DAY };
