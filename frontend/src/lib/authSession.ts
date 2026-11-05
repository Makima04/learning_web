// 登录过期状态：独立于请求客户端，避免同步链路 / 弹窗与 api.ts 互相依赖。
// 刷新后仍要记得「这个账号的登录已失效」，否则会退回原来那种静默失败。
const KEY_AUTH_EXPIRED = "ew.auth.expired.v1";

/** 登录过期状态变化：订阅方自行读 isAuthExpired() 决定弹窗开合 */
export const AUTH_EXPIRED_EVENT = "ew:auth-expired";
/** 主动唤起重新登录弹窗（设置页的「重新登录」按钮） */
export const OPEN_AUTH_DIALOG_EVENT = "ew:open-auth-dialog";
export const AUTH_EXPIRED_MESSAGE = "登录已过期，请重新登录";

function read(): boolean {
  try {
    return localStorage.getItem(KEY_AUTH_EXPIRED) === "1";
  } catch {
    return false;
  }
}

/**
 * 关键：标记时**不清 token**——syncQueue 用 isLoggedIn() 决定新进度是否入队，
 * 清掉会让会话失效期间的学习记录不再进待上传队列，反而丢数据。
 */
let expired = read();

export function isAuthExpired(): boolean {
  return expired;
}

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

/** 只标记一次，避免并发 401 反复弹窗 */
export function markAuthExpired() {
  if (expired) return;
  expired = true;
  try {
    localStorage.setItem(KEY_AUTH_EXPIRED, "1");
  } catch {
    /* quota */
  }
  emit();
}

/** 重新登录成功 / 主动登出后恢复 */
export function clearAuthExpired() {
  if (!expired) return;
  expired = false;
  try {
    localStorage.removeItem(KEY_AUTH_EXPIRED);
  } catch {
    /* ignore */
  }
  emit();
}

// 多标签页：另一个标签页标记过期 / 重新登录后，本页也跟着弹窗或收起
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== KEY_AUTH_EXPIRED) return;
    const next = e.newValue === "1";
    if (next === expired) return;
    expired = next;
    emit();
  });
}
