// 每日背词提醒 —— 纯前端浏览器通知：应用打开期间轮询，到点每天最多弹一次。
// 无推送服务器，页面不在线不会触发；写操作离线由 syncQueue 兜底，与本模块无关。
import { dayKey } from "@/lib/day";
import { computeStreaks, loadDayCounts } from "@/lib/dayCounts";
import { scopedKey } from "@/lib/storageScope";

// 按账号隔离：同一浏览器多账号各自有当天的提醒配额
const FIRED_KEY_BASE = "ew.reminder.firedDay";

/** 轮询间隔：到点后最迟 30s 内触发 */
export const REMINDER_CHECK_INTERVAL_MS = 30_000;

/** 解析 HH:MM 为当天分钟数；非法返回 null */
export function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function shouldFireReminder(
  now: Date,
  reminderTime: string,
  lastFiredDay: string | null
): boolean {
  const minutes = parseHHMM(reminderTime);
  if (minutes == null) return false;
  const today = dayKey(now.getTime());
  if (lastFiredDay === today) return false;
  return now.getHours() * 60 + now.getMinutes() >= minutes;
}

export function readLastFiredDay(): string | null {
  try {
    return localStorage.getItem(scopedKey(FIRED_KEY_BASE));
  } catch {
    return null;
  }
}

function writeLastFiredDay(day: string) {
  try {
    localStorage.setItem(scopedKey(FIRED_KEY_BASE), day);
  } catch {
    /* ignore */
  }
}

export function reminderSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** 请求通知权限；不支持或拒绝时返回相应状态 */
export async function requestReminderPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!reminderSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** 组通知文案：带上连续天数，断了链子是最疼的提醒 */
export function reminderBody(): string {
  const streaks = computeStreaks(loadDayCounts(), dayKey());
  if (streaks.current >= 2) return `已连续学习 ${streaks.current} 天，别断了链子`;
  return "打开完成今天的计划，保持手感";
}

export interface ReminderLoopOptions {
  intervalMs?: number;
  now?: () => Date;
  /** 返回 false 表示通知未真正发出（权限丢失 / 平台不支持本地通知），当天配额不被消耗 */
  notify?: () => boolean;
  getEnabled?: () => boolean;
  getTime?: () => string;
}

/** 启动提醒轮询；返回停止函数。参数可注入便于测试。 */
export function startReminderLoop(opts: ReminderLoopOptions = {}): () => void {
  const intervalMs = opts.intervalMs ?? REMINDER_CHECK_INTERVAL_MS;
  const now = opts.now ?? (() => new Date());
  const notify = opts.notify ?? (() => {
    if (!reminderSupported() || Notification.permission !== "granted") return false;
    try {
      const n = new Notification("该背单词啦", {
        body: reminderBody(),
        // 图标在生产 dist 根下；取不到也无碍
        icon: "/icons/icon-192.png",
        tag: "ew-reminder", // 同 tag 覆盖，避免堆积
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    } catch {
      // iOS PWA 等平台不支持本地 Notification 构造，会直接抛错
      return false;
    }
  });
  const getEnabled = opts.getEnabled ?? (() => false);
  const getTime = opts.getTime ?? (() => "08:30");

  const tick = () => {
    if (!getEnabled()) return;
    if (!shouldFireReminder(now(), getTime(), readLastFiredDay())) return;
    // 发送失败（含权限丢失/平台不支持）不写已触发标记，下个 tick 还有机会
    if (!notify()) return;
    writeLastFiredDay(dayKey(now().getTime()));
  };

  // 用全局 setInterval（而非 window.setInterval）：浏览器与 node 测试环境都存在
  const id = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(id);
}
