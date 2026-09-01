// 王道题：会/不会/模糊 → 掌握度 + 错题集（日志 1/3/7/14）
import type { ReviewResult } from "@/lib/journal";
import type { MarkLevel } from "@/lib/kg/types";
import {
  journalCopyForWangdao,
  wangdaoJournalId,
  type WangdaoItem,
} from "@/lib/kg/wangdao408";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";

export type PracticeJournalAction =
  | { type: "none" }
  | { type: "collect-new" }
  | { type: "review"; result: ReviewResult };

export function markToReviewResult(mark: MarkLevel): ReviewResult | null {
  if (mark === "pass") return "pass";
  if (mark === "fuzzy") return "hard";
  if (mark === "fail") return "fail";
  return null;
}

/** 会了且不在错题集 → 不进队列；不会/模糊 → 新错题；已在集里 → 按曲线复盘。 */
export function practiceJournalAction(
  mark: MarkLevel,
  inWrongBook: boolean
): PracticeJournalAction {
  const result = markToReviewResult(mark);
  if (!result) return { type: "none" };
  if (!inWrongBook) {
    return result === "pass" ? { type: "none" } : { type: "collect-new" };
  }
  return { type: "review", result };
}

export function applyWangdaoPractice(item: WangdaoItem, mark: MarkLevel): void {
  const kpId = item.kp_ids[0];
  if (!kpId) return;
  useKgProgress.getState().markItem({
    itemId: item.id,
    mark,
    primaryKpId: kpId,
    secondaryKpIds: item.kp_ids.slice(1),
  });

  const journal = useJournal.getState();
  const existing = journal.entries.find(
    (e) => e.sourceItemId === item.id && e.status === "active"
  );
  const action = practiceJournalAction(mark, Boolean(existing));
  if (action.type === "collect-new") {
    const copy = journalCopyForWangdao(item);
    if (!copy) return;
    journal.collectWrongItem({
      id: wangdaoJournalId(item.id),
      sourceItemId: item.id,
      kpId: copy.kpId,
      title: copy.title,
      body: copy.body,
      categoryId: copy.categoryId,
    });
  } else if (action.type === "review" && existing) {
    journal.reviewEntry(existing.id, action.result);
  }
}

export function toggleWangdaoCollect(item: WangdaoItem, collected: boolean): void {
  const journal = useJournal.getState();
  if (!collected) {
    journal.uncollectWrongItem(item.id);
    return;
  }
  const copy = journalCopyForWangdao(item);
  if (!copy) return;
  journal.collectWrongItem({
    id: wangdaoJournalId(item.id),
    sourceItemId: item.id,
    kpId: copy.kpId,
    title: copy.title,
    body: copy.body,
    categoryId: copy.categoryId,
  });
}

export function isCollected(itemId: string): boolean {
  return useJournal
    .getState()
    .entries.some((e) => e.sourceItemId === itemId && e.status === "active");
}
