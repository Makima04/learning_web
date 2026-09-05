import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { PracticeQuestionCard } from "@/pages/practiceQuestion";

const item: WangdaoItem = {
  id: "os-big-4.2-2",
  book: "os",
  kind: "big",
  section: "4.2",
  qno: 2,
  stem: "FCB 分解法",
  kp_ids: ["os.file.dir"],
};

describe("PracticeQuestionCard", () => {
  it("提示空格或点空白处显示答案", () => {
    const html = renderToStaticMarkup(
      createElement(PracticeQuestionCard, {
        item,
        index: 1,
        total: 15,
        collected: false,
        onMark: () => {},
        onCollect: () => {},
        onExit: () => {},
      })
    );
    expect(html).toContain("空格或点卡片空白处显示答案");
  });
});
