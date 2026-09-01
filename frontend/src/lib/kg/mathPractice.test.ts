import { describe, expect, it } from "vitest";
import { findKp } from "@/data/kg";
import { MATH_BOOKS } from "@/data/kg/math";
import {
  itemsForSource,
  MATH_FACETS,
  mathBookLabel,
  mathFacetName,
  practiceKindLabel,
  practiceSourceLabel,
} from "./mathPractice";
import type { WangdaoItem } from "./wangdao408";

describe("MATH_BOOKS 880 chapters", () => {
  it("高等数学 9 章、线代 6 章、概率 8 章，对齐李林 880", () => {
    const [calc, linear, prob] = MATH_BOOKS;
    expect(calc?.modules.map((m) => m.name)).toEqual([
      "函数、极限、连续",
      "一元函数微分学及其应用",
      "一元函数积分学及其应用",
      "空间解析几何",
      "多元函数微分学及其应用",
      "重积分及其应用",
      "微分方程及其应用",
      "无穷级数",
      "曲线积分与曲面积分",
    ]);
    expect(linear?.modules.map((m) => m.name)).toEqual([
      "行列式",
      "矩阵",
      "向量",
      "线性方程组",
      "相似矩阵",
      "二次型",
    ]);
    expect(prob?.modules.map((m) => m.name)).toEqual([
      "随机事件及其概率",
      "随机变量及其分布",
      "多维随机变量及其分布",
      "随机变量的数字特征",
      "大数定律与中心极限定理",
      "数理统计的基本概念",
      "参数估计",
      "假设检验",
    ]);
  });

  it("splits 线性方程组 into 有解判别 / 解的结构 / 公共解", () => {
    const eq = MATH_BOOKS[1]?.modules.find((m) => m.id === "la-eq");
    expect(eq?.kps.map((k) => k.id)).toEqual([
      "la.eq.solvability",
      "la.eq.structure",
      "la.eq.common",
    ]);
    expect(findKp("la.eq.gauss")?.kp.id).toBe("la.eq.structure");
  });

  it("keeps split kps for 三重积分 / 曲线曲面 / 积分不等式", () => {
    const ids = MATH_BOOKS.flatMap((b) => b.modules.flatMap((m) => m.kps.map((k) => k.id)));
    expect(ids).toEqual(expect.arrayContaining([
      "calc.m.tpl",
      "calc.m.line",
      "calc.m.line2",
      "calc.m.surf",
      "calc.m.surf2",
      "calc.m.formula",
      "calc.i1.ineq",
    ]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("practice labels", () => {
  it("labels 880 / 1000 / 填空", () => {
    const item: WangdaoItem = {
      id: "ll-base-3-fill-1",
      source: "lilin880",
      part: "base",
      book: "calc",
      kind: "fill",
      section: "3",
      qno: 1,
      stem: "x",
      kp_ids: ["calc.i1.ineq"],
    };
    expect(practiceSourceLabel(item)).toBe("李林880·基础");
    expect(practiceKindLabel(item.kind)).toBe("填空");
    expect(mathBookLabel("zhangyu1000")).toBe("张宇1000");
  });

  it("splits 880 and 1000 into separate pools", () => {
    const pool: WangdaoItem[] = [
      {
        id: "ll-1",
        source: "lilin880",
        book: "calc",
        kind: "mcq",
        section: "3",
        qno: 1,
        stem: "a",
        kp_ids: ["calc.i1.ineq"],
      },
      {
        id: "zy-1",
        source: "zhangyu1000",
        book: "calc",
        kind: "mcq",
        section: "hs-11",
        qno: 1,
        stem: "b",
        kp_ids: ["calc.i1.ineq"],
      },
    ];
    expect(itemsForSource(pool, "lilin880").map((q) => q.id)).toEqual(["ll-1"]);
    expect(itemsForSource(pool, "zhangyu1000").map((q) => q.id)).toEqual(["zy-1"]);
    expect(itemsForSource(pool, null)).toHaveLength(2);
  });

  it("names 解析分类 facets in Chinese", () => {
    expect(mathFacetName("common_same")).toBe("公共解/同解");
    expect(mathFacetName("rank_adjoint")).toBe("伴随与秩");
    expect(mathFacetName("diagonalize")).toBe("可对角化");
    expect(mathFacetName("inertia")).toBe("惯性定理/规范形");
    expect(mathFacetName("equiv_inf")).toBe("等价无穷小");
    expect(mathFacetName("var_limit")).toBe("变限积分");
    expect(mathFacetName("green")).toBe("格林公式");
    expect(mathFacetName("bayes")).toBe("贝叶斯");
    expect(mathFacetName("curvature")).toBe("曲率");
  });

  it("keeps facet ids unique", () => {
    const ids = MATH_FACETS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("张宇解析字段", () => {
  it("keeps ans_img / answer on catalog items", () => {
    const item: WangdaoItem = {
      id: "zy-base-hs-0-1",
      source: "zhangyu1000",
      part: "base",
      book: "calc",
      kind: "mcq",
      section: "hs-0",
      qno: 1,
      stem: "x",
      kp_ids: ["calc.limit.fn"],
      answer: "B",
      ans_img: "/math/img/zy-ans/zy-base-hs-0-1.jpg",
    };
    expect(item.answer).toBe("B");
    expect(item.ans_img).toContain("zy-ans");
  });
});
