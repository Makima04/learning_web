import type { Card, CardState } from "@/lib/srs";
import type { Meta } from "@/stores/meta";
import type { Direction, Settings } from "@/stores/settings";

export interface ImportedData {
  cards?: Record<number, Card>;
  meta?: Meta;
  settings?: Partial<Settings>;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}格式无效`);
  }
  return value as UnknownRecord;
}

function number(
  value: unknown,
  label: string,
  options: { integer?: boolean; min?: number; max?: number } = {}
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}必须是数字`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`${label}必须是整数`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`${label}不能小于 ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${label}不能大于 ${options.max}`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}必须是布尔值`);
  return value;
}

function card(value: unknown, index: number): Card {
  const item = record(value, `卡片 ${index}`);
  const state = item.state;
  if (state !== "new" && state !== "learn" && state !== "review") {
    throw new Error(`卡片 ${index} 的状态无效`);
  }
  const result: Card = {
    state: state as CardState,
    due: number(item.due, `卡片 ${index} 的到期时间`, { min: 0 }),
    ivl: number(item.ivl, `卡片 ${index} 的间隔`, { integer: true, min: 0 }),
    ease: number(item.ease, `卡片 ${index} 的难度`, { min: 1.3, max: 3 }),
    reps: number(item.reps, `卡片 ${index} 的复习次数`, { integer: true, min: 0 }),
    lapses: number(item.lapses, `卡片 ${index} 的遗忘次数`, { integer: true, min: 0 }),
  };
  if (item.learned !== undefined) result.learned = boolean(item.learned, `卡片 ${index} 的学习状态`);
  if (item.quiz !== undefined) {
    result.quiz = number(item.quiz, `卡片 ${index} 的学习步骤`, {
      integer: true,
      min: 0,
      max: 3,
    });
  }
  if (item.updatedAt !== undefined) {
    result.updatedAt = number(item.updatedAt, `卡片 ${index} 的更新时间`, { min: 0 });
  }
  return result;
}

function cards(value: unknown): Record<number, Card> {
  const source = record(value, "卡片数据");
  const entries = Object.entries(source);
  if (entries.length > 6550) throw new Error("卡片数量超过词库上限");
  const result: Record<number, Card> = {};
  for (const [key, value] of entries) {
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 1 || index > 6550) {
      throw new Error(`卡片索引 ${key} 无效`);
    }
    result[index] = card(value, index);
  }
  return result;
}

function meta(value: unknown): Meta {
  const source = record(value, "每日统计");
  if (typeof source.dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.dayKey)) {
    throw new Error("每日统计日期无效");
  }
  return {
    dayKey: source.dayKey,
    newToday: number(source.newToday, "今日新词数", { integer: true, min: 0 }),
    reviewToday: number(source.reviewToday, "今日复习数", { integer: true, min: 0 }),
    learnToday: number(source.learnToday, "今日学习数", { integer: true, min: 0 }),
    doneToday: number(source.doneToday, "今日完成数", { integer: true, min: 0 }),
    created: number(source.created, "数据创建时间", { min: 0 }),
  };
}

function settings(value: unknown): Partial<Settings> {
  const source = record(value, "设置数据");
  const result: Partial<Settings> = {};
  if (source.dailyNew !== undefined) {
    result.dailyNew = number(source.dailyNew, "每日新词数", { integer: true, min: 1, max: 200 });
  }
  if (source.dailyReview !== undefined) {
    result.dailyReview = number(source.dailyReview, "每日复习上限", {
      integer: true,
      min: 10,
      max: 500,
    });
  }
  if (source.direction !== undefined) {
    if (!(["en2cn", "cn2en", "random"] as unknown[]).includes(source.direction)) {
      throw new Error("记忆方向无效");
    }
    result.direction = source.direction as Direction;
  }
  if (source.autoSpeak !== undefined) result.autoSpeak = boolean(source.autoSpeak, "自动发音");
  if (source.speakOnWordClick !== undefined) {
    result.speakOnWordClick = boolean(source.speakOnWordClick, "点词朗读");
  }
  if (source.rate !== undefined) {
    result.rate = number(source.rate, "语速", { min: 0.5, max: 1.5 });
  }
  if (source.orderSeed !== undefined) {
    result.orderSeed = number(source.orderSeed, "乱序种子", {
      integer: true,
      min: 0,
      max: 0xffff_ffff,
    });
  }
  if (source.groupSize !== undefined) {
    result.groupSize = number(source.groupSize, "每组词数", { integer: true, min: 5, max: 100 });
  }
  return result;
}

export function parseImportData(text: string): ImportedData {
  const source = record(JSON.parse(text) as unknown, "导入文件");
  const result: ImportedData = {};
  if (source.cards !== undefined) result.cards = cards(source.cards);
  if (source.meta !== undefined) result.meta = meta(source.meta);
  if (source.settings !== undefined) result.settings = settings(source.settings);
  if (!result.cards && !result.meta && !result.settings) {
    throw new Error("导入文件不包含卡片、统计或设置数据");
  }
  return result;
}
