type Pos = string;
export type Sense = [Pos, string]; // [pos, cn]
export type WordEntry = [number, string, Sense[]]; // [index, english, senses]

export interface PassageWord {
  idx: number;
  english: string;
  senses: Sense[];
  count: number;
  sentences: string[];
}
export interface Passage {
  label: string;
  body: string;
  words: PassageWord[];
  itemCount?: number;
}
export type SectionType =
  | "use_of_english"
  | "reading_a"
  | "reading_b"
  | "translation"
  | "writing";
export interface PaperSection {
  type: SectionType;
  title: string;
  passages: Passage[];
}
export interface Paper {
  year: number;
  source?: string;
  variant?: "en1" | "en2";
  sections: PaperSection[];
}

declare global {
  interface Window {
    WORDS: WordEntry[];
    PAPERS: Paper[];
    // 旧版可选的 baked 译文文件
    TRANS?: Record<string, string>;
  }
}

export {};
