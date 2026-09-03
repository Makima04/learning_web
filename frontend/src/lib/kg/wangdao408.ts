// 2027 王道 408 做题本索引：静态 JSON，按图谱考点挂题。
import { useEffect, useState } from "react";
import { dayKey } from "@/lib/day";
import { isDueOnOrBefore, type JournalEntry } from "@/lib/journal";
import { loadCatalogIndex, PRACTICE_CATALOG_VER } from "@/lib/kg/catalogLoad";
import type { MarkLevel, UserItemMark } from "@/lib/kg/types";
import { canonicalKpId } from "@/lib/kg/kpAlias";

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
  /** index 分片未 hydrate 时可能为空；数学题优先用 img */
  stem?: string;
  options?: Record<string, string>;
  kp_ids: string[];
  /** wangdao / lilin880 / zhangyu1000 */
  source?: string;
  /** 基础 base / 强化 hard */
  part?: string;
  /** 原页裁图（数学公式用，优先于 stem 文本） */
  img?: string;
  /** 张宇解析册裁图 */
  ans_img?: string;
  /** 选择题字母，或解析册【答案】里读到的 A-D */
  answer?: string;
  /** 题型细类（解析分类，不是图谱考点） */
  facets?: string[];
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
  if (cache.ver === PRACTICE_CATALOG_VER && cache.value) return Promise.resolve(cache.value);
  if (cache.ver === PRACTICE_CATALOG_VER && cache.promise) return cache.promise;
  cache.ver = PRACTICE_CATALOG_VER;
  cache.value = undefined;
  cache.promise = loadCatalogIndex("wangdao")
    .then((list) => {
      cache.value = list;
      return list;
    })
    .catch((err) => {
      cache.ver = undefined;
      cache.promise = undefined;
      throw err;
    });
  return cache.promise;
}

export function useWangdao408(opts?: { enabled?: boolean }): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const enabled = opts?.enabled !== false;
  const [items, setItems] = useState<WangdaoItem[] | null>(
    enabled ? (cache.value ?? null) : []
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setError("");
      return;
    }
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
  }, [enabled]);
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
  const want = canonicalKpId(kpId);
  return entries.filter(
    (e) =>
      e.status === "active" &&
      Boolean(e.sourceItemId) &&
      canonicalKpId(e.kpId) === want
  );
}

function isSkip(mark: MarkLevel | undefined): boolean {
  return !mark || mark === "skip";
}

export function countPoolDrill(
  qs: WangdaoItem[],
  itemMarks: UserItemMark[],
  entries: JournalEntry[],
  today: string = dayKey()
): KpDrillCounts {
  const marks = markMapOf(itemMarks);
  const ids = new Set(qs.map((q) => q.id));
  const wrong = entries.filter(
    (e) => e.status === "active" && e.sourceItemId && ids.has(e.sourceItemId)
  );
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

export function learnQueueFrom(
  qs: WangdaoItem[],
  itemMarks: UserItemMark[],
  entries: JournalEntry[]
): WangdaoItem[] {
  const marks = markMapOf(itemMarks);
  const ids = new Set(qs.map((q) => q.id));
  const wrongIds = new Set(
    entries
      .filter((e) => e.status === "active" && e.sourceItemId && ids.has(e.sourceItemId))
      .map((e) => e.sourceItemId)
  );
  return qs.filter((q) => !wrongIds.has(q.id) && isSkip(marks.get(q.id)));
}

export function reviewQueueFrom(
  qs: WangdaoItem[],
  entries: JournalEntry[],
  today: string = dayKey()
): WangdaoItem[] {
  const ids = new Set(qs.map((q) => q.id));
  const dueIds = new Set(
    entries
      .filter(
        (e) =>
          e.status === "active" &&
          e.sourceItemId &&
          ids.has(e.sourceItemId) &&
          isDueOnOrBefore(e, today)
      )
      .map((e) => e.sourceItemId)
  );
  return qs.filter((q) => dueIds.has(q.id));
}

export function countKpDrill(
  items: WangdaoItem[],
  kpId: string,
  itemMarks: UserItemMark[],
  entries: JournalEntry[],
  today: string = dayKey()
): KpDrillCounts {
  return countPoolDrill(itemsForKp(items, kpId), itemMarks, entries, today);
}

export function learnQueue(
  items: WangdaoItem[],
  kpId: string,
  itemMarks: UserItemMark[],
  entries: JournalEntry[]
): WangdaoItem[] {
  return learnQueueFrom(itemsForKp(items, kpId), itemMarks, entries);
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
    : `§${item.section} #${item.qno} ${item.stem || ""}`.trim();
  return {
    kpId,
    categoryId: math ? "cat-math" : "cat-408",
    title,
    body: item.img ? loc : [loc, item.stem, optLines].filter(Boolean).join("\n").trim(),
  };
}
