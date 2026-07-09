// lookup.ts —— 词形还原 + 点词查义。移植 web/app.js inflectionStems / lookupWord / restoreInflection。
import { getWordByEn } from "@/lib/words";
import type { WordEntry } from "@/types/words";

export function inflectionStems(low: string): string[] {
  return [
    low,
    low.replace(/s$/, ""),
    low.replace(/es$/, ""),
    low.replace(/ing$/, ""),
    low.replace(/ed$/, ""),
    low.replace(/ing$/, "e"),
    low.replace(/ed$/, "e"),
    low.replace(/ies$/, "y"),
    low.replace(/ied$/, "y"),
    low.replace(/ly$/, ""),
    low.replace(/ely$/, "e"),
    low.replace(/ily$/, "y"),
    low.replace(/ness$/, ""),
    low.replace(/ment$/, ""),
    low.replace(/tion$/, "te"),
    low.replace(/sion$/, "d"),
    low.replace(/ity$/, ""),
    low.replace(/ful$/, ""),
    low.replace(/less$/, ""),
  ];
}

export function restoreInflection(low: string): string {
  const map = getWordByEn();
  if (map.has(low)) return low;
  for (const t of inflectionStems(low)) {
    if (t && map.has(t)) return t;
  }
  return low;
}

export function lookupWord(surface: string): WordEntry | null {
  const low = String(surface ?? "").toLowerCase();
  const map = getWordByEn();
  if (map.has(low)) return map.get(low)!;
  for (const t of inflectionStems(low)) {
    if (t && map.has(t)) return map.get(t)!;
  }
  return null;
}

/** 例句里目标词高亮 + 词库词可点查。返回 HTML 片段（已 esc）。 */
export function highlightTarget(text: string, english: string, esc: (s: unknown) => string): string {
  if (!text || !english) return esc(text || "");
  const low = String(english).toLowerCase();
  return String(text).replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
    const ml = m.toLowerCase();
    const isTarget = (() => {
      if (ml === low) return true;
      if (restoreInflection(ml) === low) return true;
      if (restoreInflection(low) === ml) return true;
      return false;
    })();
    const e = esc(m);
    if (isTarget) return `<strong class="c-target c-word" data-w="${e}">${e}</strong>`;
    return lookupWord(ml) ? `<span class="c-word" data-w="${e}">${e}</span>` : e;
  });
}

export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
