// 章级解题路线的守卫：章与考点必须真实存在，线代/概率每个考点都要有起手式，公式可严格排版。
import katex from "katex";
import { describe, expect, it } from "vitest";
import { MATH_BOOKS, findKp } from "@/data/kg";
import { MATH_ROUTE_CHAPTERS, MATH_ROUTE_GUIDES, routeChapterById, routeChapterForKp } from "@/data/kg/mathRouteGuides";

const MODULES = new Map(MATH_BOOKS.flatMap((book) => book.modules.map((mod) => [mod.id, { book, mod }] as const)));

describe("解题路线数据", () => {
  it("章 id 与图谱一致，且注册在正确的分科下", () => {
    for (const [bookId, chapters] of Object.entries(MATH_ROUTE_GUIDES)) {
      for (const chapter of chapters) {
        const located = MODULES.get(chapter.moduleId);
        expect(located, chapter.moduleId).toBeDefined();
        expect(located!.book.id, chapter.moduleId).toBe(bookId);
      }
    }
  });

  it("每章都有主线、固定步骤与迁移提醒", () => {
    for (const chapter of MATH_ROUTE_CHAPTERS) {
      expect(chapter.spine.length, chapter.moduleId).toBeGreaterThan(10);
      expect(chapter.steps.length, chapter.moduleId).toBeGreaterThanOrEqual(3);
      expect(chapter.transfer.length, chapter.moduleId).toBeGreaterThan(10);
      expect(chapter.rows.length, chapter.moduleId).toBeGreaterThanOrEqual(4);
      for (const row of chapter.rows) {
        expect(row.signal.trim(), chapter.moduleId).not.toBe("");
        expect(row.first.trim(), chapter.moduleId).not.toBe("");
        expect(row.chain.trim(), chapter.moduleId).not.toBe("");
        expect(row.trap.trim(), chapter.moduleId).not.toBe("");
      }
    }
  });

  it("每个索引行都落在本章的考点上", () => {
    for (const chapter of MATH_ROUTE_CHAPTERS) {
      const kpIds = new Set(MODULES.get(chapter.moduleId)!.mod.kps.map((kp) => kp.id));
      for (const row of chapter.rows) expect(kpIds.has(row.kpId), `${chapter.moduleId}: ${row.kpId}`).toBe(true);
    }
  });

  it("线性代数 17 个考点、概率论 15 个考点都有起手式", () => {
    for (const bookId of ["linear", "prob"] as const) {
      const book = MATH_BOOKS.find((b) => b.id === bookId)!;
      for (const kp of book.modules.flatMap((mod) => mod.kps)) {
        expect(routeChapterForKp(kp.id), kp.id).toBeDefined();
      }
    }
  });

  it("公式可以严格排版", () => {
    for (const chapter of MATH_ROUTE_CHAPTERS) {
      for (const row of chapter.rows) {
        if (!row.tex) continue;
        expect(() => katex.renderToString(row.tex!, { throwOnError: true, trust: false, strict: "warn" }), `${chapter.moduleId}: ${row.tex}`).not.toThrow();
      }
    }
  });

  it("章反查与考点反查口径一致", () => {
    for (const chapter of MATH_ROUTE_CHAPTERS) {
      expect(routeChapterById(chapter.moduleId)?.moduleId).toBe(chapter.moduleId);
      for (const row of chapter.rows) expect(routeChapterForKp(row.kpId)?.moduleId).toBe(chapter.moduleId);
    }
    expect(findKp("la.eig.pd")).not.toBeNull();
  });
});
