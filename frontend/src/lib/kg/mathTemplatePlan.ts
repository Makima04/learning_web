// 题型模板练习计划：李林880 + 张宇1000 合池，按模板分组。
// 真题不作检验题：模板的真题命中（examCount / examYears）只从真题数据集（topic.questions）取，
// 作为「真题考过什么」的依据展示；性价比排序仍由 math1Analysis 的真题占分 priority 决定。
// 进度全部从账号 itemMarks 派生（与既有技巧覆盖同一套证据规则：两道不同题通过、
// 至少一道主考该考点、三天后复测），不新增本地完成标志或服务端表，跨设备同步沿用 accountSync。
import { dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";
import { templatesForKp, type MathTemplate } from "@/data/kg/mathTemplates";
import type { ReviewTopic } from "./math1Analysis";
import type { UserItemMark } from "./types";
import type { WangdaoItem } from "./wangdao408";

export const TEMPLATE_REVIEW_DAYS = 3;
export type TemplateStatus = "unseen" | "learning" | "weak" | "preliminary" | "due" | "stable";
export type TemplateReason = "representative" | "supplement" | "verify";

export interface TemplateRecommendation {
  item: WangdaoItem;
  templateIds: string[];
  reason: TemplateReason;
}

export interface TemplateGroup {
  template: MathTemplate;
  /** 组内检验题：880 在前、1000 在后，各按原书顺序。真题不在其中。 */
  items: WangdaoItem[];
  /** 真题依据：命中该模板的真题道数与年份（升序去重）。 */
  examCount: number;
  examYears: number[];
  counts: { lilin880: number; zhangyu1000: number };
  total: number;
  /** 已有作答证据（非跳过）的题数 */
  practiced: number;
  passed: number;
  status: TemplateStatus;
  reviewOn: string | null;
  recommendations: WangdaoItem[];
}

export interface TemplatePlan {
  groups: TemplateGroup[];
  /** 命中考点但未命中任何模板的综合/未归类题，不计入模板覆盖。 */
  other: WangdaoItem[];
  recommendations: TemplateRecommendation[];
  tested: number;
  preliminary: number;
  stable: number;
  weak: number;
}

type TemplateTopic = Pick<ReviewTopic, "kpId" | "kind" | "subject" | "questions">;

const SOURCE_ORDER: Record<string, number> = { lilin880: 0, zhangyu1000: 1 };

function poolItemOrder(a: WangdaoItem, b: WangdaoItem): number {
  const sa = SOURCE_ORDER[a.source ?? ""] ?? 9;
  const sb = SOURCE_ORDER[b.source ?? ""] ?? 9;
  return sa - sb || (a.ord ?? a.qno) - (b.ord ?? b.qno) || a.id.localeCompare(b.id);
}

/** 检验题池只收教辅；真题条目即便混入目录也一律排除。 */
function inPool(q: WangdaoItem): boolean {
  return q.source === "lilin880" || q.source === "zhangyu1000";
}

export function buildTemplatePlan(
  topic: TemplateTopic,
  catalog: WangdaoItem[],
  marks: UserItemMark[],
  dueIds: ReadonlySet<string> = new Set(),
  waitingIds: ReadonlySet<string> = new Set(),
  now = Date.now(),
): TemplatePlan {
  const empty: TemplatePlan = { groups: [], other: [], recommendations: [], tested: 0, preliminary: 0, stable: 0, weak: 0 };
  if (topic.subject !== "math") return empty;
  const pool = [...new Map(catalog.filter((q) => q.kind === topic.kind && inPool(q)
    && q.kp_ids.includes(topic.kpId)).map((q) => [q.id, q])).values()];
  const templates = templatesForKp(topic.kpId);
  if (!templates.length) return { ...empty, other: pool.sort(poolItemOrder) };

  const byId = new Map(marks.map((m) => [m.itemId, m]));
  const primary = (q: WangdaoItem) => q.kp_ids[0] === topic.kpId;
  const usable = (q: WangdaoItem) => !waitingIds.has(q.id) || dueIds.has(q.id);
  const examQuestions = topic.questions ?? [];
  const assigned = new Set<string>();

  const groups = templates.map((template): TemplateGroup => {
    const items = pool.filter((q) => q.facets?.some((f) => template.facets.includes(f))).sort(poolItemOrder);
    for (const q of items) assigned.add(q.id);
    const exam = examQuestions.filter((q) => q.facets?.some((f) => template.facets.includes(f)));
    const examYears = [...new Set(exam.map((q) => q.year))].sort((a, b) => a - b);
    const counts = { lilin880: 0, zhangyu1000: 0 };
    for (const q of items) {
      if (q.source === "lilin880") counts.lilin880++;
      else if (q.source === "zhangyu1000") counts.zhangyu1000++;
    }
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
      .sort((a, b) => evidenceAt(a) - evidenceAt(b) || poolItemOrder(a, b));
    const main = passed.find(primary);
    const second = passed.find((q) => q.id !== main?.id);
    const complete = Boolean(main && second);
    const reviewOn = complete ? shiftDayKey(dayKey(Math.max(evidenceAt(main!), evidenceAt(second!))), TEMPLATE_REVIEW_DAYS) : null;
    const reviewMs = reviewOn ? dayKeyStartMs(reviewOn) : 0;
    const verified = complete && passed.some((q) => primary(q) && byId.get(q.id)!.ts >= reviewMs);
    const status: TemplateStatus = verified ? "stable" : complete ? (now >= reviewMs ? "due" : "preliminary")
      : lastWeakAt > 0 ? "weak" : marked.length ? "learning" : "unseen";

    const recommendations: WangdaoItem[] = [];
    if (status === "due") {
      // 复测优先没做过的主考题；没有新题时重做已会题也能验证遗忘。
      const candidates = items.filter((q) => primary(q) && usable(q));
      candidates.sort((a, b) => Number(Boolean(byId.get(a.id))) - Number(Boolean(byId.get(b.id))) || poolItemOrder(a, b));
      if (candidates[0]) recommendations.push(candidates[0]);
    } else if (!complete) {
      const goodIds = new Set(passed.map((q) => q.id));
      const candidates = items.filter((q) => usable(q) && !goodIds.has(q.id));
      const fresh = (q: WangdaoItem) => !byId.has(q.id) || byId.get(q.id)?.mark === "skip";
      const need = Math.min(2, Math.max(1, 2 - passed.length));
      for (let i = 0; i < need && candidates.length; i++) {
        const previous = recommendations[0] ?? passed[0];
        const needMain = !main && !recommendations.some(primary);
        const value = (q: WangdaoItem) => (needMain && primary(q) ? 100 : 0) + (fresh(q) ? 40 : 0)
          + (previous ? (q.source !== previous.source ? 8 : 0) + (q.part !== previous.part ? 6 : 0)
            : q.part === "base" ? 10 : 0);
        candidates.sort((a, b) => value(b) - value(a) || poolItemOrder(a, b));
        recommendations.push(candidates.shift()!);
      }
    }
    return { template, items, examCount: exam.length, examYears, counts, total: items.length,
      practiced: marked.length, passed: Math.min(2, passed.length), status, reviewOn, recommendations };
    // 真题考过但教辅暂缺题的模板保留展示（只作依据），其余空模板不显示。
  }).filter((g) => g.total > 0 || g.examCount > 0);

  const other = pool.filter((q) => !assigned.has(q.id)).sort(poolItemOrder);
  const weight = (g: TemplateGroup) => g.status === "weak" ? 0 : g.status === "due" ? 1 : 2;
  const unique = new Map<string, TemplateRecommendation>();
  for (const g of [...groups].sort((a, b) => weight(a) - weight(b))) {
    const reason: TemplateReason = g.status === "due" ? "verify" : g.status === "weak" ? "supplement" : "representative";
    for (const item of g.recommendations) {
      const existing = unique.get(item.id);
      if (existing) existing.templateIds.push(g.template.id);
      else unique.set(item.id, { item, templateIds: [g.template.id], reason });
    }
  }
  return {
    groups, other, recommendations: [...unique.values()],
    tested: groups.filter((g) => g.practiced >= 2 && g.items.some((q) => primary(q) && byId.get(q.id) && byId.get(q.id)!.mark !== "skip")).length,
    preliminary: groups.filter((g) => g.status === "preliminary" || g.status === "due" || g.status === "stable").length,
    stable: groups.filter((g) => g.status === "stable").length,
    weak: groups.filter((g) => g.status === "weak").length,
  };
}