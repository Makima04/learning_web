// 李林 880 + 张宇 1000：静态 JSON，按图谱考点挂题（与王道目录同一套 PracticeItem）。
import { useEffect, useState } from "react";
import { useWangdao408, type WangdaoItem } from "@/lib/kg/wangdao408";

export const MATH_CATALOG_VER = "math-20260831c";

const cache: {
  ver?: string;
  value?: WangdaoItem[];
  promise?: Promise<WangdaoItem[]>;
} = {};

function tag(list: WangdaoItem[], source: string): WangdaoItem[] {
  return list.map((q) => ({ ...q, source: q.source || source }));
}

async function fetchJson(url: string): Promise<WangdaoItem[]> {
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`加载数学题目录失败 (${r.status})`);
  const raw = (await r.json()) as WangdaoItem[];
  return Array.isArray(raw) ? raw : [];
}

export function loadMathPractice(): Promise<WangdaoItem[]> {
  if (cache.ver === MATH_CATALOG_VER && cache.value) return Promise.resolve(cache.value);
  if (cache.ver === MATH_CATALOG_VER && cache.promise) return cache.promise;
  cache.ver = MATH_CATALOG_VER;
  cache.value = undefined;
  cache.promise = Promise.all([
    fetchJson(`/math/lilin880.json?v=${MATH_CATALOG_VER}`).then((xs) => tag(xs, "lilin880")),
    fetchJson(`/math/zhangyu1000.json?v=${MATH_CATALOG_VER}`).then((xs) =>
      tag(xs, "zhangyu1000")
    ),
  ]).then(([a, b]) => {
    cache.value = [...a, ...b];
    return cache.value;
  });
  return cache.promise;
}

/** 王道 + 880 + 1000 合并；考点互斥，按 kp_ids 过滤即可。 */
export function useDrillCatalog(): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const wd = useWangdao408();
  const math = useMathPractice();
  const ready = wd.items !== null && math.items !== null;
  return {
    items: ready ? [...(wd.items ?? []), ...(math.items ?? [])] : null,
    error: wd.error || math.error,
  };
}

export function useMathPractice(): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const [items, setItems] = useState<WangdaoItem[] | null>(cache.value ?? null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadMathPractice()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载数学题目录失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, error };
}

export type MathBookSource = "lilin880" | "zhangyu1000";

export const MATH_BOOK_SOURCES: {
  id: MathBookSource;
  label: string;
}[] = [
  { id: "lilin880", label: "李林880" },
  { id: "zhangyu1000", label: "张宇1000" },
];

export function itemsForSource(
  items: WangdaoItem[],
  source: string | null | undefined
): WangdaoItem[] {
  if (!source) return items;
  return items.filter((q) => q.source === source);
}

export function mathBookLabel(source: string | null | undefined): string {
  if (source === "lilin880") return "李林880";
  if (source === "zhangyu1000") return "张宇1000";
  return "题目";
}

export function practiceSourceLabel(item: WangdaoItem): string {
  const part = item.part === "hard" ? "强化" : item.part === "base" ? "基础" : "";
  if (item.source === "lilin880") return part ? `李林880·${part}` : "李林880";
  if (item.source === "zhangyu1000") return part ? `张宇1000·${part}` : "张宇1000";
  return "王道";
}

export function practiceKindLabel(kind: string | undefined): string {
  if (kind === "fill") return "填空";
  if (kind === "big") return "大题";
  return "选择";
}
