import { describe, expect, it } from "vitest";
import {
  examJournalId,
  isExamItemId,
  journalCopyForExam,
  outcomeToReviewResult,
  parseExamItemId,
} from "./examJournal";
import type { ExamItem } from "./exams408";

function item(over: Partial<ExamItem> = {}): ExamItem {
  return {
    n: 3,
    kind: "mcq",
    book: "ds",
    stem: "关于二叉树的说法正确的是",
    options: { A: "甲", B: "乙", C: "丙", D: "丁" },
    kps: [{ id: "kp-tree", role: "primary" }],
    answer: "B",
    ...over,
  };
}

describe("examJournalId", () => {
  it("加 je-ex 前缀，与王道题的 je-wd- 区分", () => {
    expect(examJournalId("cs408-2025-q1")).toBe("je-ex-cs408-2025-q1");
  });
});

describe("isExamItemId / parseExamItemId", () => {
  it("只认真题题目 id", () => {
    expect(isExamItemId("cs408-2025-q1")).toBe(true);
    expect(isExamItemId("wd-ds-1")).toBe(false);
    expect(isExamItemId("cs408-2025-1")).toBe(false);
    expect(isExamItemId(undefined)).toBe(false);
  });

  it("解析年份与题号", () => {
    expect(parseExamItemId("cs408-2009-q47")).toEqual({ year: 2009, n: 47 });
    expect(parseExamItemId("bad")).toBeNull();
  });
});

describe("outcomeToReviewResult", () => {
  it("答错 / 自评不会 → fail，模糊 → hard，答对 / 会了 → pass", () => {
    expect(outcomeToReviewResult("wrong")).toBe("fail");
    expect(outcomeToReviewResult("self_fail")).toBe("fail");
    expect(outcomeToReviewResult("self_fuzzy")).toBe("hard");
    expect(outcomeToReviewResult("correct")).toBe("pass");
    expect(outcomeToReviewResult("self_pass")).toBe("pass");
  });

  it("未判分与跳过不动队列", () => {
    expect(outcomeToReviewResult("unjudgeable")).toBeNull();
    expect(outcomeToReviewResult("skipped")).toBeNull();
  });
});

describe("journalCopyForExam", () => {
  it("标题带年份与题号，正文有选项但不写答案", () => {
    const copy = journalCopyForExam(item(), 2025);
    expect(copy).not.toBeNull();
    expect(copy!.title).toContain("2025");
    expect(copy!.title).toContain("第 3 题");
    expect(copy!.body).toContain("A. 甲");
    expect(copy!.body).not.toContain("答案");
    expect(copy!.kpId).toBe("kp-tree");
    expect(copy!.categoryId).toBe("cat-408");
  });

  it("没有考点时返回 null，不留无归属错题", () => {
    expect(journalCopyForExam(item({ kps: [] }), 2025)).toBeNull();
  });

  it("大题会标明题型", () => {
    const copy = journalCopyForExam(item({ kind: "big", options: null }), 2024);
    expect(copy!.body).toContain("大题");
  });

  it("题干过长时截断，避免标题撑爆列表", () => {
    const copy = journalCopyForExam(item({ stem: "长".repeat(80) }), 2025);
    expect(copy!.title).toContain("…");
  });
});
