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
    expect(kp("ds-big-5.3-3")).toBe("ds.tree.trav");
    expect(kp("ds-big-5.3-17")).toBe("ds.search.bst");
    expect(kp("ds-big-8.5-1")).toBe("ds.sort.merge");
    expect(kp("co-big-6.1-1")).toBe("co.bus.perf");
    expect(kp("cn-big-2.1-1")).toBe("cn.intro.perf");
    expect(catalog.filter((q) => q.kind === "big" && q.diagnostic_eligible === false)).toHaveLength(3);
    expect(catalog.filter((q) => q.kind === "big" && q.kp_ids.includes("co.io.channel"))).toHaveLength(0);
  });
});
