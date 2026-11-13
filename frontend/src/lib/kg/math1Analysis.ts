// 数一分题型分析：真实年份/分值统计 + 图谱掌握记录 + 教辅训练匹配。
import data from "@/data/kg/math1Questions.json";
import { findKp } from "@/data/kg";
import type { BookId, SubjectId, UserItemMark, UserKpState } from "./types";
import type { ExamAttempt } from "./examAttempts";
import type { WangdaoItem } from "./wangdao408";
import { buildCs408Diagnostic, type Cs408Diagnostic } from "./cs408Diagnostic";

export type Math1Book = "calc" | "linear" | "prob";
export type AnalysisOrder = "personal" | "frequency" | "recent";
export const MATH1_KINDS = ["big", "mcq", "fill"] as const;
export type Math1Kind = (typeof MATH1_KINDS)[number];
export const MATH1_KIND_NAMES: Record<Math1Kind, string> = { big: "大题", mcq: "选择题", fill: "填空题" };
export function parseMath1Kind(value: string | null): Math1Kind {
  return value === "mcq" || value === "fill" ? value : "big";
}
export const MATH1_ANALYSIS = data;
export const MATH1_BOOK_NAMES: Record<Math1Book, string> = {
  calc: "高等数学", linear: "线性代数", prob: "概率论与数理统计",
};
export const MATH1_ITEMS = data.items.map((q) => {
  if (q.kind !== "big" && q.kind !== "mcq" && q.kind !== "fill") throw new Error(`未知真题题型：${q.kind}`);
  return { ...q, kind: q.kind as Math1Kind };
});
export const MATH1_BIG_ITEMS = MATH1_ITEMS.filter((q) => q.kind === "big");
export type Math1Question = (typeof MATH1_ITEMS)[number];
export type ReviewQuestion = Omit<Math1Question, "book" | "reviewReason" | "questionTextSha256"> & {
  book: string;
  reviewReason?: string;
  questionTextSha256?: string;
};
export interface ReviewDataset {
  years: number[];
  recentStart: number;
  items: ReviewQuestion[];
  /** 已逐题复核的数据集才启用辅助考点考频。 */
  includeSecondary?: boolean;
}

export function reviewQuestionKpIds(question: Pick<ReviewQuestion, "kpId" | "secondaryKpIds">): string[] {
  return [...new Set([question.kpId, ...question.secondaryKpIds])];
}

// 图谱中未完整列出的数学先修：只作为补基础候选，不算作真题命中次数。
const PREREQUISITES: Record<string, string[]> = {
  "calc.m.ext": ["calc.m.partial"],
  "calc.m.line2": ["calc.i1.tech", "calc.m.dbl"],
  "calc.m.surf2": ["calc.m.dbl", "calc.m.partial"],
  "calc.m.surf": ["calc.m.dbl"],
  "calc.series.power": ["calc.i1.tech", "calc.series.num"],
  "calc.d1.mvt": ["calc.d1.rules"],
  "calc.d1.ineq": ["calc.d1.mvt"],
  "calc.ode.2nd": ["calc.d1.rules"],
  "prob.stat.est": ["prob.num.ex", "prob.rv.dist"],
  "prob.mv.joint": ["prob.rv.dist"],
};

export interface ReviewTopic {
  subject: SubjectId;
  kind: Math1Kind;
  kpId: string;
  name: string;
  book: BookId;
  questions: ReviewQuestion[];
  /** 分值和整题作答证据仅归主考点；questions 包含辅助考查依据。 */
  primaryQuestions: ReviewQuestion[];
  years: number[];
  recentYears: number[];
  totalPoints: number;
  /** 当年当前题型分值内的占比均值，避免不同年代的题量/分值偏差。 */
  pointShare: number;
  recentPointShare: number;
  cost: number;
  facets: string[];
  prerequisites: string[];
  status: "unknown" | "weak" | "learning" | "stable";
  confidence: number | null;
  confidenceSource: "kind" | "graph" | "unknown";
  sampleCount: number;
  due: boolean;
  priority: number;
  /** 408 区分抽检证据与完整考法覆盖，避免一题通过就判稳。 */
  diagnostic?: Cs408Diagnostic;
}
export type Math1Topic = ReviewTopic;

export function buildReviewTopics(
  dataset: ReviewDataset,
  states: Record<string, UserKpState>,
  marks: UserItemMark[] = [],
  catalog: WangdaoItem[] = [],
  now = Date.now(),
  kind: Math1Kind = "big",
  attempts: ExamAttempt[] = [],
): ReviewTopic[] {
  const questionsOfKind = dataset.items.filter((q) => q.kind === kind);
  const byKp = new Map<string, ReviewQuestion[]>();
  for (const q of questionsOfKind) {
    const ids = dataset.includeSecondary ? reviewQuestionKpIds(q) : [q.kpId];
    for (const id of ids) byKp.set(id, [...(byKp.get(id) ?? []), q]);
  }
  const totals = new Map(dataset.years.map((year) => [year,
    questionsOfKind.filter((q) => q.year === year).reduce((sum, q) => sum + q.points, 0),
  ]));
  const recentYears = dataset.years.filter((year) => year >= dataset.recentStart);
  const marksById = new Map(marks.map((m) => [m.itemId, m]));
  // 真题作答与旧真题自评均沿用现有账号文档，按题取最新证据，避免重复计样本。
  for (const a of attempts) {
    const mark = a.outcome === "correct" || a.outcome === "self_pass" ? "pass"
      : a.outcome === "wrong" || a.outcome === "self_fail" ? "fail"
      : a.outcome === "self_fuzzy" ? "fuzzy" : null;
    if (mark && (!marksById.has(a.itemId) || marksById.get(a.itemId)!.ts < a.ts)) {
      marksById.set(a.itemId, { itemId: a.itemId, mark, ts: a.ts });
    }
  }
  return [...byKp].map(([kpId, questions]) => {
    const primaryQuestions = questions.filter((q) => q.kpId === kpId);
    const found = findKp(kpId)!;
    const related = catalog.filter((q) => q.kind === kind && q.kp_ids.includes(kpId));
    // 综合题整题通过不等于其中每个辅助考点都已单独检验。
    const kindMarks = [...new Set([...related.map((q) => q.id), ...primaryQuestions.map((q) => q.id)])]
      .map((id) => marksById.get(id))
      .filter((m): m is UserItemMark => Boolean(m && m.mark !== "skip"))
      .sort((a, b) => b.ts - a.ts);
    const sampleCount = kindMarks.length;
    const st = states[kpId];
    const graphConfidence = st?.lastMark && st.lastMark !== "skip" ? Math.max(0, Math.min(1, st.confidence)) : null;
    const recentMarks = kindMarks.slice(0, 10);
    const sampleWeight = recentMarks.reduce((sum, _, i) => sum + 1 / (i + 1), 0);
    const practiceConfidence = sampleWeight ? recentMarks.reduce((sum, m, i) => sum
      + (m.mark === "pass" ? .9 : m.mark === "fuzzy" ? .4 : .1) / (i + 1), 0) / sampleWeight : null;
    // 有当前题型记录时优先使用它；图谱只作共同基础参考，不把大题表现冒充选择/填空表现。
    let confidence = practiceConfidence === null ? graphConfidence
      : graphConfidence === null ? practiceConfidence : .7 * practiceConfidence + .3 * graphConfidence;
    const confidenceSource: Math1Topic["confidenceSource"] = practiceConfidence !== null ? "kind"
      : graphConfidence !== null ? "graph" : "unknown";
    let status: Math1Topic["status"] = confidence === null ? "unknown"
      : (kindMarks[0]?.mark === "fail" || (confidenceSource === "graph" && st?.status === "weak") || confidence < .35) ? "weak"
      : confidence < .8 ? "learning" : "stable";
    const diagnostic = found.book.subject === "cs408"
      ? buildCs408Diagnostic({ kpId, kind, questions }, catalog, marks, attempts, now) : undefined;
    if (diagnostic) {
      // 百分比仅作排序启发式：抽检未完成有上限，基础自检不提供整类题型掌握证据。
      const cap = diagnostic.status === "stable" ? .85 : diagnostic.status === "preliminary" || diagnostic.status === "due" ? .7 : .55;
      if (diagnostic.status === "weak") confidence = Math.min(confidence ?? .25, .3);
      else if (confidence !== null || diagnostic.checksPassed) confidence = Math.min(confidence ?? .45, cap);
      status = diagnostic.status === "weak" ? "weak" : diagnostic.status === "stable" ? "stable"
        : confidence === null ? "unknown" : "learning";
    }
    const annualShare = (year: number) => primaryQuestions.filter((q) => q.year === year)
      .reduce((sum, q) => sum + q.points, 0) / (totals.get(year) || 1);
    const pointShare = dataset.years.reduce((sum, y) => sum + annualShare(y), 0) / dataset.years.length;
    const recentPointShare = recentYears.length ? recentYears.reduce((sum, y) => sum + annualShare(y), 0) / recentYears.length : 0;
    const cost = Math.max(...questions.map((q) => q.cost));
    const due = diagnostic ? diagnostic.status === "due" : confidence !== null && Boolean(st?.due && st.due <= now);
    // 成本为相对人工估计；未知保持中性，不直接当成完全不会。
    const gap = confidence === null ? .5 : Math.max(.08, 1 - confidence);
    const priority = (.4 * pointShare + .6 * recentPointShare) * gap
      * (status === "weak" ? 1.15 : 1) * (due ? 1.08 : 1) / (1 + .35 * (cost - 1));
    return {
      subject: found.book.subject, kind, kpId, name: found.kp.name, book: found.book.id,
      questions: [...questions].sort((a, b) => b.year - a.year || a.n - b.n),
      primaryQuestions: [...primaryQuestions].sort((a, b) => b.year - a.year || a.n - b.n),
      years: [...new Set(questions.map((q) => q.year))].sort((a, b) => a - b),
      recentYears: [...new Set(questions.filter((q) => q.year >= dataset.recentStart).map((q) => q.year))],
      totalPoints: primaryQuestions.reduce((sum, q) => sum + q.points, 0), pointShare, recentPointShare,
      // 辅助考查保留原题依据，但不把整道综合题的全部考法扩散成该考点的必练技巧。
      cost, facets: [...new Set(primaryQuestions.flatMap((q) => q.facets))], diagnostic,
      prerequisites: [...new Set([...(found.kp.prereqs ?? []), ...(PREREQUISITES[kpId] ?? [])])],
      status, confidence, confidenceSource, sampleCount, due, priority,
    };
  });
}

export function buildMath1Topics(
  states: Record<string, UserKpState>, marks: UserItemMark[] = [], catalog: WangdaoItem[] = [],
  now = Date.now(), kind: Math1Kind = "big",
): ReviewTopic[] {
  return buildReviewTopics({ ...data, items: MATH1_ITEMS }, states, marks, catalog, now, kind);
}

export function sortReviewTopics(topics: ReviewTopic[], order: AnalysisOrder): ReviewTopic[] {
  return [...topics].sort((a, b) => {
    const delta = order === "personal" ? b.priority - a.priority
      : order === "frequency" ? b.years.length - a.years.length
      : b.recentYears.length - a.recentYears.length;
    return delta || b.pointShare - a.pointShare || a.kpId.localeCompare(b.kpId);
  });
}
export const sortMath1Topics = sortReviewTopics;

export interface Math1TrainingMatch {
  item: WangdaoItem;
  match: "foundation" | "method" | "topic";
  review: boolean;
}

export function matchReviewTraining(
  topic: ReviewTopic,
  catalog: WangdaoItem[],
  marks: UserItemMark[],
  states: Record<string, UserKpState>,
  dueIds: ReadonlySet<string> = new Set(),
  waitingIds: ReadonlySet<string> = new Set(),
  expand = false,
): Math1TrainingMatch[] {
  const markMap = new Map(marks.map((m) => [m.itemId, m.mark]));
  const needsFoundation = new Set(topic.prerequisites.filter((kpId) => {
    const state = states[kpId];
    return !state || !state.lastMark || state.confidence < .55;
  }));
  const candidates: Math1TrainingMatch[] = [];
  for (const item of catalog) {
    if (topic.subject === "math" ? item.source !== "lilin880" && item.source !== "zhangyu1000"
      : Boolean(item.source && item.source !== "wangdao")) continue;
    // 包括补基础也保持当前题型，不在选择/填空页静默推荐大题。
    if (item.kind !== topic.kind) continue;
    if (!expand && item.diagnostic_eligible === false) continue;
    if (waitingIds.has(item.id) && !dueIds.has(item.id)) continue;
    if (markMap.get(item.id) === "pass" && !dueIds.has(item.id)) continue;
    const sameTopic = item.kp_ids.includes(topic.kpId);
    const foundation = !sameTopic && (topic.subject === "cs408" || item.part === "base") && item.kp_ids.some((id) => needsFoundation.has(id));
    if (!sameTopic && !foundation) continue;
    // 无细标签时只声称同考点。
    const method = sameTopic && (item.facets ?? []).some((f) => topic.facets.includes(f));
    candidates.push({ item, match: foundation ? "foundation" : method ? "method" : "topic", review: dueIds.has(item.id) });
  }
  const weight = (m: Math1TrainingMatch) => (m.review ? 12 : 0)
    + (markMap.get(m.item.id) === "fail" ? 6 : markMap.get(m.item.id) === "fuzzy" ? 4 : 0)
    + (m.match === "method" ? 3 : 0)
    + (m.item.part === (topic.status === "weak" || topic.status === "unknown" ? "base" : "hard") ? 2 : 0);
  candidates.sort((a, b) => weight(b) - weight(a) || (a.item.ord ?? a.item.qno) - (b.item.ord ?? b.item.qno)
    || a.item.id.localeCompare(b.item.id));
  const result: Math1TrainingMatch[] = [];
  for (const source of topic.subject === "math" ? ["lilin880", "zhangyu1000"] : ["wangdao"]) {
    const pool = candidates.filter((c) => (c.item.source || "wangdao") === source);
    const foundation = pool.filter((c) => c.match === "foundation");
    const target = pool.filter((c) => c.match !== "foundation");
    result.push(...foundation.slice(0, 1), ...(expand ? target : target.slice(0, 2)));
    if (expand) result.push(...foundation.slice(1));
  }
  return result;
}
export const matchMath1Training = matchReviewTraining;

export function math1PdfHref(question: ReviewQuestion, answer = false): string {
  const path = answer ? `answers/${question.year}-answer.pdf` : `${question.year}.pdf`;
  return `/math/exams/math1/${path}#page=${answer ? question.answerPage : question.paperPage}`;
}
