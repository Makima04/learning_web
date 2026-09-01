// 2027 王道 408 做题本索引：静态 JSON，按图谱考点挂题。
import { useEffect, useState } from "react";
import { dayKey } from "@/lib/day";
import { isDueOnOrBefore, type JournalEntry } from "@/lib/journal";
import type { MarkLevel, UserItemMark } from "@/lib/kg/types";

export type WangdaoKind = "mcq" | "big";

export interface WangdaoItem {
  id: string;
  book: string;
  kind: WangdaoKind | string;
  section: string;
  section_name?: string;
  qno: number;
  pdf_page?: number | null;
  book_ans_page?: number | null;
  year?: number | null;
  stem: string;
  options?: Record<string, string>;
  kp_ids: string[];
  /** wangdao / lilin880 / zhangyu1000 */
  source?: string;
  /** 基础 base / 强化 hard */
  part?: string;
  /** 原页裁图（数学公式用，优先于 stem 文本） */
  img?: string;
}

export interface KpDrillCounts {
  total: number;
  /** 从未标记、也不在错题集 → 当新学 */
  learn: number;
  /** 错题集里今天到期 / 逾期 */
  review: number;
  /** 错题集里未到期（间隔中） */
  waiting: number;
}

const CATALOG_VER = "full-20260831c";
const cache: {
  ver?: string;
  value?: WangdaoItem[];
  promise?: Promise<WangdaoItem[]>;
} = {};

export function wangdaoJournalId(itemId: string): string {
  return `je-wd-${itemId}`;
}

export function itemsForKp(items: WangdaoItem[], kpId: string): WangdaoItem[] {
  return items.filter((q) => (q.kp_ids || []).includes(kpId));
}

export function itemById(items: WangdaoItem[], id: string): WangdaoItem | undefined {
  return items.find((q) => q.id === id);
}

export function loadWangdao408(): Promise<WangdaoItem[]> {
  if (cache.ver === CATALOG_VER && cache.value) return Promise.resolve(cache.value);
  if (cache.ver === CATALOG_VER && cache.promise) return cache.promise;
  cache.ver = CATALOG_VER;
  cache.value = undefined;
  cache.promise = fetch(`/cs408/wangdao2027.json?v=${CATALOG_VER}`, {
    cache: "no-store",
  }).then(async (r) => {
    if (!r.ok) throw new Error(`加载王道目录失败 (${r.status})`);
    const raw = (await r.json()) as WangdaoItem[];
    cache.value = Array.isArray(raw) ? raw : [];
    return cache.value;
  });
  return cache.promise;
}

export function useWangdao408(): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const [items, setItems] = useState<WangdaoItem[] | null>(cache.value ?? null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadWangdao408()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载王道目录失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, error };
}

export function markMapOf(itemMarks: UserItemMark[]): Map<string, MarkLevel> {
  const m = new Map<string, MarkLevel>();
  for (const x of itemMarks) m.set(x.itemId, x.mark);
  return m;
}

/** 某考点下、仍在错题集里的日志（含未到期） */
export function wrongEntriesForKp(
  entries: JournalEntry[],
  kpId: string
): JournalEntry[] {
  return entries.filter(
    (e) => e.status === "active" && e.kpId === kpId && Boolean(e.sourceItemId)
  );
}

function isSkip(mark: MarkLevel | undefined): boolean {
  return !mark || mark === "skip";
}

export function countKpDrill(
  items: WangdaoItem[],
  kpId: string,
  itemMarks: UserItemMark[],
  entries: JournalEntry[],
  today: string = dayKey()
): KpDrillCounts {
  const qs = itemsForKp(items, kpId);
  const marks = markMapOf(itemMarks);
  const wrong = wrongEntriesForKp(entries, kpId);
  const wrongIds = new Set(wrong.map((e) => e.sourceItemId));
  const dueIds = new Set(
    wrong.filter((e) => isDueOnOrBefore(e, today)).map((e) => e.sourceItemId)
  );
  let learn = 0;
  let review = 0;
  let waiting = 0;
  for (const q of qs) {
    if (dueIds.has(q.id)) review++;
    else if (wrongIds.has(q.id)) waiting++;
    else if (isSkip(marks.get(q.id))) learn++;
  }
  return { total: qs.length, learn, review, waiting };
}

export function learnQueue(
  items: WangdaoItem[],
  kpId: string,
  itemMarks: UserItemMark[],
  entries: JournalEntry[]
): WangdaoItem[] {
  const marks = markMapOf(itemMarks);
  const wrongIds = new Set(wrongEntriesForKp(entries, kpId).map((e) => e.sourceItemId));
  return itemsForKp(items, kpId).filter(
    (q) => !wrongIds.has(q.id) && isSkip(marks.get(q.id))
  );
}

export function reviewQueue(
  items: WangdaoItem[],
  kpId: string,
  entries: JournalEntry[],
  today: string = dayKey()
): WangdaoItem[] {
  const due = wrongEntriesForKp(entries, kpId).filter((e) => isDueOnOrBefore(e, today));
  const byId = new Map(items.map((q) => [q.id, q]));
  const out: WangdaoItem[] = [];
  for (const e of due) {
    const q = e.sourceItemId ? byId.get(e.sourceItemId) : undefined;
    if (q) out.push(q);
  }
  return out;
}

export function journalCopyForWangdao(item: WangdaoItem): {
  title: string;
  body: string;
  categoryId: string;
  kpId: string;
} | null {
  const kpId = item.kp_ids[0];
  if (!kpId) return null;
  const kind = item.kind === "fill" ? "填空" : item.kind === "big" ? "大题" : "选择";
  const loc = [
    `§${item.section} #${item.qno}`,
    kind,
    item.pdf_page ? `做题本 p.${item.pdf_page}` : "",
    item.book_ans_page != null ? `原书【P${item.book_ans_page}】` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const optLines = ["A", "B", "C", "D"]
    .map((k) => (item.options?.[k] ? `${k}. ${item.options[k]}` : ""))
    .filter(Boolean)
    .join("\n");
  const math = item.source === "lilin880" || item.source === "zhangyu1000";
  const srcLabel =
    item.source === "lilin880" ? "李林880" : item.source === "zhangyu1000" ? "张宇1000" : "";
  const title = item.img
    ? [srcLabel, `§${item.section} #${item.qno}`].filter(Boolean).join(" ")
    : `§${item.section} #${item.qno} ${item.stem}`.trim();
  return {
    kpId,
    categoryId: math ? "cat-math" : "cat-408",
    title,
    body: item.img ? loc : [loc, item.stem, optLines].filter(Boolean).join("\n").trim(),
  };
}
