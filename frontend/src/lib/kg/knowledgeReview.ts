import { CS408_BOOKS } from "@/data/kg/cs408";
import { MATH_BOOKS } from "@/data/kg/math";

// 知识模板只保存教学内容与原题引用；作答记录仍复用图谱/错题集的账号同步。
export type ReviewBlock =
  | { type: "text"; text: string }
  | { type: "math"; tex: string }
  | { type: "code"; code: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface ReviewStep {
  title: string;
  action: string;
  working: ReviewBlock[];
}

export interface ReviewTechnique {
  title: string;
  content: ReviewBlock[];
}

export type ReviewReference = {
  questionId: string;
  purpose: string;
} & (
  | { source: "exam" }
  | { source: "lilin880" | "zhangyu1000" | "wangdao"; label: string }
);

export interface ReviewLesson {
  id: string;
  label: string;
  examId?: string;
  /** 经逐题编写的讲解来源，区别于末尾自动匹配的同考点练习。 */
  sourceQuestion?: {
    source: "exam" | "wangdao";
    questionId: string;
    label: string;
    kind: "big" | "mcq";
    excerpt: boolean;
  };
  prompt: ReviewBlock[];
  signals: string[];
  recognition: string;
  steps: ReviewStep[];
  /** 以推导为主的教案进入时直接展示演算，仍允许手动收起。 */
  showWorkingByDefault?: boolean;
  checkpoint: string;
  techniques: ReviewTechnique[];
  references: ReviewReference[];
  selfCheck: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export interface ReviewRoute {
  id: string;
  title: string;
  cue: string;
  lessons: ReviewLesson[];
}

export interface KnowledgeReview {
  kpId: string;
  title: string;
  description: string;
  opening: string;
  knowledge?: ReviewBlock[];
  textbook?: { title: string; url: string; note?: string };
  scope: string;
  defaultRouteId: string;
  sourceGap?: string;
  routes: ReviewRoute[];
}

/** 入口元数据与正文分离，排行页不提前加载公式引擎和整份教案。 */
export const KNOWLEDGE_REVIEW_TOPICS: Readonly<Record<string, { title: string; summary: string }>> = {
  ...Object.fromEntries([...MATH_BOOKS, ...CS408_BOOKS].flatMap((book) => book.modules.flatMap((module) => module.kps.map((kp) => [kp.id, {
    title: kp.name, summary: `${module.name} · 概念公式、方法例题与解题步骤。`,
  }])))),
  "calc.m.ext": {
    title: "求极值与最值",
    summary: "识别有无约束，分清区域内部与边界，再用真题恢复解题路线。",
  },
};

export const REVIEW_SOURCE_LABELS = {
  exam: "真题",
  wangdao: "王道",
  lilin880: "李林 880",
  zhangyu1000: "张宇 1000",
} as const;

/** URL 只选择现有路线/例题；无效深链回到模板默认路线。 */
export function resolveReviewLesson(template: KnowledgeReview, routeId: string | null, lessonId: string | null) {
  const route = template.routes.find((r) => r.id === routeId)
    ?? template.routes.find((r) => r.id === template.defaultRouteId)
    ?? template.routes[0];
  const lesson = route.lessons.find((l) => l.id === lessonId) ?? route.lessons[0];
  return { route, lesson };
}
