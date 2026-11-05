import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_EXPIRED_MESSAGE,
  clearAuthExpired,
  isAuthExpired,
  markAuthExpired,
} from "@/lib/authSession";

describe("登录过期状态", () => {
  let storage: Map<string, string>;
  let events: string[];

  beforeEach(() => {
    storage = new Map();
    events = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    vi.stubGlobal(
      "CustomEvent",
      class {
        type: string;
        constructor(type: string) {
          this.type = type;
        }
      }
    );
    vi.stubGlobal("window", {
      dispatchEvent: (e: { type: string }) => {
        events.push(e.type);
        return true;
      },
    });
    clearAuthExpired();
    // 清掉重置本身产生的事件，只断言本用例的行为
    events.length = 0;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("标记后持久化，并发 401 只弹一次", () => {
    markAuthExpired();
    markAuthExpired();
    expect(isAuthExpired()).toBe(true);
    expect(storage.get("ew.auth.expired.v1")).toBe("1");
    expect(events).toEqual([AUTH_EXPIRED_EVENT]);
  });

  it("重新登录清除标记后恢复同步条件", () => {
    markAuthExpired();
    clearAuthExpired();
    expect(isAuthExpired()).toBe(false);
    expect(storage.has("ew.auth.expired.v1")).toBe(false);
    expect(events).toEqual([AUTH_EXPIRED_EVENT, AUTH_EXPIRED_EVENT]);
  });

  it("提示文案面向用户而不是原始错误", () => {
    expect(AUTH_EXPIRED_MESSAGE).toContain("重新登录");
    expect(AUTH_EXPIRED_MESSAGE).not.toContain("invalid token");
  });
});
