import { existsSync, readFileSync } from "node:fs";
import katex from "katex";
import { describe, expect, it } from "vitest";
import { MATH_EXTREMA_REVIEW } from "@/data/kg/mathExtremaReview";
import { findKp } from "@/data/kg";
import { isNavSectionActive } from "@/lib/navMemory";
import { resolveReviewLesson, type ReviewBlock } from "./knowledgeReview";
import { MATH1_ITEMS } from "./math1Analysis";
import { knowledgeReviewPath } from "./paths";
import { reviewQuestionHref } from "./reviewPriority";
import { math1QuestionImage } from "./math1Practice";
import type { WangdaoItem } from "./wangdao408";

const template = MATH_EXTREMA_REVIEW;
const catalogs = ["lilin880", "zhangyu1000"].flatMap((source) => {
  const data = JSON.parse(readFileSync(new URL(`../../../public/math/${source}/index.json`, import.meta.url), "utf8")) as { items: WangdaoItem[] };
  return data.items;
});

describe("知识复习的原题依据", () => {
  it("每个例题都对应已有极值真题，按真题、李林综合大题、张宇强化题排序", () => {
    expect(findKp(template.kpId)?.book.subject).toBe("math");
    const priority = { exam: 0, lilin880: 1, zhangyu1000: 2, wangdao: 3 };
    for (const route of template.routes) {
      for (const lesson of route.lessons) {
        const lead = MATH1_ITEMS.find((q) => q.id === lesson.examId);
        expect(lead?.kpId).toBe(template.kpId);
        expect(lead?.kind).toBe("big");
        expect(lesson.references[0].questionId).toBe(lesson.examId);
        const ranks = lesson.references.map((r) => priority[r.source]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        for (const reference of lesson.references) {
          if (reference.source === "exam") {
            const question = MATH1_ITEMS.find((q) => q.id === reference.questionId);
            expect(question?.kpId).toBe(template.kpId);
            for (const answer of [false, true]) {
              expect(reviewQuestionHref("math", question!, answer)).toContain(`/review-priority/exams/math1/${question!.year}/${question!.n}`);
              const path = math1QuestionImage(question!, answer);
              expect(existsSync(new URL(`../../../public${path}`, import.meta.url))).toBe(true);
            }
          } else {
            const question = catalogs.find((q) => q.id === reference.questionId);
            expect(question?.source).toBe(reference.source);
            expect(question?.part).toBe("hard");
            expect(question?.kind).toBe("big");
            expect(question?.kp_ids).toContain(template.kpId);
            if (reference.source === "lilin880") expect(question?.band).toBe("综合题");
            expect(existsSync(new URL(`../../../public${question!.img}`, import.meta.url))).toBe(true);
          }
        }
      }
    }
  });

  it("所有公式可严格排版，候选点比较表的列数完整", () => {
    function verify(blocks: ReviewBlock[]) {
      for (const block of blocks) {
        if (block.type === "math") {
          expect(() => katex.renderToString(block.tex, { throwOnError: true, trust: false, strict: "error" })).not.toThrow();
          // 当前教案没有矩阵或分行公式，避免导入时双重转义后把命令排成普通字母。
          expect(block.tex).not.toContain("\\\\");
        }
        if (block.type === "table") {
          for (const row of block.rows) expect(row).toHaveLength(block.headers.length);
        }
      }
    }
    for (const route of template.routes) for (const lesson of route.lessons) {
      verify(lesson.prompt);
      lesson.steps.forEach((step) => verify(step.working));
      lesson.techniques.forEach((technique) => verify(technique.content));
    }
  });
});

describe("知识复习的导航", () => {
  it("深链保留当前例题；无效路线和跨路线的例题回到合理默认项", () => {
    expect(resolveReviewLesson(template, "free", "degenerate").lesson.examId).toBe("math1-2023-q18");
    expect(resolveReviewLesson(template, "region", "degenerate").lesson.examId).toBe("math1-2024-q18");
    expect(resolveReviewLesson(template, "missing", null).route.id).toBe(template.defaultRouteId);
  });

  it("保留题型和排序上下文，属于复习性价比分区且不会污染知识图谱导航", () => {
    const path = knowledgeReviewPath(template.kpId, "?subject=cs408&book=os&kp=os.mem.vm&kind=fill&order=recent");
    const url = new URL(path, "http://localhost");
    expect(url.searchParams.get("kind")).toBe("fill");
    expect(url.searchParams.get("order")).toBe("recent");
    expect([...url.searchParams.keys()]).toEqual(["kind", "order"]);
    expect(isNavSectionActive("/review-priority", url.pathname)).toBe(true);
    expect(isNavSectionActive("/kg", url.pathname)).toBe(false);
  });
});
