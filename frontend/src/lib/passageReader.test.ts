import { describe, expect, it } from "vitest";
import {
  parsePassageReaderParams,
  passageReaderPath,
  passageReaderMatches,
} from "./passageReader";
import type { PassageReader } from "@/stores/study";

describe("passageReaderPath / parse", () => {
  it("round-trips year variant label", () => {
    const path = passageReaderPath({
      variant: "en1",
      year: 2006,
      label: "Text 2",
    });
    expect(path).toBe("/reader/en1/2006/Text%202");
    const key = parsePassageReaderParams({
      variant: "en1",
      year: "2006",
      label: "Text%202",
    });
    expect(key).toEqual({ variant: "en1", year: 2006, label: "Text 2" });
  });

  it("matches store reader to route key", () => {
    const reader = {
      title: "2006 年 Text 2",
      body: "x",
      words: [],
      year: 2006,
      variant: "en1",
      label: "Text 2",
    } as PassageReader;
    expect(
      passageReaderMatches(reader, { variant: "en1", year: 2006, label: "Text 2" })
    ).toBe(true);
    expect(
      passageReaderMatches(reader, { variant: "en2", year: 2006, label: "Text 2" })
    ).toBe(false);
  });
});
