import type { WangdaoItem } from "./wangdao408";

const BOOK_NAMES: Record<string, string> = {
  ds: "数据结构", co: "计算机组成原理", os: "操作系统", cn: "计算机网络",
};

/** 题号沿用原书小节内编号，与本次队列的第几题分开。 */
export function practiceQuestionLocation(item: WangdaoItem): string {
  if (item.source === "lilin880" || item.source === "zhangyu1000") {
    return `${item.source === "lilin880" ? "李林 880" : "张宇 1000"} · §${item.section} · 第 ${item.qno} 题`;
  }
  const section = String(item.section ?? "").trim();
  const chapter = /^(\d+)(?:\.|$)/.exec(section)?.[1];
  const position = chapter
    ? `第 ${chapter} 章${section.includes(".") ? ` · 第 ${section} 节` : ""}`
    : section ? `小节 ${section}` : "章节待核对";
  const name = item.section_name?.trim();
  const kind = item.kind === "big" ? "大题" : item.kind === "mcq" ? "选择题" : "题目";
  return ["王道", BOOK_NAMES[item.book], position, name,
    `${kind}第 ${item.qno} 题`].filter(Boolean).join(" · ");
}
