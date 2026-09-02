import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CS408_EXAM_REFS } from "@/data/kg/examClassify";
import {
  EXAM_GROUPS,
  examClassOf,
  examCountForGroup,
  examExamsInOrder,
  examGroup,
  examGroupsByBook,
  examKey,
  examSetPath,
} from "@/data/kg/examTaxonomy";
import { ExamSetPage } from "@/pages/ExamSetPage";
import { ExamTags } from "@/pages/examTags";

describe("408 全科大类/小类", () => {
  it("705 题全部能分到图谱大类且不丢题", () => {
    expect(CS408_EXAM_REFS).toHaveLength(705);
    const keys = new Set<string>();
    for (const e of CS408_EXAM_REFS) {
      const c = examClassOf(e.year, e.n);
      expect(c, `${e.year}-${e.n} 未分类`).toBeTruthy();
      keys.add(examKey(e.year, e.n));
    }
    expect(keys.size).toBe(705);
    expect(examExamsInOrder("all")).toHaveLength(705);
  });

  it("各大类题量之和等于全卷", () => {
    let sum = 0;
    for (const g of EXAM_GROUPS) sum += examCountForGroup(g.id);
    expect(sum).toBe(705);
  });

  it("四科都有大类", () => {
    const books = examGroupsByBook();
    expect(books.map((b) => b.bookId)).toEqual(["ds", "co", "os", "cn"]);
    expect(EXAM_GROUPS.some((g) => g.id === "ds-tree" && g.name === "树与二叉树")).toBe(true);
    expect(examGroup("os-mem")?.name).toBe("内存管理");
  });

  it("2019 选 31：大类内存管理，小类多级页表（os-mem 细类）", () => {
    const c = examClassOf(2019, 31);
    expect(c?.group.id).toBe("os-mem");
    expect(c?.group.name).toBe("内存管理");
    expect(c?.topic.id).toBe("page-multilevel");
    expect(c?.topic.name).toContain("多级页表");
  });

  it("2024 选 1：大类线性表，小类链表", () => {
    const c = examClassOf(2024, 1);
    expect(c?.group.id).toBe("ds-linear");
    expect(c?.topic.id).toBe("ds.linear.linked");
    expect(c?.topic.name).toContain("链表");
  });

  it("卷序按年再按题号", () => {
    const all = examExamsInOrder("all");
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!;
      const b = all[i]!;
      expect(a.year < b.year || (a.year === b.year && a.n < b.n)).toBe(true);
    }
    expect(all[0]).toMatchObject({ year: 2012, n: 1 });
    expect(all[all.length - 1]).toMatchObject({ year: 2026, n: 47 });
  });

  it("题集路径：卷序校对 / 大类 / 小类", () => {
    expect(examSetPath()).toBe("/kg/exams/set");
    expect(examSetPath({ group: "all", mode: "proof" })).toBe("/kg/exams/set/all?mode=proof");
    expect(examSetPath({ group: "ds-tree", topic: "ds.tree.trav", q: "2012-3" })).toBe(
      "/kg/exams/set/ds-tree?q=2012-3&topic=ds.tree.trav"
    );
  });
});

describe("408 全科题集 UI", () => {
  it("入口页按书列出大类和卷序校对", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/kg/exams/set"] }, createElement(ExamSetPage))
    );
    expect(html).toContain("数据结构");
    expect(html).toContain("线性表");
    expect(html).toContain("内存管理");
    expect(html).toContain("计算机网络");
    expect(html).toContain("快速校对");
    expect(html).toContain("按 408 做题本卷序");
  });

  it("收起只显示大类，点开才出小类", () => {
    const collapsed = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ExamTags, { year: 2024, n: 1, showMinor: false }))
    );
    expect(collapsed).toContain("线性表");
    expect(collapsed).not.toContain("链表");
    const open = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ExamTags, { year: 2024, n: 1, showMinor: true }))
    );
    expect(open).toContain("线性表");
    expect(open).toContain("链表");
  });
});
