// 把 todayLog 的 wordIdx 解析成展示用词条
import { getWordMap } from "@/lib/words";
import type { TodayLogItem, TodayLogType } from "@/stores/todayLog";

export interface TodayWordRow {
  wordIdx: number;
  type: TodayLogType;
  at: number;
  en: string;
  cn: string;
}

export function resolveTodayWords(items: TodayLogItem[]): TodayWordRow[] {
  const map = getWordMap();
  return items.map((it) => {
    const entry = map.get(it.wordIdx);
    const en = entry?.[1] || `#${it.wordIdx}`;
    const senses = entry?.[2] || [];
    const cn = senses.map((s) => (s[0] ? `${s[0]} ${s[1]}` : s[1])).join("；");
    return { wordIdx: it.wordIdx, type: it.type, at: it.at, en, cn };
  });
}
