import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import {
  canExplain,
  canRevealAnswer,
  clearExplainCache,
  explainPayload,
  explainQuestion,
  peekExplain,
} from "@/lib/kg/explain";

vi.mock("@/lib/api", () => ({
  kgExplain: vi.fn(),
}));

import * as api from "@/lib/api";

const big: WangdaoItem = {
  id: "os-big-4.2-2",
  book: "os",
  kind: "big",
  section: "4.2",
  qno: 2,
  stem: "FCB 分解法……",
  kp_ids: ["os.file.dir"],
};

describe("canExplain", () => {
  it("只给有题干的大题", () => {
    expect(canExplain(big)).toBe(true);
    expect(canExplain({ ...big, kind: "mcq" })).toBe(false);
    expect(canExplain({ ...big, stem: "  " })).toBe(false);
    expect(canExplain({ ...big, stem: undefined })).toBe(false);
  });
});

describe("canRevealAnswer", () => {
  it("大题、有选项答案的选择都能揭", () => {
    expect(canRevealAnswer(big)).toBe(true);
    expect(canRevealAnswer({ ...big, kind: "mcq", answer: "C" })).toBe(true);
    expect(canRevealAnswer({ ...big, kind: "mcq", stem: "x", answer: undefined })).toBe(false);
  });
});

describe("explainQuestion", () => {
  beforeEach(() => {
    clearExplainCache();
    vi.mocked(api.kgExplain).mockReset();
  });

  it("payload 带题号与考点名", () => {
    const p = explainPayload(big);
    expect(p.item_id).toBe("os-big-4.2-2");
    expect(p.kind).toBe("big");
    expect(p.kp_name).toContain("目录");
  });

  it("成功后写入会话缓存，第二次不打 API", async () => {
    vi.mocked(api.kgExplain).mockResolvedValue({
      item_id: big.id,
      answer: "(1) 16.5；4",
      solution: "每块 8 个 FCB",
      status: "ok",
      cached: false,
    });
    const a = await explainQuestion(big);
    const b = await explainQuestion(big);
    expect(a.answer).toContain("16.5");
    expect(b).toBe(a);
    expect(api.kgExplain).toHaveBeenCalledTimes(1);
    expect(peekExplain(big.id)?.status).toBe("ok");
  });

  it("失败不缓存", async () => {
    vi.mocked(api.kgExplain).mockResolvedValue({
      item_id: big.id,
      answer: "",
      solution: "",
      status: "error",
      detail: "parse failed",
    });
    await explainQuestion(big);
    expect(peekExplain(big.id)).toBeNull();
  });
});
