import type { QuestionPart, ScorePoint } from "./types";

/** 去空白、统一常见标点，便于中文关键词匹配 */
export function normalizePoliticsText(s: string): string {
  return s.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

export function pointHit(answer: string, point: ScorePoint): boolean {
  const hay = normalizePoliticsText(answer);
  if (!hay) return false;
  return point.keywords.some((kw) => {
    const needle = normalizePoliticsText(kw);
    return needle.length > 0 && hay.includes(needle);
  });
}

export function materialLinked(answer: string, hints: string[]): boolean {
  if (!hints.length) return true;
  const hay = normalizePoliticsText(answer);
  if (!hay) return false;
  return hints.some((h) => hay.includes(normalizePoliticsText(h)));
}

export interface PartScore {
  hitIds: string[];
  missIds: string[];
  score: number;
  maxScore: number;
  missingMaterial: boolean;
}

export function scorePart(answer: string, part: QuestionPart): PartScore {
  const hitIds: string[] = [];
  const missIds: string[] = [];
  let score = 0;
  let maxScore = 0;
  for (const p of part.scorePoints) {
    maxScore += p.score;
    if (pointHit(answer, p)) {
      hitIds.push(p.id);
      score += p.score;
    } else {
      missIds.push(p.id);
    }
  }
  return {
    hitIds,
    missIds,
    score,
    maxScore,
    missingMaterial: !materialLinked(answer, part.materialHints),
  };
}

/** 按学员勾选的点计分（覆盖自动检测） */
export function scoreChecked(checkedIds: string[], points: ScorePoint[]): number {
  const set = new Set(checkedIds);
  return points.reduce((sum, p) => (set.has(p.id) ? sum + p.score : sum), 0);
}

export function maxOfPart(part: QuestionPart): number {
  return part.scorePoints.reduce((s, p) => s + p.score, 0);
}
