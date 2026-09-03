// 王道 / 李林880 / 张宇1000：index（计数）+ 分片（题干）懒加载。
// 数学题有 img，index 即可作答；王道题干在分片里，展示前 hydrate。
import { useEffect, useState } from "react";
import type { WangdaoItem } from "@/lib/kg/wangdao408";

export const PRACTICE_CATALOG_VER = "split-20260903a";

export type CatalogId = "wangdao" | "lilin880" | "zhangyu1000";
export type CatalogWhich = "wangdao" | "math" | "all" | "none";

type ShardMeta = { key: string; file: string; count: number };
type IndexFile = {
  ver?: string;
  count?: number;
  shards?: ShardMeta[];
  items: WangdaoItem[];
};

type Mem = {
  items?: WangdaoItem[];
  indexLoaded?: boolean;
  indexPromise?: Promise<WangdaoItem[]>;
  shards: Map<string, string>;
  loadedShards: Set<string>;
  shardPromises: Map<string, Promise<void>>;
  byId: Map<string, WangdaoItem>;
};

const BASE: Record<CatalogId, string> = {
  wangdao: "/cs408/wangdao2027",
  lilin880: "/math/lilin880",
  zhangyu1000: "/math/zhangyu1000",
};

const MONOLITH: Record<CatalogId, string> = {
  wangdao: "/cs408/wangdao2027.json",
  lilin880: "/math/lilin880.json",
  zhangyu1000: "/math/zhangyu1000.json",
};

const stores: Record<CatalogId, Mem> = {
  wangdao: emptyMem(),
  lilin880: emptyMem(),
  zhangyu1000: emptyMem(),
};

function emptyMem(): Mem {
  return {
    shards: new Map(),
    loadedShards: new Set(),
    shardPromises: new Map(),
    byId: new Map(),
  };
}

function withVer(url: string): string {
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=${PRACTICE_CATALOG_VER}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const r = await fetch(withVer(url));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`加载失败 ${url} (${r.status})`);
  return (await r.json()) as T;
}

export function catalogIdOf(item: Pick<WangdaoItem, "source">): CatalogId {
  if (item.source === "lilin880") return "lilin880";
  if (item.source === "zhangyu1000") return "zhangyu1000";
  return "wangdao";
}

export function shardKeyOf(item: WangdaoItem): string {
  if (item.source === "lilin880" || item.source === "zhangyu1000") {
    const part = item.part || "base";
    const section = item.section == null || item.section === "" ? "misc" : String(item.section);
    return `${part}-${section}`;
  }
  return item.book || "misc";
}

/** 有题图或已有题干就不需要再拉分片。 */
export function needsHydrate(item: WangdaoItem): boolean {
  if (item.img) return false;
  return !item.stem;
}

function ingest(id: CatalogId, incoming: WangdaoItem[], kind: "index" | "shard", shardKey?: string) {
  const m = stores[id];
  for (const q of incoming) {
    const tagged =
      id !== "wangdao" && !q.source ? ({ ...q, source: id } as WangdaoItem) : q;
    const prev = m.byId.get(tagged.id);
    m.byId.set(tagged.id, prev ? { ...prev, ...tagged } : tagged);
  }
  if (shardKey) m.loadedShards.add(shardKey);
  if (kind === "index") {
    m.indexLoaded = true;
    m.items = incoming.map((q) => m.byId.get(q.id)!);
  } else if (m.indexLoaded && m.items) {
    m.items = m.items.map((q) => m.byId.get(q.id) ?? q);
  }
}

export async function loadCatalogIndex(id: CatalogId): Promise<WangdaoItem[]> {
  const m = stores[id];
  if (m.indexLoaded && m.items) return m.items;
  if (m.indexPromise) return m.indexPromise;
  m.indexPromise = (async () => {
    const idx = await fetchJson<IndexFile>(`${BASE[id]}/index.json`);
    if (idx && Array.isArray(idx.items)) {
      for (const s of idx.shards || []) m.shards.set(s.key, s.file);
      ingest(id, idx.items, "index");
      return m.items!;
    }
    const raw = await fetchJson<WangdaoItem[]>(MONOLITH[id]);
    const list = Array.isArray(raw) ? raw : [];
    ingest(id, list, "index");
    for (const q of list) m.loadedShards.add(shardKeyOf(q));
    return m.items!;
  })().catch((err) => {
    m.indexPromise = undefined;
    throw err;
  });
  return m.indexPromise;
}

export async function loadCatalogShard(id: CatalogId, key: string): Promise<WangdaoItem[]> {
  const m = stores[id];
  const fromCache = () => [...m.byId.values()].filter((q) => shardKeyOf(q) === key);
  if (m.loadedShards.has(key)) return fromCache();
  const pending = m.shardPromises.get(key);
  if (pending) {
    await pending;
    return fromCache();
  }
  const run = (async () => {
    const file = m.shards.get(key) || `${key}.json`;
    const raw = await fetchJson<WangdaoItem[]>(`${BASE[id]}/${file}`);
    if (Array.isArray(raw) && raw.length) ingest(id, raw, "shard", key);
    else m.loadedShards.add(key);
  })().finally(() => {
    m.shardPromises.delete(key);
  });
  m.shardPromises.set(key, run);
  await run;
  return fromCache();
}

export async function hydratePracticeItems(items: WangdaoItem[]): Promise<WangdaoItem[]> {
  if (!items.length) return items;
  const need = items.filter(needsHydrate);
  if (!need.length) return items.map((q) => stores[catalogIdOf(q)].byId.get(q.id) ?? q);
  const groups = new Map<CatalogId, Set<string>>();
  for (const q of need) {
    const id = catalogIdOf(q);
    let set = groups.get(id);
    if (!set) {
      set = new Set();
      groups.set(id, set);
    }
    set.add(shardKeyOf(q));
  }
  await Promise.all(
    [...groups.entries()].flatMap(([id, keys]) =>
      [...keys].map((key) => loadCatalogShard(id, key))
    )
  );
  return items.map((q) => stores[catalogIdOf(q)].byId.get(q.id) ?? q);
}

/** index 先上屏，分片回来后补题干。 */
export function useHydratedItems(items: WangdaoItem[] | null): WangdaoItem[] | null {
  const [out, setOut] = useState<WangdaoItem[] | null>(items);
  useEffect(() => {
    if (!items) {
      setOut(null);
      return;
    }
    setOut(items);
    let cancelled = false;
    hydratePracticeItems(items)
      .then((full) => {
        if (!cancelled) setOut(full);
      })
      .catch(() => {
        /* 分片失败时保留 index，题号仍可用 */
      });
    return () => {
      cancelled = true;
    };
  }, [items]);
  return out;
}

export function mediaUrl(path: string | undefined | null): string | null {
  if (!path) return null;
  if (path.includes("?")) return path;
  return `${path}?v=${PRACTICE_CATALOG_VER}`;
}

export function prefetchQuestionMedia(item: WangdaoItem | undefined | null) {
  if (!item) return;
  const stem = mediaUrl(item.img);
  if (stem) {
    const img = new Image();
    img.src = stem;
  }
  const ans = mediaUrl(item.ans_img);
  if (ans) {
    const img = new Image();
    img.src = ans;
  }
}

/** 测试用：清空内存缓存。 */
export function resetCatalogCache() {
  (Object.keys(stores) as CatalogId[]).forEach((id) => {
    stores[id] = emptyMem();
  });
}
