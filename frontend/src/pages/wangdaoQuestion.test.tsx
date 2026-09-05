import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { WangdaoAnalysis } from "@/pages/wangdaoQuestion";

function item(partial: Partial<WangdaoItem> & Pick<WangdaoItem, "id">): WangdaoItem {
  return {
    book: "os",
    kind: "big",
    section: "4.2",
    qno: 2,
    stem: "FCB 分解法",
    kp_ids: ["os.file.dir"],
    ...partial,
  };
}

describe("WangdaoAnalysis", () => {
  it("王道大题无书本答案时提供书面答题与解析两个入口", () => {
    const html = renderToStaticMarkup(createElement(WangdaoAnalysis, { item: item({ id: "os-big-4.2-2" }) }));
    expect(html).toContain("书面答题");
    expect(html).toContain("解析");
    expect(html).not.toContain("看解析");
  });

  it("选择题只有选项答案时仍是看解析，不提供书面答题", () => {
    const html = renderToStaticMarkup(
      createElement(WangdaoAnalysis, {
        item: item({ id: "os-mcq-1.1-1", kind: "mcq", answer: "C", stem: "操作系统是" }),
      })
    );
    expect(html).toContain("看解析");
    expect(html).not.toContain("书面答题");
  });

  it("无题干大题、无书本解析则不渲染", () => {
    const html = renderToStaticMarkup(
      createElement(WangdaoAnalysis, { item: item({ id: "os-big-x", stem: "" }) })
    );
    expect(html).toBe("");
  });

  it("revealAnswer 选择题直接展开书本答案", () => {
    const html = renderToStaticMarkup(
      createElement(WangdaoAnalysis, {
        item: item({ id: "os-mcq-1.1-1", kind: "mcq", answer: "C", stem: "操作系统是" }),
        revealAnswer: true,
      })
    );
    expect(html).toContain("答案：");
    expect(html).toContain("C");
  });

  it("revealAnswer 大题打开书面答题", () => {
    const html = renderToStaticMarkup(
      createElement(WangdaoAnalysis, {
        item: item({ id: "os-big-4.2-2" }),
        revealAnswer: true,
      })
    );
    expect(html).toContain("考场书面作答");
  });
});
