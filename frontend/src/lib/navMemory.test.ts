import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hrefForNavRoot,
  isNavSectionActive,
  rememberNavPath,
  sectionForPath,
} from "./navMemory";

function mockSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  });
}

describe("navMemory", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  it("maps nested routes to expected nav sections", () => {
    // 408 年份练习与王道题集保留独立浏览位置，侧栏归属 408 手稿。
    expect(sectionForPath("/kg/exams/2024")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/os-mem")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/os-mem/all")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/set")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/set/ds-tree")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/practice/2025")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/mistakes")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/wd")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/wd/ds-tree")?.id).toBe("/kg/exams");
    expect(sectionForPath("/math-handouts/calc-limit")?.id).toBe("/math-handouts");
    expect(sectionForPath("/cs408-handouts/ds-linear")?.id).toBe("/cs408-handouts");
    expect(sectionForPath("/politics/q/2026-34")?.id).toBe("/politics");
    expect(sectionForPath("/reader")?.id).toBe("/papers");
    expect(sectionForPath("/reader/en1/2006/Text%202")?.id).toBe("/papers");
  });

  it("remembers and restores last path per section", () => {
    rememberNavPath("/cs408-handouts/ds-linear");
    expect(hrefForNavRoot("/cs408-handouts")).toBe("/cs408-handouts/ds-linear");
    rememberNavPath("/settings");
    expect(hrefForNavRoot("/cs408-handouts")).toBe("/cs408-handouts/ds-linear");
    expect(hrefForNavRoot("/settings")).toBe("/settings");
    // 408 真题独立记住自己的上次路径，不占用 408 手稿的记忆
    rememberNavPath("/kg/exams/2025");
    expect(hrefForNavRoot("/kg/exams")).toBe("/kg/exams/2025");
    expect(hrefForNavRoot("/cs408-handouts")).toBe("/cs408-handouts/ds-linear");
  });

  it("section active covers children", () => {
    // 年份练习沿用 408 手稿的侧栏高亮。
    expect(isNavSectionActive("/kg/exams", "/kg/exams/practice/2025")).toBe(true);
    expect(isNavSectionActive("/cs408-handouts", "/kg/exams/practice/2025")).toBe(true);
    expect(isNavSectionActive("/cs408-handouts", "/kg/wd/ds-tree")).toBe(true);
    expect(isNavSectionActive("/cs408-handouts", "/cs408-handouts/ds-linear")).toBe(true);
    expect(hrefForNavRoot("/cs408-handouts")).toBe("/cs408-handouts");
    expect(isNavSectionActive("/papers", "/reader")).toBe(true);
    expect(isNavSectionActive("/papers", "/papers/en1/2006")).toBe(true);
    expect(isNavSectionActive("/papers", "/papers-recite")).toBe(false);
    expect(isNavSectionActive("/papers-recite", "/papers-recite/en1/2006")).toBe(
      true
    );
    expect(isNavSectionActive("/journal", "/journal/history")).toBe(true);
    expect(isNavSectionActive("/settings", "/settings/account")).toBe(true);
    expect(isNavSectionActive("/politics", "/politics/q/2024-34")).toBe(true);
    expect(isNavSectionActive("/politics", "/politics/method")).toBe(true);
  });

  it("复习性价比独立高亮和记忆，不占用手稿与真题入口", () => {
    expect(sectionForPath("/review-priority")?.id).toBe("/review-priority");
    expect(sectionForPath("/kg/math/review-priority")?.id).toBe("/review-priority");
    rememberNavPath("/math-handouts/calc-limit");
    rememberNavPath("/kg/exams/2025");
    rememberNavPath("/review-priority", "?subject=cs408&kind=big&book=os");
    expect(hrefForNavRoot("/review-priority")).toBe("/review-priority?subject=cs408&kind=big&book=os");
    expect(hrefForNavRoot("/math-handouts")).toBe("/math-handouts/calc-limit");
    expect(hrefForNavRoot("/kg/exams")).toBe("/kg/exams/2025");
  });
});
