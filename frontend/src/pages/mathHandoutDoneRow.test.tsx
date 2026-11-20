// 讲义例题「今日已练」折叠：当天标会/模糊/不会收起成彩条（区别于已斩灰条），
// 下次复习日（北京时间跨天）自动展开，也可手动展开/重新折叠。
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ExampleCard, doneMarkForToday } from "@/pages/MathHandoutDetailPage";
import type { HandoutExample } from "@/lib/mathHandouts";
import type { UserItemMark } from "@/lib/kg/types";
import { dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";

const ex: HandoutExample = {
  id: "lilin880-calc-2-9",
  anchorId: "ex-calc-2-9",
  matchedMath1: false,
  lilin880Id: null,
  year: null,
  n: null,
  sourceType: "lilin880",
  source: "李林 880 · 第 2 章基础解答第 9 题",
  title: "证明零点可导并求导数",
  answerLetter: null,
  questionHtml: "<p>设函数 f(x) 在 x=0 处连续……</p>",
  hintHtml: "<p>题面线索和第一步</p>",
  stepsHtml: "<p>具体答题步骤</p>",
};

function renderCard(overrides: Partial<Parameters<typeof ExampleCard>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ExampleCard, {
        ex,
        isActive: false,
        isRetired: false,
        isForcedOpen: false,
        hintOpen: false,
        stepsOpen: false,
        primaryKpId: "calc.derivative.definition",
        secondaryKpIds: [],
        onActivate: () => {},
        onToggleHint: () => {},
        onToggleSteps: () => {},
        onRetire: () => {},
        onUnretire: () => {},
        onToggleForceOpen: () => {},
        onMarked: () => {},
        ...overrides,
      })
    )
  );
}

describe("doneMarkForToday", () => {
  const today = dayKey();
  const noonToday = dayKeyStartMs(today) + 12 * 3600_000;
  const noonYesterday = dayKeyStartMs(shiftDayKey(today, -1)) + 12 * 3600_000;
  const rec = (mark: UserItemMark["mark"], ts: number, retired = false): UserItemMark => ({
    itemId: ex.id,
    mark,
    ts,
    retired,
  });

  it("今天标过会/模糊/不会 → 当天折叠", () => {
    expect(doneMarkForToday(rec("pass", noonToday), today)).toBe("pass");
    expect(doneMarkForToday(rec("fuzzy", noonToday), today)).toBe("fuzzy");
    expect(doneMarkForToday(rec("fail", noonToday), today)).toBe("fail");
  });

  it("昨天标的 → 下次复习自动展开", () => {
    expect(doneMarkForToday(rec("fuzzy", noonYesterday), today)).toBeUndefined();
    expect(doneMarkForToday(rec("pass", noonYesterday), today)).toBeUndefined();
  });

  it("按北京时间 0 点切日，与设备时区无关", () => {
    const start = dayKeyStartMs(today);
    expect(doneMarkForToday(rec("fail", start), today)).toBe("fail");
    expect(doneMarkForToday(rec("fail", start - 1), today)).toBeUndefined();
  });

  it("已斩 / skip / 无记录不算今日已练", () => {
    expect(doneMarkForToday(rec("pass", noonToday, true), today)).toBeUndefined();
    expect(doneMarkForToday(rec("skip", noonToday), today)).toBeUndefined();
    expect(doneMarkForToday(undefined, today)).toBeUndefined();
  });
});

describe("ExampleCard 今日已练折叠条", () => {
  it("标记后折叠成彩色紧凑条，区别于已斩灰条", () => {
    const html = renderCard({ doneMark: "fuzzy", currentMark: "fuzzy" });
    expect(html).toContain("mh-done-row is-fuzzy");
    expect(html).toContain("mh-done-badge is-fuzzy");
    expect(html).toContain("模糊");
    expect(html).toContain(ex.title);
    expect(html).toContain("今日已练 · 下次复习自动展开");
    expect(html).toContain("展开");
    // 题面与步骤不再渲染；标题不划线、不用灰条样式
    expect(html).not.toContain("mh-question");
    expect(html).not.toContain("显示答题步骤");
    expect(html).not.toContain("mh-retired-row");
    expect(html).not.toContain("mh-retired-title");
    expect(html).toContain("mh-done-title");
  });

  it("会/不会各有对应颜色与徽章", () => {
    const pass = renderCard({ doneMark: "pass", currentMark: "pass" });
    expect(pass).toContain("mh-done-row is-pass");
    expect(pass).toContain("已会");
    const fail = renderCard({ doneMark: "fail", currentMark: "fail" });
    expect(fail).toContain("mh-done-row is-fail");
    expect(fail).toContain("不会");
  });

  it("手动展开恢复完整题面，并提供重新折叠", () => {
    const html = renderCard({ doneMark: "fail", currentMark: "fail", isForcedOpen: true });
    expect(html).toContain("mh-question");
    expect(html).toContain("（今日已练 · 手动展开）");
    expect(html).toContain("重新折叠");
    expect(html).toContain("显示答题步骤");
    expect(html).toContain("斩掉");
  });

  it("已斩优先于今日已练，仍走灰条", () => {
    const html = renderCard({ isRetired: true, doneMark: "pass", currentMark: "pass" });
    expect(html).toContain("mh-retired-row");
    expect(html).toContain("已斩");
    expect(html).toContain("移回复习");
    expect(html).not.toContain("mh-done-row");
  });

  it("已斩临时展开行为不受影响", () => {
    const html = renderCard({ isRetired: true, isForcedOpen: true });
    expect(html).toContain("已斩（临时展开查看）");
    expect(html).toContain("mh-question");
  });

  it("未标记的题保持正常展开", () => {
    const html = renderCard();
    expect(html).toContain("mh-question");
    expect(html).not.toContain("mh-done-row");
  });
});