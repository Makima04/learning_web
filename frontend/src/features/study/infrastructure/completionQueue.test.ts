import { beforeEach, describe, expect, it, vi } from "vitest";
const apiMocks = vi.hoisted(() => ({ isLoggedIn: () => true, postStudyCompletions: vi.fn() }));
vi.mock("@/lib/api", () => apiMocks);
import type { StudyCompletionDTO } from "@/lib/api";
import { getScopeEpoch, setScopeUserId } from "@/lib/storageScope";
import { clearPendingCompletions, flushCompletions, hasPendingCompletions, pendingCompletionWordIds, saveCompletion } from "./completionQueue";

function command(id: string, word = 1): StudyCompletionDTO {
  return { operation_id:id, word_idx:word, card:{state:"review",due:1,ivl:1,ease:2.5,reps:1,lapses:0},
    event_type:"new",day_key:"2026-10-31",client_at:word };
}

describe("独立学习命令队列", () => {
  beforeEach(() => {
    const storage = new Map<string,string>();
    vi.stubGlobal("localStorage", {
      get length() { return storage.size; }, key: (i:number) => Array.from(storage.keys())[i] ?? null,
      getItem: (key:string) => storage.get(key) ?? null,
      setItem: (key:string,value:string) => storage.set(key,value), removeItem: (key:string) => storage.delete(key),
    });
    setScopeUserId(1);
    apiMocks.postStudyCompletions.mockReset().mockResolvedValue({ok:true});
  });

  it("独立写入不会覆盖其他命令，清空仅影响当前账号", () => {
    saveCompletion(command("one",1)); saveCompletion(command("two",2));
    expect(pendingCompletionWordIds()).toEqual(new Set([1,2]));
    setScopeUserId(null);
    expect(hasPendingCompletions()).toBe(false);
    saveCompletion(command("guest",3));
    setScopeUserId(2);
    expect(hasPendingCompletions()).toBe(false);
    setScopeUserId(1); clearPendingCompletions();
    expect(hasPendingCompletions()).toBe(false);
    setScopeUserId(null);
    expect(pendingCompletionWordIds()).toEqual(new Set([3]));
  });

  it("网络失败保留原始操作 ID，重试成功才确认删除", async () => {
    saveCompletion(command("one"));
    apiMocks.postStudyCompletions.mockRejectedValueOnce(new Error("offline"));
    expect(await flushCompletions(getScopeEpoch())).toBe("offline");
    expect(hasPendingCompletions()).toBe(true);
    expect(await flushCompletions(getScopeEpoch())).toBeNull();
    expect(apiMocks.postStudyCompletions.mock.calls[0]).toEqual(apiMocks.postStudyCompletions.mock.calls[1]);
    expect(hasPendingCompletions()).toBe(false);
  });

  it("没有明确的成功确认时保留命令", async () => {
    saveCompletion(command("one"));
    apiMocks.postStudyCompletions.mockResolvedValueOnce(null);
    expect(await flushCompletions(getScopeEpoch())).toMatch(/未确认/);
    expect(hasPendingCompletions()).toBe(true);
  });

  it("每批最多 200 条，换账号立即停止后续批次并保留队列", async () => {
    for (let i=1;i<=201;i++) saveCompletion(command(`op-${i}`,i));
    let release!: () => void;
    apiMocks.postStudyCompletions.mockImplementationOnce(() => new Promise<{ok:boolean}>((resolve) => { release=() => resolve({ok:true}); }));
    const flushing=flushCompletions(getScopeEpoch());
    setScopeUserId(2); release(); await flushing;
    expect(apiMocks.postStudyCompletions).toHaveBeenCalledOnce();
    expect(apiMocks.postStudyCompletions.mock.calls[0][0]).toHaveLength(200);
    setScopeUserId(1);
    expect(pendingCompletionWordIds().size).toBe(201);
  });

  it("上传期间新增的另一条命令不会被确认删除", async () => {
    saveCompletion(command("one",1));
    let release!: () => void;
    apiMocks.postStudyCompletions.mockImplementationOnce(() => new Promise<{ok:boolean}>((resolve) => { release=() => resolve({ok:true}); }));
    const flushing=flushCompletions(getScopeEpoch());
    saveCompletion(command("two",2)); release(); await flushing;
    expect(pendingCompletionWordIds()).toEqual(new Set([2]));
  });

  it("同一操作 ID 不能被重用成其他内容", () => {
    saveCompletion(command("one",1));
    expect(() => saveCompletion(command("one",2))).toThrow();
    expect(pendingCompletionWordIds()).toEqual(new Set([1]));
  });
});
