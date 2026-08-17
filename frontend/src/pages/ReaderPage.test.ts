import { describe, expect, it } from "vitest";
import {
  abandonTransReq,
  invalidateTransReq,
  isCurrentTransReq,
  readerTransAction,
  startTransReq,
  type TransReqGate,
} from "./ReaderPage";

describe("译句请求世代", () => {
  it("句1 请求中切回已译句0：cleanup 复位旗，stale finally 不得再改", () => {
    const gate: TransReqGate = { latest: 0 };
    let loading = false;
    let translating = false;
    const transMap: Record<number, string> = { 0: "句0译文" };
    const transErr: Record<number, string> = {};

    // 句1 自动翻译发起
    const req1 = startTransReq(gate);
    translating = true;
    loading = true;

    // 点回已译句0 → effect cleanup 作废 req1 并立刻清旗
    if (invalidateTransReq(gate, req1)) {
      translating = false;
      loading = false;
    }
    // 早退：已有译文，abandon 再清旗（幂等），不发新请求
    if (transMap[0] != null) {
      abandonTransReq(gate);
      translating = false;
      loading = false;
    }

    expect(isCurrentTransReq(gate, req1)).toBe(false);
    expect(loading).toBe(false);
    expect(translating).toBe(false);

    // 句1 慢回包：finally / then 因 stale 直接 return
    if (isCurrentTransReq(gate, req1)) {
      transMap[1] = "不该写入";
      loading = false;
      translating = false;
    }
    expect(transMap[1]).toBeUndefined();
    expect(loading).toBe(false);
    expect(translating).toBe(false);

    // 空格 / 译本句：translating 已清，可再点
    expect(translating).toBe(false);
    expect(transErr[0]).toBeUndefined();
  });

  it("慢请求不得清掉新句 loading、不得写错句", () => {
    const gate: TransReqGate = { latest: 0 };
    const transMap: Record<number, string> = {};
    let loading = false;

    const req1 = startTransReq(gate);
    loading = true;

    invalidateTransReq(gate, req1);
    const req2 = startTransReq(gate);
    loading = true;

    if (isCurrentTransReq(gate, req1)) {
      transMap[1] = "句1";
      loading = false;
    }
    expect(transMap[1]).toBeUndefined();
    expect(loading).toBe(true);
    expect(isCurrentTransReq(gate, req2)).toBe(true);

    if (isCurrentTransReq(gate, req2)) {
      transMap[2] = "句2";
      loading = false;
    }
    expect(transMap[2]).toBe("句2");
    expect(loading).toBe(false);
  });
});

describe("译句按钮 / 失败不进 transMap", () => {
  it("失败不算已译：按钮为重试，空格应再请求", () => {
    expect(readerTransAction(false, false, true)).toBe("retry");
    expect(readerTransAction(false, true, false)).toBe("next");
    expect(readerTransAction(true, false, true)).toBe("busy");
    expect(readerTransAction(false, false, false)).toBe("translate");
  });

  it("失败只写 transErr，成功再清 error 并写入 transMap", () => {
    const transMap: Record<number, string> = {};
    let transErr: Record<number, string> = {};

    // 失败：不进 transMap
    transErr = { ...transErr, 1: "网关 503" };
    expect(transMap[1]).toBeUndefined();
    expect(readerTransAction(false, transMap[1] != null, transErr[1] != null)).toBe(
      "retry"
    );

    // 成功：写入译文并清该句 error
    transMap[1] = "正确译文";
    delete transErr[1];
    expect(transErr[1]).toBeUndefined();
    expect(readerTransAction(false, transMap[1] != null, transErr[1] != null)).toBe(
      "next"
    );
  });
});
