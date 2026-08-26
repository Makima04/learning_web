/** 考研政治主观题（材料分析题 34–38） */

export type PoliticsSubject = "marx" | "xi" | "history" | "moral" | "world";

export const SUBJECT_LABEL: Record<PoliticsSubject, string> = {
  marx: "马原",
  xi: "新思想",
  history: "史纲",
  moral: "思修",
  world: "当代",
};

export const SUBJECT_NO: Record<PoliticsSubject, number> = {
  marx: 34,
  xi: 35,
  history: 36,
  moral: 37,
  world: 38,
};

export interface ScorePoint {
  id: string;
  /** 阅卷采分表述（教材原话优先） */
  text: string;
  /** 命中任一关键词即视为踩到该点 */
  keywords: string[];
  /** 该点分值 */
  score: number;
}

export interface QuestionPart {
  id: string;
  /** (1)(2) 设问原文 */
  prompt: string;
  points: number;
  scorePoints: ScorePoint[];
  /** 材料里应被引用的短语；答案中一个都没有则提示「未结合材料」 */
  materialHints: string[];
  /** 答题骨架，可一键填入空编辑器 */
  skeleton: string;
  /** 参考答案（按点组织） */
  model: string;
}

export interface PoliticsQuestion {
  id: string;
  year: number;
  no: number;
  subject: PoliticsSubject;
  title: string;
  materials: { label: string; text: string }[];
  parts: QuestionPart[];
}

export interface PartAttempt {
  partId: string;
  answer: string;
  /** 学员确认踩中的点（可覆盖自动检测） */
  checkedIds: string[];
  autoHitIds: string[];
  score: number;
  maxScore: number;
  missingMaterial: boolean;
  at: number;
}

export interface QuestionAttempt {
  id: string;
  questionId: string;
  parts: PartAttempt[];
  score: number;
  maxScore: number;
  at: number;
}

export interface QuestionDraft {
  questionId: string;
  answers: Record<string, string>;
  updatedAt: number;
}

export interface PoliticsDoc {
  drafts: Record<string, QuestionDraft>;
  attempts: QuestionAttempt[];
  lastQuestionId: string | null;
  updatedAt: number;
}
