import { describe, expect, it } from "vitest";
import { computeRoi, kindPointsPerPaper, practiceMinutes } from "./reviewRoi";
import type { ReviewTopic } from "./math1Analysis";

function topic(over: Partial<ReviewTopic> & { kpId: string }): ReviewTopic {
  return {
    subject: "math", kind: "big", name: over.kpId, book: "calc",
    questions: [], years: [2024], recentYears: [2024], totalPoints: 10,
    pointShare: 0.05, recentPointShare: 0.06, cost: 2, facets: [], prerequisites: [],
    status: "unknown", confidence: null, confidenceSource: "unknown", sampleCount: 0,
    due: false, priority: 0.1,
    ...over,
  } as ReviewTopic;
}

describe("复习性价比 ROI 换算", () => {
  it("按最近一年该题型总分还原「每年占多少分」", () => {
    const items = [
      { year: 2020, kind: "big", points: 94 },
      { year: 2026, kind: "big", points: 70 },
      { year: 2026, kind: "big", points: 20 },
      { year: 2026, kind: "mcq", points: 50 },
    ];
    expect(kindPointsPerPaper(items, "big")).toBe(90);
    expect(kindPointsPerPaper(items, "mcq")).toBe(50);
    expect(kindPointsPerPaper(items, "fill")).toBe(0);
  });

  it("组内归一化到 0–100，并用缺口折算预计提分", () => {
    const topics = [
      topic({ kpId: "a", priority: 0.2, confidence: 0.2, status: "weak", recentPointShare: 0.1 }),
      topic({ kpId: "b", priority: 0.1, confidence: 0.5, status: "learning" }),
      topic({ kpId: "c", priority: 0.05, status: "stable", confidence: 0.9 }),
    ];
    const roi = computeRoi(topics, 70);
    expect(roi.get("a")!.score).toBe(100);
    expect(roi.get("b")!.score).toBe(50);
    // a：70 × 10% = 7 分/年，缺口 80% → 预计 5.6 分
    expect(roi.get("a")!.perPaper).toBeCloseTo(7, 5);
    expect(roi.get("a")!.estGain).toBeCloseTo(5.6, 5);
    expect(roi.get("a")!.tier).toBe("高");
    expect(roi.get("c")!.tier).toBe("低");
  });

  it("有记录的考点少于 3 个时只给档位，不给分数", () => {
    const topics = [
      topic({ kpId: "a", priority: 0.2, confidence: 0.3 }),
      topic({ kpId: "b", priority: 0.1 }),
      topic({ kpId: "c", priority: 0.05 }),
    ];
    const roi = computeRoi(topics, 70);
    expect(roi.get("a")!.score).toBeNull();
    expect(roi.get("a")!.tier).toBe("高");
  });

  it("成本档位映射到粗估耗时，未知题型给默认值", () => {
    expect(practiceMinutes("big")).toBe(12);
    expect(practiceMinutes("mcq")).toBe(4);
    expect(practiceMinutes("unknown-kind")).toBe(10);
  });
});
