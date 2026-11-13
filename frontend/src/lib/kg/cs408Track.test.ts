import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildTemplatePlan } from "./mathTemplatePlan";
import { buildReviewTopics, REVIEW_DATASETS } from "./reviewPriority";
import { ALGO_DESIGN_KP, cs408ApplyExtraKpIds, cs408ExtraKpIds, filterCs408TrackTopics } from "./cs408Track";
import { CS408_ALGO_TEMPLATES } from "@/data/kg/cs408Templates";
import type { WangdaoItem } from "./wangdao408";

const catalog = JSON.parse(readFileSync("public/cs408/wangdao2027/index.json", "utf8")).items as WangdaoItem[];
const dsTopics = (extra: string[] = []) =>
  buildReviewTopics(REVIEW_DATASETS.cs408, {}, [], catalog, 100, "big", [], extra).filter((t) => t.book === "ds");

describe("408 数据结构大题分轨", () => {
  it("算法题轨：algo.design 按 10 类设计方法考法分组，覆盖全部 90 道算法题", () => {
    const topic = dsTopics().find((t) => t.kpId === ALGO_DESIGN_KP)!;
    expect(topic).toBeTruthy();
    const plan = buildTemplatePlan(topic, catalog, []);
    expect(plan.groups).toHaveLength(CS408_ALGO_TEMPLATES.length);
    expect(plan.groups.reduce((s, g) => s + g.total, 0)).toBe(90);
    expect(plan.other).toHaveLength(0);
    // 每类至少两道，避免抽检「代表题不足」永远无法停练。
    expect(plan.groups.every((g) => g.total >= 2)).toBe(true);
    expect(plan.groups.every((g) => g.template.recognize && g.template.route)).toBe(true);
  });

  it("应用题轨：补出真题未主考的结构知识点，且不含算法设计考点", () => {
    const extra = cs408ApplyExtraKpIds(catalog, "big");
    expect(extra).toContain("ds.search.b");
    expect(extra).toContain("ds.sort.external");
    expect(extra).not.toContain(ALGO_DESIGN_KP);
    const topics = dsTopics(extra);
    const apply = filterCs408TrackTopics(topics, "apply");
    expect(apply.some((t) => t.kpId === "ds.search.b")).toBe(true);
    expect(apply.some((t) => t.kpId === "ds.sort.external")).toBe(true);
    expect(apply.every((t) => t.kpId !== ALGO_DESIGN_KP)).toBe(true);
    expect(filterCs408TrackTopics(topics, "algo").map((t) => t.kpId)).toEqual([ALGO_DESIGN_KP]);
  });

  it("应用题知识点按考法 facet 动态归纳模板，王道题全部入组", () => {
    const topic = dsTopics(["ds.search.hash"]).find((t) => t.kpId === "ds.search.hash")!;
    const plan = buildTemplatePlan(topic, catalog, []);
    expect(plan.groups.length).toBeGreaterThan(0);
    expect(plan.groups.every((g) => g.template.kpId === "ds.search.hash")).toBe(true);
    expect(plan.groups.every((g) => g.items.every((q) => !q.source || q.source === "wangdao"))).toBe(true);
  });

  it("算法题与应用题不重叠：同一道算法题只归算法轨主考", () => {
    const algoIds = new Set(catalog.filter((q) => q.book === "ds" && q.kind === "big" && q.kp_ids[0] === ALGO_DESIGN_KP).map((q) => q.id));
    const applyPrimary = catalog.filter((q) => q.book === "ds" && q.kind === "big" && q.kp_ids[0] !== ALGO_DESIGN_KP);
    expect(applyPrimary.every((q) => !algoIds.has(q.id))).toBe(true);
    expect(algoIds.size).toBe(90);
  });

  it("算法题不会漏进应用题轨：遍历应用题池只含主考题，不含算法设计题", () => {
    // 5.3-1/2 是遍历应用题（trav 主考）；5.3-3..16 是算法题（algo.design 主考、trav 辅助）。
    const topic = dsTopics(["ds.tree.trav"]).find((t) => t.kpId === "ds.tree.trav")!;
    const plan = buildTemplatePlan(topic, catalog, []);
    const all = [...plan.groups.flatMap((g) => g.items), ...plan.other];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((q) => q.kp_ids[0] === "ds.tree.trav")).toBe(true);
    expect(all.some((q) => q.id === "ds-big-5.3-1")).toBe(true);
    expect(all.some((q) => q.id === "ds-big-5.3-3")).toBe(false);
  });

  it("组成/操作/网络大题：补出真题未主考的知识点，并按考法 facet 动态分组", () => {
    const cases: [string, string][] = [["os", "os.io.disk"], ["os", "os.proc.deadlock"], ["cn", "cn.app.http"], ["co", "co.mem.virt"]];
    for (const [book, kp] of cases) {
      const extra = cs408ExtraKpIds(catalog, book as "os" | "cn" | "co", "big");
      expect(extra, kp).toContain(kp);
      const topic = buildReviewTopics(REVIEW_DATASETS.cs408, {}, [], catalog, 100, "big", [], extra)
        .find((t) => t.kpId === kp)!;
      expect(topic, kp).toBeTruthy();
      const plan = buildTemplatePlan(topic, catalog, []);
      expect(plan.groups.length, kp).toBeGreaterThan(0);
      expect(plan.groups.reduce((s, g) => s + g.total, 0), kp).toBeGreaterThan(0);
      expect(plan.groups.every((g) => g.items.every((q) => !q.source || q.source === "wangdao")), kp).toBe(true);
    }
  });
});