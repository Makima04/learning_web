// 知识图谱 URL：408 与数学分路径，回上级不会串科目。
import type { SubjectId } from "@/lib/kg/types";

export const KG_SUBJECT_SLUGS = ["cs408", "math"] as const;
export type KgSubjectSlug = (typeof KG_SUBJECT_SLUGS)[number];

export function parseKgSubject(raw: string | undefined | null): KgSubjectSlug | null {
  if (raw === "math") return "math";
  if (raw === "cs408") return "cs408";
  return null;
}

export function kgSubjectSlug(subject: SubjectId | undefined | null): KgSubjectSlug {
  return subject === "math" ? "math" : "cs408";
}

export function kgMapPath(subject: SubjectId | undefined | null): string {
  return `/kg/${kgSubjectSlug(subject)}`;
}

export const REVIEW_ROOT = "/review-priority";

export function reviewPriorityPath(subject: SubjectId = "math"): string {
  return `${REVIEW_ROOT}?subject=${subject}`;
}

/** 题集显式携带返回位置，刷新、切换题型后仍回入口，不依赖浏览器历史长度。 */
export function practiceReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u0020]/.test(raw)) return null;
  const url = new URL(raw, "https://english-web.local");
  if (url.origin !== "https://english-web.local") return null;
  if (url.pathname !== REVIEW_ROOT && !url.pathname.startsWith(`${REVIEW_ROOT}/knowledge/`)
    && url.pathname !== "/kg" && !/^\/kg\/(math|cs408)(\/|$)/.test(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

export function practiceReturnLabel(path: string): string {
  const pathname = path.split(/[?#]/)[0];
  if (pathname.startsWith(`${REVIEW_ROOT}/knowledge/`)) return "返回知识复习";
  if (pathname === REVIEW_ROOT) return "返回复习性价比";
  if (pathname.includes("/kp/") || pathname.endsWith("/book")) return "返回题集";
  if (pathname.includes("/module/")) return "返回章节";
  return "返回知识图谱";
}

/** 知识复习沿用题型/排序上下文，不把旧考点或其他学科的筛选带进来。 */
export function knowledgeReviewPath(kpId: string, search = ""): string {
  const source = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of ["kind", "order"] as const) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `${REVIEW_ROOT}/knowledge/${encodeURIComponent(kpId)}${query ? `?${query}` : ""}`;
}

export function knowledgeCheckPath(kpId: string, search = ""): string {
  const path = knowledgeReviewPath(kpId, search);
  return `${path}${path.includes("?") ? "&" : "?"}check=1#knowledge-check`;
}

/** 从抽检进入单道真题，做完能回到原考点，避免无意进入整卷练习。 */
export function cs408SingleQuestionPath(year: number, n: number, returnTo: string): string {
  const params = new URLSearchParams({ q: String(n), single: "1" });
  const safe = practiceReturnPath(returnTo);
  if (safe) params.set("returnTo", safe);
  return `/kg/exams/practice/${year}?${params}`;
}

export function legacyMathReviewPath(search: string): string {
  const params = new URLSearchParams(search);
  params.set("subject", "math");
  return `${REVIEW_ROOT}?${params.toString()}`;
}

export function kgModulePath(
  bookId: string,
  moduleId: string,
  subject?: SubjectId | null
): string {
  return `/kg/${kgSubjectSlug(subject)}/module/${bookId}/${moduleId}`;
}

export function kgKpPath(
  kpId: string,
  opts?: { subject?: SubjectId | null; src?: string | null; returnTo?: string | null }
): string {
  const base = `/kg/${kgSubjectSlug(opts?.subject)}/kp/${kpId}`;
  const params = new URLSearchParams();
  if (opts?.src) params.set("src", opts.src);
  const returnTo = practiceReturnPath(opts?.returnTo);
  if (returnTo) params.set("returnTo", returnTo);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function kgBookDrillPath(
  bookId: string,
  moduleId: string,
  opts: {
    subject?: SubjectId | null;
    src: string;
    part: string;
    section: string;
    facet?: string | null;
    returnTo?: string | null;
  }
): string {
  const q = new URLSearchParams({
    src: opts.src,
    part: opts.part,
    section: opts.section,
  });
  if (opts.facet) q.set("facet", opts.facet);
  const returnTo = practiceReturnPath(opts.returnTo);
  if (returnTo) q.set("returnTo", returnTo);
  return `${kgModulePath(bookId, moduleId, opts.subject)}/book?${q.toString()}`;
}
