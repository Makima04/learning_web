// 大题分类数据一致性：防止题库扩年份后漏归类、知识点关联失效。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CS408_BOOKS } from "@/data/kg";

interface GuideQuestion {
  year: number;
  n: number;
  book: string;
  topic: string;
}

interface GuideType {
  id: string;
  family: string;
  template: string[];
  ideas: string[];
  pitfalls: string[];
  kpIds: string[];
  count: number;
  questions: GuideQuestion[];
}

interface BigGuide {
  total: number;
  type_count: number;
  years: number[];
  types: GuideType[];
  stats: { by_family: Record<string, number> };
}

const file = fileURLToPath(new URL("../../../public/cs408/big-guide.json", import.meta.url));
const guide = JSON.parse(readFileSync(file, "utf-8")) as BigGuide;
const kpIds = new Set(CS408_BOOKS.flatMap((b) => b.modules.flatMap((m) => m.kps.map((k) => k.id))));

describe("408 大题分类与答题模板", () => {
  it("2009–2026 全部 126 道大题都有归类", () => {
    expect(guide.total).toBe(126);
    expect(guide.type_count).toBe(18);
    expect(guide.years).toHaveLength(18);
    expect(guide.years[0]).toBe(2009);
    expect(guide.years.at(-1)).toBe(2026);

    const keys = new Set<string>();
    for (const t of guide.types) {
      for (const q of t.questions) {
        expect(q.year, "年份越界").toBeGreaterThanOrEqual(2009);
        expect(q.year, "年份越界").toBeLessThanOrEqual(2026);
        expect(q.n, "不是大题题号").toBeGreaterThanOrEqual(41);
        expect(q.n, "不是大题题号").toBeLessThanOrEqual(47);
        expect(q.book, `${q.year}-${q.n} 分科不一致`).toBe(t.family);
        expect(q.topic.trim().length, `${q.year}-${q.n} 缺切入要点`).toBeGreaterThan(4);
        keys.add(`${q.year}-${q.n}`);
      }
    }
    expect(keys.size).toBe(126);
  });

  it("每类的题数、模板与知识点关联都完整", () => {
    const sum = Object.values(guide.stats.by_family).reduce((a, b) => a + b, 0);
    expect(sum).toBe(126);
    for (const t of guide.types) {
      expect(t.questions.length, `${t.id} count 不符`).toBe(t.count);
      expect(t.template.length, `${t.id} 缺答题模板`).toBeGreaterThanOrEqual(4);
      expect(t.ideas.length, `${t.id} 缺思路`).toBeGreaterThanOrEqual(3);
      expect(t.pitfalls.length, `${t.id} 缺易错点`).toBeGreaterThanOrEqual(2);
      for (const kp of t.kpIds) {
        expect(kpIds.has(kp), `${t.id} 关联了不存在的知识点 ${kp}`).toBe(true);
      }
    }
  });
});
