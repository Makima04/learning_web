import type { Card, CardState } from "@/lib/srs";
import type {
  JournalCategory,
  JournalEntry,
  JournalKind,
  ReviewLog,
  ReviewResult,
  ReviewStep,
  WeeklySummary,
} from "@/lib/journal";
import type { Meta } from "@/stores/meta";
import type { Direction, Settings } from "@/stores/settings";

export interface JournalImport {
  categories: JournalCategory[];
  entries: JournalEntry[];
  logs: ReviewLog[];
  weeklies: WeeklySummary[];
  updatedAt: number;
}

export interface ImportedData {
  cards?: Record<number, Card>;
  meta?: Meta;
  settings?: Partial<Settings>;
  journal?: JournalImport;
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

function dayString(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label}日期无效`);
  }
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
  if (source.enableCloze !== undefined) {
    result.enableCloze = boolean(source.enableCloze, "重学完型填空");
  }
  if (source.journalDailyReviewLimits !== undefined) {
    const limitsRaw = record(source.journalDailyReviewLimits, "学习日志分类每日上限");
    const limits: Record<string, number> = {};
    for (const [id, raw] of Object.entries(limitsRaw)) {
      if (!id) continue;
      limits[id] = number(raw, `学习日志分类 ${id} 每日上限`, {
        integer: true,
        min: 0,
        max: 100,
      });
    }
    result.journalDailyReviewLimits = limits;
  }
  if (source.journalKgChapterDailyLimit !== undefined) {
    result.journalKgChapterDailyLimit = number(
      source.journalKgChapterDailyLimit,
      "知识图谱每日章节上限",
      { integer: true, min: 0, max: 20 }
    );
  }
  return result;
}

function journalCategory(value: unknown, index: number): JournalCategory {
  const item = record(value, `日志分类 ${index}`);
  if (typeof item.id !== "string" || !item.id) {
    throw new Error(`日志分类 ${index} 的 id 无效`);
  }
  if (typeof item.name !== "string" || !item.name.trim()) {
    throw new Error(`日志分类 ${index} 的名称无效`);
  }
  return {
    id: item.id,
    name: item.name.trim(),
    color: typeof item.color === "string" ? item.color : "#64748b",
    order: typeof item.order === "number" ? item.order : index,
  };
}

function journalEntry(value: unknown, index: number): JournalEntry {
  const item = record(value, `日志条目 ${index}`);
  if (typeof item.id !== "string" || !item.id) {
    throw new Error(`日志条目 ${index} 的 id 无效`);
  }
  if (typeof item.categoryId !== "string" || !item.categoryId) {
    throw new Error(`日志条目 ${index} 的分类无效`);
  }
  if (typeof item.title !== "string" || !item.title.trim()) {
    throw new Error(`日志条目 ${index} 的标题无效`);
  }
  const kind = item.kind;
  if (kind !== "learn" && kind !== "mistake") {
    throw new Error(`日志条目 ${index} 的类型无效`);
  }
  const step = number(item.step, `日志条目 ${index} 的间隔`, {
    integer: true,
    min: 1,
    max: 14,
  });
  if (![1, 3, 7, 14].includes(step)) {
    throw new Error(`日志条目 ${index} 的间隔档位无效`);
  }
  const status = item.status;
  if (status !== "active" && status !== "archived") {
    throw new Error(`日志条目 ${index} 的状态无效`);
  }
  const result: JournalEntry = {
    id: item.id,
    categoryId: item.categoryId,
    title: item.title.trim(),
    body: typeof item.body === "string" ? item.body : "",
    kind: kind as JournalKind,
    createdOn: dayString(item.createdOn, `日志条目 ${index} 的创建日`),
    nextReviewOn: dayString(item.nextReviewOn, `日志条目 ${index} 的复盘日`),
    step: step as ReviewStep,
    status,
    lapses: number(item.lapses ?? 0, `日志条目 ${index} 的回退次数`, {
      integer: true,
      min: 0,
    }),
    updatedAt: number(item.updatedAt ?? 0, `日志条目 ${index} 的更新时间`, { min: 0 }),
  };
  if (item.lastReviewedOn !== undefined) {
    result.lastReviewedOn = dayString(item.lastReviewedOn, `日志条目 ${index} 的上次复盘`);
  }
  if (typeof item.kpId === "string" && item.kpId.trim()) {
    result.kpId = item.kpId.trim();
  }
  if (item.fromKg === true) {
    result.fromKg = true;
  }
  return result;
}

function journalLog(value: unknown, index: number): ReviewLog {
  const item = record(value, `复盘记录 ${index}`);
  if (typeof item.id !== "string" || !item.id) {
    throw new Error(`复盘记录 ${index} 的 id 无效`);
  }
  if (typeof item.entryId !== "string" || !item.entryId) {
    throw new Error(`复盘记录 ${index} 的条目 id 无效`);
  }
  const result = item.result;
  if (result !== "pass" && result !== "hard" && result !== "fail") {
    throw new Error(`复盘记录 ${index} 的结果无效`);
  }
  const log: ReviewLog = {
    id: item.id,
    entryId: item.entryId,
    date: dayString(item.date, `复盘记录 ${index} 的日期`),
    result: result as ReviewResult,
  };
  if (item.note !== undefined) {
    if (typeof item.note !== "string") throw new Error(`复盘记录 ${index} 的备注无效`);
    log.note = item.note;
  }
  return log;
}

function journalWeekly(value: unknown, index: number): WeeklySummary {
  const item = record(value, `周报 ${index}`);
  return {
    weekKey: dayString(item.weekKey, `周报 ${index} 的周键`),
    note: typeof item.note === "string" ? item.note : "",
    updatedAt: number(item.updatedAt ?? 0, `周报 ${index} 的更新时间`, { min: 0 }),
  };
}

export function parseJournal(value: unknown): JournalImport {
  const source = record(value, "学习日志");
  const categoriesRaw = source.categories;
  const entriesRaw = source.entries;
  const logsRaw = source.logs;
  const weekliesRaw = source.weeklies;
  if (categoriesRaw !== undefined && !Array.isArray(categoriesRaw)) {
    throw new Error("学习日志分类格式无效");
  }
  if (entriesRaw !== undefined && !Array.isArray(entriesRaw)) {
    throw new Error("学习日志条目格式无效");
  }
  if (logsRaw !== undefined && !Array.isArray(logsRaw)) {
    throw new Error("学习日志复盘记录格式无效");
  }
  if (weekliesRaw !== undefined && !Array.isArray(weekliesRaw)) {
    throw new Error("学习日志周报格式无效");
  }
  const categories = (categoriesRaw as unknown[] | undefined)?.map(journalCategory) || [];
  const entries = (entriesRaw as unknown[] | undefined)?.map(journalEntry) || [];
  const logs = (logsRaw as unknown[] | undefined)?.map(journalLog) || [];
  const weeklies = (weekliesRaw as unknown[] | undefined)?.map(journalWeekly) || [];
  if (categories.length > 200) throw new Error("学习日志分类过多");
  if (entries.length > 20000) throw new Error("学习日志条目过多");
  if (logs.length > 50000) throw new Error("学习日志复盘记录过多");
  return {
    categories,
    entries,
    logs,
    weeklies,
    updatedAt: number(source.updatedAt ?? Date.now(), "学习日志更新时间", { min: 0 }),
  };
}

export function parseImportData(text: string): ImportedData {
  const source = record(JSON.parse(text) as unknown, "导入文件");
  const result: ImportedData = {};
  if (source.cards !== undefined) result.cards = cards(source.cards);
  if (source.meta !== undefined) result.meta = meta(source.meta);
  if (source.settings !== undefined) result.settings = settings(source.settings);
  if (source.journal !== undefined) result.journal = parseJournal(source.journal);
  if (!result.cards && !result.meta && !result.settings && !result.journal) {
    throw new Error("导入文件不包含卡片、统计、设置或学习日志数据");
  }
  return result;
}
