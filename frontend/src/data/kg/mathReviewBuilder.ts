import { MATH_BOOKS } from "./math";
import type { KnowledgeReview, ReviewBlock, ReviewStep } from "@/lib/kg/knowledgeReview";

export const text = (value: string): ReviewBlock => ({ type: "text", text: value });
/** 原样保存 TeX，避免手写教案时把反斜杠转成 JS 转义字符。 */
export const math = (value: TemplateStringsArray): ReviewBlock => ({ type: "math", tex: value.raw.join("") });
export const step = (title: string, action: string, ...working: ReviewBlock[]): ReviewStep => ({ title, action, working });
const names = new Map(MATH_BOOKS.flatMap((book) => book.modules.flatMap((module) => module.kps.map((kp) => [kp.id, kp.name] as const))));

/** 方法例题均为自编；真题和教辅引用在页面按真实目录匹配，不把自编题冒充原题。 */
export function topic(
  kpId: string, opening: string, knowledge: ReviewBlock[], prompt: ReviewBlock[],
  steps: ReviewStep[], checkpoint: string,
  check: readonly [question: string, correct: string, distractor: string, explanation: string],
): KnowledgeReview {
  const title = names.get(kpId);
  if (!title) throw new Error(`未知数学考点：${kpId}`);
  const correctIndex = Array.from(kpId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2;
  const options = correctIndex === 0 ? [check[1], check[2]] : [check[2], check[1]];
  return {
    kpId, title, description: "先补概念与公式，再用方法例题恢复解题步骤。", opening, knowledge,
    scope: "方法例题为自编。配套题按考点与当前题型匹配，可结合原题解析继续练习。",
    defaultRouteId: "method",
    routes: [{ id: "method", title: "方法例题与解题路线", cue: opening, lessons: [{
      id: "method", label: "方法例题（自编）", prompt, signals: [title], recognition: opening,
      steps, checkpoint, techniques: [{ title: "易错与收尾检查", content: [text(checkpoint)] }],
      references: [], selfCheck: { question: check[0], options, correctIndex, explanation: check[3] },
    }] }],
  };
}
