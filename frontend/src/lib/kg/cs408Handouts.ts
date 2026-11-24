import { CS408_BOOKS } from "@/data/kg/cs408";
import { CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import {
  examItemId,
  loadCs408ExamIndex,
  loadCs408ExamPapers,
  primaryKpId,
  secondaryKpIds,
  type ExamItem,
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
}

export const CS408_HANDOUT_CHAPTERS: Cs408HandoutChapter[] = CS408_BOOKS.flatMap(book =>
  book.modules.map(module => ({ ...module, bookId: book.id, bookName: book.name }))
);

type QuestionsByScene = ReadonlyMap<string, readonly Cs408HandoutQuestion[]>;

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
