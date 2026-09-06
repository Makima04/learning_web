import { describe, expect, it } from "vitest";
import { MAX_ITEM_NOTE, normalizeItemNote, upsertItemNotes } from "./itemNote";

describe("upsertItemNotes", () => {
  it("writes trimmed note", () => {
    expect(upsertItemNotes({}, "q1", "  忘了先判单调  ")).toEqual({
      q1: "忘了先判单调",
    });
  });

  it("returns same object when unchanged", () => {
    const notes = { q1: "卡在递推" };
    expect(upsertItemNotes(notes, "q1", "卡在递推")).toBe(notes);
  });

  it("deletes empty note", () => {
    expect(upsertItemNotes({ q1: "旧", q2: "留" }, "q1", "   ")).toEqual({ q2: "留" });
  });

  it("no-op deleting missing key", () => {
    const notes = { q2: "留" };
    expect(upsertItemNotes(notes, "q1", "")).toBe(notes);
  });

  it("caps length", () => {
    const long = "啊".repeat(MAX_ITEM_NOTE + 40);
    const next = upsertItemNotes({}, "q1", long);
    expect(next.q1.length).toBe(MAX_ITEM_NOTE);
    expect(normalizeItemNote(long).length).toBe(MAX_ITEM_NOTE);
  });
});
