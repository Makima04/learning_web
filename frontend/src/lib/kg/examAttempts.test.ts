import { describe, expect, it } from "vitest";
import { dayKey } from "@/lib/day";
import type { ExamItem } from "@/lib/kg/exams408";
import {
  ATTEMPTS_LIMIT,
  answerLetter,
  dueFor,
  dueItems,
  formatDateTime,
  formatDuration,
  historySessions,
  isDue,
  latestAttempts,
  nextReviewStep,
  sessionRecordsTruncated,
  sessionReport,
  verdictFor,
  wrongItems,
  type ExamAttempt,
  type ExamSession,
} from "./examAttempts";

function mcq(answer: string | null = "B"): ExamItem {
  return {
    n: 1,
    kind: "mcq",
    book: "ds",
    stem: "题干",
    options: { A: "a", B: "b", C: "c", D: "d" },
    kps: [],
    answer,
    explanation: "解析",
  };
}

function attempt(over: Partial<ExamAttempt> = {}): ExamAttempt {
  return {
    itemId: "cs408-2025-q1",
    year: 2025,
    n: 1,
    kind: "mcq",
    book: "ds",
    outcome: "wrong",
    reviewStep: 0,
    dueMs: 1000,
    ts: 1000,
    ...over,
  };
}

describe("answerLetter / verdictFor", () => {
  it("只认唯一大写 A–D", () => {
    expect(answerLetter(" b ")).toBe("B");
    expect(answerLetter("AB")).toBeNull();
    expect(answerLetter(null)).toBeNull();
    expect(answerLetter("略")).toBeNull();
  });

  it("选择题自动判分，大题必须自评，无答案键不判对错", () => {
    expect(verdictFor(mcq("C"), "C")).toEqual({ kind: "auto", correct: true, key: "C" });
    expect(verdictFor(mcq("C"), "A")).toEqual({ kind: "auto", correct: false, key: "C" });
    expect(verdictFor(mcq("AB"), "A")).toEqual({ kind: "unjudgeable" });
    expect(verdictFor({ ...mcq(), kind: "big" }, "A")).toEqual({ kind: "manual" });
  });
});

describe("1/3/7/14 复习队列", () => {
  it("答错回第一档，答对前进并封顶", () => {
    expect(nextReviewStep(3, "wrong")).toBe(0);
    expect(nextReviewStep(undefined, "correct")).toBe(0);
    expect(nextReviewStep(0, "correct")).toBe(1);
    expect(nextReviewStep(3, "self_pass")).toBe(3);
  });

  it("到期日按北京时间 0 点，不受设备时区影响", () => {
    // 2026-11-06 12:00 北京时间
    const ts = Date.UTC(2026, 10, 6, 4, 0, 0);
    expect(dayKey(dueFor(ts, 0))).toBe("2026-11-07");
    expect(dayKey(dueFor(ts, 1))).toBe("2026-11-09");
    expect(dayKey(dueFor(ts, 2))).toBe("2026-11-13");
    expect(dayKey(dueFor(ts, 3))).toBe("2026-11-20");
  });

  it("错题本取每题最近一次，到期的才进今日复习", () => {
    const list = [
      attempt({ ts: 1, dueMs: 500, outcome: "wrong" }),
      attempt({ ts: 3, dueMs: 9000, outcome: "correct" }),
      attempt({ itemId: "cs408-2025-q2", n: 2, ts: 2, dueMs: 500, outcome: "self_fail" }),
    ];
    expect(latestAttempts(list)).toHaveLength(2);
    expect(wrongItems(list).map((a) => a.itemId)).toEqual(["cs408-2025-q2"]);
    expect(dueItems(list, 1000).map((a) => a.itemId)).toEqual(["cs408-2025-q2"]);
    expect(dueItems(list, 100)).toHaveLength(0);
    expect(isDue(attempt({ dueMs: 999 }), 1000)).toBe(true);
  });
});

describe("sessionReport", () => {
  it("客观正确率只算能自动判分的选择题，大题单列", () => {
    const session: ExamSession = {
      id: "s1",
      year: 2025,
      mode: "mock",
      startedAt: 0,
      durationMs: 125000,
      itemIds: ["a", "b", "c", "d"],
    };
    const attempts = [
      attempt({ itemId: "a", sessionId: "s1", outcome: "correct", book: "ds" }),
      attempt({ itemId: "b", sessionId: "s1", outcome: "wrong", book: "os" }),
      attempt({ itemId: "c", sessionId: "s1", outcome: "self_pass", book: "co" }),
      attempt({ itemId: "d", sessionId: "s1", outcome: "unjudgeable", book: "cn" }),
    ];
    const r = sessionReport(session, attempts);
    expect(r.answered).toBe(4);
    expect(r.autoTotal).toBe(2);
    expect(r.correct).toBe(1);
    expect(r.wrong).toBe(1);
    expect(r.manual).toBe(1);
    expect(r.unjudgeable).toBe(1);
    expect(r.byBook.ds).toEqual({ total: 1, correct: 1 });
    expect(r.byBook.os).toEqual({ total: 1, correct: 0 });
    expect(r.wrongIds).toEqual(["b"]);
  });

  it("同一题多次提交只算最后一次", () => {
    const session: ExamSession = {
      id: "s2",
      year: 2025,
      mode: "practice",
      startedAt: 0,
      itemIds: ["a"],
    };
    const r = sessionReport(session, [
      attempt({ itemId: "a", sessionId: "s2", ts: 1, outcome: "wrong" }),
      attempt({ itemId: "a", sessionId: "s2", ts: 2, outcome: "correct" }),
    ]);
    expect(r.correct).toBe(1);
    expect(r.wrong).toBe(0);
  });
});

describe("formatDuration", () => {
  it("格式化用时", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(65000)).toBe("1 分 05 秒");
    expect(formatDuration(3725000)).toBe("1 小时 2 分");
  });
});

describe("练习记录", () => {
  const session = (over: Partial<ExamSession> = {}): ExamSession => ({
    id: "s",
    year: 2025,
    mode: "practice",
    startedAt: 100,
    itemIds: [],
    ...over,
  });

  it("过滤误点即退出的空会话，按开始时间倒序", () => {
    const sessions = [
      session({ id: "empty", startedAt: 100 }),
      session({ id: "answered", startedAt: 200 }),
      session({ id: "finished", startedAt: 300, finishedAt: 400, durationMs: 100 }),
    ];
    const attempts = [attempt({ sessionId: "answered" })];
    expect(historySessions(sessions, attempts).map((s) => s.id)).toEqual(["finished", "answered"]);
  });

  it("作答记录达到上限且最早记录晚于会话开始 → 判定历史复盘被裁剪", () => {
    const old = session({ id: "old", startedAt: 0 });
    expect(sessionRecordsTruncated(old, [])).toBe(false);
    expect(sessionRecordsTruncated(old, [attempt({ ts: 10 })])).toBe(false);
    const many = Array.from({ length: ATTEMPTS_LIMIT }, (_, i) => attempt({ ts: 10 + i }));
    expect(sessionRecordsTruncated(old, many)).toBe(true);
    expect(sessionRecordsTruncated(session({ id: "new", startedAt: 999999 }), many)).toBe(false);
  });

  it("历史时间统一按北京时间显示", () => {
    // UTC 14:53 → 北京时间 22:53
    expect(formatDateTime(Date.UTC(2026, 10, 6, 14, 53))).toBe("2026-11-06 22:53");
  });
});
