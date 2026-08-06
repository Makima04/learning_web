import { describe, expect, it } from "vitest";
import {
  normalizeVariant,
  papersListPath,
  papersReciteListPath,
  papersRecitePathFromPaperIdx,
  papersReciteYearPath,
  papersYearPath,
} from "./papersNav";

describe("papersNav paths", () => {
  it("normalizes variant", () => {
    expect(normalizeVariant("en2")).toBe("en2");
    expect(normalizeVariant("en1")).toBe("en1");
    expect(normalizeVariant("x")).toBe("en1");
  });

  it("builds list and year paths", () => {
    expect(papersListPath("en1")).toBe("/papers/en1");
    expect(papersYearPath("en2", 2006)).toBe("/papers/en2/2006");
    expect(papersReciteListPath("en1")).toBe("/papers-recite/en1");
    expect(papersReciteYearPath("en1", 2010)).toBe("/papers-recite/en1/2010");
  });

  it("papersRecitePathFromPaperIdx falls back without papers data", () => {
    expect(papersRecitePathFromPaperIdx(null)).toBe("/papers-recite/en1");
    expect(papersRecitePathFromPaperIdx(-1)).toBe("/papers-recite/en1");
    expect(papersRecitePathFromPaperIdx(99999)).toBe("/papers-recite/en1");
  });
});
