// 标记回写：题 → 考点状态 + 遗忘曲线（SM-2 简化）
import type { MarkLevel, UserKpState } from "./types";

export const DAY = 86400000;
export const EASE_INIT = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;

export function newKpState(now = Date.now()): UserKpState {
  return {
    covered: false,
    status: "unknown",
    confidence: 0,
    ease: EASE_INIT,
    ivl: 0,
    due: 0,
    lapses: 0,
    updatedAt: now,
  };
}

function clampEase(e: number): number {
  return Math.max(EASE_MIN, Math.min(EASE_MAX, e));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function deriveStatus(confidence: number, lapses: number): UserKpState["status"] {
  if (confidence <= 0.05 && lapses === 0) return "unknown";
  if (confidence < 0.35) return "weak";
  if (confidence < 0.55) return "learning";
  if (confidence < 0.8) return "stable";
  return "mastered";
}

/**
 * 将轻量标记应用到考点状态。
 * primary 权重大，secondary 较小；综合题可再指定 weakKpIds 强制弱化。
 */
export function applyMarkToKp(
  prev: UserKpState | undefined,
  mark: MarkLevel,
  opts: { role?: "primary" | "secondary"; forceWeak?: boolean; now?: number } = {}
): UserKpState {
  const now = opts.now ?? Date.now();
  const role = opts.role ?? "primary";
  const w = role === "primary" ? 1 : 0.45;
  const s = { ...(prev ?? newKpState(now)) };
  s.updatedAt = now;
  s.lastMark = mark;

  if (mark === "skip") {
    // 跳过不改掌握，只记时间
    return s;
  }

  if (mark === "fail" || opts.forceWeak) {
    s.covered = true;
    s.lapses += role === "primary" || opts.forceWeak ? 1 : 0;
    s.confidence = clamp01(s.confidence - 0.35 * w);
    s.ease = clampEase(s.ease - 0.2 * w);
    s.ivl = 0;
    s.due = now; // 立刻进入复习
    s.status = deriveStatus(s.confidence, s.lapses);
    if (opts.forceWeak || mark === "fail") s.status = "weak";
    return s;
  }

  if (mark === "fuzzy") {
    s.covered = true;
    s.confidence = clamp01(s.confidence - 0.12 * w + 0.05);
    s.ease = clampEase(s.ease - 0.05 * w);
    s.ivl = Math.max(1, Math.round((s.ivl || 1) * 0.5));
    s.due = now + s.ivl * DAY;
    s.status = deriveStatus(s.confidence, s.lapses);
    return s;
  }

  // pass
  s.covered = true;
  s.confidence = clamp01(s.confidence + 0.18 * w);
  if (s.ivl <= 0) {
    s.ivl = role === "primary" ? 2 : 1;
  } else {
    s.ivl = Math.max(1, Math.round(s.ivl * s.ease));
  }
  s.ease = clampEase(s.ease + 0.05 * w);
  s.due = now + s.ivl * DAY;
  s.status = deriveStatus(s.confidence, s.lapses);
  return s;
}

/** 模块学习入口：标记已学（覆盖，不直接当掌握） */
export function markCovered(
  prev: UserKpState | undefined,
  covered: boolean,
  now = Date.now()
): UserKpState {
  const s = { ...(prev ?? newKpState(now)) };
  s.covered = covered;
  s.updatedAt = now;
  if (covered && s.status === "unknown") {
    s.status = "learning";
    s.confidence = Math.max(s.confidence, 0.15);
  }
  return s;
}

/**
 * 一题标记 → 多考点回写。
 * weakKpIds：用户展开细标的不会考点（强制 weak）。
 */
export function applyItemMark(
  states: Record<string, UserKpState>,
  primaryKpId: string,
  secondaryKpIds: string[],
  mark: MarkLevel,
  weakKpIds: string[] = [],
  now = Date.now()
): Record<string, UserKpState> {
  const next = { ...states };
  const weakSet = new Set(weakKpIds);

  next[primaryKpId] = applyMarkToKp(next[primaryKpId], mark, {
    role: "primary",
    forceWeak: weakSet.has(primaryKpId),
    now,
  });

  for (const kid of secondaryKpIds) {
    next[kid] = applyMarkToKp(next[kid], mark, {
      role: "secondary",
      forceWeak: weakSet.has(kid),
      now,
    });
  }

  // 细标弱考点但未挂在 secondary 上时也回写
  for (const kid of weakKpIds) {
    if (kid === primaryKpId || secondaryKpIds.includes(kid)) continue;
    next[kid] = applyMarkToKp(next[kid], "fail", { role: "primary", forceWeak: true, now });
  }

  return next;
}
