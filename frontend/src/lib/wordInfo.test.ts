import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWordInfo, parseWordInfo } from "@/lib/wordInfo";
import type { WordInfoRow } from "@/types/words";

const ROW: WordInfoRow = [
  [["ob-", "相反"], ["ject", "投"], ["-ion", "名词后缀"]],
  "向相反方向投 → 反对",
  [["opposition", "反对"]],
  [["approval", "赞成"]],
  [["objective", "客观的"]],
  [["object", "反对；物体"]],
];

describe("wordInfo", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a compact row", () => {
    const info = parseWordInfo(ROW)!;
    expect(info.parts.map((p) => p[0]).join("")).toBe("ob-ject-ion");
    expect(info.note).toBe("向相反方向投 → 反对");
    expect(info.syn[0]).toEqual(["opposition", "反对"]);
    expect(info.rel[0]![0]).toBe("object");
  });

  it("returns null before data is loaded or for unknown words", () => {
    expect(getWordInfo("objection")).toBeNull();
    window.WORD_INFO = { objection: ROW };
    expect(getWordInfo("objection")?.ant[0]![0]).toBe("approval");
    expect(getWordInfo("nope")).toBeNull();
  });
});
