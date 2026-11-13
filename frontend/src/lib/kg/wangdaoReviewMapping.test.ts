import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findKp } from "@/data/kg";
import type { WangdaoItem } from "./wangdao408";

const root = new URL("../../../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const catalog: WangdaoItem[] = read("frontend/public/cs408/wangdao2027.json");
const overlay = read("scripts/wangdao_item_overlay.json").items as Record<string, {
  kp_ids: string[]; facets: string[]; primaryFacet: string | null; stem_sha256: string; diagnostic_eligible?: boolean;
}>;

describe("王道大题逐章核对与前端关联", () => {
  it("430道四科大题的原题图完整入库，目录、分片与原图版本页码一致", () => {
    const manifest = read("scripts/wangdao_question_images.json").items as Record<string, {
      img: string; pdf_page: number; book_ans_page: number; sha256: string;
    }>;
    const questions = catalog.filter((q) => q.kind === "big");
    const index: { items: WangdaoItem[] } = read("frontend/public/cs408/wangdao2027/index.json");
    const shard: WangdaoItem[] = ["ds", "co", "os", "cn"].flatMap((book) => read(`frontend/public/cs408/wangdao2027/${book}.json`));
    expect(questions).toHaveLength(430);
    expect(Object.fromEntries(["ds", "co", "os", "cn"].map((book) => [book, questions.filter((q) => q.book === book).length])))
      .toEqual({ ds: 164, co: 77, os: 110, cn: 79 });
    expect(Object.keys(manifest).sort()).toEqual(questions.map((q) => q.id).sort());
    for (const q of questions) {
      const image = manifest[q.id];
      expect(q.img, q.id).toBe(image.img);
      expect(q.pdf_page, q.id).toBe(image.pdf_page);
      expect(q.book_ans_page, q.id).toBe(image.book_ans_page);
      const bytes = readFileSync(new URL(`frontend/public${image.img}`, root));
      expect(createHash("sha256").update(bytes).digest("hex"), q.id).toBe(image.sha256);
      expect(index.items.find((item) => item.id === q.id)?.img, q.id).toBe(image.img);
      expect(shard.find((item) => item.id === q.id), q.id).toEqual(q);
    }
    // 截图中丢失有向图的题，对应新单题版 p.103、原书答案 P254。
    expect(manifest["ds-big-6.4-2"].pdf_page).toBe(103);
    expect(manifest["ds-big-6.4-2"].book_ans_page).toBe(254);
  });

  it("430道/26章全部对应核对源，完整目录、index和分片保留相同标注", () => {
    const big = catalog.filter((q) => q.kind === "big");
    expect(big).toHaveLength(430);
    expect(new Set(big.map((q) => `${q.book}-${q.section.split(".")[0]}`)).size).toBe(26);
    expect(Object.keys(overlay).sort()).toEqual(big.map((q) => q.id).sort());
    const index: { items: WangdaoItem[] } = read("frontend/public/cs408/wangdao2027/index.json");
    const shards: WangdaoItem[] = ["os", "ds", "co", "cn"].flatMap((book) => read(`frontend/public/cs408/wangdao2027/${book}.json`));
    for (const q of big) {
      const source = overlay[q.id];
      expect(createHash("sha256").update(q.stem!).digest("hex"), q.id).toBe(source.stem_sha256);
      expect(q.kp_ids, q.id).toEqual(source.kp_ids);
      for (const kp of q.kp_ids) expect(findKp(kp)?.book.subject, `${q.id}:${kp}`).toBe("cs408");
      expect(index.items.find((x) => x.id === q.id)?.kp_ids).toEqual(q.kp_ids);
      expect(shards.find((x) => x.id === q.id)).toEqual(q);
      expect(index.items.find((x) => x.id === q.id)?.facets).toEqual(source.facets);
    }
  });

  it("四科使用各自原件，计组同页多题与同页跨节保持正确裁切边界", () => {
    const manifest = read("scripts/wangdao_question_images.json");
    expect(Object.keys(manifest.sources).sort()).toEqual(["cn", "co", "ds", "os"]);
    expect(new Set(Object.values(manifest.sources).map((s) => (s as { source_sha256: string }).source_sha256)).size).toBe(4);
    for (const [firstId, nextId] of [["co-big-2.3-3", "co-big-2.3-4"], ["co-big-3.2-5", "co-big-3.3-1"]]) {
      const first = manifest.items[firstId];
      const next = manifest.items[nextId];
      expect(first.pdf_page).toBe(next.pdf_page);
      expect(first.crop[3]).toBeLessThanOrEqual(next.crop[1]);
    }
    expect(catalog.find((q) => q.id === "co-big-4.1-1")?.book_ans_page).toBe(155);
  });

  it("磁盘分配补回12道大题，目录、位图和磁盘调度保持各自含义", () => {
    const primary = (id: string) => catalog.find((q) => q.id === id)?.kp_ids[0];
    const allocation = catalog.filter((q) => q.kind === "big" && q.kp_ids.includes("os.file.alloc"));
    expect(allocation).toHaveLength(12);
    expect(allocation.filter((q) => q.kp_ids[0] === "os.file.alloc")).toHaveLength(11);
    expect(primary("os-big-4.2-8")).toBe("os.file.alloc");
    expect(primary("os-big-4.2-3")).toBe("os.file.dir");
    expect(primary("os-big-4.3-1")).toBe("os.file.fs");
    expect(primary("os-big-5.3-3")).toBe("os.io.disk");
    expect(primary("os-big-5.3-8")).toBe("os.file.fs");
  });

  it("节标题不再把遍历误挂线索树、归并误挂基数排序、性能计算误挂总线仲裁", () => {
    const kp = (id: string) => catalog.find((q) => q.id === id)!.kp_ids[0];
    const kps = (id: string) => catalog.find((q) => q.id === id)!.kp_ids;
    // 算法设计题主考归入 ds.algo.design，结构考点保留为辅助（不再误挂线索树等）。
    expect(kp("ds-big-5.3-3")).toBe("ds.algo.design");
    expect(kps("ds-big-5.3-3")).toContain("ds.tree.trav");
    expect(kp("ds-big-5.3-17")).toBe("ds.algo.design");
    expect(kps("ds-big-5.3-17")).toContain("ds.search.bst");
    expect(kp("ds-big-8.5-1")).toBe("ds.sort.merge");
    expect(kp("co-big-6.1-1")).toBe("co.bus.perf");
    expect(kp("cn-big-2.1-1")).toBe("cn.intro.perf");
    expect(catalog.filter((q) => q.kind === "big" && q.diagnostic_eligible === false)).toHaveLength(3);
    expect(catalog.filter((q) => q.kind === "big" && q.kp_ids.includes("co.io.channel"))).toHaveLength(0);
  });
});
