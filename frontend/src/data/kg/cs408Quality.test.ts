// 408 题库版本/质量元数据一致性：防止回忆版标记、原页图、缓存版本漏同步。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CS408_DATA_VER } from "@/lib/kg/exams408";

const pub = fileURLToPath(new URL("../../../public/cs408/", import.meta.url));
const index = JSON.parse(readFileSync(`${pub}index.json`, "utf-8")) as {
  data_ver: string;
  years: number[];
  papers: Array<{
    year: number;
    total: number;
    edition: string;
    quality: string;
    excluded_from_stats: boolean;
    answer_keys: number;
    explanations: number;
    page_images: number;
    verification?: { answer_key_match?: string; status?: string; checked_at?: string };
  }>;
};
const images = new Set(readdirSync(`${pub}ans`).filter((f) => f.endsWith(".jpg")));

describe("408 题库版本与数据质量", () => {
  it("索引版本与前端缓存版本一致，18 套卷都有结构化元数据", () => {
    expect(index.data_ver).toBe(CS408_DATA_VER);
    expect(index.papers).toHaveLength(18);
    expect(index.papers[0].year).toBe(2009);
    expect(index.papers.at(-1)?.year).toBe(2026);
    for (const p of index.papers) {
      expect(["recall", "compilation", "rebuild"], `${p.year} 版本缺失`).toContain(p.edition);
      expect(["ok", "needs_review"], `${p.year} 质量缺失`).toContain(p.quality);
      expect(p.answer_keys, `${p.year} 答案键不满 40`).toBe(40);
      expect(p.explanations, `${p.year} 解析数越界`).toBeLessThanOrEqual(p.total);
      expect(p.explanations, `${p.year} 无解析`).toBeGreaterThan(0);
      expect(readFileSync(`${pub}${p.year}.json`, "utf-8").length).toBeGreaterThan(100);
    }
  });

  it("2026 回忆版已核对答案键、显式标记且不参与校准", () => {
    const p = index.papers.find((x) => x.year === 2026);
    expect(p?.edition).toBe("recall");
    expect(p?.excluded_from_stats).toBe(true);
    expect(p?.verification?.status).toBe("verified_against_source");
    expect(p?.verification?.answer_key_match).toBe("40/40");
    expect(p?.verification?.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("校准口径：2009–2011 与 2026 排除，2012–2025 纳入", () => {
    for (const p of index.papers) {
      const shouldExclude = p.year <= 2011 || p.year === 2026;
      expect(p.excluded_from_stats, `${p.year} 校准口径不符`).toBe(shouldExclude);
    }
  });

  it("扫描件的原版答案页图确实存在", () => {
    for (const y of [2019, 2021, 2024, 2025]) {
      const p = index.papers.find((x) => x.year === y);
      expect(p?.quality).toBe("needs_review");
      expect(p?.page_images ?? 0, `${y} 缺少页数`).toBeGreaterThan(0);
      for (let i = 1; i <= (p?.page_images ?? 0); i++) {
        expect(existsSync(`${pub}ans/${y}-p${i}.jpg`), `${y}-p${i}.jpg 不存在`).toBe(true);
      }
    }
    expect(images.size).toBeGreaterThanOrEqual(34);
  });
});
