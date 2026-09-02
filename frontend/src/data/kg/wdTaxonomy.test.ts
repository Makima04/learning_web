import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import {
  wdAssignKp,
  wdClassOf,
  wdCompare,
  wdCounts,
  wdItemsInOrder,
  wdKindOf,
  wdSetPath,
} from "@/data/kg/wdTaxonomy";
import { WdSetPage } from "@/pages/WdSetPage";
import { WdTags } from "@/pages/wdTags";

function loadCatalog(): WangdaoItem[] {
  return JSON.parse(
    readFileSync("public/cs408/wangdao2027.json", "utf8")
  ) as WangdaoItem[];
}

function item(partial: Partial<WangdaoItem> & Pick<WangdaoItem, "id">): WangdaoItem {
  return {
    book: "ds",
    kind: "mcq",
    section: "2.2",
    qno: 1,
    stem: "stem",
    kp_ids: ["ds.linear.seq"],
    ...partial,
  };
}

describe("王道大类/小类", () => {
  it("目录 2886 题全部分到大类，选择与大题分开计数", () => {
    const catalog = loadCatalog();
    expect(catalog).toHaveLength(2886);
    let mcq = 0;
    let big = 0;
    for (const q of catalog) {
      const c = wdClassOf(q);
      expect(c.group.id, q.id).toBeTruthy();
      expect(c.topic.name, q.id).toBeTruthy();
      if (wdKindOf(q) === "big") big++;
      else mcq++;
    }
    expect(mcq).toBe(2456);
    expect(big).toBe(430);
    const all = wdCounts(catalog, "all");
    expect(all.mcq + all.big).toBe(2886);
    expect(all.exam).toBe(778);
  });

  it("5.3 遍历题不因小节名「线索」整节挂到线索树", () => {
    const trav = item({
      id: "ds-mcq-5.3-1",
      section: "5.3",
      stem: "二叉树的先序与中序遍历序列已知，可以唯一确定该二叉树",
      kp_ids: ["ds.tree.thread"],
    });
    expect(wdAssignKp(trav)).toBe("ds.tree.trav");
    expect(wdClassOf(trav).topic.id).toBe("ds.tree.trav");
    const thread = item({
      id: "ds-mcq-5.3-2",
      section: "5.3",
      stem: "在线索二叉树中，某结点没有左孩子",
      kp_ids: ["ds.tree.thread"],
    });
    expect(wdAssignKp(thread)).toBe("ds.tree.thread");
  });

  it("8.5 归并/基数按题干分小类", () => {
    expect(
      wdAssignKp(
        item({
          id: "a",
          section: "8.5",
          stem: "二路归并排序的辅助空间复杂度",
          kp_ids: ["ds.sort.radix"],
        })
      )
    ).toBe("ds.sort.merge");
    expect(
      wdAssignKp(
        item({
          id: "b",
          section: "8.5",
          stem: "基数排序是稳定的",
          kp_ids: ["ds.sort.radix"],
        })
      )
    ).toBe("ds.sort.radix");
  });

  it("绪论无考点题进绪论大类；真题带 year", () => {
    const intro = wdClassOf(
      item({
        id: "ds-mcq-1.1-1",
        section: "1.1",
        stem: "逻辑结构",
        kp_ids: [],
      })
    );
    expect(intro.group.id).toBe("ds-intro");
    expect(intro.topic.name).toBe("基本概念");
    const exam = wdClassOf(
      item({
        id: "x",
        year: 2019,
        stem: "2019 真题",
      })
    );
    expect(exam.isExam).toBe(true);
  });

  it("选择和大题不会混在同一份做题本序里", () => {
    const catalog = loadCatalog();
    const mcq = wdItemsInOrder(catalog, { kind: "mcq" });
    const big = wdItemsInOrder(catalog, { kind: "big" });
    expect(mcq.every((q) => q.kind !== "big")).toBe(true);
    expect(big.every((q) => q.kind === "big")).toBe(true);
    expect(mcq.length + big.length).toBe(catalog.length);
    for (let i = 1; i < mcq.length; i++) {
      expect(wdCompare(mcq[i - 1]!, mcq[i]!)).toBeLessThanOrEqual(0);
    }
  });

  it("题集路径区分选择/大题", () => {
    expect(wdSetPath()).toBe("/kg/wd");
    expect(wdSetPath({ group: "all", kind: "mcq", mode: "proof" })).toBe(
      "/kg/wd/all?kind=mcq&mode=proof"
    );
    expect(wdSetPath({ group: "ds-tree", kind: "big", topic: "ds.tree.trav" })).toBe(
      "/kg/wd/ds-tree?kind=big&topic=ds.tree.trav"
    );
  });
});

describe("王道题集 UI", () => {
  it("入口列出大类，并分开选择/大题校对", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/kg/wd"] }, createElement(WdSetPage))
    );
    expect(html).toContain("王道 408 题集");
    expect(html).toContain("选择题校对");
    expect(html).toContain("大题校对");
    expect(html).toContain("线性表");
    expect(html).toContain("内存管理");
  });

  it("收起只显示大类，点开才出小类", () => {
    const q = item({
      id: "ds-mcq-2.3-1",
      section: "2.3",
      stem: "单链表删除结点",
      kp_ids: ["ds.linear.linked"],
    });
    const collapsed = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(WdTags, { item: q, showMinor: false }))
    );
    expect(collapsed).toContain("线性表");
    expect(collapsed).toContain("选择");
    expect(collapsed).not.toContain("单链表");
    const open = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(WdTags, { item: q, showMinor: true }))
    );
    expect(open).toContain("线性表");
    expect(open).toContain("链表");
  });
});
