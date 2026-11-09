// 408：按题库小节抽检，缺题时记录闭卷基础检验；不把抽样通过冒充全部考法覆盖。
import { dayKey, dayKeyStartMs, shiftDayKey } from "@/lib/day";
import type { ExamAttempt } from "./examAttempts";
import type { ReviewTopic } from "./math1Analysis";
import { buildTechniquePlan, type TechniqueStatus } from "./techniqueTraining";
import type { MarkLevel, UserItemMark } from "./types";
import type { WangdaoItem } from "./wangdao408";

export const CS408_CHECK_PARTS = ["principle", "boundary", "application"] as const;
export type Cs408CheckPart = (typeof CS408_CHECK_PARTS)[number];
export const CS408_CHECK_LABELS: Record<Cs408CheckPart, string> = {
  principle: "讲清原理", boundary: "辨清边界", application: "独立推演",
};
export const CS408_DIAGNOSTIC_STATUS: Record<TechniqueStatus, string> = {
  unseen: "待验证", learning: "检验中", weak: "需补强", preliminary: "初步掌握", due: "待复测", stable: "抽检较稳",
};

export function cs408CheckId(kpId: string, part: Cs408CheckPart): string {
  return `cs408-check-v1:${kpId}:${part}`;
}

export function cs408CheckProgress(kpId: string, marks: UserItemMark[], now = Date.now()) {
  return CS408_CHECK_PARTS.map((part) => {
    const mark = marks.find((m) => m.itemId === cs408CheckId(kpId, part));
    let status: TechniqueStatus = "unseen";
    let reviewOn: string | null = null;
    if (mark?.mark === "fail" || mark?.mark === "fuzzy") status = "weak";
    if (mark?.mark === "pass") {
      const first = mark.passStartedAt ?? mark.ts;
      const firstReview = shiftDayKey(dayKey(first), 3);
      const verified = dayKey(mark.ts) >= firstReview;
      reviewOn = verified ? shiftDayKey(dayKey(mark.ts), 7) : firstReview;
      status = now >= dayKeyStartMs(reviewOn) ? "due" : verified ? "stable" : "preliminary";
    }
    return { part, mark: mark?.mark, status, reviewOn };
  });
}

/** 真题逐次作答与旧自评合并；保留失败后的通过日，避免新记录抹掉复测依据。 */
export function cs408Evidence(marks: UserItemMark[], attempts: ExamAttempt[]): UserItemMark[] {
  const map = new Map(marks.map((m) => [m.itemId, { ...m }]));
  const outcome = (a: ExamAttempt): MarkLevel | null => a.outcome === "correct" || a.outcome === "self_pass" ? "pass"
    : a.outcome === "wrong" || a.outcome === "self_fail" ? "fail" : a.outcome === "self_fuzzy" ? "fuzzy" : null;
  for (const a of [...attempts].sort((a, b) => a.ts - b.ts)) {
    const mark = outcome(a);
    if (!mark) continue;
    const prev = map.get(a.itemId);
    const latest = !prev || a.ts >= prev.ts ? { itemId: a.itemId, mark, ts: a.ts } : prev;
    const weakAt = Math.max(prev?.lastWeakAt ?? 0,
      prev?.mark === "fail" || prev?.mark === "fuzzy" ? prev.ts : 0,
      mark === "fail" || mark === "fuzzy" ? a.ts : 0);
    const passes = [...new Set([
      ...(prev?.mark === "pass" ? [prev.passStartedAt ?? prev.ts, prev.ts, ...(prev.passTimes ?? [])] : []),
      ...(mark === "pass" ? [a.ts] : []),
    ])].filter((ts) => ts >= weakAt).sort((a, b) => a - b);
    map.set(a.itemId, { ...latest, lastWeakAt: weakAt || undefined,
      passStartedAt: latest.mark === "pass" ? passes[0] : undefined,
      passTimes: latest.mark === "pass" ? passes : undefined });
  }
  return [...map.values()];
}

export type Cs408Sample =
  | { source: "wangdao"; item: WangdaoItem }
  | { source: "exam"; question: ReviewTopic["questions"][number] };
export interface Cs408Diagnostic {
  status: TechniqueStatus;
  label: string;
  groups: { id: string; label: string; status: TechniqueStatus; passed: number; shortage: boolean; reviewOn: string | null }[];
  completed: number;
  checksPassed: number;
  checksDue: number;
  recommendations: Cs408Sample[];
  remaining: number;
  canStop: boolean;
  reviewOn: string | null;
  /** 题目数量只反映证据量，不等同于考法数量。 */
  sampleCount: number;
  basis: "methods" | "sections";
}

export function buildCs408Diagnostic(
  topic: Pick<ReviewTopic, "kpId" | "kind" | "questions">,
  catalog: WangdaoItem[], marks: UserItemMark[], attempts: ExamAttempt[] = [],
  now = Date.now(), dueIds: ReadonlySet<string> = new Set(), waitingIds: ReadonlySet<string> = new Set(),
): Cs408Diagnostic {
  const samples = new Map<string, Cs408Sample>();
  const labels = new Map<string, string>();
  const pool: WangdaoItem[] = [];
  let hasSections = false;
  for (const item of catalog) {
    if (item.kind !== topic.kind || !item.kp_ids.includes(topic.kpId) || item.diagnostic_eligible === false
      || (item.source && item.source !== "wangdao")) continue;
    // 逐题核对的考法只用于其所属主考点；综合题的辅助标签不扩大必练量。
    const facets = item.facets?.filter((f) => f.startsWith(`${topic.kpId}::`)) ?? [];
    if (facets.length && item.kp_ids[0] === topic.kpId) {
      for (const facet of facets) labels.set(facet, facet.split("::")[1]);
      samples.set(item.id, { source: "wangdao", item });
      pool.push({ ...item, facets });
      continue;
    }
    if (item.kp_ids[0] !== topic.kpId) continue;
    // 未核对细考法的题（如选择题）只按原书小节分组，不根据题干猜标签。
    hasSections = true;
    const group = `section:${item.book}:${item.section}`;
    labels.set(group, item.section_name || `王道第 ${item.section} 节`);
    samples.set(item.id, { source: "wangdao", item });
    pool.push({ ...item, facets: [group], primaryFacet: group });
  }
  for (const question of topic.questions) {
    labels.set("exam", "同考点真题抽检");
    samples.set(question.id, { source: "exam", question });
    // 仅供覆盖算法使用，展示和跳转仍使用上面的真实来源。
    pool.push({ id: question.id, source: "wangdao", book: question.book, kind: question.kind,
      section: String(question.year), qno: question.n, kp_ids: [topic.kpId], facets: ["exam"], primaryFacet: "exam" });
  }
  const evidence = cs408Evidence(marks, attempts);
  const plan = buildTechniquePlan({ ...topic, subject: "cs408", facets: [...labels.keys()] },
    pool, evidence, dueIds, waitingIds, now);
  const byId = new Map(evidence.map((m) => [m.itemId, m]));
  // 首轮三天后复测，通过后七天再抽检，避免一次复测后永久退出推荐。
  const groups = plan.groups.map((g) => {
    if (g.status !== "stable") return { ...g, label: labels.get(g.id)! };
    const primary = pool.filter((q) => q.facets?.includes(g.id) && q.kp_ids[0] === topic.kpId);
    const latest = Math.max(...primary.map((q) => byId.get(q.id)?.mark === "pass" ? byId.get(q.id)!.ts : 0));
    const reviewOn = shiftDayKey(dayKey(latest), 7);
    if (now < dayKeyStartMs(reviewOn)) return { ...g, reviewOn, label: labels.get(g.id)! };
    const fresh = primary.filter((q) => !waitingIds.has(q.id) || dueIds.has(q.id))
      .sort((a, b) => Number(byId.has(a.id)) - Number(byId.has(b.id)) || a.qno - b.qno);
    return { ...g, label: labels.get(g.id)!, status: "due" as const, reviewOn,
      recommendations: fresh.slice(0, 1).map((item) => ({ item, techniqueIds: [g.id], reason: "verify" as const })) };
  });
  const recommended = new Map<string, Cs408Sample>();
  const weight = (status: TechniqueStatus) => status === "weak" ? 0 : status === "due" ? 1 : 2;
  const ordered = [...groups].sort((a, b) => weight(a.status) - weight(b.status)
    || Number(a.id === "exam") - Number(b.id === "exam"));
  // 同一优先级先各取一题，再取变式；已有明确王道考法时，真题留作后续综合抽检。
  for (let at = 0; at < 2; at++) {
    for (const g of ordered) {
      const r = g.recommendations[at];
      if (r) recommended.set(r.item.id, samples.get(r.item.id)!);
    }
  }
  const checks = cs408CheckProgress(topic.kpId, marks, now);
  const passed = (s: TechniqueStatus) => s === "preliminary" || s === "due" || s === "stable";
  const completed = groups.filter((g) => passed(g.status)).length;
  const checksPassed = checks.filter((c) => passed(c.status)).length;
  const checksDue = checks.filter((c) => c.status === "due").length;
  const allSampled = groups.length > 0 && completed === groups.length;
  const weak = groups.some((g) => g.status === "weak") || checks.some((c) => c.status === "weak");
  const status: TechniqueStatus = weak ? "weak" : checksDue ? "due" : allSampled
    ? groups.some((g) => g.status === "due") ? "due" : groups.every((g) => g.status === "stable") ? "stable" : "preliminary"
    : groups.some((g) => g.tested || g.passed) || checksPassed ? "learning" : "unseen";
  const reviewOn = [...groups.filter((g) => passed(g.status)), ...checks.filter((c) => passed(c.status))]
    .flatMap((g) => g.reviewOn ? [g.reviewOn] : []).sort()[0] ?? null;
  return { status, label: status === "due" && checksDue ? "基础待复测" : status === "learning" && checksPassed === 3 ? "基础已检验" : CS408_DIAGNOSTIC_STATUS[status],
    groups, completed, checksPassed, checksDue, recommendations: [...recommended.values()].slice(0, 3), remaining: recommended.size,
    canStop: allSampled && !weak && status !== "due", reviewOn,
    sampleCount: pool.filter((q) => { const m = byId.get(q.id); return m && m.mark !== "skip"; }).length,
    basis: hasSections ? "sections" : "methods" };
}
