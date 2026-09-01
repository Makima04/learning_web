import { describe, expect, it } from "vitest";
import { practiceJournalAction } from "./wangdaoPractice";

describe("practiceJournalAction", () => {
  it("会了 and not collected stays out of the journal", () => {
    expect(practiceJournalAction("pass", false)).toEqual({ type: "none" });
  });

  it("不会 / 模糊 on a new question collect into 错题集", () => {
    expect(practiceJournalAction("fail", false)).toEqual({ type: "collect-new" });
    expect(practiceJournalAction("fuzzy", false)).toEqual({ type: "collect-new" });
  });

  it("marks on an existing 错题 follow the review curve", () => {
    expect(practiceJournalAction("pass", true)).toEqual({ type: "review", result: "pass" });
    expect(practiceJournalAction("fuzzy", true)).toEqual({ type: "review", result: "hard" });
    expect(practiceJournalAction("fail", true)).toEqual({ type: "review", result: "fail" });
  });

  it("skip never touches the journal", () => {
    expect(practiceJournalAction("skip", false)).toEqual({ type: "none" });
    expect(practiceJournalAction("skip", true)).toEqual({ type: "none" });
  });
});
