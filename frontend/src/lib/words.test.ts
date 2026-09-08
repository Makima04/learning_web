import { describe, expect, it } from "vitest";
import type { WordEntry } from "@/types/words";
import { getPhonetic } from "@/lib/words";

describe("getPhonetic", () => {
  it("reads the optional 4th field", () => {
    const entry: WordEntry = [1, "panorama", [["n.", "全景"]], "/ˌpænɚˈæmə/"];
    expect(getPhonetic(entry)).toBe("/ˌpænɚˈæmə/");
  });

  it("returns empty when missing", () => {
    const entry: WordEntry = [99999, "zzzz", [["n.", "x"]]];
    expect(getPhonetic(entry)).toBe("");
  });
});
