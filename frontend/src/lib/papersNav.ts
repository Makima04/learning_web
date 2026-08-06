// 真题列表深链：variant / year 与 papers 数组下标互查
import { getPapers } from "@/lib/words";
import type { Paper } from "@/types/words";

export type PaperVariant = "en1" | "en2";

export function normalizeVariant(v: string | undefined | null): PaperVariant {
  return v === "en2" ? "en2" : "en1";
}

/** 某 variant 下按年唯一的 paper 在 PAPERS 中的下标（同年取首次） */
export function findPaperIndex(variant: PaperVariant, year: number): number {
  const papers = getPapers();
  return papers.findIndex(
    (p) => (p.variant || "en1") === variant && p.year === year
  );
}

export function getPaperByVariantYear(
  variant: PaperVariant,
  year: number
): { paper: Paper; index: number } | null {
  const index = findPaperIndex(variant, year);
  if (index < 0) return null;
  return { paper: getPapers()[index], index };
}

export function papersListPath(variant: PaperVariant = "en1"): string {
  return `/papers/${variant}`;
}

export function papersYearPath(variant: PaperVariant, year: number): string {
  return `/papers/${variant}/${year}`;
}

export function papersReciteListPath(variant: PaperVariant = "en1"): string {
  return `/papers-recite/${variant}`;
}

export function papersReciteYearPath(variant: PaperVariant, year: number): string {
  return `/papers-recite/${variant}/${year}`;
}

/**
 * 从 PAPERS 下标回到记词页：有年份则进该年题型列表，否则回 variant 年列表。
 * paperIdx 非法时退回英语一总列表。
 */
export function papersRecitePathFromPaperIdx(paperIdx: number | null | undefined): string {
  if (paperIdx == null || paperIdx < 0) return papersReciteListPath("en1");
  const papers = getPapers();
  const paper = papers[paperIdx];
  if (!paper) return papersReciteListPath("en1");
  const variant = normalizeVariant(paper.variant);
  if (paper.year != null && Number.isFinite(paper.year)) {
    return papersReciteYearPath(variant, paper.year);
  }
  return papersReciteListPath(variant);
}

/** 该 variant 下去重年份列表（新→旧），带原始 index */
export function listYearsForVariant(variant: PaperVariant): {
  year: number;
  index: number;
  paper: Paper;
}[] {
  const papers = getPapers();
  const list = papers
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.variant || "en1") === variant);
  const seen = new Map<number, number>();
  for (const { p, i } of list) {
    if (p.year != null && !seen.has(p.year)) seen.set(p.year, i);
  }
  return Array.from(seen.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, index]) => ({ year, index, paper: papers[index] }));
}
