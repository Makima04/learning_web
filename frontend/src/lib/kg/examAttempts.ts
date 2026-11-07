// 408 真题作答记录：挂在 KgDoc 上，随 /api/kg 整包同步（服务端权威）。
// 后端 kg.rs 存的是 JSON Value，加字段无需改 Rust / migration。
import { dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";
import type { ExamItem } from "@/lib/kg/exams408";

/** 选择题自动判分；大题走自评；无法自动判分时只记录不判对错 */
export type AttemptOutcome =
  | "correct"
  | "wrong"
  | "self_pass"
  | "self_fuzzy"
  | "self_fail"
  | "unjudgeable"
  | "skipped";

export interface ExamAttempt {
  itemId: string;
  year: number;
  n: number;
  kind: "mcq" | "big";
  book: string;
  chosen?: string;
  outcome: AttemptOutcome;
  sessionId?: string;
  /** 1/3/7/14 队列的档位，0..3 */
  reviewStep: number;
  /** 北京时间到期日 0 点 */
  dueMs: number;
  ts: number;
}

export interface ExamSession {
  id: string;
  year: number;
  mode: "practice" | "mock";
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  itemIds: string[];
}

export const REVIEW_DAYS = [1, 3, 7, 14] as const;
export const ATTEMPTS_LIMIT = 2000;
export const SESSIONS_LIMIT = 40;

export const BOOK_LABEL: Record<string, string> = {
  ds: "数据结构",
  co: "组成原理",
  os: "操作系统",
  cn: "计算机网络",
};

export function bookLabel(id: string): string {
  return BOOK_LABEL[id] ?? id;
}

/** 答案文本里唯一的大写 A–D 才自动判分；「AB」「略」等返回 null */
export function answerLetter(answer: string | null | undefined): string | null {
  if (!answer) return null;
  const t = answer.trim().toUpperCase();
  return /^[A-D]$/.test(t) ? t : null;
}

export type Verdict =
  | { kind: "auto"; correct: boolean; key: string }
  | { kind: "manual" }
  | { kind: "unjudgeable" };

/** 提交前不接触答案文本以外的任何内容；判分只在提交后调用 */
export function verdictFor(item: ExamItem, chosen: string | null): Verdict {
  if (item.kind === "big") return { kind: "manual" };
  const key = answerLetter(item.answer);
  if (!key) return { kind: "unjudgeable" };
  return { kind: "auto", correct: chosen === key, key };
}

/** 答错或自评没掌握 → 回到第 1 天；答对 → 前进一档，封顶 14 天 */
export function nextReviewStep(prev: number | undefined, outcome: AttemptOutcome): number {
  const good = outcome === "correct" || outcome === "self_pass";
  if (!good) return 0;
  return Math.min((prev ?? -1) + 1, REVIEW_DAYS.length - 1);
}

export function dueFor(ts: number, step: number): number {
  const i = Math.min(Math.max(step, 0), REVIEW_DAYS.length - 1);
  return dayKeyStartMs(shiftDayKey(dayKey(ts), REVIEW_DAYS[i]));
}

export function isDue(a: ExamAttempt, now: number = Date.now()): boolean {
  return a.dueMs > 0 && a.dueMs <= now;
}

/** 每题取最近一次作答，作为错题本当前状态 */
export function latestAttempts(attempts: ExamAttempt[]): ExamAttempt[] {
  const m = new Map<string, ExamAttempt>();
  for (const a of attempts) {
    const cur = m.get(a.itemId);
    if (!cur || a.ts >= cur.ts) m.set(a.itemId, a);
  }
  return [...m.values()];
}

/** 错题 = 最近一次作答为错、或主观题自评未掌握 */
export function isWrong(a: ExamAttempt): boolean {
  return a.outcome === "wrong" || a.outcome === "self_fail" || a.outcome === "self_fuzzy";
}

export function wrongItems(attempts: ExamAttempt[]): ExamAttempt[] {
  return latestAttempts(attempts)
    .filter(isWrong)
    .sort((a, b) => a.dueMs - b.dueMs || b.ts - a.ts);
}

export function dueItems(attempts: ExamAttempt[], now: number = Date.now()): ExamAttempt[] {
  return wrongItems(attempts).filter((a) => isDue(a, now));
}

export interface BookStat {
  total: number;
  correct: number;
}

export interface SessionReport {
  total: number;
  answered: number;
  /** 可自动判分的选择题 */
  autoTotal: number;
  correct: number;
  wrong: number;
  /** 大题自评 */
  manual: number;
  unjudgeable: number;
  skipped: number;
  byBook: Record<string, BookStat>;
  wrongIds: string[];
  durationMs: number;
}

/** 复盘只统计本会话、每题取最后一次提交 */
export function sessionReport(session: ExamSession, attempts: ExamAttempt[]): SessionReport {
  const inSession = latestAttempts(
    attempts.filter((a) => a.sessionId === session.id)
  );
  const byBook: Record<string, BookStat> = {};
  const wrongIds: string[] = [];
  let correct = 0;
  let wrong = 0;
  let manual = 0;
  let unjudgeable = 0;
  let skipped = 0;
  for (const a of inSession) {
    const stat = (byBook[a.book] ??= { total: 0, correct: 0 });
    if (a.outcome === "correct") {
      correct++;
      stat.correct++;
    } else if (a.outcome === "wrong") {
      wrong++;
      wrongIds.push(a.itemId);
    } else if (a.outcome === "self_pass" || a.outcome === "self_fuzzy" || a.outcome === "self_fail") {
      manual++;
      if (a.outcome !== "self_pass") wrongIds.push(a.itemId);
    } else if (a.outcome === "unjudgeable") {
      unjudgeable++;
    } else {
      skipped++;
    }
    // 客观正确率分母只算能自动判分的题
    if (a.outcome === "correct" || a.outcome === "wrong") stat.total++;
  }
  const autoTotal = correct + wrong;
  return {
    total: session.itemIds.length,
    answered: inSession.length,
    autoTotal,
    correct,
    wrong,
    manual,
    unjudgeable,
    skipped,
    byBook,
    wrongIds,
    durationMs: session.durationMs ?? 0,
  };
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分 ${String(s).padStart(2, "0")} 秒`;
}

/** 练习页每次挂载都会建会话；误点即退出的空会话不该污染练习记录 */
export function historySessions(sessions: ExamSession[], attempts: ExamAttempt[]): ExamSession[] {
  const withAnswers = new Set<string>();
  for (const a of attempts) if (a.sessionId) withAnswers.add(a.sessionId);
  return sessions
    .filter((s) => Boolean(s.finishedAt) || withAnswers.has(s.id))
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** 作答记录被 ATTEMPTS_LIMIT 裁剪后，早期会话的历史复盘会缺题，需在 UI 明说 */
export function sessionRecordsTruncated(session: ExamSession, attempts: ExamAttempt[]): boolean {
  if (attempts.length < ATTEMPTS_LIMIT || attempts.length === 0) return false;
  let earliest = Infinity;
  for (const a of attempts) if (a.ts < earliest) earliest = a.ts;
  return earliest > session.startedAt;
}

/** 历史时间统一按北京时间显示，不受设备时区影响 */
export function formatDateTime(ts: number): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ts))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
