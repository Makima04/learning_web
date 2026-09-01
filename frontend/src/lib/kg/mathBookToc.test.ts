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
  it("follows page then qno", () => {
    const qs: WangdaoItem[] = [
      { id: "b", book: "linear", kind: "big", section: "13", qno: 1, pdf_page: 10, stem: "", kp_ids: [] },
      { id: "a", book: "linear", kind: "mcq", section: "13", qno: 2, pdf_page: 9, stem: "", kp_ids: [] },
      { id: "c", book: "linear", kind: "mcq", section: "13", qno: 1, pdf_page: 9, stem: "", kp_ids: [] },
    ];
    expect(sortBookItems(qs).map((q) => q.id)).toEqual(["c", "a", "b"]);
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
