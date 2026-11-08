// 复习性价比：把 priority（0–1 的相对权重）翻译成用户能读的「性价比分 / 每年占多少分 / 预计提分 / 预计耗时」。
// 只做展示层的换算，排序仍然用 math1Analysis.priority，避免两套口径打架。
import type { ReviewTopic } from "./math1Analysis";

export interface RoiInfo {
  /** 组内归一化 0–100；样本不足时为 null（只显示高/中/低） */
  score: number | null;
  tier: "高" | "中" | "低";
  /** 掌握缺口 0–1 */
  gap: number;
  /** 该考点平均每年占多少分（按最近一年该题型卷面总分还原） */
  perPaper: number;
  /** 按缺口估算的可提分（约数，UI 必须标「估算」） */
  estGain: number;
  /** 补齐耗时（分钟，成本档位映射，人工粗估） */
  estMinutes: number;
}

/** 成本 1–3 档 → 粗估耗时。与文档里「人工相对估计」的口径保持一致，不做精确承诺。 */
const MINUTES_BY_COST = [20, 35, 55];

/** 一道题的大致耗时，只用于队列的「约 N 分钟」，按题型粗分。 */
const MINUTES_BY_KIND: Record<string, number> = { big: 12, fill: 5, mcq: 4 };

function tierOf(score: number): RoiInfo["tier"] {
  return score >= 70 ? "高" : score >= 45 ? "中" : "低";
}

/** 最近一年该题型的卷面总分，用来把「占分比例」还原成「多少分」。 */
export function kindPointsPerPaper(items: { year: number; kind: string; points: number }[], kind: string): number {
  const rows = items.filter((q) => q.kind === kind);
  if (!rows.length) return 0;
  const latest = Math.max(...rows.map((q) => q.year));
  return rows.filter((q) => q.year === latest).reduce((sum, q) => sum + q.points, 0);
}

export function computeRoi(topics: ReviewTopic[], pointsPerPaper: number): Map<string, RoiInfo> {
  const max = Math.max(...topics.map((t) => t.priority), 0) || 1;
  // 少于 3 个考点有记录时，分数没有可比性，退化成高/中/低。
  const reliable = topics.filter((t) => t.status !== "unknown").length >= 3;
  const map = new Map<string, RoiInfo>();
  for (const t of topics) {
    const gap = t.confidence === null ? 0.5 : Math.max(0.08, 1 - t.confidence);
    const perPaper = pointsPerPaper * t.recentPointShare;
    const raw = Math.round((t.priority / max) * 100);
    map.set(t.kpId, {
      score: reliable ? raw : null,
      tier: tierOf(raw),
      gap,
      perPaper,
      estGain: Math.round(perPaper * gap * 10) / 10,
      estMinutes: MINUTES_BY_COST[Math.min(MINUTES_BY_COST.length - 1, Math.max(0, t.cost - 1))],
    });
  }
  return map;
}

export function practiceMinutes(kind: string): number {
  return MINUTES_BY_KIND[kind] ?? 10;
}

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
