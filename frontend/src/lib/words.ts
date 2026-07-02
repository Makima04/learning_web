// words.ts —— window.WORDS / window.PAPERS 的类型化访问 + 反向索引 + PAPER_ORDER。
// 模块级 memo：6550 词 + 8MB papers 只构建一次。
import type { Paper, Passage, PaperSection, Sense, WordEntry } from "@/types/words";

export function getWords(): WordEntry[] {
  return (typeof window !== "undefined" && window.WORDS) || [];
}
export function getPapers(): Paper[] {
  return (typeof window !== "undefined" && window.PAPERS) || [];
}

const WORD_MAP: Map<number, WordEntry> = new Map();
let wordMapBuilt = false;
export function getWordMap(): Map<number, WordEntry> {
  if (!wordMapBuilt) {
    for (const w of getWords()) WORD_MAP.set(w[0], w);
    wordMapBuilt = true;
  }
  return WORD_MAP;
}

// 按 english 小写建反查（用于真题匹配回查）
const WORD_BY_EN: Map<string, WordEntry> = new Map();
let enMapBuilt = false;
export function getWordByEn(): Map<string, WordEntry> {
  if (!enMapBuilt) {
    for (const w of getWords()) WORD_BY_EN.set(w[1].toLowerCase(), w);
    enMapBuilt = true;
  }
  return WORD_BY_EN;
}

// ---- 反向索引：word_idx -> 该词出现在哪些真题例句 ----
export interface WordExample {
  year: number | null;
  label: string | null;
  sentence: string;
}
let exampleIndex: Map<number, WordExample[]> | null = null;
export function getExampleIndex(): Map<number, WordExample[]> {
  if (exampleIndex) return exampleIndex;
  const idx: Map<number, WordExample[]> = new Map();
  for (const p of getPapers()) {
    for (const s of p.sections || []) {
      for (const psg of s.passages || []) {
        for (const w of psg.words || []) {
          if (!w.sentences || w.sentences.length === 0) continue;
          const arr = idx.get(w.idx) || [];
          for (const sent of w.sentences) {
            if (sent && sent.trim())
              arr.push({ year: p.year, label: psg.label, sentence: sent });
          }
          if (arr.length) idx.set(w.idx, arr);
        }
      }
    }
  }
  exampleIndex = idx;
  return idx;
}

export function getExamples(idx: number, limit = 5): WordExample[] {
  return (getExampleIndex().get(idx) || []).slice(0, limit);
}

// ---- PAPER_ORDER：未学习新词的出场顺序 = 真题出现顺序（2006→）----
// 按 PAPERS year 升序遍历，每篇章 words[]（已按 count desc）按首次出现收集 idx，
// 最后追加不出现在任何真题的 WORDS 索引（按 WORDS 顺序）。
let paperOrder: number[] | null = null;
export function getPaperOrder(): number[] {
  if (paperOrder) return paperOrder;
  const seen: Set<number> = new Set();
  const order: number[] = [];
  const papers = getPapers()
    .slice()
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  for (const p of papers) {
    for (const s of p.sections || []) {
      for (const psg of s.passages || []) {
        for (const w of psg.words || []) {
          if (!seen.has(w.idx)) {
            seen.add(w.idx);
            order.push(w.idx);
          }
        }
      }
    }
  }
  // 追加未出现在任何真题的词，按 WORDS 顺序
  for (const w of getWords()) {
    if (!seen.has(w[0])) {
      seen.add(w[0]);
      order.push(w[0]);
    }
  }
  paperOrder = order;
  return order;
}

// ---- 分类：已学习 / 未学习 ----
// 已学习 = 有卡且 state in (learn,review) 或 reps>0；未学习 = 无卡或 new&reps===0。
import type { Card } from "@/lib/srs";
export function isStudied(card: Card | null): boolean {
  if (!card) return false;
  if (card.state === "learn" || card.state === "review") return true;
  return (card.reps || 0) > 0;
}

// ---- 章节类型中文标签 ----
export const SECTION_TYPE_LABEL: Record<string, string> = {
  use_of_english: "完形",
  reading_a: "阅读A",
  reading_b: "新题型",
  translation: "翻译",
  writing: "写作",
};

export type { Paper, Passage, PaperSection, Sense, WordEntry };
