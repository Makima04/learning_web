import { describe, expect, it } from "vitest";
import { CS408_BIG_SLOTS } from "@/data/kg";
import {
  buildCs408BigBlueprint,
  templateItemFromSlot,
  validateCs408BigBlueprint,
} from "./blueprint408";
import type { UserKpState } from "./types";

describe("buildCs408BigBlueprint", () => {
  it("fixes 7 slots with book quotas and unique primary KPs", () => {
    const bp = buildCs408BigBlueprint({ random: () => 0.42, now: 1_700_000_000_000 });
    const errors = validateCs408BigBlueprint(bp);
    expect(errors).toEqual([]);
    expect(bp.slots).toHaveLength(7);
    expect(bp.kind).toBe("big_only");

    const byBook = { ds: 0, co: 0, os: 0, cn: 0 } as Record<string, number>;
    for (const s of bp.slots) byBook[s.bookId] = (byBook[s.bookId] || 0) + 1;
    expect(byBook).toEqual({ ds: 2, co: 2, os: 2, cn: 1 });

    const primaries = bp.slots.map((s) => s.primaryKpId);
    expect(new Set(primaries).size).toBe(primaries.length);
  });

  it("matches fixed slot ids", () => {
    const bp = buildCs408BigBlueprint({ random: () => 0.1, now: 99 });
    expect(bp.slots.map((s) => s.slotId).sort()).toEqual(
      CS408_BIG_SLOTS.map((s) => s.slotId).sort()
    );
  });

  it("prefers weak user KPs when scores dominate", () => {
    // 把 ds 里某个高 bigWeight 考点 confidence 打到极低
    const weakId = "ds.algo.design";
    const states: Record<string, UserKpState> = {
      [weakId]: {
        covered: true,
        status: "weak",
        confidence: 0.05,
        ease: 1.5,
        ivl: 0,
        due: 1,
        lapses: 3,
        updatedAt: 1,
      },
    };
    // 多次抽样，弱项应经常出现在 ds 槽
    let hit = 0;
    for (let i = 0; i < 30; i++) {
      const bp = buildCs408BigBlueprint({
        states,
        random: () => (i * 0.037) % 1,
        now: 1000 + i,
      });
      if (bp.slots.some((s) => s.bookId === "ds" && s.primaryKpId === weakId)) hit++;
    }
    expect(hit).toBeGreaterThan(0);
  });

  it("template items bind slot kp", () => {
    const bp = buildCs408BigBlueprint({ random: () => 0.5, now: 1 });
    const item = templateItemFromSlot(bp.slots[0], "paper-1");
    expect(item.primaryKpId).toBe(bp.slots[0].primaryKpId);
    expect(item.source).toBe("template");
  });
});
