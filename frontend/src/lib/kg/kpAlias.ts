import type { UserItemMark, UserKpState } from "./types";

/** 旧考点 id → 现行 id。日志 / 进度里可能还留着已拆掉的点。 */
export const KP_ID_ALIASES: Record<string, string> = {
  "la.eq.gauss": "la.eq.structure",
  // 2026-11 考点去重：微分等式/不等式证明并入中值定理；不定积分计算并入积分技巧。
  "calc.d1.ineq": "calc.d1.mvt",
  "calc.i1.indef": "calc.i1.tech",
};

export function canonicalKpId(id: string | undefined | null): string {
  if (!id) return "";
  return KP_ID_ALIASES[id] ?? id;
}

/** 合并进度时取更保守的一侧，避免旧考点并入后掌握度被抬高。 */
const STATUS_RANK: Record<UserKpState["status"], number> = {
  weak: 0, learning: 1, unknown: 2, stable: 3, mastered: 4,
};

function mergeKpState(a: UserKpState, b: UserKpState): UserKpState {
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  const older = newer === a ? b : a;
  return {
    covered: a.covered || b.covered,
    status: STATUS_RANK[a.status] <= STATUS_RANK[b.status] ? a.status : b.status,
    confidence: Math.min(a.confidence, b.confidence),
    ease: Math.min(a.ease, b.ease),
    ivl: Math.min(a.ivl, b.ivl),
    // due=0 表示未排复习；两侧都有排期时取更早的一次。
    due: a.due && b.due ? Math.min(a.due, b.due) : a.due || b.due,
    lapses: Math.max(a.lapses, b.lapses),
    lastMark: newer.lastMark ?? older.lastMark,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/**
 * 考点合并的一次性进度迁移：states 的旧 id 键并入现行 id，
 * itemMarks.weakKpIds 同步替换。纯函数；调用方决定是否持久化并回推服务端。
 */
export function migrateKpProgress<
  T extends { states: Record<string, UserKpState>; itemMarks: UserItemMark[] },
>(doc: T): { doc: T; changed: boolean } {
  let changed = false;
  const states: Record<string, UserKpState> = {};
  for (const [id, st] of Object.entries(doc.states)) {
    const want = canonicalKpId(id);
    if (want !== id) changed = true;
    states[want] = states[want] ? mergeKpState(states[want], st) : st;
  }
  const itemMarks = doc.itemMarks.map((m) => {
    if (!m.weakKpIds?.some((id) => canonicalKpId(id) !== id)) return m;
    changed = true;
    return { ...m, weakKpIds: [...new Set(m.weakKpIds.map((id) => canonicalKpId(id)))] };
  });
  return changed ? { doc: { ...doc, states, itemMarks }, changed } : { doc, changed };
}
