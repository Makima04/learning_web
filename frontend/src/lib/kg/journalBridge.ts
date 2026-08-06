// 知识图谱 ↔ 学习日志：纯函数桥接（map / copy / 日期对齐）。
// store 侧各自 getState 调用，本文件不 import store，避免循环依赖。
import { findKp } from "@/data/kg";
import type { MarkLevel } from "@/lib/kg/types";
import type { ReviewResult } from "@/lib/journal";

/** 学习日志复盘结果 → 图谱轻量标记 */
export function mapReviewToMark(result: ReviewResult): MarkLevel {
  if (result === "pass") return "pass";
  if (result === "hard") return "fuzzy";
  return "fail";
}

/** 图谱创建日志时的标题 / 正文 / 分类 */
export function journalCopyForKp(kpId: string): {
  title: string;
  body: string;
  categoryId: string;
} | null {
  const hit = findKp(kpId);
  if (!hit) return null;
  const { kp, module, book } = hit;
  return {
    title: kp.name,
    body: `来自知识图谱：${book.name} · ${module.name}`,
    categoryId: book.subject === "math" ? "cat-math" : "cat-408",
  };
}

/** YYYY-MM-DD → 本地 0 点 ms，用于对齐 kp.due */
export function dayKeyToLocalMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getTime();
}
