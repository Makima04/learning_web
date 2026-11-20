// 章级解题路线：一条主线 + 题型索引（看到什么式子，第一步写什么）。
// 与 knowledgeReview 的考点模板互补：这里不铺概念，只回答「起手第一步」。
import type { BookId } from "@/lib/kg/types";

export interface RouteRow {
  /** 看到的式子或条件（文字）。 */
  signal: string;
  /** 需要看清的式子，原样 TeX。 */
  tex?: string;
  /** 第一步写什么。 */
  first: string;
  /** 接着往下走。 */
  chain: string;
  /** 这一行落到哪个考点，可跳讲解。 */
  kpId: string;
  /** 最常见的那一处失分。 */
  trap: string;
}

export interface RouteStep {
  /** 主线上的固定动作，动词开头。 */
  label: string;
  detail: string;
}

export interface RouteChapter {
  /** 与 MATH_BOOKS 的 module id 一致。 */
  moduleId: string;
  /** 本章唯一主线：所有题型都从这句话起步。 */
  spine: string;
  /** 主线的固定步骤，顺序对每题都一样。 */
  steps: RouteStep[];
  /** 题型索引：看到什么，第一步写什么。 */
  rows: RouteRow[];
  /** 本章最值得带走的一句判断：什么只负责什么。 */
  transfer: string;
}

/** 章级路线只挂在数学上；做题本与知识讲解都按 module 归属。 */
export function routeChapterPath(moduleId: string): string {
  return `/review-priority/routes/${encodeURIComponent(moduleId)}`;
}

export function routeIndexPath(bookId?: string): string {
  return bookId ? `/review-priority/routes?book=${encodeURIComponent(bookId)}` : "/review-priority/routes";
}

/** 反查：某个考点属于哪一章的路线，便于从考点页回跳。 */
export function moduleOfRouteChapter(chapters: readonly RouteChapter[], moduleId: string): RouteChapter | undefined {
  return chapters.find((chapter) => chapter.moduleId === moduleId);
}

export function rowsForKp(chapter: RouteChapter, kpId: string): RouteRow[] {
  return chapter.rows.filter((row) => row.kpId === kpId);
}

/** 题目归位只认第一个匹配行：一道题在索引里只该有一个起手动作。 */
export function firstRowForKp(chapter: RouteChapter, kpId: string): RouteRow | undefined {
  return chapter.rows.find((row) => row.kpId === kpId);
}

export const ROUTE_BOOK_ORDER: BookId[] = ["linear", "prob"];
