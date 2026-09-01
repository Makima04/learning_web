import { CS408_BOOKS as CS408_BOOKS_BASE } from "./cs408";
import { applyCs408ExamStats } from "./cs408ExamStats";
import { MATH_BOOKS } from "./math";
import type {
  BookId,
  KgBook,
  KgModule,
  KnowledgePoint,
  MathTrack,
  SubjectId,
} from "@/lib/kg/types";
import { canonicalKpId } from "@/lib/kg/kpAlias";

export { MATH_BOOKS } from "./math";
export {
  CS408_EXAM_PAPER_COUNT,
  CS408_EXAM_YEARS,
  CS408_KP_STATS,
  applyCs408ExamStats,
} from "./cs408ExamStats";

/** 408 图谱：freq/bigWeight 已用 2012–2026 真题 LLM 标注校准 */
export const CS408_BOOKS: KgBook[] = CS408_BOOKS_BASE.map((book) => ({
  ...book,
  modules: book.modules.map((mod) => ({
    ...mod,
    kps: mod.kps.map((kp) => applyCs408ExamStats(kp)),
  })),
}));

const ALL_BOOKS: KgBook[] = [...CS408_BOOKS, ...MATH_BOOKS];

export function allBooks(): KgBook[] {
  return ALL_BOOKS;
}

export function booksForSubject(subject: SubjectId): KgBook[] {
  return ALL_BOOKS.filter((b) => b.subject === subject).sort(
    (a, b) => a.order - b.order
  );
}

/** 数一/数二：过滤 scope 不匹配的考点；模块若被滤空则去掉 */
export function filterMathBooks(track: MathTrack): KgBook[] {
  return MATH_BOOKS.map((book) => ({
    ...book,
    modules: book.modules
      .map((mod) => ({
        ...mod,
        kps: mod.kps.filter(
          (kp) => !kp.scope || kp.scope === "both" || kp.scope === track
        ),
      }))
      .filter((mod) => mod.kps.length > 0),
  })).filter((book) => book.modules.length > 0);
}

export function getBook(bookId: BookId): KgBook | undefined {
  return ALL_BOOKS.find((b) => b.id === bookId);
}

export function getModule(
  bookId: BookId,
  moduleId: string
): KgModule | undefined {
  return getBook(bookId)?.modules.find((m) => m.id === moduleId);
}

/** 按模块 id 反查书 + 章（日志章节大卡用） */
export function findModule(moduleId: string): {
  module: KgModule;
  book: KgBook;
} | null {
  for (const book of ALL_BOOKS) {
    const mod = book.modules.find((m) => m.id === moduleId);
    if (mod) return { module: mod, book };
  }
  return null;
}

export function findKp(kpId: string): {
  kp: KnowledgePoint;
  module: KgModule;
  book: KgBook;
} | null {
  const want = canonicalKpId(kpId);
  for (const book of ALL_BOOKS) {
    for (const mod of book.modules) {
      const kp = mod.kps.find((k) => k.id === want);
      if (kp) return { kp, module: mod, book };
    }
  }
  return null;
}

export function allKpsForSubject(
  subject: SubjectId,
  mathTrack?: MathTrack
): KnowledgePoint[] {
  const books =
    subject === "math" && mathTrack
      ? filterMathBooks(mathTrack)
      : booksForSubject(subject);
  return books.flatMap((b) => b.modules.flatMap((m) => m.kps));
}

export function moduleIdOfKp(kpId: string): string | null {
  return findKp(kpId)?.module.id ?? null;
}

/** 408 大题固定卷型：7 道综合题，分科配额 */
export const CS408_BIG_SLOTS: {
  slotId: string;
  bookId: BookId;
  order: number;
  suggestPoints: number;
  label: string;
}[] = [
  { slotId: "q41", bookId: "ds", order: 1, suggestPoints: 10, label: "数据结构综合 1" },
  { slotId: "q42", bookId: "ds", order: 2, suggestPoints: 15, label: "数据结构综合 2" },
  { slotId: "q43", bookId: "co", order: 1, suggestPoints: 10, label: "组成原理综合 1" },
  { slotId: "q44", bookId: "co", order: 2, suggestPoints: 13, label: "组成原理综合 2" },
  { slotId: "q45", bookId: "os", order: 1, suggestPoints: 8, label: "操作系统综合 1" },
  { slotId: "q46", bookId: "os", order: 2, suggestPoints: 7, label: "操作系统综合 2" },
  { slotId: "q47", bookId: "cn", order: 1, suggestPoints: 7, label: "计算机网络综合" },
];
