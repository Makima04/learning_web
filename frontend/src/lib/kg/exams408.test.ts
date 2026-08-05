import { describe, expect, it } from "vitest";
import { CS408_BOOKS, CS408_KP_STATS, findKp } from "@/data/kg";
import { examItemId, primaryKpId, secondaryKpIds } from "./exams408";

describe("exams408 helpers", () => {
  it("builds stable item ids", () => {
    expect(examItemId(2024, 41)).toBe("cs408-2024-q41");
  });

  it("picks primary and secondary kps", () => {
    const item = {
      n: 1,
      kind: "mcq",
      book: "ds",
      stem: "x",
      kps: [
        { id: "ds.algo.design", role: "primary" as const },
        { id: "ds.algo.recur", role: "secondary" as const },
      ],
    };
    expect(primaryKpId(item)).toBe("ds.algo.design");
    expect(secondaryKpIds(item)).toEqual(["ds.algo.recur"]);
  });
});

describe("cs408 exam stats calibration", () => {
  it("applies LLM exam stats onto high-freq KPs", () => {
    const st = CS408_KP_STATS["os.proc.sync"];
    expect(st).toBeTruthy();
    expect(st.asBigPrimary).toBeGreaterThanOrEqual(5);
    const found = findKp("os.proc.sync");
    expect(found?.kp.freq).toBe(st.freq);
    expect(found?.kp.bigWeight).toBe(st.bigWeight);
  });

  it("keeps all books calibrated in CS408_BOOKS export", () => {
    const all = CS408_BOOKS.flatMap((b) => b.modules.flatMap((m) => m.kps));
    const calibrated = all.filter((kp) => CS408_KP_STATS[kp.id]);
    expect(calibrated.length).toBeGreaterThan(50);
    // 大题常客应抬高大题权
    const design = all.find((k) => k.id === "ds.algo.design");
    expect(design?.bigWeight).toBeGreaterThanOrEqual(0.8);
  });
});
