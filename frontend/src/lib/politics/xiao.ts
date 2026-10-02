// 肖秀荣 1000 题：考点卡片 → 对应选择。静态 JSON，进度走 politics store。
import { addDays } from "@/lib/journal";
import { dayKey } from "@/lib/day";

export type XiaoSubject = "marx" | "mao" | "xi" | "history" | "moral";
export type XiaoKind = "single" | "multi";
export type XiaoMarkLevel = "pass" | "fuzzy" | "fail";
export type XiaoReviewStep = 0 | 1 | 3 | 7 | 14;

const REVIEW_STEPS: XiaoReviewStep[] = [1, 3, 7, 14];

export function kpMarkId(kpId: string): string {
  return `kp:${kpId}`;
}

/** 按主动回忆结果安排复习：不会明天重来，模糊隔天，会逐步拉长。 */
export function scheduleXiaoReview(
  mark: XiaoMarkLevel,
  previousStep: XiaoReviewStep = 0,
  today: string = dayKey()
): { step: XiaoReviewStep; nextReviewOn: string } {
  if (mark === "fail") return { step: 0, nextReviewOn: addDays(today, 1) };
  if (mark === "fuzzy") return { step: 1, nextReviewOn: addDays(today, 1) };
  const index = Math.max(0, REVIEW_STEPS.indexOf(previousStep));
  const step = REVIEW_STEPS[Math.min(index + (previousStep ? 1 : 0), REVIEW_STEPS.length - 1)];
  return { step, nextReviewOn: addDays(today, step) };
}

export function isXiaoDue(nextReviewOn: string | undefined, today: string = dayKey()): boolean {
  return Boolean(nextReviewOn && nextReviewOn <= today);
}

export const XIAO_SUBJECTS: { id: XiaoSubject; label: string; hint: string }[] = [
  { id: "marx", label: "马原", hint: "理解题，先把概念钉死再做多选" },
  { id: "mao", label: "毛中特", hint: "革命道路、改造、探索，记忆+对比" },
  { id: "xi", label: "新思想", hint: "中国式现代化、新质生产力、最新提法" },
  { id: "history", label: "史纲", hint: "会议、文件、阶段意义，易混对比" },
  { id: "moral", label: "思法", hint: "人生价值、道德、法治运行" },
];

export const XIAO_SUBJECT_LABEL: Record<XiaoSubject, string> = {
  marx: "马原",
  mao: "毛中特",
  xi: "新思想",
  history: "史纲",
  moral: "思法",
};

export interface XiaoQuestion {
  id: string;
  source: "xiao1000";
  subject: XiaoSubject;
  kind: XiaoKind;
  chapter: string;
  chapter_no: number | null;
  qno: number;
  stem: string;
  options: Record<string, string>;
  pdf_page?: number;
  kp_ids: string[];
  answer?: string;
  source_ref?: string;
  explain?: string;
}

export interface XiaoConfusion {
  wrong: string;
  right: string;
}

export interface XiaoExplainSection {
  title: string;
  body: string;
  /** 一句人话 */
  simple?: string;
}

export interface XiaoCheck {
  prompt: string;
  /** true = 对 */
  answer: boolean;
  why?: string;
}

export interface XiaoKp {
  id: string;
  subject: XiaoSubject;
  chapter: string;
  chapter_no: number | null;
  name: string;
  summary: string;
  bullets: string[];
  confusions: XiaoConfusion[];
  /** 第二层：上滑展开的解释。没有则只显示速记。 */
  explain?: XiaoExplainSection[];
  /** 解释后的判断，用来确认有没有分清 */
  checks?: XiaoCheck[];
  /** 脚本按章兜底，等分科卡片替换 */
  provisional?: boolean;
}

export function hasKpExplain(kp: Pick<XiaoKp, "explain">): boolean {
  return (kp.explain?.length ?? 0) > 0;
}

export interface XiaoMark {
  itemId: string;
  mark: XiaoMarkLevel;
  picked: string;
  at: number;
}

export interface XiaoChapterSummary {
  chapter_no: number | null;
  chapter: string;
  questionCount: number;
  kpCount: number;
}

export interface XiaoCatalogSubject {
  id: XiaoSubject;
  label: string;
  hint: string;
  questionCount: number;
  kpCount: number;
  chapters: XiaoChapterSummary[];
}

export interface XiaoCatalog {
  version: 1;
  subjects: XiaoCatalogSubject[];
}

export interface XiaoPack {
  questions: XiaoQuestion[];
  kps: XiaoKp[];
}

let catalogCache: XiaoCatalog | null = null;
let catalogInflight: Promise<XiaoCatalog> | null = null;
const subjectCache = new Map<XiaoSubject, XiaoPack>();
const subjectInflight = new Map<XiaoSubject, Promise<XiaoPack>>();

function isSubject(s: string): s is XiaoSubject {
  return s === "marx" || s === "mao" || s === "xi" || s === "history" || s === "moral";
}

export function parseXiaoSubject(raw: string | undefined): XiaoSubject | null {
  if (!raw) return null;
  return isSubject(raw) ? raw : null;
}

export function normalizeXiaoAnswer(raw: string | undefined): string {
  if (!raw) return "";
  return [...raw.toUpperCase()].filter((ch) => "ABCD".includes(ch)).sort().join("");
}

export function optionKeys(q: XiaoQuestion): string[] {
  return ["A", "B", "C", "D"].filter((k) => q.options[k]);
}

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${label}失败 (${response.status})`);
  return response.json() as Promise<T>;
}

export async function loadXiaoCatalog(): Promise<XiaoCatalog> {
  if (catalogCache) return catalogCache;
  if (catalogInflight) return catalogInflight;
  catalogInflight = fetchJson<XiaoCatalog>("/politics/xiao1000.index.json", "加载肖 1000 目录")
    .then((catalog) => {
      catalogCache = catalog;
      catalogInflight = null;
      return catalog;
    })
    .catch((error) => {
      catalogInflight = null;
      throw error;
    });
  return catalogInflight;
}

export async function loadXiaoSubject(subject: XiaoSubject): Promise<XiaoPack> {
  const cached = subjectCache.get(subject);
  if (cached) return cached;
  const pending = subjectInflight.get(subject);
  if (pending) return pending;
  const request = fetchJson<XiaoPack>(`/politics/xiao1000/${subject}.json`, `加载${XIAO_SUBJECT_LABEL[subject]}题库`)
    .then((pack) => {
      subjectCache.set(subject, pack);
      subjectInflight.delete(subject);
      return pack;
    })
    .catch((error) => {
      subjectInflight.delete(subject);
      throw error;
    });
  subjectInflight.set(subject, request);
  return request;
}

export function kpsForSubject(kps: XiaoKp[], subject: XiaoSubject): XiaoKp[] {
  return kps
    .filter((k) => k.subject === subject)
    .sort((a, b) => (a.chapter_no ?? 99) - (b.chapter_no ?? 99) || a.id.localeCompare(b.id));
}

export function questionsForKp(questions: XiaoQuestion[], kpId: string): XiaoQuestion[] {
  return questions.filter((q) => (q.kp_ids || []).includes(kpId));
}

export function questionsForSubject(questions: XiaoQuestion[], subject: XiaoSubject): XiaoQuestion[] {
  return questions.filter((q) => q.subject === subject);
}

export function chapterKey(chapterNo: number | null, chapter: string): string {
  return `${chapterNo ?? "unknown"}:${chapter}`;
}

export function chaptersForSubject(
  kps: XiaoKp[],
  questions: XiaoQuestion[]
): { chapter_no: number | null; chapter: string; kps: XiaoKp[]; questionCount: number }[] {
  const questionsByChapter = new Map<string, number>();
  for (const question of questions) {
    const key = chapterKey(question.chapter_no, question.chapter);
    questionsByChapter.set(key, (questionsByChapter.get(key) ?? 0) + 1);
  }

  const groups = new Map<string, { chapter_no: number | null; chapter: string; kps: XiaoKp[]; questionCount: number }>();
  for (const kp of kps) {
    const key = chapterKey(kp.chapter_no, kp.chapter);
    const group = groups.get(key) ?? {
      chapter_no: kp.chapter_no,
      chapter: kp.chapter,
      kps: [],
      questionCount: questionsByChapter.get(key) ?? 0,
    };
    group.kps.push(kp);
    groups.set(key, group);
  }

  return [...groups.values()].sort(
    (a, b) => (a.chapter_no ?? 99) - (b.chapter_no ?? 99) || a.chapter.localeCompare(b.chapter)
  );
}

export function findKp(kps: XiaoKp[], id: string): XiaoKp | undefined {
  return kps.find((k) => k.id === id);
}

export function xiaoPath(subject?: XiaoSubject, kpId?: string): string {
  if (subject && kpId) return `/politics/xiao/${subject}/${encodeURIComponent(kpId)}`;
  if (subject) return `/politics/xiao/${subject}`;
  return "/politics/xiao";
}
