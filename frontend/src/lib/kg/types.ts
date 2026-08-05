// 考研知识图谱类型：三级（科目书 → 模块 → 考点）+ 用户进度 + 组卷蓝图

/** 学科大类 */
export type SubjectId = "cs408" | "math";

/** 数学轨：设置里选择，决定界面只展示数一或数二考点 */
export type MathTrack = "math1" | "math2";

/** 书/分科 */
export type BookId =
  | "ds"
  | "co"
  | "os"
  | "cn"
  | "calc"
  | "linear"
  | "prob";

/** 轻量多档：不要求提交答案 */
export type MarkLevel = "fail" | "fuzzy" | "pass" | "skip";

export type KpStatus = "unknown" | "learning" | "weak" | "stable" | "mastered";

export type KpRole = "primary" | "secondary";

/** 原子考点 */
export interface KnowledgePoint {
  id: string;
  name: string;
  /** 考频 1–5（大纲+历年综合，5=几乎年年） */
  freq: number;
  /** 出大题倾向 0–1 */
  bigWeight: number;
  /** 先修考点 */
  prereqs?: string[];
  /** 仅数学：数一 / 数二 / 共用 */
  scope?: MathTrack | "both";
  tags?: string[];
}

/** 模块（用户可见卡片层） */
export interface KgModule {
  id: string;
  name: string;
  order: number;
  kps: KnowledgePoint[];
}

/** 书（408 四本 / 数学高数·线代·概率） */
export interface KgBook {
  id: BookId;
  name: string;
  subject: SubjectId;
  order: number;
  modules: KgModule[];
}

export interface UserKpState {
  covered: boolean;
  status: KpStatus;
  /** 0–1，启发式掌握度 */
  confidence: number;
  ease: number;
  /** 复习间隔（天） */
  ivl: number;
  due: number;
  lapses: number;
  lastMark?: MarkLevel;
  updatedAt: number;
}

export interface UserItemMark {
  itemId: string;
  mark: MarkLevel;
  /** 用户细标的弱考点（综合题） */
  weakKpIds?: string[];
  ts: number;
}

/** 预测/练习卷中的一题槽位（算法填结构，LLM/题库填内容） */
export interface BlueprintSlot {
  slotId: string;
  bookId: BookId;
  order: number;
  suggestPoints: number;
  primaryKpId: string;
  secondaryKpIds: string[];
  moduleId: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  rationale: string;
}

export interface PredictBlueprint {
  subject: "cs408";
  kind: "big_only";
  createdAt: number;
  slots: BlueprintSlot[];
  /** 本卷禁止复用的 primary kp */
  usedPrimaryKpIds: string[];
}

export interface PredictItem {
  slotId: string;
  itemId: string;
  source: "llm" | "template" | "bank";
  stem: string;
  answer: string;
  solution: string;
  primaryKpId: string;
  secondaryKpIds: string[];
  bookId: BookId;
  moduleId: string;
  suggestPoints: number;
}

export interface PredictPaper {
  id: string;
  blueprint: PredictBlueprint;
  items: PredictItem[];
  createdAt: number;
}

/** 模块双层进度 */
export interface ModuleProgress {
  moduleId: string;
  total: number;
  covered: number;
  /** 0–1 覆盖率 */
  coverage: number;
  /** 0–1 掌握率（考点 confidence 均值，仅 covered 或有标记的） */
  mastery: number;
  weakKpIds: string[];
  dueCount: number;
}

export interface BookProgress {
  bookId: BookId;
  coverage: number;
  mastery: number;
  modules: ModuleProgress[];
}
