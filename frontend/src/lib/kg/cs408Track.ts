// 数据结构大题分「算法题 / 应用题」两轨：
// 算法题 = ds.algo.design 主考的设计题，按设计方法细分考法；
// 应用题 = 各结构知识点主考的计算/模拟/构造题，按知识点细分。
// 其余 408 科目暂不分轨。轨道只切换考点列表与钻取分组，证据仍复用账号同步。
import type { BookId, SubjectId } from "./types";
import type { Math1Kind, ReviewTopic } from "./math1Analysis";
import type { WangdaoItem } from "./wangdao408";

export const ALGO_DESIGN_KP = "ds.algo.design";
export type Cs408Track = "algo" | "apply";
export const CS408_TRACK_NAMES: Record<Cs408Track, string> = { algo: "算法题", apply: "应用题" };

export function parseCs408Track(value: string | null): Cs408Track {
  return value === "apply" ? "apply" : "algo";
}

export function cs408TrackApplicable(subject: SubjectId, book: BookId, kind: Math1Kind): boolean {
  return subject === "cs408" && book === "ds" && kind === "big";
}

/** 应用题轨需要补出的结构考点：题库有应用题、但真题未必主考过（如 B 树、外排）。 */
export function cs408ApplyExtraKpIds(catalog: WangdaoItem[], kind: Math1Kind): string[] {
  const set = new Set<string>();
  for (const q of catalog) {
    if (q.book !== "ds" || q.kind !== kind) continue;
    if (q.source && q.source !== "wangdao") continue;
    const kp = q.kp_ids?.[0];
    if (kp && kp !== ALGO_DESIGN_KP) set.add(kp);
  }
  return [...set];
}

/** 某科题库有大题、但真题未必主考过的知识点（如磁盘调度、死锁、HTTP、拥塞控制），补进考点列表。 */
export function cs408ExtraKpIds(catalog: WangdaoItem[], book: BookId, kind: Math1Kind): string[] {
  const set = new Set<string>();
  for (const q of catalog) {
    if (q.book !== book || q.kind !== kind) continue;
    if (q.source && q.source !== "wangdao") continue;
    const kp = q.kp_ids?.[0];
    if (kp) set.add(kp);
  }
  return [...set];
}

export function filterCs408TrackTopics(topics: ReviewTopic[], track: Cs408Track): ReviewTopic[] {
  return track === "algo"
    ? topics.filter((t) => t.kpId === ALGO_DESIGN_KP)
    : topics.filter((t) => t.kpId !== ALGO_DESIGN_KP);
}