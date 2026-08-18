// 按登录用户隔离 localStorage key，避免多账号串数据。
// 未登录：base key（访客）；登录：`${base}.u{userId}`。

const KEY_USER = "ew.user.v1";

/** undefined = 尚未显式设置，回落到 localStorage 里的 user */
let explicitUserId: number | null | undefined = undefined;

function readUserIdFromStorage(): number | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    if (!raw) return null;
    const u = JSON.parse(raw) as { id?: number } | null;
    return typeof u?.id === "number" ? u.id : null;
  } catch {
    return null;
  }
}

/** 当前作用域用户 id；null 表示访客 */
export function currentScopeUserId(): number | null {
  if (explicitUserId !== undefined) return explicitUserId;
  return readUserIdFromStorage();
}

export function setScopeUserId(id: number | null) {
  explicitUserId = id;
}

/** 生成当前作用域下的 storage key */
export function scopedKey(base: string): string {
  const id = currentScopeUserId();
  if (id == null) return base;
  return `${base}.u${id}`;
}

/**
 * 登录后若账号命名空间为空、但存在旧的无作用域数据，则拷贝一次（升级兼容）。
 * 不删除 unscoped，以便登出后访客数据仍在。
 */
export function migrateUnscopedIfNeeded(base: string) {
  const scoped = scopedKey(base);
  if (scoped === base) return;
  try {
    if (localStorage.getItem(scoped)) return;
    const unscoped = localStorage.getItem(base);
    if (unscoped) localStorage.setItem(scoped, unscoped);
  } catch {
    /* ignore */
  }
}

/** 学习进度相关 base key（主题 / 翻译缓存不按用户隔离） */
export const SCOPED_BASES = [
  "ew.cards.v1",
  "ew.meta.v1",
  "ew.set.v1",
  "ew.journal.v1",
  "ew.todayLog.v1",
  "ew.sync.pending.cards.v1",
  "ew.sync.pending.meta.v1",
  "ew.sync.pending.settings.v1",
  "ew.sync.pending.studyEvents.v1",
  "ew.sync.pending.journal.v1",
  "ew.sync.status.v1",
] as const;

export function migrateAllUnscopedIfNeeded() {
  for (const base of SCOPED_BASES) migrateUnscopedIfNeeded(base);
}
