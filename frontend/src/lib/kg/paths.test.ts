import { describe, expect, it } from "vitest";
import { kgKpPath, kgMapPath, kgModulePath, parseKgSubject, kgSubjectSlug } from "./paths";

describe("kg paths", () => {
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
  });

  it("parses slugs", () => {
    expect(parseKgSubject("math")).toBe("math");
    expect(parseKgSubject("cs408")).toBe("cs408");
    expect(parseKgSubject("module")).toBeNull();
    expect(kgSubjectSlug("math")).toBe("math");
    expect(kgSubjectSlug("cs408")).toBe("cs408");
  });
});
