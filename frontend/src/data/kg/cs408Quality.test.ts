// 408 题库版本/质量元数据一致性：防止回忆版标记、原页图、缓存版本漏同步。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DS_BIG_CHAPTERS, DS_BIG_SCENE_GUIDES, dsBigWangdaoMeta } from "@/data/kg/cs408DsBigTaxonomy";
import { CS408_EXAM_BIG_IMAGES } from "@/data/kg/cs408ExamBigImages";
import { buildCs408HandoutQuestions, buildCs408KindQuestions, isWangdaoBigExamDuplicate } from "@/lib/kg/cs408Handouts";
import { CS408_DATA_VER, examItemId, type ExamPaper } from "@/lib/kg/exams408";
import type { WangdaoItem } from "@/lib/kg/wangdao408";

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
  it("手稿收录所有年份和非真题重复的王道题，大题自动去除王道中的历年真题", () => {
    const papers = index.years.map(year => JSON.parse(readFileSync(`${pub}${year}.json`, "utf-8")) as ExamPaper);
    const { items: wangdao } = JSON.parse(readFileSync(`${pub}wangdao2027/index.json`, "utf-8")) as { items: WangdaoItem[] };
    const scenes = buildCs408HandoutQuestions(papers, wangdao);
    const ids = new Set([...scenes.values()].flatMap(questions => questions.map(q => q.id)));
    const expected = [
      ...papers.flatMap(paper => paper.items.map(item => examItemId(paper.year, item.n))),
      ...wangdao.filter(item => item.kp_ids.length > 0 && !isWangdaoBigExamDuplicate(item)).map(item => item.id),
    ];
    expect([...ids].sort()).toEqual(expected.sort());
    expect(wangdao.filter(isWangdaoBigExamDuplicate)).toHaveLength(117);
    expect(scenes.get("ds.algo.dp")?.[0]?.id).toBe("cs408-2025-q41");
    expect(scenes.get("ds.algo.design")?.filter(q => q.id === "cs408-2025-q41")).toHaveLength(1);
  });

  it("数据结构大题按算法题/应用题全量重组，王道题去重真题后按价值分层排序", () => {
    const papers = index.years.map(year => JSON.parse(readFileSync(`${pub}${year}.json`, "utf-8")) as ExamPaper);
    const { items: wangdao } = JSON.parse(readFileSync(`${pub}wangdao2027/index.json`, "utf-8")) as { items: WangdaoItem[] };
    const allScenes = buildCs408HandoutQuestions(papers, wangdao);
    const bigScenes = buildCs408KindQuestions(allScenes, "big");

    const dsSceneIds = DS_BIG_CHAPTERS.flatMap(ch => ch.kps.map(kp => kp.id));
    for (const sceneId of dsSceneIds) {
      expect(DS_BIG_SCENE_GUIDES[sceneId], `${sceneId} 缺少核心讲解`).toBeDefined();
    }

    const mappedIds: string[] = [];
    const tierOrder = { high: 0, medium: 1, low: 2 } as const;
    for (const sceneId of dsSceneIds) {
      const list = bigScenes.get(sceneId) ?? [];
      expect(list.length, `${sceneId} 不应为空`).toBeGreaterThan(0);
      mappedIds.push(...list.map(q => q.id));
      const wdTiers = list
        .filter(q => q.source === "wangdao")
        .map(q => tierOrder[dsBigWangdaoMeta(q.id)?.tier ?? "low"]);
      expect(wdTiers, `${sceneId} 王道题未按价值从高到低排序`).toEqual([...wdTiers].sort((a, b) => a - b));
    }

    const expectedDsBig = [
      ...papers.flatMap(p => p.items.filter(i => i.book === "ds" && i.kind === "big").map(i => examItemId(p.year, i.n))),
      ...wangdao.filter(i => i.book === "ds" && i.kind === "big" && i.kp_ids.length > 0 && !isWangdaoBigExamDuplicate(i)).map(i => i.id),
    ];
    expect(mappedIds.length).toBe(new Set(mappedIds).size);
    expect([...mappedIds].sort()).toEqual(expectedDsBig.sort());
  });

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

  it("2026 校订版（pgcode.cn）已核对答案键、按重构卷纳入校准", () => {
    const p = index.papers.find((x) => x.year === 2026);
    expect(p?.edition).toBe("rebuild");
    expect(p?.excluded_from_stats).toBe(false);
    expect(p?.verification?.status).toBe("imported_from_pgcode");
    expect(p?.verification?.answer_key_match).toBe("40/40");
    expect(p?.verification?.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("校准口径：2009–2011 排除，2012–2026 纳入", () => {
    for (const p of index.papers) {
      const shouldExclude = p.year <= 2011;
      expect(p.excluded_from_stats, `${p.year} 校准口径不符`).toBe(shouldExclude);
    }
  });

  it("2026 题干附图已入库且路径可解析", () => {
    const paper = JSON.parse(readFileSync(`${pub}2026.json`, "utf-8")) as {
      items: Array<{ n: number; stem_images?: string[] }>;
    };
    const withImg = paper.items.filter((i) => i.stem_images?.length);
    expect(withImg.map((i) => i.n)).toEqual([26, 36, 37, 43, 44, 46, 47]);
    for (const it of withImg) {
      for (const src of it.stem_images ?? []) {
        expect(src.startsWith("/cs408/pic/2026/"), src).toBe(true);
        expect(existsSync(`${pub}${src.slice("/cs408/".length)}`), src).toBe(true);
      }
    }
  });

  it("2009–2025 全部 119 道真题大题都有原页高清题图且文件存在", () => {
    const papers = index.years
      .filter((y) => y <= 2025)
      .map((year) => JSON.parse(readFileSync(`${pub}${year}.json`, "utf-8")) as ExamPaper);
    const bigIds = papers.flatMap((p) => p.items.filter((i) => i.kind === "big").map((i) => examItemId(p.year, i.n)));
    expect(bigIds).toHaveLength(119);
    for (const id of bigIds) {
      const src = CS408_EXAM_BIG_IMAGES[id];
      expect(src, `${id} 缺少原页题图`).toBeDefined();
      expect(existsSync(`${pub}${src.slice("/cs408/".length)}`), `${id} -> ${src} 不存在`).toBe(true);
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
