import { describe, expect, it } from "vitest";
import { MATH_BOOKS } from "@/data/kg/math";
import { bookDrillGroups, itemsForBookDrill, sortBookItems } from "./mathBookToc";
import type { WangdaoItem } from "./wangdao408";

describe("bookDrillGroups", () => {
  it("maps 线性方程组 to 880 ch13 and 1000 la-4/la-5", () => {
    const g = bookDrillGroups("la-eq");
    expect(g.map((x) => `${x.source}:${x.part}:${x.section}`)).toEqual([
      "lilin880:base:13",
      "lilin880:hard:13",
      "zhangyu1000:base:la-4",
      "zhangyu1000:hard:la-5",
    ]);
  });

  it("covers every math module with at least 李林章节", () => {
    const mods = MATH_BOOKS.flatMap((b) => b.modules.map((m) => m.id));
    for (const id of mods) {
      const g = bookDrillGroups(id);
      expect(g.some((x) => x.source === "lilin880")).toBe(true);
    }
  });
});

describe("sortBookItems", () => {
  it("优先用抽取脚本写入的 ord（原书顺序）", () => {
    const qs: WangdaoItem[] = [
      { id: "fill-1", book: "calc", kind: "fill", section: "2", qno: 1, pdf_page: 12, stem: "", kp_ids: [], ord: 3 },
      { id: "mcq-2", book: "calc", kind: "mcq", section: "2", qno: 2, pdf_page: 11, stem: "", kp_ids: [], ord: 2 },
      { id: "mcq-1", book: "calc", kind: "mcq", section: "2", qno: 1, pdf_page: 11, stem: "", kp_ids: [], ord: 1 },
    ];
    expect(sortBookItems(qs).map((q) => q.id)).toEqual(["mcq-1", "mcq-2", "fill-1"]);
  });

  it("没有 ord 时退回页码 → 题号（张宇1000 全书连续编号）", () => {
    const qs: WangdaoItem[] = [
      { id: "big-2", book: "calc", kind: "big", section: "hs-1", qno: 2, pdf_page: 11, stem: "", kp_ids: [] },
      { id: "mcq-3", book: "calc", kind: "mcq", section: "hs-1", qno: 3, pdf_page: 11, stem: "", kp_ids: [] },
      { id: "mcq-1", book: "calc", kind: "mcq", section: "hs-1", qno: 1, pdf_page: 11, stem: "", kp_ids: [] },
    ];
    expect(sortBookItems(qs).map((q) => q.id)).toEqual(["mcq-1", "big-2", "mcq-3"]);
  });

  it("filters by source/part/section", () => {
    const spec = bookDrillGroups("la-eq")[0]!;
    const pool: WangdaoItem[] = [
      { id: "keep", source: "lilin880", part: "base", book: "linear", kind: "mcq", section: "13", qno: 1, stem: "", kp_ids: [] },
      { id: "drop", source: "lilin880", part: "hard", book: "linear", kind: "mcq", section: "13", qno: 1, stem: "", kp_ids: [] },
    ];
    expect(itemsForBookDrill(pool, spec).map((q) => q.id)).toEqual(["keep"]);
  });
});
