import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentScopeUserId,
  migrateUnscopedIfNeeded,
  scopedKey,
  setScopeUserId,
} from "@/lib/storageScope";

describe("storageScope", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    setScopeUserId(null);
  });

  it("uses base key for guest and scoped key for user", () => {
    expect(scopedKey("ew.cards.v1")).toBe("ew.cards.v1");
    setScopeUserId(42);
    expect(scopedKey("ew.cards.v1")).toBe("ew.cards.v1.u42");
    expect(currentScopeUserId()).toBe(42);
  });

  it("migrates unscoped data into user namespace once", () => {
    localStorage.setItem("ew.cards.v1", '{"1":{}}');
    setScopeUserId(7);
    migrateUnscopedIfNeeded("ew.cards.v1");
    expect(localStorage.getItem("ew.cards.v1.u7")).toBe('{"1":{}}');
    // unscoped 保留
    expect(localStorage.getItem("ew.cards.v1")).toBe('{"1":{}}');
    // 不覆盖已有 scoped
    localStorage.setItem("ew.cards.v1.u7", '{"2":{}}');
    localStorage.setItem("ew.cards.v1", '{"3":{}}');
    migrateUnscopedIfNeeded("ew.cards.v1");
    expect(localStorage.getItem("ew.cards.v1.u7")).toBe('{"2":{}}');
  });
});
