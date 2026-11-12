import { describe, expect, it } from "vitest";
import { findKp } from "@/data/kg";
import { buildReviewTopics, matchReviewTraining, REVIEW_DATASETS, REVIEW_BOOKS, reviewQuestionHref } from "./reviewPriority";
import { legacyMathReviewPath } from "./paths";
import type { ExamAttempt } from "./examAttempts";
import type { WangdaoItem } from "./wangdao408";
import { existsSync, readFileSync } from "node:fs";
import { math1PracticePath, math1QuestionImage } from "./math1Practice";

describe("统一复习性价比的数据范围", () => {
  it("数学保留三类题，408 只用合格统计卷且题型、分科、图谱均匹配", () => {
    expect(REVIEW_DATASETS.math.items).toHaveLength(408);
    const data = REVIEW_DATASETS.cs408;
    expect(data.items).toHaveLength(564);
    expect(data.years).toHaveLength(12);
    expect(data.excludedYears.map((r) => r.year)).toEqual([2009, 2010, 2011, 2015, 2021, 2026]);
    for (const subject of ["math", "cs408"] as const) {
      for (const q of REVIEW_DATASETS[subject].items) {
        const found = findKp(q.kpId);
        expect(found?.book.subject).toBe(subject);
        expect(found?.book.id).toBe(q.book);
        expect(REVIEW_BOOKS[subject]).toContain(q.book);
        for (const id of q.secondaryKpIds) expect(findKp(id)?.book.subject).toBe(subject);
      }
    }
    for (const year of data.years) {
      const qs = data.items.filter((q) => q.year === year);
      expect(qs.filter((q) => q.kind === "mcq")).toHaveLength(40);
      expect(qs.filter((q) => q.kind === "big")).toHaveLength(7);
      expect(qs.reduce((sum, q) => sum + q.points, 0)).toBe(150);
    }
  });

  it("各学科各题型独立归一化，不把辅助考点当成额外得分", () => {
    for (const subject of ["math", "cs408"] as const) {
      const data = REVIEW_DATASETS[subject];
      for (const kind of subject === "math" ? ["big", "mcq", "fill"] as const : ["big", "mcq"] as const) {
        const topics = buildReviewTopics(data, {}, [], [], 100, kind);
        expect(topics.every((t) => t.subject === subject && t.kind === kind)).toBe(true);
        expect(topics.reduce((sum, t) => sum + t.pointShare, 0)).toBeCloseTo(1);
        expect(topics.reduce((sum, t) => sum + t.recentPointShare, 0)).toBeCloseTo(1);
        expect(topics.reduce((sum, t) => sum + t.totalPoints, 0)).toBe(data.items.filter((q) => q.kind === kind).reduce((sum, q) => sum + q.points, 0));
      }
    }
  });
});

describe("408 学习证据与配套训练", () => {
  it("真题自评和作答按同题最新记录合并，已判分的真题能改变个人排序", () => {
    const data = REVIEW_DATASETS.cs408;
    const q = data.items.find((q) => q.kind === "mcq")!;
    const attempt: ExamAttempt = { itemId: q.id, year: q.year, n: q.n, kind: "mcq", book: q.book,
      outcome: "wrong", ts: 200, reviewStep: 0, dueMs: 300 };
    const topics = buildReviewTopics(data, {}, [{ itemId: q.id, mark: "pass", ts: 100 }], [], 1000, "mcq", [attempt]);
    const topic = topics.find((t) => t.kpId === q.kpId)!;
    expect(topic.sampleCount).toBe(1);
    expect(topic.confidenceSource).toBe("kind");
    expect(topic.status).toBe("weak");
  });

  it("408 匹配王道、数学匹配李林/张宇，补基础也不跨题型", () => {
    const topic = buildReviewTopics(REVIEW_DATASETS.cs408, {}, [], [], 100, "big")[0];
    const base: WangdaoItem = { id: "wd-big", book: topic.book, kind: "big", section: "1", qno: 1, kp_ids: [topic.kpId] };
    const pool: WangdaoItem[] = [base, { ...base, id: "wd-mcq", kind: "mcq" },
      { ...base, id: "math", source: "lilin880" }];
    expect(matchReviewTraining(topic, pool, [], {}).map((m) => m.item.id)).toEqual(["wd-big"]);
  });
});

describe("新入口与真题深链", () => {
  it("数学各题型直达逐题练习和解析，保留返回筛选且媒体齐全", () => {
    const returnTo = "/review-priority?subject=math&kind=fill&book=linear&order=recent&kp=la.det.calc";
    for (const question of REVIEW_DATASETS.math.items) {
      for (const answer of [false, true]) {
        const url = new URL(reviewQuestionHref("math", question, answer, returnTo), "http://localhost");
        expect(url.pathname).toBe(`/review-priority/exams/math1/${question.year}/${question.n}`);
        expect(url.searchParams.get("answer")).toBe(answer ? "1" : null);
        expect(url.searchParams.get("returnTo")).toBe(returnTo);
        const path = `public${math1QuestionImage(question, answer)}`;
        expect(existsSync(path), path).toBe(true);
        expect(readFileSync(path).subarray(8, 12).toString(), path).toBe("WEBP");
      }
    }
    expect(math1PracticePath(REVIEW_DATASETS.math.items[0], false, "//evil.example")).not.toContain("returnTo");
  });
  it("旧数学链接迁移时保留题型和考点，408 原题直达作答或答案位置", () => {
    const redirect = legacyMathReviewPath("?kind=fill&book=linear&kp=la.eig.value&subject=cs408");
    const url = new URL(redirect, "http://localhost");
    expect(url.pathname).toBe("/review-priority");
    expect(url.searchParams.get("subject")).toBe("math");
    expect(url.searchParams.get("kind")).toBe("fill");
    expect(url.searchParams.get("kp")).toBe("la.eig.value");
    const q = REVIEW_DATASETS.cs408.items[0];
    expect(reviewQuestionHref("cs408", q)).toBe(`/kg/exams/practice/${q.year}?q=${q.n}`);
    expect(reviewQuestionHref("cs408", q, true)).toBe(`/kg/exams/${q.year}#q${q.n}`);
  });
});
