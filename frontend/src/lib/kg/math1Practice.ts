// 数学真题逐题入口和媒体路径；题号始终使用原卷题号。
import type { ReviewQuestion } from "./math1Analysis";
import { practiceReturnPath } from "./paths";

export function math1QuestionImage(question: Pick<ReviewQuestion, "year" | "n">, answer = false): string {
  return `/math/exams/math1/questions/${question.year}/q${question.n}${answer ? "-answer" : ""}.webp`;
}

export function math1PracticePath(question: Pick<ReviewQuestion, "year" | "n">, answer = false, returnTo?: string): string {
  const params = new URLSearchParams();
  if (answer) params.set("answer", "1");
  const safe = practiceReturnPath(returnTo);
  if (safe) params.set("returnTo", safe);
  const query = params.toString();
  return `/review-priority/exams/math1/${question.year}/${question.n}${query ? `?${query}` : ""}`;
}
