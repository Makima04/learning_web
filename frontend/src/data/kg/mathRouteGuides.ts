// 章级解题路线的注册表：只收线性代数与概率论，高等数学按同一结构后续加入。
import type { RouteChapter } from "@/lib/kg/mathRoute";
import { MATH_ROUTE_LINEAR } from "./mathRouteLinear";
import { MATH_ROUTE_PROB } from "./mathRouteProb";

/** key 与 MATH_BOOKS 的 book id 对应，顺序即页面显示顺序。 */
export const MATH_ROUTE_GUIDES: Readonly<Record<string, readonly RouteChapter[]>> = {
  linear: MATH_ROUTE_LINEAR,
  prob: MATH_ROUTE_PROB,
};

export const MATH_ROUTE_CHAPTERS: readonly RouteChapter[] = Object.values(MATH_ROUTE_GUIDES).flat();

export function routeChapterById(moduleId: string): RouteChapter | undefined {
  return MATH_ROUTE_CHAPTERS.find((chapter) => chapter.moduleId === moduleId);
}

/** 考点 → 所属章路线；同章内多行时取第一行作为起手式。 */
export function routeChapterForKp(kpId: string): RouteChapter | undefined {
  return MATH_ROUTE_CHAPTERS.find((chapter) => chapter.rows.some((row) => row.kpId === kpId));
}
