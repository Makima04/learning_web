// 王道题：会/不会/模糊 → 掌握度 + 错题集（日志 1/3/7/14）
import type { EntryStatus, ReviewResult } from "@/lib/journal";
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
  if (!collected && !isCollected(item.id)) return;
  setWangdaoReviewStatus(item, collected ? "active" : "archived");
}

export function isCollected(itemId: string): boolean {
  return useJournal
    .getState()
    .entries.some((e) => e.sourceItemId === itemId && e.status === "active");
}

/** 只切换复习安排，不把手动调整伪记为一次「会」或复盘。 */
export function setWangdaoReviewStatus(item: WangdaoItem, status: EntryStatus): void {
  const journal = useJournal.getState();
  const existing = journal.entries.find((e) => e.sourceItemId === item.id);
  if (existing) {
    journal.setEntryReviewStatus(existing.id, status);
    return;
  }
  const copy = journalCopyForWangdao(item);
  if (!copy) return;
  journal.addEntry({
    id: wangdaoJournalId(item.id),
    sourceItemId: item.id,
    kpId: copy.kpId,
    title: copy.title,
    body: copy.body,
    categoryId: copy.categoryId,
    kind: "mistake",
    fromKg: true,
    status,
  });
}
