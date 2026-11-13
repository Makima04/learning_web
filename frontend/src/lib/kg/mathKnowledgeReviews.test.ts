import { readFileSync } from "node:fs";
import katex from "katex";
import { describe, expect, it } from "vitest";
import { MATH_BOOKS } from "@/data/kg/math";
import { MATH_KNOWLEDGE_REVIEWS } from "@/data/kg/mathKnowledgeReviews";
import { KNOWLEDGE_REVIEW_TOPICS, resolveReviewLesson, type ReviewBlock } from "./knowledgeReview";
import { mathKnowledgeReferences } from "./mathKnowledgeReferences";
import { MATH1_ITEMS, type Math1Kind } from "./math1Analysis";
import type { WangdaoItem } from "./wangdao408";

const points = MATH_BOOKS.flatMap((book) => book.modules.flatMap((module) => module.kps));
const catalog = ["lilin880", "zhangyu1000"].flatMap((source) => JSON.parse(
  readFileSync(new URL(`../../../public/math/${source}/index.json`, import.meta.url), "utf8"),
).items as WangdaoItem[]);

describe("数学知识模板全量覆盖与教学内容", () => {
  it("三个分科的 73 个考点均有入口和真实模板，数学入口独立于408覆盖统计", () => {
    expect(points).toHaveLength(73);
    expect(Object.keys(MATH_KNOWLEDGE_REVIEWS).sort()).toEqual(points.map((kp) => kp.id).sort());
    expect(Object.keys(KNOWLEDGE_REVIEW_TOPICS).filter(id => points.some(kp => kp.id === id)).sort()).toEqual(Object.keys(MATH_KNOWLEDGE_REVIEWS).sort());
  });

  it.each(points.map((kp) => [kp.id, kp.name]))("%s 的概念、演算、自测与公式可读", (id) => {
    const review = MATH_KNOWLEDGE_REVIEWS[id];
    expect(review.opening.length).toBeGreaterThan(15);
    expect(review.routes.some((route) => route.id === review.defaultRouteId)).toBe(true);
    const verify = (blocks: ReviewBlock[]) => {
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        if (block.type === "math") expect(() => katex.renderToString(block.tex, { throwOnError: true, trust: false, strict: "error" })).not.toThrow();
        if (block.type === "table") block.rows.forEach((row) => expect(row.length).toBe(block.headers.length));
      }
    };
    verify(review.knowledge!);
    for (const route of review.routes) for (const lesson of route.lessons) {
      verify(lesson.prompt);
      expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
      lesson.steps.forEach((step) => { expect(step.action).not.toBe(""); verify(step.working); });
      lesson.techniques.forEach((technique) => verify(technique.content));
      expect(lesson.checkpoint.length).toBeGreaterThan(15);
      expect(lesson.selfCheck.options[lesson.selfCheck.correctIndex]).toBeTruthy();
      expect(new Set(lesson.selfCheck.options).size).toBe(lesson.selfCheck.options.length);
      expect(lesson.selfCheck.explanation.length).toBeGreaterThan(10);
      if (!lesson.examId) expect(lesson.label).toContain("自编");
    }
    expect(resolveReviewLesson(review, "missing", "missing").lesson).toBeTruthy();
  });
});

describe("配套题引用与题型隔离", () => {
  it.each(["big", "mcq", "fill"] as Math1Kind[])("%s 的所有引用都是真实同考点、同题型题目", (kind) => {
    for (const kp of points) {
      const references = mathKnowledgeReferences(kp.id, kind, catalog);
      expect(new Set(references.map((ref) => ref.questionId)).size).toBe(references.length);
      const ranks = references.map((ref) => ({ exam: 0, lilin880: 1, zhangyu1000: 2, wangdao: 3 })[ref.source]);
      expect(ranks).toEqual([...ranks].sort());
      for (const reference of references) {
        if (reference.source === "exam") {
          const question = MATH1_ITEMS.find((q) => q.id === reference.questionId);
          expect(question?.kpId).toBe(kp.id);
          expect(question?.kind).toBe(kind);
        } else {
          const question = catalog.find((q) => q.id === reference.questionId);
          expect(question?.kp_ids).toContain(kp.id);
          expect(question?.kind).toBe(kind);
          expect(question?.source).toBe(reference.source);
        }
      }
    }
  });
  it("不存在的考点不拼造题号", () => {
    expect(mathKnowledgeReferences("missing", "big", catalog)).toEqual([]);
  });
});
