// 408 全科真题分类：知识图谱模块 = 大类，主考点 = 小类。
// os-mem 沿用 osMemTopics 的细类作为小类（比四级考点更贴题型）。
import { CS408_BOOKS, findKp, findModule } from "@/data/kg";
import { CS408_EXAM_REFS, type Cs408ExamRef } from "@/data/kg/examClassify";
import {
  OS_MEM_TOPICS,
  osMemExamLookup,
  osMemTopic,
  type OsMemTopic,
} from "@/data/kg/osMemTopics";
import type { BookId } from "@/lib/kg/types";

export interface ExamGroup {
  id: string;
  bookId: BookId;
  bookName: string;
  name: string;
  blurb: string;
}

export interface ExamTopic {
  id: string;
  groupId: string;
  name: string;
  /** 回写掌握度 / 图解用的图谱考点 */
  kpId: string;
}

export interface ExamClass {
  ref: Cs408ExamRef;
  group: ExamGroup;
  topic: ExamTopic;
}

export const EXAM_GROUPS: ExamGroup[] = CS408_BOOKS.flatMap((book) =>
  book.modules.map((mod) => ({
    id: mod.id,
    bookId: book.id as BookId,
    bookName: book.name,
    name: mod.name,
    blurb:
      mod.kps.slice(0, 3).map((k) => k.name).join("、") +
      (mod.kps.length > 3 ? "…" : ""),
  }))
);

function topicFromKp(kpId: string, groupId: string, name: string): ExamTopic {
  return { id: kpId, groupId, name, kpId };
}

function topicFromOsMem(t: OsMemTopic): ExamTopic {
  return { id: t.id, groupId: "os-mem", name: t.name, kpId: t.kpId };
}

const GROUP_MAP = new Map(EXAM_GROUPS.map((g) => [g.id, g]));
const REF_MAP = new Map(CS408_EXAM_REFS.map((e) => [`${e.year}-${e.n}`, e]));

const TOPIC_MAP = new Map<string, ExamTopic>();
for (const book of CS408_BOOKS) {
  for (const mod of book.modules) {
    for (const kp of mod.kps) {
      TOPIC_MAP.set(kp.id, topicFromKp(kp.id, mod.id, kp.name));
    }
  }
}
for (const t of OS_MEM_TOPICS) {
  TOPIC_MAP.set(t.id, topicFromOsMem(t));
}

export function examKey(year: number, n: number): string {
  return `${year}-${n}`;
}

export function parseExamKey(raw: string | null | undefined): { year: number; n: number } | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return { year: Number(m[1]), n: Number(m[2]) };
}

export function examGroup(id: string): ExamGroup | undefined {
  return GROUP_MAP.get(id);
}

export function examTopic(id: string): ExamTopic | undefined {
  return TOPIC_MAP.get(id);
}

export function examRefLookup(year: number, n: number): Cs408ExamRef | undefined {
  return REF_MAP.get(examKey(year, n));
}

function classifyRef(ref: Cs408ExamRef): ExamClass | null {
  const os = osMemExamLookup(ref.year, ref.n);
  if (os) {
    const t = osMemTopic(os.topic);
    const group = GROUP_MAP.get("os-mem");
    if (t && group) {
      return { ref, group, topic: topicFromOsMem(t) };
    }
  }
  const found = findKp(ref.kpId);
  const group = found ? GROUP_MAP.get(found.module.id) : undefined;
  if (!found || !group) return null;
  return {
    ref,
    group,
    topic: topicFromKp(found.kp.id, found.module.id, found.kp.name),
  };
}

const CLASS_MAP = new Map<string, ExamClass>();
for (const ref of CS408_EXAM_REFS) {
  const c = classifyRef(ref);
  if (c) CLASS_MAP.set(examKey(ref.year, ref.n), c);
}

export function examClassOf(year: number, n: number): ExamClass | null {
  return CLASS_MAP.get(examKey(year, n)) ?? null;
}

export function examExamsInOrder(groupId?: string | "all", topicId?: string): Cs408ExamRef[] {
  let list = CS408_EXAM_REFS;
  if (groupId && groupId !== "all") {
    list = list.filter((e) => CLASS_MAP.get(examKey(e.year, e.n))?.group.id === groupId);
  }
  if (topicId) {
    list = list.filter((e) => CLASS_MAP.get(examKey(e.year, e.n))?.topic.id === topicId);
  }
  return [...list].sort((a, b) => a.year - b.year || a.n - b.n);
}

export function examTopicsForGroup(groupId: string): ExamTopic[] {
  const used = new Set(
    examExamsInOrder(groupId)
      .map((e) => examClassOf(e.year, e.n)?.topic.id)
      .filter((id): id is string => Boolean(id))
  );
  if (used.size === 0) return [];
  if (groupId === "os-mem") {
    return OS_MEM_TOPICS.map(topicFromOsMem).filter((t) => used.has(t.id));
  }
  const found = findModule(groupId);
  if (found) {
    return found.module.kps
      .map((kp) => topicFromKp(kp.id, groupId, kp.name))
      .filter((t) => used.has(t.id));
  }
  return [...used].map((id) => TOPIC_MAP.get(id)).filter((t): t is ExamTopic => Boolean(t));
}

export function examCountForGroup(groupId: string): number {
  return examExamsInOrder(groupId).length;
}

export function examYears(): number[] {
  return [...new Set(CS408_EXAM_REFS.map((e) => e.year))].sort((a, b) => a - b);
}

export function examGroupsByBook(): { bookId: BookId; bookName: string; groups: ExamGroup[] }[] {
  const out: { bookId: BookId; bookName: string; groups: ExamGroup[] }[] = [];
  for (const g of EXAM_GROUPS) {
    const last = out[out.length - 1];
    if (!last || last.bookId !== g.bookId) {
      out.push({ bookId: g.bookId, bookName: g.bookName, groups: [g] });
    } else {
      last.groups.push(g);
    }
  }
  return out;
}

export function examSetPath(opts?: {
  group?: string | "all";
  mode?: "proof" | "browse";
  q?: string;
  topic?: string;
}): string {
  const group = opts?.group ?? "";
  const base = group ? `/kg/exams/set/${group}` : "/kg/exams/set";
  const q = new URLSearchParams();
  if (opts?.mode === "proof") q.set("mode", "proof");
  if (opts?.q) q.set("q", opts.q);
  if (opts?.topic) q.set("topic", opts.topic);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}
