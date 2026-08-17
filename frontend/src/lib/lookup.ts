// lookup.ts —— 词形还原 + 点词查义。
// 多候选取最长命中，避免 hop/hope、us/use 这类前缀误中。
import { getWordByEn } from "@/lib/words";
import type { WordEntry } from "@/types/words";

const CONSONANT = /[bcdfghjklmnpqrstvwxyz]/;

/** 过短或功能词残干：不得压过更长实词候选 */
const WEAK_STEMS: Set<string> = new Set(
  `a an the and or but if as at by to of in on is it its be am are was were been being do does did done have has had will would could should may might must shall can i me my we us our you your he him his she her they them their this that these those who whom which what when where why how not no so too very just only even also than then there here all any each every both few more most other some such own same into over under after before about from with for out up down off`.split(
    /\s+/
  )
);

function isConsonant(ch: string | undefined): boolean {
  return !!ch && CONSONANT.test(ch);
}

function isWeakStem(stem: string): boolean {
  return stem.length < 3 || WEAK_STEMS.has(stem);
}

/** surface → 小写、去首尾非字母、剥所有格 's / ' */
export function normalizeSurface(surface: string): string {
  let s = String(surface ?? "").toLowerCase();
  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/^[^a-z]+|[^a-z]+$/g, "");
  s = s.replace(/'s$/, "");
  s = s.replace(/'$/, "");
  return s;
}

function pushStem(out: string[], seen: Set<string>, stem: string) {
  if (!stem || seen.has(stem)) return;
  seen.add(stem);
  out.push(stem);
}

/** 去辅音双写：running → run、hopped → hop */
function undoubleFinal(stem: string): string | null {
  if (stem.length < 2) return null;
  const last = stem[stem.length - 1];
  const prev = stem[stem.length - 2];
  if (last && last === prev && isConsonant(last)) return stem.slice(0, -1);
  return null;
}

export function inflectionStems(low: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  pushStem(out, seen, low);

  pushStem(out, seen, low.replace(/ies$/, "y"));
  pushStem(out, seen, low.replace(/es$/, ""));
  pushStem(out, seen, low.replace(/s$/, ""));

  if (low.endsWith("ing") && low.length > 4) {
    const base = low.slice(0, -3);
    pushStem(out, seen, base);
    pushStem(out, seen, `${base}e`); // hoping → hope, using → use
    const undoubled = undoubleFinal(base);
    if (undoubled) pushStem(out, seen, undoubled);
  }

  if (low.endsWith("ied") && low.length > 3) {
    pushStem(out, seen, low.replace(/ied$/, "y"));
  } else if (low.endsWith("ed") && low.length > 3) {
    const base = low.slice(0, -2);
    pushStem(out, seen, base);
    pushStem(out, seen, `${base}e`); // hoped → hope, noted → note
    const undoubled = undoubleFinal(base);
    if (undoubled) pushStem(out, seen, undoubled);
  }

  pushStem(out, seen, low.replace(/ily$/, "y"));
  pushStem(out, seen, low.replace(/ely$/, "e"));
  pushStem(out, seen, low.replace(/ly$/, ""));
  pushStem(out, seen, low.replace(/ness$/, ""));
  pushStem(out, seen, low.replace(/ment$/, ""));
  pushStem(out, seen, low.replace(/tion$/, "te"));
  pushStem(out, seen, low.replace(/sion$/, "d"));
  pushStem(out, seen, low.replace(/ity$/, ""));
  pushStem(out, seen, low.replace(/ful$/, ""));
  pushStem(out, seen, low.replace(/less$/, ""));
  return out;
}

/** 词库命中：exact 优先；否则实词优先、同档取最长 */
function pickLemma(normalized: string, map: Map<string, WordEntry>): string | null {
  if (!normalized) return null;
  if (map.has(normalized)) return normalized;

  let best: string | null = null;
  let bestWeak = true;
  for (const stem of inflectionStems(normalized)) {
    if (!stem || !map.has(stem)) continue;
    const weak = isWeakStem(stem);
    if (!best) {
      best = stem;
      bestWeak = weak;
      continue;
    }
    if (bestWeak !== weak) {
      if (!weak) {
        best = stem;
        bestWeak = false;
      }
      continue;
    }
    if (stem.length > best.length) best = stem;
  }
  return best;
}

export function restoreInflection(surface: string): string {
  const normalized = normalizeSurface(surface);
  if (!normalized) return String(surface ?? "").toLowerCase();
  return pickLemma(normalized, getWordByEn()) ?? normalized;
}

export function lookupWord(surface: string): WordEntry | null {
  const normalized = normalizeSurface(surface);
  if (!normalized) return null;
  const map = getWordByEn();
  const lemma = pickLemma(normalized, map);
  return lemma ? (map.get(lemma) ?? null) : null;
}

/** 跳过不可点查的功能词 / 过短噪声（例句里仍显示，但不包 c-word） */
const SKIP_CLICK = WEAK_STEMS;

export function isClickableSurface(surface: string): boolean {
  const low = normalizeSurface(surface);
  if (low.length < 2) return false;
  if (SKIP_CLICK.has(low)) return false;
  return true;
}

/**
 * 例句里目标词高亮 + 可点查（词库词 + 非常用实词，词库外走 LLM）。
 * 返回 HTML 片段（已 esc）。
 */
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
    if (lookupWord(ml)) return `<span class="c-word" data-w="${e}">${e}</span>`;
    // 词库外实词也可点：WordPopover 走 LLM
    if (isClickableSurface(m))
      return `<span class="c-word c-word-oov" data-w="${e}">${e}</span>`;
    return e;
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
