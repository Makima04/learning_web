import { describe, expect, it } from "vitest";
import {
  chaptersForSubject,
  hasKpExplain,
  isXiaoDue,
  normalizeXiaoAnswer,
  scheduleXiaoReview,
  xiaoPath,
} from "./xiao";

describe("xiao helpers", () => {
  it("normalizes multi-select letters", () => {
    expect(normalizeXiaoAnswer("CAD")).toBe("ACD");
    expect(normalizeXiaoAnswer("a b")).toBe("AB");
    expect(normalizeXiaoAnswer("")).toBe("");
  });

  it("builds paths with encoded kp ids", () => {
    expect(xiaoPath()).toBe("/politics/xiao");
    expect(xiaoPath("marx")).toBe("/politics/xiao/marx");
    expect(xiaoPath("marx", "marx.ch1")).toBe("/politics/xiao/marx/marx.ch1");
  });

  it("schedules active recall reviews by confidence", () => {
    expect(scheduleXiaoReview("fail", 7, "2026-09-12")).toEqual({
      step: 0,
      nextReviewOn: "2026-09-13",
    });
    expect(scheduleXiaoReview("fuzzy", 3, "2026-09-12")).toEqual({
      step: 1,
      nextReviewOn: "2026-09-13",
    });
    expect(scheduleXiaoReview("pass", 1, "2026-09-12")).toEqual({
      step: 3,
      nextReviewOn: "2026-09-15",
    });
    expect(scheduleXiaoReview("pass", 14, "2026-09-12")).toEqual({
      step: 14,
      nextReviewOn: "2026-09-26",
    });
    expect(isXiaoDue(undefined, "2026-09-12")).toBe(false);
    expect(isXiaoDue("2026-09-12", "2026-09-12")).toBe(true);
    expect(isXiaoDue("2026-09-13", "2026-09-12")).toBe(false);
  });

  it("treats explain as an optional second layer", () => {
    expect(hasKpExplain({ explain: undefined })).toBe(false);
    expect(hasKpExplain({ explain: [] })).toBe(false);
    expect(hasKpExplain({ explain: [{ title: "科学性", body: "有根据" }] })).toBe(true);
  });

  it("groups knowledge points by textbook chapter", () => {
    const groups = chaptersForSubject(
      [
        {
          id: "marx.ch2.a",
          subject: "marx",
          chapter: "第二章 实践与认识及其发展规律",
          chapter_no: 2,
          name: "实践是认识的基础",
          summary: "",
          bullets: [],
          confusions: [],
        },
        {
          id: "marx.ch1.a",
          subject: "marx",
          chapter: "第一章 世界的物质性及发展规律",
          chapter_no: 1,
          name: "物质",
          summary: "",
          bullets: [],
          confusions: [],
        },
      ],
      [
        {
          id: "xiao-marx-s-1",
          source: "xiao1000",
          subject: "marx",
          kind: "single",
          chapter: "第二章 实践与认识及其发展规律",
          chapter_no: 2,
          qno: 1,
          stem: "题干",
          options: { A: "选项" },
          kp_ids: ["marx.ch2.a"],
        },
      ]
    );
    expect(groups.map((group) => [group.chapter_no, group.kps.length, group.questionCount])).toEqual([
      [1, 1, 0],
      [2, 1, 1],
    ]);
  });
});
