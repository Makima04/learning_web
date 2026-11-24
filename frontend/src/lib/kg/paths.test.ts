import { describe, expect, it } from "vitest";
import {
  cs408HandoutPath,
  cs408SingleQuestionPath,
  handoutRootPath,
  kgMapPath,
  kgSubjectSlug,
  knowledgeCheckPath,
  parseKgSubject,
  practiceReturnLabel,
  practiceReturnPath,
} from "./paths";

describe("kg paths", () => {
  it("单题抽检携带安全返回地址，基础自检入口保留题型与排序", () => {
    const path = "/review-priority?subject=cs408&kind=big&book=os&kp=os.file.alloc";
    const url = new URL(cs408SingleQuestionPath(2020, 45, path), "https://example.com");
    expect(url.searchParams.get("single")).toBe("1");
    expect(url.searchParams.get("q")).toBe("45");
    expect(url.searchParams.get("returnTo")).toBe(path);
    expect(cs408SingleQuestionPath(2020, 45, "https://evil.example")).not.toContain("returnTo");
    const check = new URL(knowledgeCheckPath("co.io.channel", "kind=big&order=recent&kp=os.io.disk"), "https://example.com");
    expect(check.searchParams.get("kind")).toBe("big");
    expect(check.searchParams.get("check")).toBe("1");
    expect(check.hash).toBe("#knowledge-check");
    expect(check.searchParams.has("kp")).toBe(false);
  });

  it("routes subject roots to math/408 handouts", () => {
    expect(handoutRootPath("cs408")).toBe("/cs408-handouts");
    expect(handoutRootPath("math")).toBe("/math-handouts");
    expect(handoutRootPath(undefined)).toBe("/cs408-handouts");
    expect(kgMapPath("cs408")).toBe("/cs408-handouts");
    expect(kgMapPath("math")).toBe("/math-handouts");
  });

  it("builds 408 handout deep links by kp, chapter, or book", () => {
    expect(cs408HandoutPath({ kpId: "ds.sort.insert" })).toBe(
      "/cs408-handouts/ds-sort?scene=ds.sort.insert"
    );
    expect(cs408HandoutPath({ chapterId: "os-mem", scene: "os.mem.page" })).toBe(
      "/cs408-handouts/os-mem?scene=os.mem.page"
    );
    expect(cs408HandoutPath({ bookId: "os" })).toBe("/cs408-handouts?book=os");
    expect(cs408HandoutPath()).toBe("/cs408-handouts");
  });

  it("parses slugs", () => {
    expect(parseKgSubject("math")).toBe("math");
    expect(parseKgSubject("cs408")).toBe("cs408");
    expect(parseKgSubject("module")).toBeNull();
    expect(kgSubjectSlug("math")).toBe("math");
    expect(kgSubjectSlug("cs408")).toBe("cs408");
  });

  it("支持复习性价比、知识复习与手稿作为安全返回路径", () => {
    for (const path of [null, undefined, "", "https://example.com", "//example.com", "/\\example.com", "/settings", "/kg/../../settings", "/review-priority\n"]) {
      expect(practiceReturnPath(path)).toBeNull();
    }
    const review = "/review-priority/knowledge/calc.m.ext?kind=fill&order=recent";
    expect(practiceReturnPath(review)).toBe(review);
    expect(practiceReturnLabel(review)).toBe("返回知识复习");

    const mathHandout = "/math-handouts/calc-limit";
    expect(practiceReturnPath(mathHandout)).toBe(mathHandout);
    expect(practiceReturnLabel(mathHandout)).toBe("返回数学手稿");

    const csHandout = "/cs408-handouts/os-mem?scene=os.mem.page";
    expect(practiceReturnPath(csHandout)).toBe(csHandout);
    expect(practiceReturnLabel(csHandout)).toBe("返回408手稿");
  });
});
