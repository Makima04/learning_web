// 考点去重后的一致性守卫：模板、真题、教辅目录、知识复习引用的考点必须存在，
// 防止以后再出现「方法是独立考点」式的重复归类或悬空引用。
import { readFileSync } from "node:fs";
import katex from "katex";
import { describe, expect, it } from "vitest";
import { MATH_BOOKS, findKp } from "@/data/kg";
import { MATH_TEMPLATES } from "@/data/kg/mathTemplates";
import { MATH_KNOWLEDGE_REVIEWS } from "@/data/kg/mathKnowledgeReviews";
import { MATH1_ITEMS } from "@/lib/kg/math1Analysis";
import type { WangdaoItem } from "@/lib/kg/wangdao408";

const ALL_KP_IDS = new Set(MATH_BOOKS.flatMap((b) => b.modules.flatMap((m) => m.kps.map((k) => k.id))));

function catalogItems(source: "lilin880" | "zhangyu1000"): WangdaoItem[] {
  const data = JSON.parse(readFileSync(new URL(`../../../public/math/${source}/index.json`, import.meta.url), "utf8")) as { items: WangdaoItem[] };
  return data.items;
}

describe("考点引用一致性", () => {
  it("模板都挂在现行考点上，且模板 id 不重复", () => {
    for (const t of MATH_TEMPLATES) expect(ALL_KP_IDS.has(t.kpId), t.id).toBe(true);
    const ids = MATH_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("真题主/辅考点全部可解析", () => {
    for (const q of MATH1_ITEMS) {
      expect(findKp(q.kpId), q.id).not.toBeNull();
      for (const s of q.secondaryKpIds) expect(findKp(s), q.id).not.toBeNull();
      expect(q.secondaryKpIds).not.toContain(q.kpId);
    }
  });

  it("李林880 / 张宇1000 目录的 kp_ids 全部可解析", () => {
    for (const source of ["lilin880", "zhangyu1000"] as const) {
      for (const q of catalogItems(source)) {
        for (const kp of q.kp_ids) expect(ALL_KP_IDS.has(kp), `${q.id}: ${kp}`).toBe(true);
      }
    }
  });

  it("知识复习都对应现行考点，公式可严格排版", () => {
    for (const [kpId, review] of Object.entries(MATH_KNOWLEDGE_REVIEWS)) {
      expect(ALL_KP_IDS.has(kpId), kpId).toBe(true);
      const blocks = [...(review.knowledge ?? [])];
      for (const route of review.routes) for (const lesson of route.lessons) {
        blocks.push(...lesson.prompt);
        lesson.steps.forEach((s) => blocks.push(...s.working));
        lesson.techniques.forEach((t) => blocks.push(...t.content));
      }
      for (const b of blocks) {
        if (b.type === "math") {
          expect(() => katex.renderToString(b.tex, { throwOnError: true, trust: false, strict: "warn" }), `${kpId}: ${b.tex}`).not.toThrow();
        }
      }
    }
  });
});

describe("2026-11 考点去重", () => {
  it("微分等式/不等式证明与不定积分计算已并入现行考点", () => {
    expect(ALL_KP_IDS.has("calc.d1.ineq")).toBe(false);
    expect(ALL_KP_IDS.has("calc.i1.indef")).toBe(false);
    expect(findKp("calc.d1.ineq")?.kp.id).toBe("calc.d1.mvt");
    expect(findKp("calc.i1.indef")?.kp.id).toBe("calc.i1.tech");
  });

  it("三大公式归入曲线/曲面积分模板，formula 只留散度旋度", () => {
    const byKp = (kp: string) => MATH_TEMPLATES.filter((t) => t.kpId === kp);
    expect(byKp("calc.m.formula").map((t) => t.id)).toEqual(["calc.m.formula.field"]);
    expect(byKp("calc.m.line2").map((t) => t.id)).toContain("calc.m.line2.stokes");
    expect(byKp("calc.m.line2").map((t) => t.id)).toContain("calc.m.line2.green");
    const gauss = byKp("calc.m.surf2").find((t) => t.id === "calc.m.surf2.gauss");
    expect(gauss?.facets).toEqual(expect.arrayContaining(["gauss", "close_surface", "tpl_sph", "surf_dS"]));
    expect(findKp("calc.m.formula")?.kp.name).toBe("散度、旋度与保守场");
  });

  it("真题里没有以三大公式为主考点的题；教辅只保留散度/旋度计算题", () => {
    expect(MATH1_ITEMS.some((q) => q.kpId === "calc.m.formula")).toBe(false);
    for (const source of ["lilin880", "zhangyu1000"] as const) {
      for (const q of catalogItems(source)) {
        if (q.kp_ids.includes("calc.m.formula")) {
          expect(q.facets?.some((f) => f === "curl" || f === "curl_div"), q.id).toBe(true);
        }
      }
    }
  });
});
