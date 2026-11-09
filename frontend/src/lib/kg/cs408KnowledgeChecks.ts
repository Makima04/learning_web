import { cs408CheckId, type Cs408CheckPart } from "./cs408Diagnostic";
import type { KnowledgeReview, ReviewBlock } from "./knowledgeReview";

export interface Cs408KnowledgeCheck {
  id: string;
  part: Cs408CheckPart;
  prompt: ReviewBlock[];
  rubric: ReviewBlock[];
}

/** 复用逐点编写的教材例题与核对依据；不生成未经核验的题目或答案。 */
export function cs408KnowledgeChecks(template: KnowledgeReview): Cs408KnowledgeCheck[] {
  const lesson = template.routes.find((route) => route.id === "method")?.lessons[0];
  if (!lesson) return [];
  const text = (value: string): ReviewBlock => ({ type: "text", text: value });
  return [
    { id: cs408CheckId(template.kpId, "principle"), part: "principle",
      prompt: [text(`不看资料，用自己的话说明「${template.title}」的关键原理、适用条件，以及主要公式或操作规则。`)],
      rubric: template.knowledge?.length ? template.knowledge : [text(template.opening)] },
    { id: cs408CheckId(template.kpId, "boundary"), part: "boundary",
      prompt: [text(`${lesson.selfCheck.question}请说明理由，不只回答结论。`)],
      rubric: [text(lesson.selfCheck.options[lesson.selfCheck.correctIndex]), text(lesson.selfCheck.explanation)] },
    { id: cs408CheckId(template.kpId, "application"), part: "application",
      prompt: lesson.prompt,
      rubric: [...lesson.steps.flatMap((step) => [text(step.title), ...step.working]), text(lesson.checkpoint)] },
  ];
}
