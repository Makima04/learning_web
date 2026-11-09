import { REVIEW_DATASETS } from "./reviewPriority";
import type { ReviewReference } from "./knowledgeReview";
import type { Math1Kind } from "./math1Analysis";
import type { WangdaoItem } from "./wangdao408";

/** 保留考点和题型，真题与王道仅作练习，不冒充教材原文。 */
export function cs408KnowledgeReferences(kpId: string, kind: Math1Kind, catalog: WangdaoItem[]): ReviewReference[] {
  const exam: ReviewReference[] = REVIEW_DATASETS.cs408.items
    .filter(q => q.kpId === kpId && q.kind === kind)
    .sort((a,b) => b.year-a.year || a.n-b.n).slice(0,2)
    .map(q => ({ source: "exam", questionId: q.id, purpose: "同考点真题：独立推演，再核对解析。" }));
  const practice: ReviewReference[] = catalog.filter(q => (q.source === "wangdao" || !q.source) && q.kind === kind && q.kp_ids.includes(kpId))
    .sort((a,b) => (a.ord ?? a.qno)-(b.ord ?? b.qno) || a.id.localeCompare(b.id)).slice(0,3)
    .map(q => ({ source: "wangdao", questionId: q.id, label: `${q.section_name} · ${q.kind === "big" ? "大题" : "选择"} ${q.qno}`, purpose: "同考点王道练习：按题目约定推演，可记录评分、收藏与错题。" }));
  return [...exam,...practice];
}
