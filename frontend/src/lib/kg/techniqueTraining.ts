// 按「考点 × 题型 × 技巧」覆盖；进度从账号 itemMarks 推导，不另存本地完成标志。
import { dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";
import type { ReviewTopic } from "./math1Analysis";
import type { MarkLevel, UserItemMark } from "./types";
import type { WangdaoItem } from "./wangdao408";

export const TECHNIQUE_REVIEW_DAYS = 3;
export type TechniqueStatus = "unseen" | "learning" | "weak" | "preliminary" | "due" | "stable";
export type TrainingReason = "representative" | "supplement" | "verify";
export interface TechniqueRecommendation {
  item: WangdaoItem;
  techniqueIds: string[];
  reason: TrainingReason;
}
export interface TechniqueGroup {
  id: string;
  total: number;
  tested: boolean;
  passed: number;
  status: TechniqueStatus;
  /** 没有两道不同题或缺主考题时，不声称覆盖完成。 */
  shortage: boolean;
  reviewOn: string | null;
  recommendations: TechniqueRecommendation[];
}
export interface TechniquePlan {
  groups: TechniqueGroup[];
  recommendations: TechniqueRecommendation[];
  untaggedCount: number;
  tested: number;
  preliminary: number;
  stable: number;
  weak: number;
}

/** 旧记录以 ts 作为首次通过时间兼容；跳过保留原证据，不覆盖已提交的判断。 */
export function nextPracticeMark(
  prev: UserItemMark | undefined, itemId: string, mark: MarkLevel, now: number,
  weakKpIds: string[] = [],
): UserItemMark {
  if (mark === "skip" && prev) return prev;
  const oldPasses = prev?.mark === "pass" ? (prev.passTimes ?? [prev.passStartedAt ?? prev.ts, prev.ts]) : [];
  const passes = [...oldPasses.filter((ts) => dayKey(ts) !== dayKey(now)), now];
  return {
    itemId, mark, ts: now, weakKpIds,
    passStartedAt: mark === "pass"
      ? prev?.mark === "pass" ? (prev.passStartedAt ?? prev.ts) : now
      : undefined,
    lastWeakAt: mark === "fail" || mark === "fuzzy" ? now : prev?.lastWeakAt,
    // 保留最初日期和最近 31 个通过日，避免无限增长；当天连点也不会制造额外证据。
    passTimes: mark === "pass" ? (passes.length > 32 ? [passes[0], ...passes.slice(-31)] : passes) : undefined,
  };
}

function sourceAllowed(topic: ReviewTopic, q: WangdaoItem): boolean {
  return q.kind === topic.kind && q.kp_ids.includes(topic.kpId)
    && (topic.subject === "math" ? q.source === "lilin880" || q.source === "zhangyu1000"
      : !q.source || q.source === "wangdao");
}

/** 单技巧题或明确主技巧标注才作主考证据；多标签的顺序不代表主次。 */
function primary(q: WangdaoItem, topic: ReviewTopic, id: string): boolean {
  return q.kp_ids[0] === topic.kpId
    && (q.primaryFacet === id || (q.facets?.length === 1 && q.facets[0] === id));
}

function order(a: WangdaoItem, b: WangdaoItem): number {
  return (a.ord ?? a.qno) - (b.ord ?? b.qno) || a.id.localeCompare(b.id);
}

export function buildTechniquePlan(
  topic: ReviewTopic, catalog: WangdaoItem[], marks: UserItemMark[],
  dueIds: ReadonlySet<string> = new Set(), waitingIds: ReadonlySet<string> = new Set(),
  now = Date.now(),
): TechniquePlan {
  const pool = [...new Map(catalog.filter((q) => sourceAllowed(topic, q)).map((q) => [q.id, q])).values()];
  const byId = new Map(marks.map((m) => [m.itemId, m]));
  // 必练技巧来自真题分类及主考点的明确专项题；综合题的辅助标签不扩成新的必练技巧。
  // 真题已知而缺教辅的技巧仍列出缺题；无标签题不推断方法。
  const ids = [...new Set([...topic.facets, ...pool.flatMap((q) => q.kp_ids[0] !== topic.kpId ? []
    : q.primaryFacet ? [q.primaryFacet] : q.facets?.length === 1 ? q.facets : [])])].sort();
  const groups = ids.map((id): TechniqueGroup => {
    const items = pool.filter((q) => q.facets?.includes(id)).sort(order);
    const isPrimary = (q: WangdaoItem) => primary(q, topic, id);
    const usable = (q: WangdaoItem) => !waitingIds.has(q.id) || dueIds.has(q.id);
    const marked = items.filter((q) => { const m = byId.get(q.id); return m && m.mark !== "skip"; });
    const lastWeakAt = Math.max(0, ...items.map((q) => {
      const m = byId.get(q.id);
      return Math.max(m?.lastWeakAt ?? 0, m?.mark === "fail" || m?.mark === "fuzzy" ? m.ts : 0);
    }));
    const evidenceAt = (q: WangdaoItem) => {
      const m = byId.get(q.id);
      if (m?.mark !== "pass") return Infinity;
      return Math.min(...[m.passStartedAt ?? m.ts, ...(m.passTimes ?? []), m.ts].filter((ts) => ts >= lastWeakAt));
    };
    const passed = items.filter((q) => Number.isFinite(evidenceAt(q)))
      .sort((a, b) => evidenceAt(a) - evidenceAt(b) || order(a, b));
    const main = passed.find(isPrimary);
    const other = passed.find((q) => q.id !== main?.id);
    const shortage = items.length < 2 || !items.some(isPrimary);
    const complete = Boolean(main && other);
    const baseAt = complete ? Math.max(evidenceAt(main!), evidenceAt(other!)) : 0;
    const reviewOn = complete ? shiftDayKey(dayKey(baseAt), TECHNIQUE_REVIEW_DAYS) : null;
    const reviewMs = reviewOn ? dayKeyStartMs(reviewOn) : 0;
    const verified = complete && passed.some((q) => isPrimary(q) && byId.get(q.id)!.ts >= reviewMs);
    const status: TechniqueStatus = verified ? "stable" : complete ? (now >= reviewMs ? "due" : "preliminary")
      : lastWeakAt > 0 ? "weak" : marked.length ? "learning" : "unseen";
    const recommendations: TechniqueRecommendation[] = [];
    const reason: TrainingReason = status === "due" ? "verify" : status === "weak" ? "supplement" : "representative";
    const add = (q: WangdaoItem) => recommendations.push({ item: q, techniqueIds: [id], reason });
    if (status === "due") {
      // 优先用新主考题检验迁移；无新题时重做已会题，同样可验证遗忘。
      const candidates = items.filter((q) => isPrimary(q) && usable(q));
      candidates.sort((a, b) => Number(Boolean(byId.get(a.id))) - Number(Boolean(byId.get(b.id))) || order(a, b));
      if (candidates[0]) add(candidates[0]);
    } else if (!complete) {
      const goodIds = new Set(passed.map((q) => q.id));
      const candidates = items.filter((q) => usable(q) && !goodIds.has(q.id));
      // 补练优先选没做过的同技巧题，避免立即反复重做刚看过答案的错题。
      const fresh = (q: WangdaoItem) => !byId.has(q.id) || byId.get(q.id)?.mark === "skip";
      const need = Math.min(2, Math.max(1, 2 - passed.length));
      for (let i = 0; i < need && candidates.length; i++) {
        const previous = recommendations[0]?.item ?? passed[0];
        const needMain = !main && !recommendations.some((r) => isPrimary(r.item));
        const value = (q: WangdaoItem) => (needMain && isPrimary(q) ? 100 : 0) + (fresh(q) ? 40 : 0)
          + (previous ? (q.source !== previous.source ? 8 : 0) + (q.part !== previous.part ? 6 : 0)
            + (q.section !== previous.section ? 2 : 0) : q.part === "base" ? 10 : 0);
        candidates.sort((a, b) => value(b) - value(a) || order(a, b));
        add(candidates.shift()!);
      }
    }
    return { id, total: items.length, tested: marked.length >= 2 && marked.some(isPrimary),
      passed: Math.min(2, passed.length), status, shortage, reviewOn, recommendations };
  });
  const weight = (g: TechniqueGroup) => g.status === "weak" ? 0 : g.status === "due" ? 1 : 2;
  const unique = new Map<string, TechniqueRecommendation>();
  for (const g of [...groups].sort((a, b) => weight(a) - weight(b))) {
    for (const r of g.recommendations) {
      const existing = unique.get(r.item.id);
      if (existing) existing.techniqueIds.push(...r.techniqueIds);
      else unique.set(r.item.id, { ...r, techniqueIds: [...r.techniqueIds] });
    }
  }
  return { groups, recommendations: [...unique.values()],
    untaggedCount: pool.filter((q) => !q.facets?.length).length,
    tested: groups.filter((g) => g.tested && !g.shortage).length,
    preliminary: groups.filter((g) => g.status === "preliminary" || g.status === "due" || g.status === "stable").length,
    stable: groups.filter((g) => g.status === "stable").length,
    weak: groups.filter((g) => g.status === "weak").length };
}
