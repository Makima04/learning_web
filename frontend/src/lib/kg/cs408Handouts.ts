import { CS408_BOOKS } from "@/data/kg/cs408";
import {
  DS_BIG_CHAPTERS,
  dsBigChapterForScene,
  dsBigWangdaoMeta,
  resolveDsBigScene,
  type DsBigGroup,
} from "@/data/kg/cs408DsBigTaxonomy";
import { CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import {
  examItemId,
  loadCs408ExamIndex,
  loadCs408ExamPapers,
  primaryKpId,
  secondaryKpIds,
  type ExamItem,
  type ExamKind,
  type ExamPaper,
} from "@/lib/kg/exams408";
import { syncExamAttemptToJournal } from "@/lib/kg/examJournal";
import { type BookId, type KgModule } from "@/lib/kg/types";
import { applyWangdaoPractice } from "@/lib/kg/wangdaoPractice";
import { loadWangdao408, type WangdaoItem } from "@/lib/kg/wangdao408";
import { useKgProgress } from "@/stores/kgProgress";

export type Cs408HandoutQuestion =
  | { source: "exam"; id: string; item: ExamItem; year: number; edition?: string }
  | { source: "wangdao"; id: string; item: WangdaoItem };
export type Cs408HandoutPriority = Cs408HandoutQuestion["source"];
export type Cs408HandoutMark = "pass" | "fuzzy" | "fail";

export interface Cs408HandoutChapter extends KgModule {
  bookId: BookId;
  bookName: string;
  group?: DsBigGroup;
}

export const CS408_HANDOUT_CHAPTERS: Cs408HandoutChapter[] = CS408_BOOKS.flatMap(book =>
  book.modules.map(module => ({ ...module, bookId: book.id, bookName: book.name }))
);

export function chaptersForBookKind(bookId: BookId, kind: ExamKind): readonly Cs408HandoutChapter[] {
  if (bookId === "ds" && kind === "big") return DS_BIG_CHAPTERS;
  return CS408_HANDOUT_CHAPTERS.filter(chapter => chapter.bookId === bookId);
}

export function findCs408HandoutChapter(chapterId: string | undefined): Cs408HandoutChapter | undefined {
  if (!chapterId) return undefined;
  return DS_BIG_CHAPTERS.find(chapter => chapter.id === chapterId)
    ?? CS408_HANDOUT_CHAPTERS.find(chapter => chapter.id === chapterId);
}

type QuestionsByScene = ReadonlyMap<string, readonly Cs408HandoutQuestion[]>;

// OCR 漏标 year 字段但实为历年 408 统考真题原题的王道大题（四科全量核对）。
const UNLABELED_WANGDAO_BIG_EXAM_DUPS = new Set([
  "co-big-4.3-5",  // 2024 #43
  "co-big-5.6-2",  // 2014 #44
  "co-big-7.3-7",  // 2009 #43
  "cn-big-3.4-7",  // 2017 #47
  "cn-big-4.2-18", // 2025 #47
  "cn-big-4.4-4",  // 2013 #47
  "cn-big-5.3-13", // 2012 #47
]);

/** 王道大题中直接收录的 408 历年真题原题：手稿已有真题卷原题与解析，大题去重。 */
export function isWangdaoBigExamDuplicate(item: WangdaoItem): boolean {
  return item.kind === "big" && (Boolean(item.year) || UNLABELED_WANGDAO_BIG_EXAM_DUPS.has(item.id));
}

function isDsBigQuestion(question: Cs408HandoutQuestion): boolean {
  return question.item.book === "ds" && question.item.kind === "big";
}

function compareDsBigQuestions(a: Cs408HandoutQuestion, b: Cs408HandoutQuestion): number {
  if (a.source !== b.source) return a.source === "exam" ? -1 : 1;
  if (a.source === "exam" && b.source === "exam") {
    return b.year - a.year || a.item.n - b.item.n;
  }
  const rankA = dsBigWangdaoMeta(a.id)?.rank ?? Number.MAX_SAFE_INTEGER;
  const rankB = dsBigWangdaoMeta(b.id)?.rank ?? Number.MAX_SAFE_INTEGER;
  return rankA - rankB || a.id.localeCompare(b.id);
}

export function buildCs408KindQuestions(allQuestions: QuestionsByScene, kind: ExamKind): QuestionsByScene {
  const byScene = new Map<string, Cs408HandoutQuestion[]>();
  const dsBigSeen = new Set<string>();

  for (const [sceneId, items] of allQuestions) {
    const matched = items.filter(q => q.item.kind === kind);
    if (kind !== "big") {
      byScene.set(sceneId, matched);
      continue;
    }
    const nonDs: Cs408HandoutQuestion[] = [];
    for (const q of matched) {
      if (isDsBigQuestion(q)) {
        if (dsBigSeen.has(q.id)) continue;
        dsBigSeen.add(q.id);
        const kpIds = q.source === "exam"
          ? [primaryKpId(q.item), ...secondaryKpIds(q.item)].filter((id): id is string => Boolean(id))
          : q.item.kp_ids;
        const targetScene = resolveDsBigScene(q.id, q.source, kpIds);
        const bucket = byScene.get(targetScene) ?? [];
        bucket.push(q);
        byScene.set(targetScene, bucket);
      } else {
        nonDs.push(q);
      }
    }
    if (nonDs.length > 0) byScene.set(sceneId, nonDs);
  }

  if (kind === "big") {
    for (const [sceneId, bucket] of byScene) {
      if (sceneId.startsWith("ds.big.")) {
        bucket.sort(compareDsBigQuestions);
      }
    }
  }
  return byScene;
}

export function resolveCs408QuestionLocation(
  question: Cs408HandoutQuestion,
  fallbackChapter: Cs408HandoutChapter,
  fallbackSceneId: string,
): { chapterId: string; chapterName: string; sceneId: string } {
  if (isDsBigQuestion(question)) {
    const kpIds = question.source === "exam"
      ? [primaryKpId(question.item), ...secondaryKpIds(question.item)].filter((id): id is string => Boolean(id))
      : question.item.kp_ids;
    const sceneId = resolveDsBigScene(question.id, question.source, kpIds);
    const chapter = dsBigChapterForScene(sceneId);
    if (chapter) {
      return { chapterId: chapter.id, chapterName: chapter.name, sceneId };
    }
  }
  return { chapterId: fallbackChapter.id, chapterName: fallbackChapter.name, sceneId: fallbackSceneId };
}

export function buildCs408HandoutQuestions(papers: ExamPaper[], wangdao: WangdaoItem[]): QuestionsByScene {
  const byScene = new Map<string, Cs408HandoutQuestion[]>();
  const byId = new Map<string, Cs408HandoutQuestion>();
  const allowedScenes = new Set(CS408_HANDOUT_CHAPTERS.flatMap(chapter => chapter.kps.map(kp => kp.id)));

  function add(scene: string | null, question: Cs408HandoutQuestion) {
    byId.set(question.id, question);
    if (!scene || !allowedScenes.has(scene)) return;
    const questions = byScene.get(scene) ?? [];
    questions.push(question);
    byScene.set(scene, questions);
  }

  for (const paper of [...papers].sort((a, b) => b.year - a.year)) {
    for (const item of paper.items) {
      add(primaryKpId(item), {
        source: "exam",
        id: examItemId(paper.year, item.n),
        item,
        year: paper.year,
        edition: paper.meta?.edition === "recall" ? paper.meta.edition_label : undefined,
      });
    }
  }
  for (const item of wangdao) {
    if (isWangdaoBigExamDuplicate(item)) continue;
    const scene = item.kp_ids.find(id => allowedScenes.has(id)) ?? null;
    add(scene, { source: "wangdao", id: item.id, item });
  }

  // 教案逐题核对过，主例题可能跨考点，放在讲解对应的场景并优先展示。
  for (const [scene, review] of Object.entries(CS408_KNOWLEDGE_REVIEWS)) {
    const exampleId = review.routes[0]?.lessons[0]?.sourceQuestion?.questionId;
    const example = exampleId ? byId.get(exampleId) : undefined;
    if (!example || !allowedScenes.has(scene)) continue;
    byScene.set(scene, [example, ...(byScene.get(scene) ?? []).filter(q => q.id !== example.id)]);
  }
  return byScene;
}

export async function loadCs408HandoutQuestions(): Promise<QuestionsByScene> {
  const [papers, wangdao] = await Promise.all([
    loadCs408ExamIndex().then(index => loadCs408ExamPapers(index.years)),
    loadWangdao408(),
  ]);
  return buildCs408HandoutQuestions(papers, wangdao);
}

export function cs408HandoutProgressTarget(question: Cs408HandoutQuestion) {
  const primary = question.source === "exam" ? primaryKpId(question.item) : question.item.kp_ids[0];
  if (!primary) return null;
  return {
    itemId: question.id,
    primaryKpId: primary,
    secondaryKpIds: question.source === "exam" ? secondaryKpIds(question.item) : question.item.kp_ids.slice(1),
  };
}

export function markCs408HandoutQuestion(question: Cs408HandoutQuestion, mark: Cs408HandoutMark) {
  if (question.source === "wangdao") {
    applyWangdaoPractice(question.item, mark);
    return;
  }

  const target = cs408HandoutProgressTarget(question);
  if (!target) return;
  useKgProgress.getState().markItem({ ...target, mark });
  const outcome = { pass: "self_pass", fuzzy: "self_fuzzy", fail: "self_fail" } as const;
  syncExamAttemptToJournal({ item: question.item, year: question.year, outcome: outcome[mark] });
}
