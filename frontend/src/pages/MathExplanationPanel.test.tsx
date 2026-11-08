import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MathExplanationView } from "./MathExplanationView";
import { isMathExplanationRunning, validateMathExplanation, type MathExplanation, type MathExplanationResponse } from "@/lib/kg/mathExplanation";

const seed = JSON.parse(readFileSync(new URL("../../../backend/data/math_explanation_seed.json", import.meta.url), "utf8"));
const explanation = seed.explanation as MathExplanation;
const response: MathExplanationResponse = { protocol: "math_explanation.v1", status: "ready", configured: true, model: seed.model, question: { id: seed.item_id, source: "lilin880", book: "calc", kind: "big", section: "9", qno: 1, kp_ids: [] }, explanation };

describe("正式数学逐题解析", () => {
  it("突破点与路线可见，演算、答案和验算独立折叠", () => {
    const html = renderToStaticMarkup(createElement(MathExplanationView, { data: explanation }));
    expect(html).toContain("本题突破点");
    expect(html).toContain("解题路线");
    expect(html).toContain("看细节");
    expect(html).toContain("核对最终答案");
    expect(html).toContain("查看验算与适用条件");
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(html).toContain('class="katex"');
  });
  it("模型文本按文字显示，不作为 HTML 或脚本执行", () => {
    const malicious = structuredClone(explanation);
    malicious.steps[0].details = [{ type: "text", text: '<img src=x onerror="alert(1)">' }];
    const html = renderToStaticMarkup(createElement(MathExplanationView, { data: malicious }));
    expect(html).toContain("&lt;img");
    expect(html).not.toContain('<img src="x"');
    expect(html).not.toContain("<script");
  });
  it("不合格公式不进入展示，进行中的任务与空缓存严格区分", () => {
    expect(validateMathExplanation(response)).toBe(response);
    const invalid = structuredClone(response);
    invalid.explanation!.steps[0].details = [{ type: "math", tex: "\\notARealMathCommand" }];
    expect(() => validateMathExplanation(invalid)).toThrow("排版校验");
    expect(isMathExplanationRunning({ ...response, status: "processing" })).toBe(true);
    expect(isMathExplanationRunning({ ...response, status: "missing" })).toBe(false);
    expect(isMathExplanationRunning(null)).toBe(false);
  });
});
