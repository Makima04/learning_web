import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  translateByText: vi.fn(),
  getTrans: vi.fn<() => string | undefined>(() => undefined),
  setTrans: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  translateByText: mocks.translateByText,
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/stores/trans", () => ({
  useTrans: {
    getState: () => ({
      getTrans: mocks.getTrans,
      setTrans: mocks.setTrans,
    }),
  },
}));

import { isChineseTranslation, translate } from "@/lib/llm";

const EN =
  "Women are particularly susceptible to developing depression and anxiety disorders in response to stress compared to men.";
const BAD_ZH =
  "That quote attributes the claim to Dr. Yehuda: women are more likely than men to develop depression and anxiety. What would you like me to do with it?";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTrans.mockReturnValue(undefined);
});

describe("isChineseTranslation", () => {
  it("接受正常译文与含专名的译文", () => {
    expect(isChineseTranslation("与男性相比，女性更容易患抑郁症。")).toBe(true);
    expect(isChineseTranslation("Dr. Yehuda 说：女性更容易抑郁。")).toBe(true);
  });

  it("拒绝英文分析、反问与空串", () => {
    expect(isChineseTranslation(BAD_ZH)).toBe(false);
    expect(
      isChineseTranslation("What would you like me to do with it—paraphrase, analyze, or cite?")
    ).toBe(false);
    expect(isChineseTranslation("")).toBe(false);
  });
});

describe("translate 缓存防污染", () => {
  it("服务端返回英文时报错且不写入本地缓存", async () => {
    mocks.translateByText.mockResolvedValueOnce({ zh: BAD_ZH, status: "ok" });
    await expect(translate(EN)).rejects.toThrow(/不是中文/);
    expect(mocks.setTrans).not.toHaveBeenCalled();
  });

  it("本地已有英文缓存时忽略并重新请求", async () => {
    mocks.getTrans.mockReturnValueOnce(BAD_ZH);
    mocks.translateByText.mockResolvedValueOnce({
      zh: "与男性相比，女性在压力下更容易抑郁和焦虑。",
      status: "ok",
    });
    await expect(translate(EN)).resolves.toContain("女性");
    expect(mocks.translateByText).toHaveBeenCalledOnce();
    expect(mocks.setTrans).toHaveBeenCalled();
  });
});
