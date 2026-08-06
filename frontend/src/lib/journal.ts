// journal.ts —— 学习日志 / 复盘板：固定间隔 1→3→7→14 天（与词库 SM-2 独立）。
import { dayKey } from "@/lib/day";

export type JournalKind = "learn" | "mistake";
export type ReviewStep = 1 | 3 | 7 | 14;
export type EntryStatus = "active" | "archived";
export type ReviewResult = "pass" | "hard" | "fail";

export const REVIEW_STEPS: ReviewStep[] = [1, 3, 7, 14];

export interface JournalCategory {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface JournalEntry {
  id: string;
  categoryId: string;
  title: string;
  body: string;
  kind: JournalKind;
  /** 创建日 YYYY-MM-DD */
  createdOn: string;
  /** 下次复盘日 YYYY-MM-DD */
  nextReviewOn: string;
  /** 当前间隔档位（天） */
  step: ReviewStep;
  status: EntryStatus;
  lapses: number;
  lastReviewedOn?: string;
  updatedAt: number;
  /** 关联知识图谱考点；有则复盘回写 KG 熟练度 */
  kpId?: string;
  /** 自动从图谱「已学」创建时为 true，便于 UI 标注 */
  fromKg?: boolean;
}

export interface ReviewLog {
  id: string;
  entryId: string;
  date: string;
  result: ReviewResult;
  note?: string;
}

export interface WeeklySummary {
  /** 当周周一 YYYY-MM-DD */
  weekKey: string;
  note: string;
  updatedAt: number;
}

export const DEFAULT_CATEGORIES: JournalCategory[] = [
  { id: "cat-math", name: "数学", color: "#2563eb", order: 0 },
  { id: "cat-408", name: "408", color: "#7c3aed", order: 1 },
  { id: "cat-english", name: "英语", color: "#059669", order: 2 },
  { id: "cat-politics", name: "政治", color: "#d97706", order: 3 },
];

/** 在 dayKey 上加减天数，返回新的 YYYY-MM-DD（本地时区）。 */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dayKey(dt.getTime());
}

/** 比较两个 dayKey：a < b → 负，相等 → 0，a > b → 正。 */
export function compareDay(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isDueOnOrBefore(entry: JournalEntry, today: string = dayKey()): boolean {
  return entry.status === "active" && compareDay(entry.nextReviewOn, today) <= 0;
}

export function nextStepAfterPass(step: ReviewStep): ReviewStep | "archive" {
  const i = REVIEW_STEPS.indexOf(step);
  if (i < 0) return 1;
  if (i >= REVIEW_STEPS.length - 1) return "archive";
  return REVIEW_STEPS[i + 1];
}

export interface ScheduleOutcome {
  step: ReviewStep;
  nextReviewOn: string;
  status: EntryStatus;
  lapsesDelta: number;
}

/** 根据复盘结果推进间隔。today 为复盘发生日。 */
export function scheduleAfterReview(
  entry: Pick<JournalEntry, "step" | "lapses">,
  result: ReviewResult,
  today: string = dayKey()
): ScheduleOutcome {
  if (result === "fail") {
    return {
      step: 1,
      nextReviewOn: addDays(today, 1),
      status: "active",
      lapsesDelta: 1,
    };
  }
  if (result === "hard") {
    // 未完全掌握：保留当前档，隔天再看
    return {
      step: entry.step,
      nextReviewOn: addDays(today, 1),
      status: "active",
      lapsesDelta: 0,
    };
  }
  // pass
  const next = nextStepAfterPass(entry.step);
  if (next === "archive") {
    return {
      step: 14,
      nextReviewOn: today,
      status: "archived",
      lapsesDelta: 0,
    };
  }
  return {
    step: next,
    nextReviewOn: addDays(today, next),
    status: "active",
    lapsesDelta: 0,
  };
}

export function newEntryDefaults(
  partial: Pick<JournalEntry, "categoryId" | "title" | "body" | "kind"> & {
    id?: string;
    createdOn?: string;
    kpId?: string;
    fromKg?: boolean;
  }
): JournalEntry {
  const createdOn = partial.createdOn || dayKey();
  const now = Date.now();
  const entry: JournalEntry = {
    id: partial.id || `je-${now}-${Math.random().toString(36).slice(2, 8)}`,
    categoryId: partial.categoryId,
    title: partial.title.trim(),
    body: partial.body.trim(),
    kind: partial.kind,
    createdOn,
    nextReviewOn: addDays(createdOn, 1),
    step: 1,
    status: "active",
    lapses: 0,
    updatedAt: now,
  };
  if (partial.kpId) entry.kpId = partial.kpId;
  if (partial.fromKg) entry.fromKg = true;
  return entry;
}

/** 当周周一（本地）的 dayKey，用作周报主键。 */
export function weekKeyOf(day: string = dayKey()): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + offset);
  return dayKey(dt.getTime());
}

export function weekRangeLabel(weekKey: string): string {
  const end = addDays(weekKey, 6);
  return `${weekKey} ~ ${end}`;
}

export interface WeekStats {
  created: number;
  reviewed: number;
  failed: number;
  byCategory: Record<string, number>;
  topFailTitles: { title: string; fails: number }[];
}

export function computeWeekStats(
  entries: JournalEntry[],
  logs: ReviewLog[],
  weekKey: string
): WeekStats {
  const weekEnd = addDays(weekKey, 6);
  const inWeek = (d: string) => compareDay(d, weekKey) >= 0 && compareDay(d, weekEnd) <= 0;

  const createdEntries = entries.filter((e) => inWeek(e.createdOn));
  const weekLogs = logs.filter((l) => inWeek(l.date));
  const byCategory: Record<string, number> = {};
  for (const e of createdEntries) {
    byCategory[e.categoryId] = (byCategory[e.categoryId] || 0) + 1;
  }

  const failCount = new Map<string, number>();
  for (const log of weekLogs) {
    if (log.result !== "fail") continue;
    const entry = entries.find((e) => e.id === log.entryId);
    if (!entry) continue;
    failCount.set(entry.title, (failCount.get(entry.title) || 0) + 1);
  }
  const topFailTitles = [...failCount.entries()]
    .map(([title, fails]) => ({ title, fails }))
    .sort((a, b) => b.fails - a.fails)
    .slice(0, 5);

  return {
    created: createdEntries.length,
    reviewed: weekLogs.length,
    failed: weekLogs.filter((l) => l.result === "fail").length,
    byCategory,
    topFailTitles,
  };
}

export function sortDueEntries(entries: JournalEntry[], today: string = dayKey()): JournalEntry[] {
  return [...entries]
    .filter((e) => isDueOnOrBefore(e, today))
    .sort((a, b) => {
      // 错题优先 → 逾期更久优先 → 创建更早优先
      if (a.kind !== b.kind) return a.kind === "mistake" ? -1 : 1;
      const overdueA = compareDay(today, a.nextReviewOn);
      const overdueB = compareDay(today, b.nextReviewOn);
      if (overdueA !== overdueB) return overdueB - overdueA;
      return compareDay(a.createdOn, b.createdOn);
    });
}
