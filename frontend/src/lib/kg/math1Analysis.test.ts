import { describe, expect, it } from "vitest";
import { findKp } from "@/data/kg";
import { readFileSync, existsSync } from "node:fs";
import {
  buildMath1Topics, matchMath1Training, sortMath1Topics, math1PdfHref,
  MATH1_BIG_ITEMS, MATH1_ITEMS, MATH1_ANALYSIS, MATH1_KINDS, parseMath1Kind,
} from "./math1Analysis";
import { newKpState } from "./mark";
import type { WangdaoItem } from "./wangdao408";

describe("数学一真题统计的来源完整性", () => {
  it("18 年三种题型题号完整，每年 150 分，考点均能回到图谱", () => {
    expect(MATH1_ITEMS).toHaveLength(408);
    expect(MATH1_BIG_ITEMS).toHaveLength(144);
    expect(MATH1_ITEMS.filter((q) => q.kind === "mcq")).toHaveLength(156);
    expect(MATH1_ITEMS.filter((q) => q.kind === "fill")).toHaveLength(108);
    expect(new Set(MATH1_ITEMS.map((q) => q.id)).size).toBe(408);
    for (const year of MATH1_ANALYSIS.years) {
      const qs = MATH1_ITEMS.filter((q) => q.year === year);
      expect(qs.map((q) => q.n)).toEqual(Array.from({ length: year <= 2020 ? 23 : 22 }, (_, i) => i + 1));
      expect(qs.reduce((sum, q) => sum + q.points, 0)).toBe(150);
      const specs = year <= 2020 ? { mcq: [1, 8, 32], fill: [9, 14, 24], big: [15, 23, 94] }
        : { mcq: [1, 10, 50], fill: [11, 16, 30], big: [17, 22, 70] };
      for (const kind of MATH1_KINDS) {
        const [start, end, points] = specs[kind];
        const group = qs.filter((q) => q.kind === kind);
        expect(group.map((q) => q.n)).toEqual(Array.from({ length: end - start + 1 }, (_, i) => start + i));
        expect(group.reduce((sum, q) => sum + q.points, 0)).toBe(points);
      }
    }
    for (const q of MATH1_ITEMS) {
      expect(findKp(q.kpId)?.book.id).toBe(q.book);
      for (const id of q.secondaryKpIds) expect(findKp(id)).toBeTruthy();
      expect(q.sourceLabel).toBeTruthy();
      expect(q.paperPage).toBeGreaterThan(1);
      expect(q.answerPage).toBeGreaterThan(1);
      expect(existsSync(`public/math/exams/math1/${q.year}.pdf`)).toBe(true);
      expect(existsSync(`public/math/exams/math1/answers/${q.year}-answer.pdf`)).toBe(true);
    }
    expect(readFileSync("public/math/exams/math1/2026.pdf").subarray(0, 4).toString()).toBe("%PDF");
    expect(math1PdfHref(MATH1_BIG_ITEMS[0], true)).toContain("answers/2009-answer.pdf#page=");
  });

  it("每年去重计频、主考点只分配一次分值，辅助考点不重复累加", () => {
    for (const kind of MATH1_KINDS) {
      const topics = buildMath1Topics({}, [], [], 100, kind);
      const allPoints = MATH1_ITEMS.filter((q) => q.kind === kind).reduce((sum, q) => sum + q.points, 0);
      expect(topics.reduce((sum, t) => sum + t.totalPoints, 0)).toBe(allPoints);
      expect(topics.reduce((sum, t) => sum + t.pointShare, 0)).toBeCloseTo(1);
      expect(topics.reduce((sum, t) => sum + t.recentPointShare, 0)).toBeCloseTo(1);
      for (const topic of topics) {
        expect(topic.kind).toBe(kind);
        expect(topic.questions.every((q) => q.kind === kind)).toBe(true);
        expect(topic.years.length).toBe(new Set(topic.questions.map((q) => q.year)).size);
        expect(topic.recentYears.every((y) => y >= 2022)).toBe(true);
      }
      const history = sortMath1Topics(topics, "frequency");
      expect(history[0].years.length).toBeGreaterThanOrEqual(history[1].years.length);
    }
    expect(parseMath1Kind(null)).toBe("big");
    expect(parseMath1Kind("invalid")).toBe("big");
    expect(parseMath1Kind("fill")).toBe("fill");
  });
});

describe("个性化复习排序", () => {
  const kpId = "calc.m.ext";
  const topic = (state: ReturnType<typeof newKpState> | undefined) =>
    buildMath1Topics(state ? { [kpId]: state } : {}, [], [], 100).find((t) => t.kpId === kpId)!;

  it("未做过、仅标记已学不等于不会；确认薄弱优先于稳定掌握", () => {
    const unknown = topic(undefined);
    const coveredOnly = topic({ ...newKpState(), covered: true, confidence: .15 });
    const weak = topic({ ...newKpState(), covered: true, confidence: .1, lastMark: "fail", status: "weak" });
    const stable = topic({ ...newKpState(), covered: true, confidence: .95, lastMark: "pass", status: "mastered" });
    expect(unknown.status).toBe("unknown");
    expect(coveredOnly.status).toBe("unknown");
    expect(unknown.confidence).toBeNull();
    expect(weak.priority).toBeGreaterThan(unknown.priority);
    expect(unknown.priority).toBeGreaterThan(stable.priority);
    expect(stable.status).toBe("stable");
  });

  it("分值先在每年内归一化，再结合近五年与长期；不是直接累加旧卷分值", () => {
    const t = topic(undefined);
    const annual = MATH1_ANALYSIS.years.map((year) => ({ year, share: t.questions.filter((q) => q.year === year)
      .reduce((sum, q) => sum + q.points, 0) / (year <= 2020 ? 94 : 70) }));
    expect(t.pointShare).toBeCloseTo(annual.reduce((sum, y) => sum + y.share, 0) / 18);
    expect(t.priority).toBeCloseTo((.4 * t.pointShare + .6 * t.recentPointShare) * .5 / (1 + .35 * (t.cost - 1)));
  });

  it("分别使用当前题型的练习记录，缺少记录时明确回退为共享图谱参考", () => {
    const state = { [kpId]: { ...newKpState(), covered: true, confidence: .8, lastMark: "pass" as const } };
    const catalog: WangdaoItem[] = [
      { id: "big", book: "calc", kind: "big", section: "5", qno: 1, kp_ids: [kpId] },
      { id: "mcq", book: "calc", kind: "mcq", section: "5", qno: 2, kp_ids: [kpId] },
    ];
    const marks = [{ itemId: "big", mark: "pass" as const, ts: 100 }, { itemId: "mcq", mark: "fail" as const, ts: 101 }];
    const get = (kind: "big" | "mcq" | "fill") => buildMath1Topics(state, marks, catalog, 100, kind).find((t) => t.kpId === kpId)!;
    expect(get("big").status).toBe("stable");
    expect(get("mcq").status).toBe("weak");
    expect(get("mcq").sampleCount).toBe(1);
    expect(get("mcq").confidenceSource).toBe("kind");
    expect(get("fill").sampleCount).toBe(0);
    expect(get("fill").confidenceSource).toBe("graph");
  });
});

describe("教辅推荐保持匹配边界与错题间隔", () => {
  const topic = buildMath1Topics({}).find((t) => t.kpId === "calc.m.ext")!;
  const question = (id: string, extra: Partial<WangdaoItem> = {}): WangdaoItem => ({
    id, book: "calc", source: "lilin880", section: "5", qno: 1,
    kind: "big", kp_ids: [topic.kpId], part: "base", ...extra,
  });

  it("没有细标签的张宇题只标同考点，有标签交集才标方法匹配", () => {
    const result = matchMath1Training(topic, [question("ll", { facets: ["ext_free"] }), question("zy", { source: "zhangyu1000" })], [], {});
    expect(result.find((q) => q.item.id === "ll")?.match).toBe("method");
    expect(result.find((q) => q.item.id === "zy")?.match).toBe("topic");
  });

  it("避开已会和未到期错题，到期可重练；补基础题必须关联先修", () => {
    const pool = [question("pass"), question("wait"), question("due"),
      question("base", { kp_ids: ["calc.m.partial"] }),
      question("unrelated", { kp_ids: ["calc.limit.fn"] })];
    const marks = ["pass", "due"].map((itemId) => ({ itemId, mark: "pass" as const, ts: 1 }));
    const result = matchMath1Training(topic, pool, marks, {}, new Set(["due"]), new Set(["wait"]));
    expect(result.map((m) => m.item.id)).toEqual(["base", "due"]);
    expect(result[0].match).toBe("foundation");
    expect(result[1].review).toBe(true);
    const masteredBase = { "calc.m.partial": { ...newKpState(), confidence: .9, lastMark: "pass" as const } };
    expect(matchMath1Training(topic, pool, marks, masteredBase, new Set(["due"]), new Set(["wait"])).map((m) => m.item.id)).toEqual(["due"]);
  });

  it("三个题型的训练及补基础均不串题型，展开更多不会截断全部候选", () => {
    const pool = MATH1_KINDS.flatMap((kind) => Array.from({ length: 12 }, (_, i) => question(`${kind}-${i}`, { kind, qno: i + 1 })));
    pool.push(question("fill-base", { kind: "fill", kp_ids: ["calc.m.partial"] }));
    for (const kind of MATH1_KINDS) {
      const t = buildMath1Topics({}, [], [], 100, kind).find((q) => q.kpId === topic.kpId)!;
      const selected = matchMath1Training(t, pool, [], {});
      const all = matchMath1Training(t, pool, [], {}, new Set(), new Set(), true);
      expect(selected.length).toBeLessThanOrEqual(3);
      expect(all.filter((m) => m.match !== "foundation")).toHaveLength(12);
      expect(all.every((m) => m.item.kind === kind)).toBe(true);
      expect(new Set(all.map((m) => m.item.id)).size).toBe(all.length);
      expect(selected.every((m) => all.some((a) => a.item.id === m.item.id))).toBe(true);
    }
  });
});
