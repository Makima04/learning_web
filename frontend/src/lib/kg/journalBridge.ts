// 知识图谱 ↔ 学习日志：纯函数桥接（map / copy / 日期对齐 / 章节大卡排队）。
// store 侧各自 getState 调用，本文件不 import store，避免循环依赖。
import { findKp, findModule } from "@/data/kg";
import { dayKey } from "@/lib/day";
import type { BookId, MarkLevel, SubjectId } from "@/lib/kg/types";
import {
  isFirstReview,
  isKgJournalEntry,
  sortDueEntries,
  type JournalEntry,
  type ReviewResult,
} from "@/lib/journal";

/**
 * 章节大卡实际复盘的条目：408 / 数学都只复盘错题集（sourceItemId）。
 */
export function isKgChapterReviewEntry(entry: JournalEntry): boolean {
  if (!isKgJournalEntry(entry)) return false;
  return Boolean(entry.sourceItemId);
}

/** 图谱每日章节大卡默认上限（与手写分类额度独立）。 */
export const DEFAULT_KG_CHAPTER_DAILY_REVIEW = 3;

/** 学习日志复盘结果 → 图谱轻量标记 */
export function mapReviewToMark(result: ReviewResult): MarkLevel {
  if (result === "pass") return "pass";
  if (result === "hard") return "fuzzy";
  return "fail";
}

/** 图谱创建日志时的标题 / 正文 / 分类 */
export function journalCopyForKp(kpId: string): {
  title: string;
  body: string;
  categoryId: string;
} | null {
  const hit = findKp(kpId);
  if (!hit) return null;
  const { kp, module, book } = hit;
  return {
    title: kp.name,
    body: `来自知识图谱：${book.name} · ${module.name}`,
    categoryId: book.subject === "math" ? "cat-math" : "cat-408",
  };
}

/** YYYY-MM-DD → 本地 0 点 ms，用于对齐 kp.due */
export function dayKeyToLocalMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getTime();
}

export function kgChapterDailyLimit(raw?: number | null): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(20, Math.floor(raw)));
  }
  return DEFAULT_KG_CHAPTER_DAILY_REVIEW;
}

/** 图谱日志条目所属章节；找不到考点时落到 orphan:kpId，避免并成一堆。 */
export function moduleIdOfJournalEntry(entry: JournalEntry): string {
  if (entry.kpId) {
    const hit = findKp(entry.kpId);
    if (hit) return hit.module.id;
    return `orphan:${entry.kpId}`;
  }
  return `orphan:${entry.id}`;
}

export interface KgChapterCard {
  moduleId: string;
  bookId: BookId | "unknown";
  bookName: string;
  moduleName: string;
  subject: SubjectId | "unknown";
  categoryId: string;
  entries: JournalEntry[];
  firstReviewCount: number;
  overdueCount: number;
}

export interface KgChapterPlan {
  due: KgChapterCard[];
  deferred: KgChapterCard[];
}

function chapterFromEntries(
  moduleId: string,
  list: JournalEntry[],
  today: string
): KgChapterCard {
  const hit = findModule(moduleId);
  const sample = list[0];
  const firstReviewCount = list.filter(isFirstReview).length;
  const overdueCount = list.filter((e) => e.nextReviewOn < today).length;
  if (hit) {
    return {
      moduleId,
      bookId: hit.book.id,
      bookName: hit.book.name,
      moduleName: hit.module.name,
      subject: hit.book.subject,
      categoryId: hit.book.subject === "math" ? "cat-math" : "cat-408",
      entries: list,
      firstReviewCount,
      overdueCount,
    };
  }
  return {
    moduleId,
    bookId: "unknown",
    bookName: "知识图谱",
    moduleName: sample?.title || "未匹配章节",
    subject: "unknown",
    categoryId: sample?.categoryId || "cat-408",
    entries: list,
    firstReviewCount,
    overdueCount,
  };
}

/**
 * 图谱到期卡按章聚成大卡，每天最多 limit 章（默认 3）。
 * 章的优先级取该章里最靠前的知识点（沿用 sortDueEntries）。
 * 手写卡不进入本队列。
 */
export function planKgChapterDue(
  entries: JournalEntry[],
  limit?: number | null,
  today: string = dayKey()
): KgChapterPlan {
  const kgDue = sortDueEntries(entries.filter(isKgChapterReviewEntry), today);
  const byModule = new Map<string, JournalEntry[]>();
  const order: string[] = [];
  for (const entry of kgDue) {
    const moduleId = moduleIdOfJournalEntry(entry);
    const list = byModule.get(moduleId);
    if (list) {
      list.push(entry);
    } else {
      byModule.set(moduleId, [entry]);
      order.push(moduleId);
    }
  }

  const cap = kgChapterDailyLimit(limit);
  const dueIds = cap <= 0 ? [] : order.slice(0, cap);
  const deferredIds = cap <= 0 ? order : order.slice(cap);

  return {
    due: dueIds.map((id) => chapterFromEntries(id, byModule.get(id) || [], today)),
    deferred: deferredIds.map((id) =>
      chapterFromEntries(id, byModule.get(id) || [], today)
    ),
  };
}
