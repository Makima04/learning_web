import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  OS_MEM_EXAMS,
  OS_MEM_GROUPS,
  osMemExamKey,
  osMemExamLookup,
  osMemExamsForKp,
  osMemExamsInOrder,
  osMemGroup,
  osMemGroupForTopic,
  osMemSetPath,
  osMemTopic,
} from "@/data/kg/osMemTopics";
import { OsMemExamSetPage } from "@/pages/OsMemExamSetPage";
import { OsMemTags } from "@/pages/osMemTags";

describe("OS 内存管理大类/小类", () => {
  it("四类大类覆盖全部 44 题且不重叠", () => {
    expect(OS_MEM_GROUPS).toHaveLength(4);
    const keys = new Set<string>();
    let sum = 0;
    for (const g of OS_MEM_GROUPS) {
      const list = osMemExamsInOrder(g.id);
      sum += list.length;
      for (const e of list) keys.add(osMemExamKey(e.year, e.n));
    }
    expect(sum).toBe(44);
    expect(keys.size).toBe(44);
    expect(osMemExamsInOrder("all")).toHaveLength(44);
  });

  it("卷序按年再按题号", () => {
    const all = osMemExamsInOrder("all");
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!;
      const b = all[i]!;
      expect(a.year < b.year || (a.year === b.year && a.n < b.n)).toBe(true);
    }
    expect(all[0]).toMatchObject({ year: 2012, n: 25 });
  });

  it("2019 选 31 属于分页大类、多级页表小类", () => {
    const e = osMemExamLookup(2019, 31);
    expect(e?.topic).toBe("page-multilevel");
    expect(osMemTopic(e!.topic)?.name).toContain("多级页表");
    expect(osMemGroupForTopic(e!.topic)?.id).toBe("paging");
    expect(osMemGroup("paging")?.name).toBe("分页与分段");
  });

  it("题集路径：卷序校对 / 大类 / 小类", () => {
    expect(osMemSetPath()).toBe("/kg/exams/os-mem");
    expect(osMemSetPath({ group: "all", mode: "proof" })).toBe("/kg/exams/os-mem/all?mode=proof");
    expect(osMemSetPath({ group: "paging", topic: "page-multilevel", q: "2019-31" })).toBe(
      "/kg/exams/os-mem/paging?q=2019-31&topic=page-multilevel"
    );
  });

  it("图谱四考点仍能按 kp 取出题", () => {
    expect(osMemExamsForKp("os.mem.alloc")).toHaveLength(3);
    expect(osMemExamsForKp("os.mem.page").length).toBeGreaterThan(10);
  });
});

describe("OS 内存管理题集 UI", () => {
  it("入口页列出四大类和卷序校对", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/kg/exams/os-mem"] }, createElement(OsMemExamSetPage))
    );
    expect(html).toContain("连续分配");
    expect(html).toContain("分页与分段");
    expect(html).toContain("虚拟内存与置换");
    expect(html).toContain("工作集与抖动");
    expect(html).toContain("快速校对");
    expect(html).toContain("按 408 做题本卷序");
  });

  it("收起只显示大类，点开才出小类", () => {
    const collapsed = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(OsMemTags, { year: 2019, n: 31, showMinor: false }))
    );
    expect(collapsed).toContain("分页与分段");
    expect(collapsed).not.toContain("多级页表");
    const open = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(OsMemTags, { year: 2019, n: 31, showMinor: true }))
    );
    expect(open).toContain("分页与分段");
    expect(open).toContain("多级页表");
  });
});
