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

/** 常见人名/姓氏：大写出现时不走词形还原，避免 James→jam、Jobs→job。 */
const PROPER_NAMES: Set<string> = new Set(
  `james john peter michael david robert william mary linda george thomas charles joseph paul bill steve jack tom sam ben chris daniel matthew andrew joshua ryan kevin brian jason eric adam scott frank henry jobs brooks smith jones miller davis wilson taylor`.split(
    /\s+/
  )
);

function isCapitalizedSurface(surface: string): boolean {
  return /^[A-Z]/.test(String(surface ?? "").trim());
}

function isProperNameSurface(surface: string, normalized: string): boolean {
  return isCapitalizedSurface(surface) && PROPER_NAMES.has(normalized);
}

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

/** 去辅音双写：running → run、hopped → hop */
function undoubleFinal(stem: string): string | null {
  if (stem.length < 2) return null;
  const last = stem[stem.length - 1];
  const prev = stem[stem.length - 2];
  if (last && last === prev && isConsonant(last)) return stem.slice(0, -1);
  return null;
}

// 与 backend/src/bin/ew_pipeline.rs 的 build_lookup / lemma 规则保持同一口径。
const SPELLING_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["behavior", "behaviour"],
  ["labor", "labour"],
  ["favor", "favour"],
  ["color", "colour"],
  ["honor", "honour"],
  ["humor", "humour"],
  ["neighbor", "neighbour"],
  ["rumor", "rumour"],
  ["vapor", "vapour"],
  ["flavor", "flavour"],
  ["center", "centre"],
  ["theater", "theatre"],
  ["defense", "defence"],
  ["offense", "offence"],
  ["license", "licence"],
  ["program", "programme"],
  ["catalog", "catalogue"],
  ["dialog", "dialogue"],
  ["analog", "analogue"],
  ["traveler", "traveller"],
  ["traveling", "travelling"],
  ["traveled", "travelled"],
  ["modeling", "modelling"],
  ["modeled", "modelled"],
  ["canceled", "cancelled"],
  ["canceling", "cancelling"],
  ["labeled", "labelled"],
  ["labeling", "labelling"],
  ["signaled", "signalled"],
  ["signaling", "signalling"],
  ["fulfill", "fulfil"],
  ["enroll", "enrol"],
  ["skillful", "skilful"],
  ["willful", "wilful"],
  ["aging", "ageing"],
  ["judgment", "judgement"],
  ["acknowledgment", "acknowledgement"],
  ["email", "e-mail"],
  ["online", "on-line"],
  ["wellbeing", "well-being"],
  ["toward", "towards"],
  ["afterward", "afterwards"],
  ["upward", "upwards"],
  ["downward", "downwards"],
  ["forward", "forwards"],
  ["backward", "backwards"],
  ["homeward", "homewards"],
  ["outward", "outwards"],
  ["inward", "inwards"],
  ["westward", "westwards"],
  ["eastward", "eastwards"],
  ["northward", "northwards"],
  ["southward", "southwards"],
  ["among", "amongst"],
  ["amid", "amidst"],
  ["while", "whilst"],
  ["anemia", "anaemia"],
  ["estrogen", "oestrogen"],
  ["pediatric", "paediatric"],
  ["encyclopedia", "encyclopaedia"],
  ["medieval", "mediaeval"],
];

const SPELLING_SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  ["isation", "ization"],
  ["ization", "isation"],
  ["ising", "izing"],
  ["izing", "ising"],
  ["ised", "ized"],
  ["ized", "ised"],
  ["ises", "izes"],
  ["izes", "ises"],
  ["ise", "ize"],
  ["ize", "ise"],
  ["ysing", "yzing"],
  ["yzing", "ysing"],
  ["ysed", "yzed"],
  ["yzed", "ysed"],
  ["yse", "yze"],
  ["yze", "yse"],
  ["ously", "ous"],
  ["iously", "ious"],
  ["fully", "ful"],
  ["lessly", "less"],
  ["ially", "ial"],
  ["cial", "ce"],
  ["tial", "ce"],
  ["ogue", "og"],
  ["og", "ogue"],
  ["ence", "ense"],
  ["ense", "ence"],
  ["our", "or"],
  ["or", "our"],
  ["re", "er"],
  ["er", "re"],
  ["ll", "l"],
  ["l", "ll"],
  ["ae", "e"],
  ["oe", "e"],
];

const DERIV_SUFFIXES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["istically", ["istic", "ism"]],
  ["istical", ["istics"]],
  ["ically", ["ic", "y"]],
  ["ational", ["ate", ""]],
  ["ability", ["able"]],
  ["ibility", ["ible"]],
  ["ivity", ["ive"]],
  ["iatrist", ["iatry"]],
  ["lysis", ["lyse", "lyze"]],
  ["izing", ["ize", "eous"]],
  ["ising", ["ise", "eous"]],
  ["ulsive", ["el"]],
  ["atist", ["a"]],
  ["thy", ["th"]],
  ["uly", ["ue"]],
  ["ry", ["", "e"]],
  ["ization", ["ize", "eous"]],
  ["isation", ["ise", "eous"]],
  ["ification", ["ify"]],
  ["ation", ["", "e", "ate"]],
  ["ition", ["", "e", "ite"]],
  ["ution", ["", "e", "ute"]],
  ["ceptive", ["ceive"]],
  ["ception", ["ceive"]],
  ["vention", ["vene"]],
  ["ential", ["ence", "ent"]],
  ["ative", ["ate", "e"]],
  ["itive", ["ition"]],
  ["sive", ["de"]],
  ["atic", ["acy"]],
  ["ction", ["ct"]],
  ["ssion", ["ss"]],
  ["sion", ["d", "de", "se"]],
  ["iness", ["y"]],
  ["ency", ["ent"]],
  ["ancy", ["ant"]],
  ["ent", ["", "e"]],
  ["ant", ["", "e"]],
  ["ment", ["", "e"]],
  ["ness", ["", "e"]],
  ["ity", ["", "e", "y", "ous", "al"]],
  ["ance", ["", "e", "ant", "y"]],
  ["ence", ["", "e", "ent"]],
  ["able", ["", "e", "y"]],
  ["ible", ["", "e", "y"]],
  ["ial", ["", "e"]],
  ["ally", [""]],
  ["ily", ["y"]],
  ["ably", ["able"]],
  ["ibly", ["ible"]],
  ["ly", ["", "e", "le", "y"]],
  ["ory", ["", "e", "ate"]],
  ["ary", ["", "e"]],
  ["ate", ["", "e"]],
  ["ive", ["", "e"]],
  ["ous", ["", "e"]],
  ["ual", ["", "e"]],
  ["ful", [""]],
  ["less", [""]],
  ["ical", ["ic", "y"]],
  ["al", ["", "e"]],
  ["ic", ["", "e"]],
  ["ish", [""]],
  ["ize", ["", "e", "y"]],
  ["ise", ["", "e", "y"]],
  ["ify", ["", "e"]],
  ["en", ["", "e"]],
  ["er", ["", "e", "y"]],
  ["itor", ["e", "it"]],
  ["ator", ["ate", "at"]],
  ["utor", ["ute", "ut"]],
  ["or", ["", "e"]],
  ["ery", ["", "e"]],
  ["ist", ["y", "ive", ""]],
  ["icism", ["ical"]],
  ["ism", ["istic", "ist", "ical", ""]],
  ["age", ["", "e", "ager"]],
  ["ship", [""]],
  ["hood", [""]],
  ["ion", ["", "e", "t"]],
  ["acy", ["ate", ""]],
  ["y", ["", "e"]],
];

const PREFIXES: readonly string[] = [
  "counter", "inter", "trans", "under", "super", "multi", "semi", "anti", "over",
  "fore", "with", "micro", "macro", "hyper", "ultra", "auto", "extra", "intra",
  "meta", "para", "peri", "poly", "mono", "non", "mis", "pre", "post", "pro",
  "sub", "bio", "co", "de", "dis", "en", "em", "in", "im", "re", "un", "up",
  "down", "out", "well", "self", "bi", "tri", "uni", "ir", "il",
];

function spellingCandidates(low: string): string[] {
  const out = new Set<string>();
  for (const [a, b] of SPELLING_PAIRS) {
    for (const [from, to] of [[a, b], [b, a]] as Array<[string, string]>) {
      if (low.startsWith(from)) out.add(`${to}${low.slice(from.length)}`);
    }
  }
  for (const [from, to] of SPELLING_SUFFIXES) {
    if (low.endsWith(from) && low.length > from.length) {
      out.add(`${low.slice(0, -from.length)}${to}`);
    }
  }
  out.delete(low);
  return [...out];
}

function collectStems(
  low: string,
  out: Set<string>,
  seen: Set<string>,
  depth: number
): void {
  if (!low || depth > 4 || seen.has(low)) return;
  seen.add(low);
  out.add(low);

  for (const variant of spellingCandidates(low)) {
    collectStems(variant, out, seen, depth + 1);
  }

  const stems = new Set<string>();
  if (low.endsWith("ies")) stems.add(`${low.slice(0, -3)}y`);
  if (low.endsWith("es")) stems.add(low.slice(0, -2));
  if (low.endsWith("s") && !low.endsWith("ss")) stems.add(low.slice(0, -1));

  if (low.endsWith("ing") && low.length > 4) {
    const base = low.slice(0, -3);
    stems.add(base);
    stems.add(`${base}e`); // hoping → hope, using → use
    const undoubled = undoubleFinal(base);
    if (undoubled) stems.add(undoubled);
  }
  if (low.endsWith("ied") && low.length > 3) {
    stems.add(`${low.slice(0, -3)}y`);
  } else if (low.endsWith("ed") && low.length > 3) {
    const base = low.slice(0, -2);
    stems.add(base);
    stems.add(`${base}e`); // hoped → hope, noted → note
    const undoubled = undoubleFinal(base);
    if (undoubled) stems.add(undoubled);
  }
  if (low.endsWith("est") && low.length > 5) {
    const base = low.slice(0, -3);
    stems.add(base);
    stems.add(`${base}e`);
    const undoubled = undoubleFinal(base);
    if (undoubled) stems.add(undoubled);
  }
  if (low.endsWith("er") && low.length > 4) {
    const base = low.slice(0, -2);
    stems.add(base);
    stems.add(`${base}e`);
    const undoubled = undoubleFinal(base);
    if (undoubled) stems.add(undoubled);
  }

  for (const [suffix, reps] of DERIV_SUFFIXES) {
    if (!low.endsWith(suffix) || low.length <= suffix.length + 2) continue;
    const stem = low.slice(0, -suffix.length);
    for (const rep of reps) stems.add(`${stem}${rep}`);
    if (stem.endsWith("i")) stems.add(`${stem.slice(0, -1)}y`);
  }
  for (const prefix of PREFIXES) {
    if (low.startsWith(prefix) && low.length > prefix.length + 3) {
      stems.add(low.slice(prefix.length));
    }
  }

  if (low.includes("-")) {
    for (const part of low.split("-")) {
      if (part.length >= 2) stems.add(part);
    }
  } else if (low.length >= 6) {
    for (let i = 3; i <= low.length - 3; i += 1) {
      stems.add(low.slice(0, i));
      stems.add(low.slice(i));
    }
  }

  for (const stem of stems) {
    if (stem && stem !== low) collectStems(stem, out, seen, depth + 1);
  }
}

/** 词形候选：exact 开头，随后是拼写变体、屈折、派生、前缀、复合词（递归）。 */
export function inflectionStems(low: string): string[] {
  const out = new Set<string>();
  collectStems(low, out, new Set(), 0);
  return [low, ...[...out].filter((stem) => stem !== low)];
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
  const map = getWordByEn();
  if (!map.has(normalized) && isProperNameSurface(surface, normalized)) return normalized;
  return pickLemma(normalized, map) ?? normalized;
}

export function lookupWord(surface: string): WordEntry | null {
  const normalized = normalizeSurface(surface);
  if (!normalized) return null;
  const map = getWordByEn();
  if (!map.has(normalized) && isProperNameSurface(surface, normalized)) return null;
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
