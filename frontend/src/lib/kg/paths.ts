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

export function kgModulePath(
  bookId: string,
  moduleId: string,
  subject?: SubjectId | null
): string {
  return `/kg/${kgSubjectSlug(subject)}/module/${bookId}/${moduleId}`;
}

export function kgKpPath(
  kpId: string,
  opts?: { subject?: SubjectId | null; src?: string | null }
): string {
  const base = `/kg/${kgSubjectSlug(opts?.subject)}/kp/${kpId}`;
  if (opts?.src) return `${base}?src=${encodeURIComponent(opts.src)}`;
  return base;
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
  }
): string {
  const q = new URLSearchParams({
    src: opts.src,
    part: opts.part,
    section: opts.section,
  });
  if (opts.facet) q.set("facet", opts.facet);
  return `${kgModulePath(bookId, moduleId, opts.subject)}/book?${q.toString()}`;
}
