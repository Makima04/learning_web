import { useEffect, useState } from "react";

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

const HANDOUTS_DATA_VERSION = "20261121v8";

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
