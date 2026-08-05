// 双层进度：覆盖 coverage vs 掌握 mastery
import { booksForSubject, filterMathBooks, getBook } from "@/data/kg";
import type {
  BookId,
  BookProgress,
  MathTrack,
  ModuleProgress,
  SubjectId,
  UserKpState,
} from "./types";

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function moduleProgress(
  bookId: BookId,
  moduleId: string,
  states: Record<string, UserKpState>,
  now = Date.now()
): ModuleProgress | null {
  const book = getBook(bookId);
  const mod = book?.modules.find((m) => m.id === moduleId);
  if (!mod) return null;

  const kps = mod.kps;
  const total = kps.length;
  let covered = 0;
  const confs: number[] = [];
  const weakKpIds: string[] = [];
  let dueCount = 0;

  for (const kp of kps) {
    const st = states[kp.id];
    if (st?.covered || (st && st.status !== "unknown")) covered++;
    if (st) {
      confs.push(st.confidence);
      if (st.status === "weak" || st.confidence < 0.35) weakKpIds.push(kp.id);
      if (st.due > 0 && st.due <= now) dueCount++;
    } else {
      confs.push(0);
    }
  }

  return {
    moduleId,
    total,
    covered,
    coverage: total ? covered / total : 0,
    mastery: avg(confs),
    weakKpIds: weakKpIds.slice(0, 5),
    dueCount,
  };
}

export function bookProgress(
  bookId: BookId,
  states: Record<string, UserKpState>,
  now = Date.now(),
  mathTrack?: MathTrack
): BookProgress | null {
  let book = getBook(bookId);
  if (!book) return null;
  if (book.subject === "math" && mathTrack) {
    book = filterMathBooks(mathTrack).find((b) => b.id === bookId) ?? book;
  }

  const modules: ModuleProgress[] = [];
  for (const mod of book.modules) {
    // 过滤后的模块
    const filtered = mathTrack
      ? {
          ...mod,
          kps: mod.kps.filter(
            (kp) => !kp.scope || kp.scope === "both" || kp.scope === mathTrack
          ),
        }
      : mod;
    if (!filtered.kps.length) continue;

    const kps = filtered.kps;
    const total = kps.length;
    let covered = 0;
    const confs: number[] = [];
    const weakKpIds: string[] = [];
    let dueCount = 0;
    for (const kp of kps) {
      const st = states[kp.id];
      if (st?.covered || (st && st.status !== "unknown")) covered++;
      if (st) {
        confs.push(st.confidence);
        if (st.status === "weak" || st.confidence < 0.35) weakKpIds.push(kp.id);
        if (st.due > 0 && st.due <= now) dueCount++;
      } else confs.push(0);
    }
    modules.push({
      moduleId: mod.id,
      total,
      covered,
      coverage: total ? covered / total : 0,
      mastery: avg(confs),
      weakKpIds: weakKpIds.slice(0, 5),
      dueCount,
    });
  }

  return {
    bookId,
    coverage: avg(modules.map((m) => m.coverage)),
    mastery: avg(modules.map((m) => m.mastery)),
    modules,
  };
}

export function subjectProgress(
  subject: SubjectId,
  states: Record<string, UserKpState>,
  mathTrack: MathTrack = "math1",
  now = Date.now()
): BookProgress[] {
  const books =
    subject === "math" ? filterMathBooks(mathTrack) : booksForSubject(subject);
  return books
    .map((b) => bookProgress(b.id, states, now, subject === "math" ? mathTrack : undefined))
    .filter((x): x is BookProgress => !!x);
}

/** 今日待复习考点 */
export function dueKpIds(
  states: Record<string, UserKpState>,
  now = Date.now()
): string[] {
  return Object.entries(states)
    .filter(([, st]) => st.due > 0 && st.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}
