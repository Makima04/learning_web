import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findKp } from "@/data/kg";
import { MATH_BOOKS } from "@/data/kg/math";
import { MATH_TEMPLATES, mathTemplateName, templateIdsForItem, templatesForKp } from "@/data/kg/mathTemplates";
import { buildTemplatePlan } from "./mathTemplatePlan";
import { buildMath1Topics, type ReviewQuestion } from "./math1Analysis";
import { mathFacetName } from "./mathPractice";
import { dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";
import type { UserItemMark } from "./types";
import type { WangdaoItem } from "./wangdao408";

describe("题型模板注册表", () => {
  it("模板 id 唯一、考点真实存在、考法标签都能显示中文名", () => {
    const ids = MATH_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of MATH_TEMPLATES) {
      expect(findKp(t.kpId)?.book.subject, t.id).toBe("math");
      expect(t.name.length, t.id).toBeGreaterThan(4);
      expect(t.recognize.length, t.id).toBeGreaterThan(8);
      expect(t.route.length, t.id).toBeGreaterThan(8);
      expect(t.facets.length, t.id).toBeGreaterThan(0);
      for (const f of t.facets) expect(mathFacetName(f), `${t.id}: ${f}`).not.toBe(f);
    }
    expect(mathTemplateName("la.eig.quad.ortho")).toContain("正交变换");
  });

  it("73 个数学考点每类都有模板，模板只挂在数学考点上", () => {
    const kps = MATH_BOOKS.flatMap((b) => b.modules.flatMap((m) => m.kps));
    expect(kps).toHaveLength(73);
    for (const kp of kps) expect(templatesForKp(kp.id).length, kp.id).toBeGreaterThan(0);
    expect(templatesForKp("ds.linear")).toHaveLength(0);
  });
});

describe("模板练习计划：教辅合池分组，真题只作依据", () => {
  const examQ = (year: number, n: number, facets: string[]): ReviewQuestion => ({
    id: `math1-${year}-q${n}`, year, n, kind: "big", points: 10, sourceLabel: "模板依据",
    kpId: "la.eig.quad", book: "linear", secondaryKpIds: [], facets, cost: 2,
    paperPage: 2, answerPage: 2, classification: "question_reviewed", reviewReason: "测试用真题依据", note: "",
  });
  const topic = {
    kpId: "la.eig.quad", kind: "big" as const, subject: "math" as const,
    questions: [examQ(2023, 21, ["ortho_trans"]), examQ(2015, 21, ["ortho_trans", "inertia"])],
  };
  const base: Pick<WangdaoItem, "book" | "kind" | "section" | "kp_ids"> = { book: "linear", kind: "big", section: "6", kp_ids: ["la.eig.quad"] };
  const ll: WangdaoItem = { ...base, id: "ll-hard-6-big-1", source: "lilin880", part: "hard", qno: 1, ord: 5, facets: ["ortho_trans", "eigen_compute"] };
  const ll3: WangdaoItem = { ...base, id: "ll-base-6-big-3", source: "lilin880", part: "base", qno: 3, ord: 7, facets: ["ortho_trans"] };
  const ll2: WangdaoItem = { ...base, id: "ll-base-6-big-2", source: "lilin880", part: "base", qno: 2, ord: 6, facets: ["complete_square"] };
  const zy: WangdaoItem = { ...base, id: "zy-hard-la-6-3", source: "zhangyu1000", part: "hard", qno: 3, ord: 3, facets: ["inertia"] };
  const misc: WangdaoItem = { ...base, id: "ll-hard-6-big-9", source: "lilin880", part: "hard", qno: 9, ord: 9, facets: [] };
  const wrongKind: WangdaoItem = { ...base, id: "ll-mcq", kind: "mcq", qno: 1, facets: ["ortho_trans"] };
  const wrongKp: WangdaoItem = { ...base, id: "ll-pd", kp_ids: ["la.eig.pd"], qno: 1, facets: ["pd"] };
  const zhentiIntruder: WangdaoItem = { ...base, id: "math1-2023-q21", source: "zhenti", section: "2023", qno: 21, year: 2023, facets: ["ortho_trans"], img: "q.webp", ans_img: "a.webp" };
  const pool = [zy, ll, misc, ll3, ll2, wrongKind, wrongKp, zhentiIntruder];
  const orthoOf = (plan: ReturnType<typeof buildTemplatePlan>) => plan.groups.find((g) => g.template.id === "la.eig.quad.ortho")!;

  it("按考法交集归入模板，880 在前 1000 在后；真题混入目录也一律排除", () => {
    const plan = buildTemplatePlan(topic, pool, []);
    const ortho = orthoOf(plan);
    expect(ortho.items.map((q) => q.id)).toEqual(["ll-hard-6-big-1", "ll-base-6-big-3"]);
    expect(ortho.counts).toEqual({ lilin880: 2, zhangyu1000: 0 });
    // 真题只作依据：命中数与年份来自真题数据集，而不是检验题池。
    expect(ortho.examCount).toBe(2);
    expect(ortho.examYears).toEqual([2015, 2023]);
    // 惯性指数题同时命中「配方法」与「反求参数」两类：综合题自然关联多个模板。
    expect(plan.groups.filter((g) => g.items.some((q) => q.id === zy.id)).length).toBe(2);
    expect(plan.other.map((q) => q.id)).toEqual(["ll-hard-6-big-9"]);
    const everything = [...plan.groups.flatMap((g) => g.items), ...plan.other, ...plan.recommendations.map((r) => r.item)];
    expect(everything.some((q) => q.source === "zhenti")).toBe(false);
    expect(everything.some((q) => q.id === wrongKind.id || q.id === wrongKp.id)).toBe(false);
    expect(everything.every((q) => q.kind === "big" && q.kp_ids.includes(topic.kpId))).toBe(true);
  });

  it("首轮推荐优先没做过的基础题并保证主考证据，跨模板去重", () => {
    const plan = buildTemplatePlan(topic, pool, []);
    const ortho = orthoOf(plan);
    expect(ortho.status).toBe("unseen");
    expect(ortho.recommendations.map((q) => q.id)).toEqual(["ll-base-6-big-3", "ll-hard-6-big-1"]);
    const zyRec = plan.recommendations.filter((r) => r.item.id === zy.id);
    expect(zyRec).toHaveLength(1);
    expect(zyRec[0].templateIds.length).toBe(2);
    expect(plan.recommendations.every((r) => r.item.source !== "zhenti")).toBe(true);
  });

  it("两道不同题通过（含主考）→ 初步掌握，三天后到期，复测通过转稳", () => {
    const t0 = 1_700_000_000_000;
    const marks: UserItemMark[] = [
      { itemId: ll.id, mark: "pass", ts: t0, passStartedAt: t0, passTimes: [t0] },
      { itemId: ll3.id, mark: "pass", ts: t0 + 3_600_000, passStartedAt: t0 + 3_600_000, passTimes: [t0 + 3_600_000] },
    ];
    const reviewOn = shiftDayKey(dayKey(t0 + 3_600_000), 3);
    const reviewMs = dayKeyStartMs(reviewOn);
    const before = buildTemplatePlan(topic, pool, marks, new Set(), new Set(), t0 + 7_200_000);
    const g0 = orthoOf(before);
    expect(g0.status).toBe("preliminary");
    expect(g0.reviewOn).toBe(reviewOn);
    expect(g0.passed).toBe(2);
    const due = buildTemplatePlan(topic, pool, marks, new Set(), new Set(), reviewMs);
    const g1 = orthoOf(due);
    expect(g1.status).toBe("due");
    expect(g1.recommendations.length).toBe(1);
    expect(g1.recommendations[0].kp_ids[0]).toBe(topic.kpId);
    const retest: UserItemMark[] = [
      { itemId: ll.id, mark: "pass", ts: reviewMs, passStartedAt: t0, passTimes: [t0, reviewMs] },
      marks[1],
    ];
    const after = buildTemplatePlan(topic, pool, retest, new Set(), new Set(), reviewMs + 1);
    expect(orthoOf(after).status).toBe("stable");
  });

  it("不会/模糊后转薄弱，旧通过证据不再计入，补练避开未到期错题", () => {
    const t0 = 1_700_000_000_000;
    const marks: UserItemMark[] = [
      { itemId: ll.id, mark: "fail", ts: t0 + 3_600_000, lastWeakAt: t0 + 3_600_000 },
    ];
    const plan = buildTemplatePlan(topic, pool, marks, new Set(), new Set([ll.id]), t0 + 7_200_000);
    const g = orthoOf(plan);
    expect(g.status).toBe("weak");
    expect(g.passed).toBe(0);
    expect(g.recommendations.map((q) => q.id)).toEqual(["ll-base-6-big-3"]);
    expect(plan.recommendations.find((r) => r.item.id === ll3.id)?.reason).toBe("supplement");
  });

  it("真题考过但教辅暂缺题的模板保留为依据展示，不出检验题", () => {
    const onlyExam = { ...topic, questions: [examQ(2020, 21, ["rayleigh"])] };
    const plan = buildTemplatePlan(onlyExam, [ll], []);
    const inverse = plan.groups.find((g) => g.template.id === "la.eig.quad.inverse")!;
    expect(inverse.total).toBe(0);
    expect(inverse.examCount).toBe(1);
    expect(inverse.examYears).toEqual([2020]);
    expect(inverse.recommendations).toHaveLength(0);
  });

  it("408 考点不套用数学模板", () => {
    const plan = buildTemplatePlan({ kpId: "ds.linear", kind: "big", subject: "cs408", questions: [] }, pool, []);
    expect(plan.groups).toHaveLength(0);
    expect(plan.other).toHaveLength(0);
  });
});

describe("模板与真实教辅题目对齐", () => {
  const ll = JSON.parse(readFileSync("public/math/lilin880/index.json", "utf8")).items as WangdaoItem[];
  const zy = JSON.parse(readFileSync("public/math/zhangyu1000/index.json", "utf8")).items as WangdaoItem[];
  const catalog = [...ll, ...zy];

  it("二次型大题：模板命中真题依据与教辅检验题，组内不含真题", () => {
    const topic = buildMath1Topics({}, [], catalog, 100, "big").find((t) => t.kpId === "la.eig.quad")!;
    const plan = buildTemplatePlan(topic, catalog, []);
    const ortho = plan.groups.find((g) => g.template.id === "la.eig.quad.ortho")!;
    expect(ortho.examCount).toBeGreaterThan(0);
    expect(ortho.examYears.length).toBeGreaterThan(0);
    expect(ortho.counts.lilin880 + ortho.counts.zhangyu1000).toBeGreaterThan(0);
    expect(ortho.items[0].source).toBe("lilin880");
    expect(ortho.items.every((q) => q.source === "lilin880" || q.source === "zhangyu1000")).toBe(true);
    // 真题依据几乎都应能归入模板（综合/未归类只占少数）。
    const matched = topic.questions.filter((q) => templateIdsForItem("la.eig.quad", q.facets).length > 0).length;
    expect(matched).toBeGreaterThanOrEqual(Math.ceil(topic.questions.length * 0.8));
  });

  it("每个数学考点的大题合池后，未归类题不超过一半", () => {
    for (const kp of MATH_BOOKS.flatMap((b) => b.modules.flatMap((m) => m.kps))) {
      const plan = buildTemplatePlan({ kpId: kp.id, kind: "big", subject: "math", questions: [] }, catalog, []);
      const total = plan.groups.reduce((s, g) => s + g.total, 0) + plan.other.length;
      if (total === 0) continue;
      expect(plan.other.length, `${kp.id} 未归类 ${plan.other.length}/${total}`).toBeLessThanOrEqual(Math.ceil(total / 2));
    }
  });

  it("一题多模板：真题的小问考法能关联多个模板", () => {
    const topic = buildMath1Topics({}, [], catalog, 100, "big").find((t) => t.kpId === "la.eig.quad")!;
    const q = topic.questions.find((x) => (x.facets?.length ?? 0) >= 2)!;
    expect(templateIdsForItem("la.eig.quad", q.facets).length).toBeGreaterThan(0);
  });
});