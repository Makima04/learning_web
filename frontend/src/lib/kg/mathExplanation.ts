import katex from "katex";
import type { WangdaoItem } from "./wangdao408";

export type MathExplanationBlock = { type: "text"; text: string } | { type: "math"; tex: string };
export interface MathExplanation {
  schema_version: "math_explanation.v1";
  status: "draft";
  problem_readback: MathExplanationBlock[];
  breakthroughs: { id: string; clue: string; move: string; why: string; step_ids: string[] }[];
  steps: { id: string; title: string; brief: string; details: MathExplanationBlock[]; pitfalls: string[] }[];
  final_answer: MathExplanationBlock[];
  checks: { target: string; evidence: MathExplanationBlock[] }[];
  transfer: { signal: string; move: string; conditions: string };
}
export interface MathExplanationResponse {
  protocol: "math_explanation.v1";
  status: "missing" | "queued" | "processing" | "ready" | "needs_input" | "needs_review" | "error";
  phase?: "queued" | "solving" | "formatting" | "complete";
  question: WangdaoItem;
  explanation?: MathExplanation | null;
  configured: boolean;
  model: string;
  returned_models?: string[];
  review_status?: "reviewed" | "model_draft";
  message?: string;
  updated_at?: string;
  retry_after_seconds?: number;
}
export function isMathQuestion(item: Pick<WangdaoItem, "source">): boolean {
  return item.source === "lilin880" || item.source === "zhangyu1000";
}
export function isMathExplanationRunning(value: MathExplanationResponse | null): boolean {
  return value?.status === "queued" || value?.status === "processing";
}
/** 所有公式先严格验证再展示；KaTeX 使用 trust=false，普通文字由 React 转义。 */
export function validateMathExplanation(value: MathExplanationResponse): MathExplanationResponse {
  if (value.protocol !== "math_explanation.v1" || !value.question?.id) throw new Error("解析协议不匹配，请刷新页面");
  if (value.status !== "ready") return value;
  const data = value.explanation;
  if (!data || data.schema_version !== "math_explanation.v1" || !data.steps?.length || !data.breakthroughs?.length) throw new Error("解析内容不完整，请稍后重试");
  const collections = [data.problem_readback, data.final_answer, ...data.steps.map((s) => s.details), ...data.checks.map((c) => c.evidence)];
  for (const blocks of collections) for (const block of blocks) {
    if (block.type === "math") {
      try { katex.renderToString(block.tex, { throwOnError: true, trust: false, strict: "error" }); }
      catch { throw new Error("解析中的公式未通过排版校验，请稍后重试"); }
    }
  }
  return value;
}
