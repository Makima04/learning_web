import { useEffect, useState } from "react";
import { dayKey } from "@/lib/day";
import { compareDay, isDueOnOrBefore, type JournalEntry } from "@/lib/journal";
import type { UserItemMark } from "@/lib/kg/types";

export type HandoutPriority = "exam" | "lilin880";

export interface HandoutMethod {
  id: string;
  titleHtml: string;
  title: string;
  descHtml: string;
}

export interface HandoutExample {
  id: string;
  anchorId: string;
  matchedMath1: boolean;
  lilin880Id: string | null;
  year: number | null;
  n: number | null;
  sourceType: "exam" | "lilin880" | "lilin_mock";
  source: string;
  title: string;
  answerLetter: string | null;
  questionHtml: string;
  hintHtml: string;
  stepsHtml: string;
}

export interface HandoutGroupGuide {
  shortTitle: string;
  clueHtml: string;
  coreHtml: string;
  pitfallHtml: string;
  roadmapHtml: string;
  featuredAnchorIds: string[];
  structured: boolean;
}

export interface HandoutGroup {
  id: string;
  title: string;
  guide?: HandoutGroupGuide;
  examples: HandoutExample[];
}

export interface MathHandout {
  slug: string;
  order: number;
  book: "calc" | "linear" | "prob";
  bookName: string;
  chapterPath: string;
  moduleId: string;
  primaryKpId: string;
  secondaryKpIds: string[];
  title: string;
  verdictHeading: string;
  verdictHtml: string;
  verdictLeadHtml?: string;
  verdictTableHtml?: string;
  hasStructuredScenarios?: boolean;
  topicHeading: string;
  topicIntroHtml: string;
  methods: HandoutMethod[];
  workedHeading: string;
  workedHtml: string;
  practiceHeading: string;
  practiceIntroHtml: string;
  groups: HandoutGroup[];
  stats: {
    total: number;
    exam: number;
    lilin880: number;
  };
}

export interface Lilin880Item {
  id: string;
  source: string;
  book: string;
  kind: "mcq" | "fill" | "big";
  section: string;
  section_name: string;
  qno: number;
  pdf_page?: number;
  stem: string;
  kp_ids?: string[];
  part?: string;
  band?: string;
  options?: Record<string, string>;
  img?: string;
  ans_img?: string;
  answer?: string;
}

const PRIORITY_STORAGE_KEY = "ew.mathHandout.priority.v1";

export function readHandoutPriority(): HandoutPriority {
  try {
    const v = localStorage.getItem(PRIORITY_STORAGE_KEY);
    return v === "lilin880" ? "lilin880" : "exam";
  } catch {
    return "exam";
  }
}

export function writeHandoutPriority(p: HandoutPriority): void {
  try {
    localStorage.setItem(PRIORITY_STORAGE_KEY, p);
  } catch {
    /* ignore */
  }
}

export function useHandoutPriority(): [HandoutPriority, (p: HandoutPriority) => void] {
  const [priority, setPriorityState] = useState<HandoutPriority>(readHandoutPriority);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PRIORITY_STORAGE_KEY) {
        setPriorityState(readHandoutPriority());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setPriority = (p: HandoutPriority) => {
    setPriorityState(p);
    writeHandoutPriority(p);
  };
  return [priority, setPriority];
}

const HANDOUTS_DATA_VERSION = "20261122v3";

let handoutsCache: Promise<MathHandout[]> | null = null;
export function loadMathHandouts(): Promise<MathHandout[]> {
  if (!handoutsCache) {
    handoutsCache = fetch(`/math/handouts.json?v=${HANDOUTS_DATA_VERSION}`, {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { handouts: MathHandout[] }) => d.handouts)
      .catch((err) => {
        handoutsCache = null;
        throw err;
      });
  }
  return handoutsCache;
}

let lilinCache: Promise<Lilin880Item[]> | null = null;
export function loadLilin880(): Promise<Lilin880Item[]> {
  if (!lilinCache) {
    lilinCache = fetch(`/math/lilin880.json?v=${HANDOUTS_DATA_VERSION}`, {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        lilinCache = null;
        throw err;
      });
  }
  return lilinCache;
}

export interface ExampleReviewState {
  isDue: boolean;
  reviewedToday: boolean;
}

/** 按 sourceItemId 索引学习日志条目（若同题多条，优先保留当前到期且 active 的条目）。 */
export function buildJournalEntryMap(
  entries: JournalEntry[],
  today: string = dayKey()
): Map<string, JournalEntry> {
  const map = new Map<string, JournalEntry>();
  for (const e of entries) {
    if (!e.sourceItemId) continue;
    const prev = map.get(e.sourceItemId);
    if (!prev) {
      map.set(e.sourceItemId, e);
      continue;
    }
    const curDue = isDueOnOrBefore(e, today);
    const prevDue = isDueOnOrBefore(prev, today);
    if (curDue && !prevDue) {
      map.set(e.sourceItemId, e);
    } else if (curDue === prevDue && e.updatedAt > prev.updatedAt) {
      map.set(e.sourceItemId, e);
    }
  }
  return map;
}

/** 判断手稿单题今日是否「待复习」或「今日已复盘」（同时兼容真题·880同题双ID）。 */
export function getExampleReviewState(
  ex: HandoutExample,
  journalByItemId: Map<string, JournalEntry>,
  markRecordMap: Map<string, UserItemMark>,
  today: string = dayKey()
): ExampleReviewState {
  const ids = ex.lilin880Id && ex.lilin880Id !== ex.id ? [ex.id, ex.lilin880Id] : [ex.id];
  const retired = ids.some((id) => Boolean(markRecordMap.get(id)?.retired));
  const matchedEntries = ids
    .map((id) => journalByItemId.get(id))
    .filter((e): e is JournalEntry => Boolean(e));

  if (retired) {
    const retiredToday = ids.some((id) => {
      const rec = markRecordMap.get(id);
      return Boolean(rec?.retired && rec.retiredAt && dayKey(rec.retiredAt) === today);
    });
    const hadPriorEntry = matchedEntries.some((e) => compareDay(e.createdOn, today) < 0);
    const reviewedEntryToday = matchedEntries.some((e) => e.lastReviewedOn === today);
    return {
      isDue: false,
      reviewedToday: reviewedEntryToday || (retiredToday && hadPriorEntry),
    };
  }

  const isDue = matchedEntries.some((e) => isDueOnOrBefore(e, today));
  if (isDue) {
    return { isDue: true, reviewedToday: false };
  }
  const reviewedToday = matchedEntries.some((e) => e.lastReviewedOn === today);
  return { isDue: false, reviewedToday };
}

export function matchLilin880ForHandout(
  handout: MathHandout,
  allLilin: Lilin880Item[]
): { primary: Lilin880Item[]; secondary: Lilin880Item[] } {
  const primary: Lilin880Item[] = [];
  const secondary: Lilin880Item[] = [];
  const secSet = new Set(handout.secondaryKpIds);
  for (const item of allLilin) {
    const kps = item.kp_ids ?? [];
    if (kps.includes(handout.primaryKpId)) {
      primary.push(item);
    } else if (kps.some((k) => secSet.has(k))) {
      secondary.push(item);
    }
  }
  return { primary, secondary };
}
