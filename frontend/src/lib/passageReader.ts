// 真题篇章 → 阅读器状态；支持 URL 深链刷新还原。
import { getPapers } from "@/lib/words";
import type { PassageReader } from "@/stores/study";
import type { Paper, Passage, PaperSection } from "@/types/words";

export type PassageKey = {
  variant: string;
  year: number;
  label: string;
};

/** /reader/en1/2006/Text%202 */
export function passageReaderPath(key: PassageKey): string {
  const v = key.variant || "en1";
  const y = Number.isFinite(key.year) ? String(key.year) : "0";
  const lab = encodeURIComponent(key.label || "passage");
  return `/reader/${v}/${y}/${lab}`;
}

export function parsePassageReaderParams(params: {
  variant?: string;
  year?: string;
  label?: string;
}): PassageKey | null {
  const variant = (params.variant || "").trim() || "en1";
  const year = parseInt(params.year || "", 10);
  let label = params.label || "";
  try {
    label = decodeURIComponent(label);
  } catch {
    /* keep raw */
  }
  label = label.trim();
  if (!label || !Number.isFinite(year)) return null;
  return { variant, year, label };
}

export function findPaperPassage(
  key: PassageKey
): { paper: Paper; section: PaperSection; passage: Passage } | null {
  const wantVariant = key.variant || "en1";
  const papers = getPapers();
  for (const paper of papers) {
    const v = paper.variant || "en1";
    if (v !== wantVariant) continue;
    if (paper.year !== key.year) continue;
    for (const section of paper.sections || []) {
      for (const passage of section.passages || []) {
        if ((passage.label || "").trim() === key.label) {
          return { paper, section, passage };
        }
      }
    }
  }
  // 宽松：label 大小写不敏感
  const low = key.label.toLowerCase();
  for (const paper of papers) {
    const v = paper.variant || "en1";
    if (v !== wantVariant) continue;
    if (paper.year !== key.year) continue;
    for (const section of paper.sections || []) {
      for (const passage of section.passages || []) {
        if ((passage.label || "").trim().toLowerCase() === low) {
          return { paper, section, passage };
        }
      }
    }
  }
  return null;
}

export function buildPassageReader(
  paper: Paper,
  section: PaperSection,
  passage: Passage
): PassageReader {
  const year = paper.year;
  const label = passage.label || "";
  return {
    title: `${year ? year + " 年 " : ""}${label}`.trim(),
    body: passage.body,
    words: (passage.words || []).map((w) => w.english),
    year,
    variant: paper.variant || "en1",
    label,
    items: passage.items || [],
    answers: passage.answers || {},
    sectionType: section.type,
    wordsFull: passage.words,
  };
}

/** 从 year/variant/label 重建阅读状态；找不到返回 null */
export function loadPassageReader(key: PassageKey): PassageReader | null {
  const hit = findPaperPassage(key);
  if (!hit) return null;
  return buildPassageReader(hit.paper, hit.section, hit.passage);
}

export function passageReaderMatches(
  reader: PassageReader | null | undefined,
  key: PassageKey
): boolean {
  if (!reader) return false;
  const v = reader.variant || "en1";
  return (
    v === (key.variant || "en1") &&
    reader.year === key.year &&
    (reader.label || "").trim() === key.label
  );
}
