import { CS408_DATA_VER } from "@/lib/kg/exams408";

export interface GuideQuestion {
  year: number;
  n: number;
  book: string;
  bookName: string;
  topic: string;
  note: string;
  kps: string[];
  hasAnswer: boolean;
  hasExplanation: boolean;
  stemBrief: string;
}

export interface GuideType {
  id: string;
  family: string;
  familyName: string;
  name: string;
  subtitle: string;
  paradigm: string;
  template: string[];
  ideas: string[];
  pitfalls: string[];
  kpIds: string[];
  kpNames: { id: string; name: string }[];
  count: number;
  years: number[];
  questions: GuideQuestion[];
}

export interface BigGuide {
  version: string;
  scope: string;
  note: string;
  total: number;
  type_count: number;
  years: number[];
  families: { id: string; name: string }[];
  types: GuideType[];
  stats: {
    by_family: Record<string, number>;
    by_year: Record<string, number>;
    with_answer: number;
    with_explanation: number;
  };
}

let pending: Promise<BigGuide> | undefined;

export function loadCs408BigGuide(): Promise<BigGuide> {
  pending ??= fetch(`/cs408/big-guide.json?v=${CS408_DATA_VER}`, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`加载失败 (${response.status})`);
      return response.json() as Promise<BigGuide>;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
