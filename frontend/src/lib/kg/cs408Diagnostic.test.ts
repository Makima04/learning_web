import { describe, expect, it } from "vitest";
import { dayKeyStartMs } from "@/lib/day";
import { CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import { buildCs408Diagnostic, cs408CheckId, cs408CheckProgress } from "./cs408Diagnostic";
import { cs408KnowledgeChecks } from "./cs408KnowledgeChecks";
import { buildReviewTopics, REVIEW_DATASETS } from "./reviewPriority";
import { nextPracticeMark } from "./techniqueTraining";
import type { WangdaoItem } from "./wangdao408";
import type { ExamAttempt } from "./examAttempts";

const now = dayKeyStartMs("2026-11-09") + 60_000;
const topic = { kpId: "os.io.disk", kind: "big" as const, questions: [] };
const q = (id: string, method = "调度", extra: Partial<WangdaoItem> = {}): WangdaoItem => ({
  id, book: "os", kind: "big", section: "5.3", qno: 1, kp_ids: [topic.kpId],
  facets: [`${topic.kpId}::${method}`], primaryFacet: `${topic.kpId}::${method}`, ...extra,
});
const pool = [q("a"), q("b", "调度", { qno: 2 })];
const pass = (id: string, at = now) => nextPracticeMark(undefined, id, "pass", at);

describe("408 以少量不同题抽检，不以刷完题集为条件", () => {
  it("一题通过或当天重复点会不能判稳；两道不同题通过后明确停练", () => {
    const repeated = nextPracticeMark(pass("a"), "a", "pass", now + 1);
    const one = buildCs408Diagnostic(topic, pool, [repeated], [], now);
    expect(one.status).toBe("learning");
    expect(one.canStop).toBe(false);
    expect(one.recommendations).toEqual([{ source: "wangdao", item: pool[1] }]);
    const two = buildCs408Diagnostic(topic, pool, pool.map((q) => pass(q.id)), [], now);
    expect(two.status).toBe("preliminary");
    expect(two.canStop).toBe(true);
    expect(two.recommendations).toEqual([]);
    expect(two.reviewOn).toBe("2026-11-12");
  });

  it("北京时间三天后复测，复测通过后七天再抽检", () => {
    const due = dayKeyStartMs("2026-11-12");
    const marks = pool.map((q) => pass(q.id));
    expect(buildCs408Diagnostic(topic, pool, marks, [], due - 1).canStop).toBe(true);
    expect(buildCs408Diagnostic(topic, pool, marks, [], due).status).toBe("due");
    marks[0] = nextPracticeMark(marks[0], "a", "pass", due);
    const stable = buildCs408Diagnostic(topic, pool, marks, [], due);
    expect(stable.status).toBe("stable");
    expect(stable.reviewOn).toBe("2026-11-19");
    expect(buildCs408Diagnostic(topic, pool, marks, [], dayKeyStartMs("2026-11-19")).status).toBe("due");
  });

  it("多个考法分轮最多三题；不拿辅助考点和OCR待核对题凑覆盖", () => {
    const many = [q("a"), q("b"), q("c", "时间"), q("d", "时间"), q("bad", "容量", { diagnostic_eligible: false }),
      q("aux", "辅助", { kp_ids: ["os.file.fs", topic.kpId] })];
    const plan = buildCs408Diagnostic(topic, many, [], [], now);
    expect(plan.remaining).toBe(4);
    expect(plan.recommendations).toHaveLength(3);
    expect(plan.groups.map((g) => g.label)).toEqual(["时间", "调度"]);
    const shortage = buildCs408Diagnostic(topic, [pool[0]], [pass("a")], [], now);
    expect(shortage.groups[0].shortage).toBe(true);
    expect(shortage.canStop).toBe(false);
  });

  it("没有王道也用真题抽检，并合并逐次作答和旧自评的延迟证据", () => {
    const base = REVIEW_DATASETS.cs408.items.find((q) => q.kind === "big")!;
    const questions = [1, 2].map((n) => ({ ...base, id: `cs408-2020-q${n}`, n, year: 2020, kpId: topic.kpId }));
    const t = { ...topic, questions };
    const a = (id: string, ts: number): ExamAttempt => ({ itemId: id, year: 2020, n: 1, kind: "big", book: "os", outcome: "self_pass", ts, reviewStep: 1, dueMs: ts });
    expect(buildCs408Diagnostic(t, [], [], [], now).recommendations.every((r) => r.source === "exam")).toBe(true);
    const due = dayKeyStartMs("2026-11-12");
    const attempts = [a(questions[0].id, now), a(questions[1].id, now + 1), a(questions[0].id, due)];
    expect(buildCs408Diagnostic(t, [], [], attempts, due).status).toBe("stable");
    const failed = { ...attempts[2], outcome: "self_fail" as const, ts: due + 1 };
    expect(buildCs408Diagnostic(t, [], [], [...attempts, failed], due + 1).status).toBe("weak");
  });

  it("王道错题间隔中不立即重做，未到期的证据仍保留", () => {
    const waiting = new Set(["a"]);
    const plan = buildCs408Diagnostic(topic, pool, [nextPracticeMark(undefined, "a", "fail", now)], [], now, new Set(), waiting);
    expect(plan.recommendations.flatMap((r) => r.source === "wangdao" ? [r.item.id] : [])).toEqual(["b"]);
    expect(plan.status).toBe("weak");
  });
});

describe("408 缺题时的闭卷基础证据", () => {
  it("92个考点都有原理、边界、推演三项及现有教案的核对依据", () => {
    expect(Object.keys(CS408_KNOWLEDGE_REVIEWS)).toHaveLength(92);
    for (const template of Object.values(CS408_KNOWLEDGE_REVIEWS)) {
      const checks = cs408KnowledgeChecks(template);
      expect(checks.map((c) => c.part)).toEqual(["principle", "boundary", "application"]);
      expect(checks.every((c) => c.prompt.length && c.rubric.length)).toBe(true);
    }
  });

  it("基础三项通过只标基础已检验，不能伪造原题掌握；复测不靠同日连点", () => {
    const marks = ["principle", "boundary", "application"].map((part) => pass(cs408CheckId(topic.kpId, part as "principle" | "boundary" | "application")));
    const plan = buildCs408Diagnostic(topic, [], marks, [], now);
    expect(plan.label).toBe("基础已检验");
    expect(plan.canStop).toBe(false);
    expect(plan.sampleCount).toBe(0);
    expect(cs408CheckProgress(topic.kpId, marks, now).every((c) => c.status === "preliminary")).toBe(true);
    expect(cs408CheckProgress(topic.kpId, marks, dayKeyStartMs("2026-11-12")).every((c) => c.status === "due")).toBe(true);
    const due = buildCs408Diagnostic(topic, [], marks, [], dayKeyStartMs("2026-11-12"));
    expect(due.label).toBe("基础待复测");
    expect(due.checksDue).toBe(3);
  });

  it("性价比不能被一道会了抬到90%或稳定掌握，数学沿用原逻辑", () => {
    const data = REVIEW_DATASETS.cs408;
    const first = data.items.find((q) => q.kind === "big")!;
    const t = buildReviewTopics(data, {}, [pass(first.id)], [], now, "big").find((t) => t.kpId === first.kpId)!;
    expect(t.confidence).toBeLessThanOrEqual(.55);
    expect(t.status).not.toBe("stable");
    expect(t.diagnostic?.canStop).toBe(false);
    const math = REVIEW_DATASETS.math.items[0];
    const m = buildReviewTopics(REVIEW_DATASETS.math, {}, [pass(math.id)], [], now, math.kind).find((t) => t.kpId === math.kpId)!;
    expect(m.confidence).toBe(.9);
    expect(m.diagnostic).toBeUndefined();
  });
});
