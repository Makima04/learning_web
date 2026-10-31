import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitImport } from "./importSnapshot";
import { setScopeUserId } from "@/lib/storageScope";

describe("旧进度事务迁移", () => {
  beforeEach(() => {
    const storage = new Map<string,string>();
    vi.stubGlobal("localStorage", {
      getItem:(key:string) => storage.get(key) ?? null,
      setItem:(key:string,value:string) => storage.set(key,value),
    });
    setScopeUserId(1);
  });

  it("网络失败和页面重试复用相同操作 ID", async () => {
    const data = {events:[{word_idx:1,event_type:"new" as const,quality:"good" as const,day_key:"2026-10-31",client_at:1}]};
    const transport = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ok:true});
    await expect(submitImport(data,transport)).rejects.toThrow("offline");
    await submitImport(data,transport);
    await submitImport(data,transport);
    expect(transport.mock.calls[0][0]).toEqual(transport.mock.calls[1][0]);
    expect(transport.mock.calls[1][0]).toEqual(transport.mock.calls[2][0]);
  });

  it("账号和内容变化不会误用另一份迁移凭据", async () => {
    const transport = vi.fn().mockResolvedValue({ok:true});
    await submitImport({cards:{}},transport);
    setScopeUserId(2);
    await submitImport({cards:{}},transport);
    expect(transport.mock.calls[0][0].operation_id).not.toBe(transport.mock.calls[1][0].operation_id);
    await submitImport({events:[]},transport);
    expect(transport.mock.calls[2][0].operation_id).not.toBe(transport.mock.calls[1][0].operation_id);
  });

  it("持久化失败不会发送未留凭据的迁移请求", async () => {
    vi.spyOn(localStorage,"setItem").mockImplementation(() => {throw new Error("quota");});
    const transport = vi.fn();
    await expect(submitImport({cards:{}},transport)).rejects.toThrow("quota");
    expect(transport).not.toHaveBeenCalled();
  });
});
