import data from "@/data/kg/cs408QuestionLessons.json";
import type { KnowledgeReview, ReviewBlock, ReviewLesson } from "./knowledgeReview";

interface QuestionCase {
  questionId: string;
  source: "exam" | "wangdao";
  label: string;
  kind: "big" | "mcq";
  stem: string;
  options: Record<string, string>;
  excerpt: boolean;
  focus: string;
  steps: string[];
  answer: string;
  transfer: string;
  code?: string;
  selfCheck?: ReviewLesson["selfCheck"];
}

export const CS408_QUESTION_CASES = data.cases as Record<string, QuestionCase>;
export const CS408_QUESTION_GAPS: Readonly<Record<string, string>> = data.gaps;
const text = (value: string): ReviewBlock => ({ type: "text", text: value });

/** 原题教案默认打开；教材自编小例题仍可作为补基础路线阅读。 */
export function withCs408QuestionReview(base: KnowledgeReview): KnowledgeReview {
  const q = CS408_QUESTION_CASES[base.kpId];
  if (!q) return { ...base, sourceGap: CS408_QUESTION_GAPS[base.kpId] };
  const foundation = base.routes[0].lessons[0];
  const options = Object.entries(q.options);
  const single = q.kind === "mcq" && /^[A-D]$/.test(q.answer) && options.some(([key]) => key === q.answer);
  const lesson: ReviewLesson = {
    id: q.questionId,
    label: q.label,
    ...(q.source === "exam" ? { examId: q.questionId } : {}),
    sourceQuestion: { source: q.source, questionId: q.questionId, label: q.label, kind: q.kind, excerpt: q.excerpt },
    prompt: [text(q.stem), ...(options.length ? [{ type: "table" as const, headers: ["选项", "内容"], rows: options }] : [])],
    signals: [base.title, q.kind === "big" ? "大题" : "选择题"],
    recognition: q.focus,
    showWorkingByDefault: true,
    steps: q.steps.map((content, index) => ({
      title: ["提取本题条件", "按条件推演", "结论与排错"][index] ?? `推演 ${index + 1}`,
      action: index === 0 ? q.focus : index === 1 ? "将知识用于这道题的具体数据和约束。" : "核对题目所问，说明答案成立的前提。",
      working: [text(content), ...(q.code && index === 1 ? [{ type: "code" as const, code: q.code }] : [])],
    })),
    checkpoint: `本题答案：${q.answer.replace(/[。；;]+$/, "")}。${q.steps[q.steps.length - 1]}`,
    techniques: [{ title: "条件改变后怎么处理", content: [text(q.transfer)] }, ...foundation.techniques],
    references: q.source === "exam"
      ? [{ source: "exam", questionId: q.questionId, purpose: "本节讲解的原题：独立重做，检验是否能重建上述推演。" }]
      : [{ source: "wangdao", questionId: q.questionId, label: q.label, purpose: "本节讲解的王道原题：沿用原书小节题号，可独立重做并记录结果。" }],
    selfCheck: q.selfCheck ?? (single ? {
      question: "回到这道原题，哪一项符合题目要求？",
      options: options.map(([key, content]) => `${key}. ${content}`),
      correctIndex: options.findIndex(([key]) => key === q.answer),
      explanation: q.steps[q.steps.length - 1],
    } : foundation.selfCheck),
  };
  return {
    ...base,
    description: "从真实题目出发：读条件 → 对照知识 → 分步推演 → 条件变化 → 独立重做。",
    opening: q.focus,
    scope: "原题讲解针对下方注明的具体题目重新编写；‘补基础’保留自编小例题。同考点补充题不保证同解法。",
    defaultRouteId: "question",
    routes: [{ id: "question", title: "结合原题讲解", cue: q.label, lessons: [lesson] },
      ...base.routes.map(route => ({ ...route, title: "补基础（自编例题）" }))],
  };
}
