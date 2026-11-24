import { useEffect, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { dayKey } from "@/lib/day";
import { compareDay, isDueOnOrBefore, type JournalEntry } from "@/lib/journal";
import type { UserItemMark } from "@/lib/kg/types";
import { templatesForKp } from "@/data/kg/mathTemplates";

export type HandoutPriority = "exam" | "lilin880";
export type HandoutKindFilter = "all" | "big" | "fill" | "mcq";
export type HandoutGroupMode = "scene" | "template";

export interface HandoutMethod {
  id: string;
  titleHtml: string;
  title: string;
  descHtml: string;
}

export interface HandoutExample {
  id: string;
  anchorId: string;
  matchedMath1: boolean;
  lilin880Id: string | null;
  year: number | null;
  n: number | null;
  sourceType: "exam" | "lilin880" | "lilin_mock";
  source: string;
  title: string;
  answerLetter: string | null;
  questionHtml: string;
  hintHtml: string;
  stepsHtml: string;
}

export interface HandoutGroupGuide {
  shortTitle: string;
  clueHtml: string;
  coreHtml: string;
  pitfallHtml: string;
  roadmapHtml: string;
  featuredAnchorIds: string[];
  structured: boolean;
}

export interface HandoutGroup {
  id: string;
  title: string;
  guide?: HandoutGroupGuide;
  examples: HandoutExample[];
}

export interface MathHandout {
  slug: string;
  order: number;
  book: "calc" | "linear" | "prob";
  bookName: string;
  chapterPath: string;
  moduleId: string;
  primaryKpId: string;
  secondaryKpIds: string[];
  title: string;
  verdictHeading: string;
  verdictHtml: string;
  verdictLeadHtml?: string;
  verdictTableHtml?: string;
  hasStructuredScenarios?: boolean;
  topicHeading: string;
  topicIntroHtml: string;
  methods: HandoutMethod[];
  workedHeading: string;
  workedHtml: string;
  practiceHeading: string;
  practiceIntroHtml: string;
  groups: HandoutGroup[];
  stats: {
    total: number;
    exam: number;
    lilin880: number;
  };
}

export interface Lilin880Item {
  id: string;
  source: string;
  book: string;
  kind: "mcq" | "fill" | "big";
  section: string;
  section_name: string;
  qno: number;
  pdf_page?: number;
  stem: string;
  kp_ids?: string[];
  facets?: string[];
  part?: string;
  band?: string;
  options?: Record<string, string>;
  img?: string;
  ans_img?: string;
  answer?: string;
}

const PRIORITY_STORAGE_KEY = "ew.mathHandout.priority.v1";

export function readHandoutPriority(): HandoutPriority {
  try {
    const v = localStorage.getItem(PRIORITY_STORAGE_KEY);
    return v === "lilin880" ? "lilin880" : "exam";
  } catch {
    return "exam";
  }
}

export function writeHandoutPriority(p: HandoutPriority): void {
  try {
    localStorage.setItem(PRIORITY_STORAGE_KEY, p);
  } catch {
    /* ignore */
  }
}

export function useHandoutPriority(): [HandoutPriority, (p: HandoutPriority) => void] {
  const [priority, setPriorityState] = useState<HandoutPriority>(readHandoutPriority);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PRIORITY_STORAGE_KEY) {
        setPriorityState(readHandoutPriority());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setPriority = (p: HandoutPriority) => {
    setPriorityState(p);
    writeHandoutPriority(p);
  };
  return [priority, setPriority];
}

const HANDOUTS_DATA_VERSION = "20261124v6";

let handoutsCache: Promise<MathHandout[]> | null = null;
export function loadMathHandouts(): Promise<MathHandout[]> {
  if (!handoutsCache) {
    handoutsCache = fetch(`/math/handouts.json?v=${HANDOUTS_DATA_VERSION}`, {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { handouts: MathHandout[] }) => d.handouts)
      .catch((err) => {
        handoutsCache = null;
        throw err;
      });
  }
  return handoutsCache;
}

let lilinCache: Promise<Lilin880Item[]> | null = null;
export function loadLilin880(): Promise<Lilin880Item[]> {
  if (!lilinCache) {
    lilinCache = fetch(`/math/lilin880.json?v=${HANDOUTS_DATA_VERSION}`, {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        lilinCache = null;
        throw err;
      });
  }
  return lilinCache;
}

export interface ExampleReviewState {
  isDue: boolean;
  reviewedToday: boolean;
}

/** 按 sourceItemId 索引学习日志条目（若同题多条，优先保留当前到期且 active 的条目）。 */
export function buildJournalEntryMap(
  entries: JournalEntry[],
  today: string = dayKey()
): Map<string, JournalEntry> {
  const map = new Map<string, JournalEntry>();
  for (const e of entries) {
    if (!e.sourceItemId) continue;
    const prev = map.get(e.sourceItemId);
    if (!prev) {
      map.set(e.sourceItemId, e);
      continue;
    }
    const curDue = isDueOnOrBefore(e, today);
    const prevDue = isDueOnOrBefore(prev, today);
    if (curDue && !prevDue) {
      map.set(e.sourceItemId, e);
    } else if (curDue === prevDue && e.updatedAt > prev.updatedAt) {
      map.set(e.sourceItemId, e);
    }
  }
  return map;
}

/** 判断手稿单题今日是否「待复习」或「今日已复盘」（同时兼容真题·880同题双ID）。 */
export function getExampleReviewState(
  ex: HandoutExample,
  journalByItemId: Map<string, JournalEntry>,
  markRecordMap: Map<string, UserItemMark>,
  today: string = dayKey()
): ExampleReviewState {
  const ids = ex.lilin880Id && ex.lilin880Id !== ex.id ? [ex.id, ex.lilin880Id] : [ex.id];
  const retired = ids.some((id) => Boolean(markRecordMap.get(id)?.retired));
  const matchedEntries = ids
    .map((id) => journalByItemId.get(id))
    .filter((e): e is JournalEntry => Boolean(e));

  if (retired) {
    const retiredToday = ids.some((id) => {
      const rec = markRecordMap.get(id);
      return Boolean(rec?.retired && rec.retiredAt && dayKey(rec.retiredAt) === today);
    });
    const hadPriorEntry = matchedEntries.some((e) => compareDay(e.createdOn, today) < 0);
    const reviewedEntryToday = matchedEntries.some((e) => e.lastReviewedOn === today);
    return {
      isDue: false,
      reviewedToday: reviewedEntryToday || (retiredToday && hadPriorEntry),
    };
  }

  const isDue = matchedEntries.some((e) => isDueOnOrBefore(e, today));
  if (isDue) {
    return { isDue: true, reviewedToday: false };
  }
  const reviewedToday = matchedEntries.some((e) => e.lastReviewedOn === today);
  return { isDue: false, reviewedToday };
}

export function useMathHandouts(enabled = true): MathHandout[] {
  const [list, setList] = useState<MathHandout[]>([]);
  useEffect(() => {
    if (!enabled) {
      setList([]);
      return;
    }
    let alive = true;
    loadMathHandouts()
      .then((hs) => {
        if (alive) setList(hs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);
  return list;
}

export interface HandoutExampleRef {
  handout: MathHandout;
  example: HandoutExample;
}

export interface HandoutLookup {
  byKp: Map<string, MathHandout>;
  byModule: Map<string, MathHandout[]>;
  byItemId: Map<string, HandoutExampleRef>;
  byExam: Map<string, HandoutExampleRef>;
}

export function buildHandoutLookup(handouts: MathHandout[]): HandoutLookup {
  const byKp = new Map<string, MathHandout>();
  const byModule = new Map<string, MathHandout[]>();
  const byItemId = new Map<string, HandoutExampleRef>();
  const byExam = new Map<string, HandoutExampleRef>();

  for (const h of handouts) {
    if (!byKp.has(h.primaryKpId)) byKp.set(h.primaryKpId, h);
    const modList = byModule.get(h.moduleId) ?? [];
    modList.push(h);
    byModule.set(h.moduleId, modList);

    for (const g of h.groups) {
      for (const ex of g.examples) {
        const ref: HandoutExampleRef = { handout: h, example: ex };
        if (!byItemId.has(ex.id)) byItemId.set(ex.id, ref);
        if (ex.lilin880Id && !byItemId.has(ex.lilin880Id)) {
          byItemId.set(ex.lilin880Id, ref);
        }
        if (ex.year && ex.n) {
          const key = `${ex.year}-${ex.n}`;
          if (!byExam.has(key)) byExam.set(key, ref);
        }
      }
    }
  }
  for (const h of handouts) {
    for (const sec of h.secondaryKpIds ?? []) {
      if (!byKp.has(sec)) byKp.set(sec, h);
    }
  }
  return { byKp, byModule, byItemId, byExam };
}

export function countHandoutDue(
  handout: MathHandout,
  journalByItemId: Map<string, JournalEntry>,
  markRecordMap: Map<string, UserItemMark>,
  today: string = dayKey()
): { dueCount: number; reviewedTodayCount: number } {
  let dueCount = 0;
  let reviewedTodayCount = 0;
  for (const g of handout.groups) {
    for (const ex of g.examples) {
      const st = getExampleReviewState(ex, journalByItemId, markRecordMap, today);
      if (st.isDue) dueCount += 1;
      else if (st.reviewedToday) reviewedTodayCount += 1;
    }
  }
  return { dueCount, reviewedTodayCount };
}

export function handoutHref(slug: string, opts?: { dueOnly?: boolean; anchorId?: string }): string {
  if (opts?.anchorId) return `/math-handouts/${slug}#${opts.anchorId}`;
  return opts?.dueOnly ? `/math-handouts/${slug}?review=due` : `/math-handouts/${slug}`;
}

export function matchLilin880ForHandout(
  handout: MathHandout,
  allLilin: Lilin880Item[]
): { primary: Lilin880Item[]; secondary: Lilin880Item[] } {
  const primary: Lilin880Item[] = [];
  const secondary: Lilin880Item[] = [];
  const secSet = new Set(handout.secondaryKpIds);
  for (const item of allLilin) {
    const kps = item.kp_ids ?? [];
    if (kps.includes(handout.primaryKpId)) {
      primary.push(item);
    } else if (kps.some((k) => secSet.has(k))) {
      secondary.push(item);
    }
  }
  return { primary, secondary };
}

export interface ExamMetaLite {
  kind: "mcq" | "fill" | "big";
  facets?: string[];
}

/** 推断手稿例题的题型（选择 / 填空 / 大题），优先取 880 / 真题元数据，其次按题号与来源兜底。 */
export function inferHandoutExampleKind(
  ex: HandoutExample,
  lilinMap: ReadonlyMap<string, Lilin880Item>,
  examMetaMap: ReadonlyMap<string, ExamMetaLite>
): "mcq" | "fill" | "big" {
  if (ex.lilin880Id) {
    const it = lilinMap.get(ex.lilin880Id);
    if (it?.kind) return it.kind;
  }
  if (ex.year && ex.n) {
    const em = examMetaMap.get(`${ex.year}-${ex.n}`);
    if (em?.kind) return em.kind;
  }
  if (ex.answerLetter || ex.id.includes("-mcq-") || /选择/.test(ex.source)) return "mcq";
  if (ex.id.includes("-fill-") || /填空/.test(ex.source)) return "fill";
  return "big";
}

/** 获取手稿例题对应的考法细类 facets（合并 880 与真题元数据）。 */
export function facetsOfHandoutExample(
  ex: HandoutExample,
  lilinMap: ReadonlyMap<string, Lilin880Item>,
  examMetaMap: ReadonlyMap<string, ExamMetaLite>
): string[] {
  const out = new Set<string>();
  if (ex.lilin880Id) {
    for (const f of lilinMap.get(ex.lilin880Id)?.facets ?? []) out.add(f);
  }
  if (ex.year && ex.n) {
    for (const f of examMetaMap.get(`${ex.year}-${ex.n}`)?.facets ?? []) out.add(f);
  }
  return [...out];
}

/** 判断讲义是否关联了复习性价比的「题型模板」。 */
export function handoutHasTemplates(handout: MathHandout): boolean {
  if (templatesForKp(handout.primaryKpId).length > 0) return true;
  return (handout.secondaryKpIds ?? []).some((kp) => templatesForKp(kp).length > 0);
}

/** 在「判别场景」模式下按题型筛选各场景内例题。 */
export function filterHandoutGroupsByKind(
  groups: HandoutGroup[],
  lilinMap: ReadonlyMap<string, Lilin880Item>,
  examMetaMap: ReadonlyMap<string, ExamMetaLite>,
  kindFilter: HandoutKindFilter
): HandoutGroup[] {
  if (kindFilter === "all") return groups;
  return groups.map((g) => ({
    ...g,
    examples: g.examples.filter(
      (ex) => inferHandoutExampleKind(ex, lilinMap, examMetaMap) === kindFilter
    ),
  }));
}

const SUP_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+", "ⁿ": "n", "ᵏ": "k",
};
const SUB_MAP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};
const GREEK_MAP: Record<string, string> = {
  α: "\\alpha ", β: "\\beta ", γ: "\\gamma ", δ: "\\delta ", ε: "\\varepsilon ",
  ζ: "\\zeta ", η: "\\eta ", θ: "\\theta ", κ: "\\kappa ", λ: "\\lambda ",
  μ: "\\mu ", ξ: "\\xi ", π: "\\pi ", ρ: "\\rho ", σ: "\\sigma ",
  τ: "\\tau ", φ: "\\varphi ", χ: "\\chi ", ψ: "\\psi ", ω: "\\omega ",
  Δ: "\\Delta ", Λ: "\\Lambda ", Φ: "\\Phi ", Ω: "\\Omega ",
};

/** 将模板中的紧凑数学片段转为标准 LaTeX 并由 KaTeX 渲染，避免 HTML 拼接错乱与斜杠歧义。 */
function templateMathToTex(raw: string): string {
  let s = raw
    .replace(/θ̂/g, "\\hat{\\theta}")
    .replace(/x̄/g, "\\bar{x}")
    .replace(/X̄/g, "\\bar{X}")
    .replace(/ᵀ/g, "^{\\mathsf{T}}")
    .replace(/′/g, "'")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿᵏ]+/g, (m) => `^{${[...m].map((c) => SUP_MAP[c] ?? c).join("")}}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `_{${[...m].map((c) => SUB_MAP[c] ?? c).join("")}}`)
    .replace(/∫∫∫/g, "\\iiint ")
    .replace(/∫∫/g, "\\iint ")
    .replace(/∫/g, "\\int ")
    .replace(/∬/g, "\\iint ")
    .replace(/∭/g, "\\iiint ")
    .replace(/∮/g, "\\oint ")
    .replace(/Σ/g, "\\sum ")
    .replace(/∏/g, "\\prod ")
    .replace(/∞/g, "\\infty ")
    .replace(/∇/g, "\\nabla ")
    .replace(/∂/g, "\\partial ")
    .replace(/∃/g, "\\exists ")
    .replace(/∀/g, "\\forall ")
    .replace(/∈/g, "\\in ")
    .replace(/∉/g, "\\notin ")
    .replace(/⊂/g, "\\subset ")
    .replace(/⊆/g, "\\subseteq ")
    .replace(/∪/g, "\\cup ")
    .replace(/∩/g, "\\cap ")
    .replace(/·/g, "\\cdot ")
    .replace(/×/g, "\\times ")
    .replace(/÷/g, "\\div ")
    .replace(/±/g, "\\pm ")
    .replace(/−/g, "-")
    .replace(/≠/g, "\\neq ")
    .replace(/≤/g, "\\le ")
    .replace(/≥/g, "\\ge ")
    .replace(/≈/g, "\\approx ")
    .replace(/≡/g, "\\equiv ")
    .replace(/⇔/g, "\\Leftrightarrow ")
    .replace(/⇒/g, "\\Rightarrow ")
    .replace(/→/g, "\\to ")
    .replace(/~/g, "\\sim ")
    .replace(/√\(([^)]+)\)/g, "\\sqrt{$1}")
    .replace(/√([A-Za-z0-9])/g, "\\sqrt{$1}")
    .replace(/[αβγδεζηθκλμξπρστφχψωΔΛΦΩ]/g, (c) => GREEK_MAP[c] ?? c)
    .replace(/([A-Za-z])_(min|max)\b/g, "$1_{\\mathrm{$2}}")
    .replace(/([A-Za-z])_([A-Za-z0-9]{2,})/g, "$1_{$2}")
    .replace(/\b(max|min|sin|cos|tan|ln|log|lim|exp)\b/g, "\\$1 ")
    .replace(/\b(tr|Cov|Var|div|curl)\b/g, "\\operatorname{$1}");

  // 仅当片段内只有一个斜杠时才将其排成直观看得懂的分式（避免把 Z/t/χ² 这类枚举斜杠误排成嵌套分式）
  const slashCount = (s.match(/\//g) ?? []).length;
  if (slashCount === 1) {
    s = s.replace(
      /((?:\([^()]+\)|\|[^|]+\||[A-Za-z0-9\\_{}^'()]+))\s*\/\s*((?:\([^()]+\)|\|[^|]+\||[A-Za-z0-9\\_{}^'()]+))/,
      (_m, num: string, den: string) => {
        const cleanNum = num.startsWith("(") && num.endsWith(")") ? num.slice(1, -1) : num;
        const cleanDen = den.startsWith("(") && den.endsWith(")") ? den.slice(1, -1) : den;
        return `\\frac{${cleanNum}}{${cleanDen}}`;
      }
    );
  }
  return s.trim();
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 将模板纯文本里的数学公式用 KaTeX 渲染为标准数学排版，并可选按分号拆分为清晰的分条步骤。 */
function formatTemplateInlineMath(text: string): string {
  const mathRe =
    /[A-Za-z0-9\u0391-\u03C9∫∬∭∮Σ∏√∇∂∞∃∀∈∉⊂⊆∪∩·×÷±−≠≤≥≈≡⇔⇒→~|()[\]{}_^/.,′'+\-⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿᵏ₀₁₂₃₄₅₆₇₈₉ᵀ]+(?:̂|̄)?/g;

  let out = "";
  let lastIdx = 0;
  for (const m of text.matchAll(mathRe)) {
    const start = m.index ?? 0;
    const raw = m[0];
    out += escapeHtmlText(text.slice(lastIdx, start));
    lastIdx = start + raw.length;

    // 保留纯数字、纯标点以及中文之间的单独斜杠（如 串联/并联）
    if (/^[0-9.,/+\-()[\]{}]+$/.test(raw)) {
      out += escapeHtmlText(raw);
      continue;
    }

    // 去掉末尾误吞的标点（如句末句号或逗号）
    let core = raw;
    let tail = "";
    const tailMatch = core.match(/[.,]+$/);
    if (tailMatch) {
      tail = tailMatch[0];
      core = core.slice(0, -tail.length);
    }

    try {
      const tex = templateMathToTex(core);
      const rendered = katex.renderToString(tex, {
        throwOnError: false,
        strict: "ignore",
      });
      out += `<span class="mh-tpl-katex">${rendered}</span>${escapeHtmlText(tail)}`;
    } catch {
      out += `<span class="mh-tpl-math">${escapeHtmlText(core)}</span>${escapeHtmlText(tail)}`;
    }
  }
  out += escapeHtmlText(text.slice(lastIdx));
  return out;
}

function formatTemplateTextToHtml(text: string, splitClauses = false): string {
  const trimmed = text.trim();
  if (!splitClauses) return formatTemplateInlineMath(trimmed);
  const clauses = trimmed
    .replace(/[。；;]+$/, "")
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (clauses.length <= 1) return formatTemplateInlineMath(trimmed);
  const items = clauses
    .map((c) => `<li>${formatTemplateInlineMath(c)}</li>`)
    .join("");
  return `<ol class="mh-tpl-list">${items}</ol>`;
}

/** 将手稿内全部例题按「复习性价比」同源的题型模板重新分组（每题按主考法区分度唯一归属，避免多模板重复出现）。 */
export function buildHandoutTemplateGroups(
  handout: MathHandout,
  lilinMap: ReadonlyMap<string, Lilin880Item>,
  examMetaMap: ReadonlyMap<string, ExamMetaLite>,
  kindFilter: HandoutKindFilter
): HandoutGroup[] {
  const uniqueExamples: HandoutExample[] = [];
  const seen = new Set<string>();
  for (const g of handout.groups) {
    for (const ex of g.examples) {
      if (seen.has(ex.anchorId)) continue;
      seen.add(ex.anchorId);
      if (
        kindFilter !== "all" &&
        inferHandoutExampleKind(ex, lilinMap, examMetaMap) !== kindFilter
      ) {
        continue;
      }
      uniqueExamples.push(ex);
    }
  }

  const primaryTemplates = templatesForKp(handout.primaryKpId);
  const templates =
    primaryTemplates.length > 0
      ? primaryTemplates
      : (handout.secondaryKpIds ?? []).flatMap((kp) => templatesForKp(kp));

  // 统计每个 facet 在当前考点各模板中的出现频次：只在单一模板出现的专属考法（如 maxmin / sum_conv）权重最高，
  // 而跨模板共享的背景标签（如 indep_rv / uniform / exp）权重压低，避免一题被误吸进多个模板。
  const facetDf = new Map<string, number>();
  for (const tpl of templates) {
    for (const f of new Set(tpl.facets)) {
      facetDf.set(f, (facetDf.get(f) ?? 0) + 1);
    }
  }

  const buckets = new Map<string, HandoutExample[]>();
  for (const tpl of templates) buckets.set(tpl.id, []);
  const unmatched: HandoutExample[] = [];

  for (const ex of uniqueExamples) {
    const exFacets = facetsOfHandoutExample(ex, lilinMap, examMetaMap);
    let bestTplId: string | null = null;
    let bestScore = 0;

    for (const tpl of templates) {
      let score = 0;
      for (let eIdx = 0; eIdx < exFacets.length; eIdx++) {
        const f = exFacets[eIdx];
        const tIdx = tpl.facets.indexOf(f);
        if (tIdx < 0) continue;
        const df = facetDf.get(f) ?? 1;
        const specificity = df === 1 ? 4.0 : 1.0 / df;
        const exWeight = 1.0 / (eIdx + 1);
        const tplWeight = 1.0 / (0.5 * tIdx + 1);
        score += specificity * exWeight * tplWeight;
      }
      if (score > bestScore) {
        bestScore = score;
        bestTplId = tpl.id;
      }
    }

    if (bestTplId) {
      buckets.get(bestTplId)!.push(ex);
    } else {
      unmatched.push(ex);
    }
  }

  const groups: HandoutGroup[] = [];
  for (const tpl of templates) {
    const matched = buckets.get(tpl.id) ?? [];
    if (matched.length === 0) continue;
    groups.push({
      id: `tpl-${tpl.id}`,
      title: tpl.name,
      guide: {
        shortTitle: tpl.name,
        clueHtml: formatTemplateTextToHtml(tpl.recognize, false),
        coreHtml: formatTemplateTextToHtml(tpl.route, true),
        pitfallHtml: "",
        roadmapHtml: "",
        featuredAnchorIds: [],
        structured: true,
      },
      examples: matched,
    });
  }

  if (unmatched.length > 0 || groups.length === 0) {
    groups.push({
      id: "tpl-other",
      title: "综合 / 未归类",
      guide: {
        shortTitle: "综合 / 未归类",
        clueHtml: "本组收录暂未命中单一模板的综合题。",
        coreHtml: "先识别题干给出的分布或结构条件，再拆分对应模板路线逐问作答。",
        pitfallHtml: "",
        roadmapHtml: "",
        featuredAnchorIds: [],
        structured: true,
      },
      examples: unmatched,
    });
  }

  return groups;
}
