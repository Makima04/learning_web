import { describe, expect, it } from "vitest";
import { kgBookDrillPath, kgKpPath, kgMapPath, kgModulePath, parseKgSubject, kgSubjectSlug, practiceReturnLabel, practiceReturnPath } from "./paths";
import { cs408SingleQuestionPath, knowledgeCheckPath } from "./paths";

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
  it("splits 408 and math map URLs", () => {
    expect(kgMapPath("cs408")).toBe("/kg/cs408");
    expect(kgMapPath("math")).toBe("/kg/math");
    expect(kgMapPath(undefined)).toBe("/kg/cs408");
  });

  it("nests module / kp under the subject", () => {
    expect(kgModulePath("ds", "tree", "cs408")).toBe("/kg/cs408/module/ds/tree");
    expect(kgModulePath("calc", "calc-limit", "math")).toBe(
      "/kg/math/module/calc/calc-limit"
    );
    expect(kgKpPath("calc.m.tpl", { subject: "math", src: "lilin880" })).toBe(
      "/kg/math/kp/calc.m.tpl?src=lilin880"
    );
    expect(kgKpPath("ds.sort.insert", { subject: "cs408" })).toBe(
      "/kg/cs408/kp/ds.sort.insert"
    );
    expect(
      kgBookDrillPath("linear", "la-eq", {
        subject: "math",
        src: "lilin880",
        part: "base",
        section: "13",
      })
    ).toBe("/kg/math/module/linear/la-eq/book?src=lilin880&part=base&section=13");
  });

  it("parses slugs", () => {
    expect(parseKgSubject("math")).toBe("math");
    expect(parseKgSubject("cs408")).toBe("cs408");
    expect(parseKgSubject("module")).toBeNull();
    expect(kgSubjectSlug("math")).toBe("math");
    expect(kgSubjectSlug("cs408")).toBe("cs408");
  });

  it("从知识复习进入题集时完整保留路线、例题和排行筛选", () => {
    const returnTo = "/review-priority/knowledge/calc.m.ext?kind=fill&order=recent&route=free&example=degenerate";
    const href = kgKpPath("calc.m.ext", { subject: "math", src: "lilin880", returnTo });
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("src")).toBe("lilin880");
    expect(practiceReturnPath(params.get("returnTo"))).toBe(returnTo);
    expect(practiceReturnLabel(returnTo)).toBe("返回知识复习");
  });

  it("复习性价比来源保留考点和筛选，章节题集换方法标签也不丢来源", () => {
    const returnTo = "/review-priority?subject=math&book=calc&kind=big&order=frequency&kp=calc.m.ext";
    const href = kgBookDrillPath("calc", "calc-multi", {
      subject: "math", src: "lilin880", part: "hard", section: "5", facet: "ext_free", returnTo,
    });
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("facet")).toBe("ext_free");
    expect(practiceReturnPath(params.get("returnTo"))).toBe(returnTo);
    expect(practiceReturnLabel(returnTo)).toBe("返回复习性价比");
  });

  it("没有来源时沿用图谱层级，不把非站内学习路径当作返回位置", () => {
    for (const path of [null, undefined, "", "https://example.com", "//example.com", "/\\example.com", "/settings", "/kg/../../settings", "/review-priority\n"]) {
      expect(practiceReturnPath(path)).toBeNull();
    }
    expect(kgKpPath("calc.m.ext", { subject: "math", returnTo: "//example.com" })).toBe("/kg/math/kp/calc.m.ext");
    const chapter = "/kg/math/module/calc/calc-multi";
    expect(practiceReturnPath(chapter)).toBe(chapter);
    expect(practiceReturnLabel(chapter)).toBe("返回章节");
  });
});
