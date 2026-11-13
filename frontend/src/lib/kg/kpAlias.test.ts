import { describe, expect, it } from "vitest";
import { canonicalKpId, migrateKpProgress } from "./kpAlias";
import type { UserItemMark, UserKpState } from "./types";

function state(partial: Partial<UserKpState> = {}): UserKpState {
  return {
    covered: false, status: "unknown", confidence: 0, ease: 2.5,
    ivl: 0, due: 0, lapses: 0, updatedAt: 0, ...partial,
  };
}

describe("考点合并别名", () => {
  it("旧 id 解析到现行考点，未知 id 原样返回", () => {
    expect(canonicalKpId("calc.d1.ineq")).toBe("calc.d1.mvt");
    expect(canonicalKpId("calc.i1.indef")).toBe("calc.i1.tech");
    expect(canonicalKpId("la.eq.gauss")).toBe("la.eq.structure");
    expect(canonicalKpId("calc.m.line2")).toBe("calc.m.line2");
    expect(canonicalKpId(undefined)).toBe("");
  });
});

describe("进度迁移", () => {
  it("旧考点键并入现行考点，itemMarks 弱考点同步替换去重", () => {
    const marks: UserItemMark[] = [
      { itemId: "x", mark: "fail", ts: 10, weakKpIds: ["calc.d1.ineq", "calc.d1.mvt", "calc.m.line2"] },
      { itemId: "y", mark: "pass", ts: 20 },
    ];
    const input: { states: Record<string, UserKpState>; itemMarks: UserItemMark[] } = {
      states: { "calc.d1.ineq": state({ confidence: .6, status: "learning" }) },
      itemMarks: marks,
    };
    const { doc, changed } = migrateKpProgress(input);
    expect(changed).toBe(true);
    expect(doc.states["calc.d1.ineq"]).toBeUndefined();
    expect(doc.states["calc.d1.mvt"]?.confidence).toBe(.6);
    expect(doc.itemMarks[0].weakKpIds).toEqual(["calc.d1.mvt", "calc.m.line2"]);
    expect(doc.itemMarks[1]).toBe(marks[1]);
  });

  it("两侧都有进度时取更保守值：掌握度更低、更早复习、weak 优先", () => {
    const { doc } = migrateKpProgress({
      states: {
        "calc.i1.tech": state({ confidence: .8, status: "stable", ease: 2.6, ivl: 10, due: 500, lapses: 1, covered: true, updatedAt: 100, lastMark: "pass" }),
        "calc.i1.indef": state({ confidence: .3, status: "weak", ease: 2.2, ivl: 3, due: 200, lapses: 3, updatedAt: 200, lastMark: "fail" }),
      },
      itemMarks: [],
    });
    const merged = doc.states["calc.i1.tech"];
    expect(doc.states["calc.i1.indef"]).toBeUndefined();
    expect(merged.confidence).toBe(.3);
    expect(merged.status).toBe("weak");
    expect(merged.ease).toBe(2.2);
    expect(merged.ivl).toBe(3);
    expect(merged.due).toBe(200);
    expect(merged.lapses).toBe(3);
    expect(merged.covered).toBe(true);
    expect(merged.lastMark).toBe("fail");
    expect(merged.updatedAt).toBe(200);
  });

  it("due=0 表示未排复习，不覆盖另一侧的排期", () => {
    const { doc } = migrateKpProgress({
      states: {
        "calc.d1.mvt": state({ due: 0 }),
        "calc.d1.ineq": state({ due: 999 }),
      },
      itemMarks: [],
    });
    expect(doc.states["calc.d1.mvt"].due).toBe(999);
  });

  it("没有旧 id 时原样返回，不触发持久化", () => {
    const input = {
      states: { "calc.m.line2": state({ confidence: .9 }) },
      itemMarks: [{ itemId: "x", mark: "pass", ts: 1 }] as UserItemMark[],
    };
    const { doc, changed } = migrateKpProgress(input);
    expect(changed).toBe(false);
    expect(doc).toBe(input);
  });
});
