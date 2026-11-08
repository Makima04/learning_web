import { MATH1_ITEMS, type Math1Kind } from "./math1Analysis";
import type { ReviewReference } from "./knowledgeReview";
import type { WangdaoItem } from "./wangdao408";

/** 只按已有考点和当前题型匹配，不把同考点等同于同解法，也不拼造不存在的题号。 */
export function mathKnowledgeReferences(kpId: string, kind: Math1Kind, catalog: WangdaoItem[]): ReviewReference[] {
  const references: ReviewReference[] = MATH1_ITEMS.filter((q) => q.kpId === kpId && q.kind === kind)
    .sort((a, b) => b.year - a.year || a.n - b.n).slice(0, 2)
    .map((q) => ({ source: "exam", questionId: q.id, purpose: "同考点真题：先独立作答，再对照原卷解析。" }));
  for (const source of ["lilin880", "zhangyu1000"] as const) {
    const matches = catalog.filter((q) => q.source === source && q.kind === kind && q.kp_ids.includes(kpId))
      .sort((a, b) => Number(b.part === "hard") - Number(a.part === "hard") || (a.ord ?? a.qno) - (b.ord ?? b.qno) || a.id.localeCompare(b.id));
    references.push(...matches.slice(0, 2).map((q) => ({
      source, questionId: q.id,
      label: `${q.part === "hard" ? "强化" : "基础"} · ${q.kind === "big" ? "大题" : q.kind === "mcq" ? "选择" : "填空"} · ${q.qno}`,
      purpose: "同考点配套练习；先看题目条件，选择对应方法，完成后可记录掌握情况。",
    })));
  }
  return references;
}
