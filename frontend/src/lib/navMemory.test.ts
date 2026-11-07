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

  it("maps nested kg routes to kg section", () => {
    expect(sectionForPath("/kg")?.id).toBe("/kg");
    expect(sectionForPath("/kg/module/ds/tree")?.id).toBe("/kg");
    expect(sectionForPath("/kg/math")?.id).toBe("/kg");
    expect(sectionForPath("/kg/math/module/calc/calc-limit")?.id).toBe("/kg");
    expect(sectionForPath("/kg/cs408/kp/ds.sort.insert")?.id).toBe("/kg");
    // 408 真题已升为独立一级入口，其子路由归 /kg/exams 分区
    expect(sectionForPath("/kg/exams/2024")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/os-mem")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/os-mem/all")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/set")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/set/ds-tree")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/practice/2025")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/exams/mistakes")?.id).toBe("/kg/exams");
    expect(sectionForPath("/kg/wd")?.id).toBe("/kg");
    expect(sectionForPath("/kg/wd/ds-tree")?.id).toBe("/kg");
    expect(sectionForPath("/politics/q/2026-34")?.id).toBe("/politics");
    expect(sectionForPath("/reader")?.id).toBe("/papers");
    expect(sectionForPath("/reader/en1/2006/Text%202")?.id).toBe("/papers");
  });

  it("remembers and restores last path per section", () => {
    rememberNavPath("/kg/module/ds/tree");
    expect(hrefForNavRoot("/kg")).toBe("/kg/module/ds/tree");
    rememberNavPath("/settings");
    expect(hrefForNavRoot("/kg")).toBe("/kg/module/ds/tree");
    expect(hrefForNavRoot("/settings")).toBe("/settings");
    // 408 真题独立记住自己的上次路径，不占用知识图谱的记忆
    rememberNavPath("/kg/exams/2025");
    expect(hrefForNavRoot("/kg/exams")).toBe("/kg/exams/2025");
    expect(hrefForNavRoot("/kg")).toBe("/kg/module/ds/tree");
  });

  it("section active covers children", () => {
    expect(isNavSectionActive("/kg", "/kg/predict")).toBe(true);
    // 「知识图谱」不能再抢「408 真题」的高亮
    expect(isNavSectionActive("/kg", "/kg/exams/2025")).toBe(false);
    expect(isNavSectionActive("/kg/exams", "/kg/exams/practice/2025")).toBe(true);
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
});
