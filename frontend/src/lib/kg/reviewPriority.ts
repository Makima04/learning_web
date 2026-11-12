// 一级「复习性价比」入口：学科 → 题型 → 分科 → 考点资源。
import math from "@/data/kg/math1Questions.json";
import cs408 from "@/data/kg/cs408ReviewQuestions.json";
import { MATH1_ITEMS, type ReviewQuestion } from "./math1Analysis";
import type { BookId, SubjectId } from "./types";
import { math1PracticePath } from "./math1Practice";
export { buildReviewTopics, sortReviewTopics, matchReviewTraining } from "./math1Analysis";
export type { ReviewTopic, ReviewQuestion } from "./math1Analysis";

export { REVIEW_ROOT, reviewPriorityPath, legacyMathReviewPath } from "./paths";
export const REVIEW_BOOK_NAMES: Record<BookId, string> = {
  calc: "高等数学", linear: "线性代数", prob: "概率论与数理统计",
  ds: "数据结构", co: "计算机组成原理", os: "操作系统", cn: "计算机网络",
};
export const REVIEW_BOOKS: Record<SubjectId, BookId[]> = {
  math: ["calc", "linear", "prob"], cs408: ["ds", "co", "os", "cn"],
};
const cs408Items: ReviewQuestion[] = cs408.items.map((q) => {
  if (q.kind !== "big" && q.kind !== "mcq") throw new Error(`未知 408 题型：${q.kind}`);
  return { ...q, kind: q.kind };
});
export const REVIEW_DATASETS = {
  math: { ...math, items: MATH1_ITEMS },
  cs408: { ...cs408, items: cs408Items },
};

export function reviewQuestionHref(subject: SubjectId, question: ReviewQuestion, answer = false, returnTo?: string): string {
  if (subject === "cs408") return answer ? `/kg/exams/${question.year}#q${question.n}`
    : `/kg/exams/practice/${question.year}?q=${question.n}`;
  return math1PracticePath(question, answer, returnTo);
}
