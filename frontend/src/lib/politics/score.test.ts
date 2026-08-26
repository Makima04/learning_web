import { describe, expect, it } from "vitest";
import { POLITICS_QUESTIONS } from "./questions";
import { materialLinked, normalizePoliticsText, pointHit, scoreChecked, scorePart } from "./score";
import { SUBJECT_NO } from "./types";

describe("normalizePoliticsText", () => {
  it("strips whitespace and unifies punctuation", () => {
    expect(normalizePoliticsText("实践 决定 认识")).toBe("实践决定认识");
    expect(normalizePoliticsText("「绿水青山」就是金山银山。")).toContain("绿水青山就是金山银山");
  });
});

describe("pointHit / scorePart", () => {
  const q = POLITICS_QUESTIONS.find((x) => x.id === "2024-34");
  const part1 = q!.parts[0]!;

  it("hits when a keyword is present", () => {
    const ans = "实践决定认识。调查属于感性认识，必须上升为理性认识。材料中只调查不研究就得不出科学观点。";
    const r = scorePart(ans, part1);
    expect(r.hitIds).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));
    expect(r.missIds).toEqual([]);
    expect(r.score).toBe(r.maxScore);
    expect(r.missingMaterial).toBe(false);
  });

  it("misses principle-only dumps that skip required terms", () => {
    const ans = "我们要重视调查研究，深入基层了解情况。";
    const r = scorePart(ans, part1);
    expect(r.hitIds).toHaveLength(0);
    expect(r.score).toBe(0);
  });

  it("flags answers that never quote the material", () => {
    const ans = "实践决定认识，要从感性认识飞跃到理性认识，完成两次飞跃。";
    const r = scorePart(ans, part1);
    expect(r.hitIds.length).toBeGreaterThan(0);
    expect(r.missingMaterial).toBe(true);
  });

  it("pointHit is punctuation-insensitive", () => {
    const point = part1.scorePoints[0]!;
    expect(pointHit("所谓实践，决定认识。", point)).toBe(true);
  });

  it("scoreChecked respects user overrides", () => {
    expect(scoreChecked(["p1", "p3"], part1.scorePoints)).toBe(3);
  });
});

describe("materialLinked", () => {
  it("returns true when any hint appears", () => {
    expect(materialLinked("解剖麻雀式调研", ["解剖麻雀", "一类问题"])).toBe(true);
  });
  it("returns true if no hints configured", () => {
    expect(materialLinked("", [])).toBe(true);
  });
});

describe("question bank integrity", () => {
  it("covers 2024–2026 × 五道分析题，且 id / 题号一致", () => {
    expect(POLITICS_QUESTIONS).toHaveLength(15);
    const ids = POLITICS_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(15);
    for (const q of POLITICS_QUESTIONS) {
      expect(q.no).toBe(SUBJECT_NO[q.subject]);
      expect(q.id).toBe(`${q.year}-${q.no}`);
      expect(q.parts).toHaveLength(2);
      const sum = q.parts.reduce((s, p) => s + p.points, 0);
      expect(sum).toBe(10);
      for (const p of q.parts) {
        expect(p.scorePoints.length).toBeGreaterThanOrEqual(2);
        const kwOk = p.scorePoints.every((sp) => sp.keywords.length > 0 && sp.score > 0);
        expect(kwOk).toBe(true);
        const pointIds = p.scorePoints.map((sp) => sp.id);
        expect(new Set(pointIds).size).toBe(pointIds.length);
        expect(p.skeleton.length).toBeGreaterThan(10);
        expect(p.model.length).toBeGreaterThan(20);
      }
    }
  });
});
