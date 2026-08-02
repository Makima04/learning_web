// quiz.ts —— 重学完型四选一：干扰项现抽 + 例句池轮换 + 句中挖空
import { restoreInflection, shuffle } from "@/lib/lookup";
import { getExamples, getWordMap, getWords } from "@/lib/words";

/** 从候选池抽一句，尽量避开上次用过的 */
export function pickFromPool(pool: string[], avoid?: string | null): string | null {
  const cleaned = [...new Set(pool.map((s) => s.trim()).filter(Boolean))];
  if (!cleaned.length) return null;
  if (cleaned.length === 1) return cleaned[0];
  const candidates = avoid ? cleaned.filter((s) => s !== avoid) : cleaned;
  const list = candidates.length ? candidates : cleaned;
  return list[Math.floor(Math.random() * list.length)]!;
}

/**
 * 取某词可用例句池。
 * - passage：只用 entry.sentences（本篇，不串年）
 * - 其它：entry.sentences 优先，否则全局真题反查
 */
export function examplePoolFor(
  idx: number,
  mode: string,
  entrySentences?: string[] | null
): string[] {
  if (mode === "passage") {
    return (entrySentences || []).filter((s) => s && s.trim());
  }
  if (entrySentences?.length) {
    return entrySentences.filter((s) => s && s.trim());
  }
  return getExamples(idx, 20).map((e) => e.sentence);
}

/** 抽 3 个英文干扰项：会话近邻 → 形近/等长 → 全库随机；每次现抽，不写死 */
export function pickDistractors(
  correctIdx: number,
  correctEnglish: string,
  count = 3,
  preferIdxs: number[] = []
): string[] {
  const words = getWords();
  const map = getWordMap();
  const correctLow = correctEnglish.toLowerCase();
  const used = new Set<string>([correctLow]);
  const out: string[] = [];

  const tryAdd = (english: string | undefined) => {
    if (!english || out.length >= count) return;
    const low = english.toLowerCase();
    if (used.has(low)) return;
    used.add(low);
    out.push(english);
  };

  // A. 本组/队列近邻
  for (const idx of shuffle(preferIdxs)) {
    if (out.length >= count) break;
    if (idx === correctIdx) continue;
    tryAdd(map.get(idx)?.[1]);
  }

  // B. 形近：同前 3 字母，或长度差 ≤1
  const en = correctEnglish;
  const similar = words.filter((w) => {
    if (w[0] === correctIdx) return false;
    if (used.has(w[1].toLowerCase())) return false;
    const e = w[1];
    if (e.length >= 3 && en.length >= 3 && e.slice(0, 3).toLowerCase() === en.slice(0, 3).toLowerCase()) {
      return true;
    }
    return Math.abs(e.length - en.length) <= 1 && e.length >= 4;
  });
  for (const w of shuffle(similar)) {
    if (out.length >= count) break;
    tryAdd(w[1]);
  }

  // C. 全库随机补齐
  if (out.length < count) {
    const rest = words.filter((w) => w[0] !== correctIdx && !used.has(w[1].toLowerCase()));
    for (const w of shuffle(rest)) {
      if (out.length >= count) break;
      tryAdd(w[1]);
    }
  }

  return out.slice(0, count);
}

/** 1 正确 + 3 干扰，打乱顺序 */
export function buildClozeOptions(
  correctIdx: number,
  correctEnglish: string,
  preferIdxs: number[] = []
): string[] {
  const distractors = pickDistractors(correctIdx, correctEnglish, 3, preferIdxs);
  return shuffle([correctEnglish, ...distractors]);
}

/** 是否目标词形（含简单屈折） */
function isTargetForm(surface: string, english: string): boolean {
  const ml = surface.toLowerCase();
  const low = english.toLowerCase();
  if (ml === low) return true;
  if (restoreInflection(ml) === low) return true;
  if (restoreInflection(low) === ml) return true;
  return false;
}

/**
 * 句中把目标词挖成空白（HTML，已 esc）。
 * 无匹配时在句末补 ______。
 */
export function blankTargetHtml(
  text: string,
  english: string,
  esc: (s: unknown) => string
): string {
  if (!text) return `<span class="font-semibold tracking-wider">______</span>`;
  if (!english) return esc(text);

  let hit = false;
  const html = String(text).replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
    if (isTargetForm(m, english)) {
      hit = true;
      return `<span class="font-semibold tracking-wider text-primary">______</span>`;
    }
    const e = esc(m);
    return e;
  });
  if (!hit) {
    return `${esc(text)} <span class="font-semibold tracking-wider text-primary">______</span>`;
  }
  return html;
}

export interface ClozeQuiz {
  /** 挖空用原句；无句时为 null，UI 用中文义作题干 */
  sentence: string | null;
  options: string[];
  correct: string;
}
