import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalogIdOf,
  needsHydrate,
  shardKeyOf,
} from "./catalogLoad";
import type { WangdaoItem } from "./wangdao408";

function item(partial: Partial<WangdaoItem> & Pick<WangdaoItem, "id" | "book">): WangdaoItem {
  return {
    kind: "mcq",
    section: "1",
    qno: 1,
    kp_ids: [],
    ...partial,
  };
}

describe("catalogLoad keys", () => {
  it("shards wangdao by book, math by part-section", () => {
    expect(shardKeyOf(item({ id: "ds-1", book: "ds" }))).toBe("ds");
    expect(
      shardKeyOf(
        item({
          id: "ll-1",
          book: "calc",
          source: "lilin880",
          part: "hard",
          section: "3",
        })
      )
    ).toBe("hard-3");
    expect(
      shardKeyOf(
        item({
          id: "zy-1",
          book: "calc",
          source: "zhangyu1000",
          part: "base",
          section: "hs-0",
        })
      )
    ).toBe("base-hs-0");
  });

  it("math with img does not need hydrate; wangdao stemless does", () => {
    expect(
      needsHydrate(
        item({
          id: "ll-1",
          book: "calc",
          source: "lilin880",
          img: "/math/img/ll/x.jpg",
        })
      )
    ).toBe(false);
    expect(needsHydrate(item({ id: "ds-1", book: "ds", stem: "题干" }))).toBe(false);
    expect(needsHydrate(item({ id: "ds-2", book: "ds" }))).toBe(true);
    expect(catalogIdOf({ source: "zhangyu1000" })).toBe("zhangyu1000");
    expect(catalogIdOf({})).toBe("wangdao");
  });
});

describe("split catalogs on disk", () => {
  it("wangdao index is slim and shards keep stems", () => {
    const idx = JSON.parse(
      readFileSync("public/cs408/wangdao2027/index.json", "utf8")
    ) as { items: WangdaoItem[]; shards: { key: string }[]; count: number };
    expect(idx.count).toBe(2886);
    expect(idx.items).toHaveLength(2886);
    expect(idx.shards.map((s) => s.key).sort()).toEqual(["cn", "co", "ds", "os"]);
    expect(idx.items[0]?.stem).toBeUndefined();
    expect(idx.items[0]?.options).toBeUndefined();
    const ds = JSON.parse(
      readFileSync("public/cs408/wangdao2027/ds.json", "utf8")
    ) as WangdaoItem[];
    expect(ds.length).toBeGreaterThan(700);
    expect(ds[0]?.stem).toBeTruthy();
  });

  it("lilin / zhangyu index keep img and drop stem", () => {
    const ll = JSON.parse(
      readFileSync("public/math/lilin880/index.json", "utf8")
    ) as { items: WangdaoItem[]; count: number };
    const zy = JSON.parse(
      readFileSync("public/math/zhangyu1000/index.json", "utf8")
    ) as { items: WangdaoItem[]; count: number };
    expect(ll.count).toBe(1118);
    expect(zy.count).toBe(1152);
    expect(ll.items[0]?.img).toMatch(/^\/math\/img\//);
    expect(ll.items[0]?.stem).toBeUndefined();
    expect(zy.items[0]?.img).toMatch(/^\/math\/img\//);
  });
});
