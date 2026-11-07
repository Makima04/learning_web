// 408 真题 ↔ 学习日志：错题与 1/3/7/14 复习队列统一由 journal 承载。
// journal 按条 LWW 合并 + 墓碑（多端并发不会互相覆盖），KgDoc.attempts 只保留
// 作答履历与统计（正确率、分科、复盘），不再自己跑一套到期队列。
import type { ReviewResult } from "@/lib/journal";
import {
  examItemId,
  loadCs408ExamPaper,
  primaryKpId,
  type ExamItem,
} from "@/lib/kg/exams408";
import { wrongItems, type AttemptOutcome, type ExamAttempt } from "@/lib/kg/examAttempts";
import { useJournal } from "@/stores/journal";

const EXAM_ID_RE = /^cs408-(\d{4})-q(\d+)$/;

/** 与王道题的 je-wd- 前缀区分，便于排查同步数据 */
export function examJournalId(itemId: string): string {
  return `je-ex-${itemId}`;
}

/** 只认真题题目 id，避免错题本把王道/数学题混进来 */
export function isExamItemId(id: string | null | undefined): boolean {
  return Boolean(id && EXAM_ID_RE.test(id));
}

export function parseExamItemId(id: string): { year: number; n: number } | null {
  const m = EXAM_ID_RE.exec(id);
  return m ? { year: Number(m[1]), n: Number(m[2]) } : null;
}

/** 答错 / 自评不会 → fail；自评模糊 → hard；答对 / 自评会了 → pass；未判分 → 不动队列 */
export function outcomeToReviewResult(outcome: AttemptOutcome): ReviewResult | null {
  if (outcome === "wrong" || outcome === "self_fail") return "fail";
  if (outcome === "self_fuzzy") return "hard";
  if (outcome === "correct" || outcome === "self_pass") return "pass";
  return null;
}

/** 错题集正文只放定位与选项，不放答案——复习时要先重做再看解析 */
export function journalCopyForExam(
  item: ExamItem,
  year: number
): { title: string; body: string; categoryId: string; kpId: string } | null {
  const kpId = primaryKpId(item);
  if (!kpId) return null;
  const kind = item.kind === "big" ? "大题" : "选择题";
  const stem = (item.stem || "").replace(/\s+/g, " ").trim();
  const short = stem.length > 22 ? `${stem.slice(0, 22)}…` : stem;
  const opts = ["A", "B", "C", "D"]
    .map((k) => (item.options?.[k] ? `${k}. ${item.options[k]}` : ""))
    .filter(Boolean)
    .join("\n");
  return {
    title: `${year} 真题 第 ${item.n} 题${short ? ` · ${short}` : ""}`,
    body: [
      `${year} 年 · ${kind}${item.points ? ` · ${item.points} 分` : ""}`,
      opts,
      "来自 408 真题：复习时先重做，再回去核对解析。",
    ]
      .filter(Boolean)
      .join("\n"),
    categoryId: "cat-408",
    kpId,
  };
}

/** 该题当前是否在错题集里（active） */
export function examWrongEntry(itemId: string) {
  return useJournal
    .getState()
    .entries.find((e) => e.sourceItemId === itemId && e.status === "active");
}

export function examIsCollected(itemId: string): boolean {
  return Boolean(examWrongEntry(itemId));
}

/**
 * 作答结果同步进错题集：
 * - 答错 / 自评不会或模糊且不在集里 → 新建错题（step=1，明天到期）
 * - 已在集里 → 按 1/3/7/14 曲线复盘（答对前进一档，答错回到第 1 天）
 * - 答对且不在集里 → 不入队，不把会做的题堆进错题本
 */
export function syncExamAttemptToJournal(input: {
  item: ExamItem;
  year: number;
  outcome: AttemptOutcome;
}): void {
  const result = outcomeToReviewResult(input.outcome);
  if (!result) return;
  const itemId = examItemId(input.year, input.item.n);
  const journal = useJournal.getState();
  const existing = examWrongEntry(itemId);

  if (!existing) {
    if (result === "pass") return;
    const copy = journalCopyForExam(input.item, input.year);
    if (!copy) return;
    journal.collectWrongItem({
      id: examJournalId(itemId),
      sourceItemId: itemId,
      kpId: copy.kpId,
      title: copy.title,
      body: copy.body,
      categoryId: copy.categoryId,
    });
    return;
  }
  journal.reviewEntry(existing.id, result);
}

/** 「已掌握」：归档错题条目，不再进到期队列（与 journal 其它条目一致） */
export function archiveExamWrong(itemId: string): boolean {
  const entry = examWrongEntry(itemId);
  if (!entry) return false;
  useJournal.getState().archiveEntry(entry.id);
  return true;
}

/**
 * 把老的 attempts 里已有的错题补进 journal（幂等）。
 * 早前错题本读 KgDoc.attempts，切到 journal 后不迁移等于「丢错题」。
 * 需要按年份拉试卷拿考点，网络失败只跳过该年，不影响其它年份。
 */
export async function migrateExamWrongsToJournal(attempts: ExamAttempt[]): Promise<number> {
  const collected = new Set(
    useJournal
      .getState()
      .entries.filter((e) => e.status === "active" && isExamItemId(e.sourceItemId))
      .map((e) => e.sourceItemId as string)
  );
  const pending = wrongItems(attempts).filter((a) => !collected.has(a.itemId));
  if (!pending.length) return 0;

  const years = [...new Set(pending.map((a) => a.year))];
  let added = 0;
  for (const year of years) {
    const paper = await loadCs408ExamPaper(year).catch(() => null);
    if (!paper) continue;
    const byN = new Map(paper.items.map((it) => [it.n, it]));
    for (const a of pending.filter((x) => x.year === year)) {
      const item = byN.get(a.n);
      if (!item) continue;
      const copy = journalCopyForExam(item, year);
      if (!copy) continue;
      useJournal.getState().collectWrongItem({
        id: examJournalId(a.itemId),
        sourceItemId: a.itemId,
        kpId: copy.kpId,
        title: copy.title,
        body: copy.body,
        categoryId: copy.categoryId,
      });
      added++;
    }
  }
  return added;
}
