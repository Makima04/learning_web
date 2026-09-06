import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ItemNoteField } from "@/pages/itemNoteField";
import { useKgProgress } from "@/stores/kgProgress";

describe("ItemNoteField", () => {
  beforeEach(() => {
    useKgProgress.setState({
      states: {},
      itemMarks: [],
      itemNotes: {},
      papers: [],
      updatedAt: 0,
    });
  });

  it("无备注时显示入口", () => {
    const html = renderToStaticMarkup(createElement(ItemNoteField, { itemId: "q1" }));
    expect(html).toContain("写思路备注");
    expect(html).not.toContain("卡在哪一步");
  });
});
