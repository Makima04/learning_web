// 408 大题预测：结构由算法固定，内容槽位只选题点（LLM/题库后填）
import { CS408_BIG_SLOTS, CS408_BOOKS, findKp, moduleIdOfKp } from "@/data/kg";
import type {
  BlueprintSlot,
  KnowledgePoint,
  PredictBlueprint,
  UserKpState,
} from "./types";

export interface BlueprintOptions {
  /** 用户考点状态，用于弱项加权 */
  states?: Record<string, UserKpState>;
  /** 近期测过的 kp，降权 */
  recentlyTestedKpIds?: string[];
  /** 可注入随机源，便于测试 */
  random?: () => number;
  now?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreKp(
  kp: KnowledgePoint,
  states: Record<string, UserKpState> | undefined,
  recently: Set<string>,
  usedModules: Set<string>
): number {
  const st = states?.[kp.id];
  const freqN = (kp.freq || 1) / 5;
  const big = kp.bigWeight ?? 0.3;
  const weak = st ? 1 - st.confidence : 0.55; // 未知略提高探索
  const gap = st?.covered ? 0.2 : 0.7;
  const recentPenalty = recently.has(kp.id) ? 0.85 : 0;
  const masteryPenalty = st && st.confidence > 0.85 ? 0.5 : 0;
  const mod = moduleIdOfKp(kp.id);
  const moduleDiversity = mod && usedModules.has(mod) ? 0.35 : 0;

  // 大题优先 bigWeight 高的考点
  return (
    0.28 * freqN +
    0.32 * big +
    0.22 * weak +
    0.12 * gap -
    recentPenalty -
    masteryPenalty -
    moduleDiversity +
    // 极小噪声位留给调用方 random 加权抽样
    0
  );
}

function weightedPick(
  items: { kp: KnowledgePoint; score: number }[],
  rnd: () => number
): KnowledgePoint | null {
  if (!items.length) return null;
  // 分数平移到正数
  const min = Math.min(...items.map((i) => i.score));
  const weights = items.map((i) => Math.max(0.01, i.score - min + 0.05));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i].kp;
  }
  return items[items.length - 1].kp;
}

function kpsInBook(bookId: string): KnowledgePoint[] {
  const book = CS408_BOOKS.find((b) => b.id === bookId);
  if (!book) return [];
  return book.modules.flatMap((m) => m.kps);
}

/**
 * 生成 408 仅大题预测蓝图。
 * 硬约束：
 * 1. 固定 7 槽：DS2 + CO2 + OS2 + CN1
 * 2. 同一卷 primaryKp 不重复
 * 3. 同书尽量不同模块
 */
export function buildCs408BigBlueprint(
  opts: BlueprintOptions = {}
): PredictBlueprint {
  const rnd = opts.random ?? mulberry32((opts.now ?? Date.now()) & 0xffffffff);
  const states = opts.states;
  const recently = new Set(opts.recentlyTestedKpIds ?? []);
  const usedPrimary = new Set<string>();
  const usedModulesByBook = new Map<string, Set<string>>();
  const slots: BlueprintSlot[] = [];

  for (const tmpl of CS408_BIG_SLOTS) {
    const usedMods = usedModulesByBook.get(tmpl.bookId) ?? new Set();
    const candidates = kpsInBook(tmpl.bookId)
      .filter((kp) => (kp.bigWeight ?? 0) >= 0.25) // 大题候选
      .filter((kp) => !usedPrimary.has(kp.id))
      .map((kp) => ({
        kp,
        score: scoreKp(kp, states, recently, usedMods),
      }));

    // 若过滤后太少，放宽 bigWeight
    const pool =
      candidates.length >= 2
        ? candidates
        : kpsInBook(tmpl.bookId)
            .filter((kp) => !usedPrimary.has(kp.id))
            .map((kp) => ({
              kp,
              score: scoreKp(kp, states, recently, usedMods),
            }));

    const primary = weightedPick(pool, rnd);
    if (!primary) {
      throw new Error(`no kp candidate for slot ${tmpl.slotId}`);
    }

    usedPrimary.add(primary.id);
    const modId = moduleIdOfKp(primary.id) || "";
    if (modId) {
      usedMods.add(modId);
      usedModulesByBook.set(tmpl.bookId, usedMods);
    }

    // secondary：同模块或先修，且不与 primary 相同
    const found = findKp(primary.id);
    const secondary: string[] = [];
    if (found) {
      for (const pr of primary.prereqs ?? []) {
        if (!usedPrimary.has(pr) && secondary.length < 2) secondary.push(pr);
      }
      for (const other of found.module.kps) {
        if (other.id === primary.id) continue;
        if (usedPrimary.has(other.id)) continue;
        if (secondary.length >= 2) break;
        if (!secondary.includes(other.id)) secondary.push(other.id);
      }
    }

    const conf = states?.[primary.id]?.confidence;
    const difficulty = ((): 1 | 2 | 3 | 4 | 5 => {
      const base = Math.round((primary.freq + primary.bigWeight * 5) / 2);
      if (conf != null && conf < 0.3) return Math.min(5, base + 1) as 1 | 2 | 3 | 4 | 5;
      return Math.max(1, Math.min(5, base)) as 1 | 2 | 3 | 4 | 5;
    })();

    slots.push({
      slotId: tmpl.slotId,
      bookId: tmpl.bookId,
      order: tmpl.order,
      suggestPoints: tmpl.suggestPoints,
      primaryKpId: primary.id,
      secondaryKpIds: secondary.slice(0, 2),
      moduleId: modId,
      difficulty,
      rationale: `${tmpl.label} · 主考 ${primary.name}（频${primary.freq}/大题权${primary.bigWeight}）`,
    });
  }

  return {
    subject: "cs408",
    kind: "big_only",
    createdAt: opts.now ?? Date.now(),
    slots,
    usedPrimaryKpIds: [...usedPrimary],
  };
}

/** 校验蓝图硬约束（测试/服务端共用逻辑） */
export function validateCs408BigBlueprint(bp: PredictBlueprint): string[] {
  const errors: string[] = [];
  if (bp.slots.length !== CS408_BIG_SLOTS.length) {
    errors.push(`expected ${CS408_BIG_SLOTS.length} slots, got ${bp.slots.length}`);
  }
  const primaries = bp.slots.map((s) => s.primaryKpId);
  if (new Set(primaries).size !== primaries.length) {
    errors.push("duplicate primaryKpId in paper");
  }
  for (const tmpl of CS408_BIG_SLOTS) {
    const slot = bp.slots.find((s) => s.slotId === tmpl.slotId);
    if (!slot) {
      errors.push(`missing slot ${tmpl.slotId}`);
      continue;
    }
    if (slot.bookId !== tmpl.bookId) {
      errors.push(`${tmpl.slotId} book mismatch`);
    }
    const found = findKp(slot.primaryKpId);
    if (!found) errors.push(`unknown kp ${slot.primaryKpId}`);
    else if (found.book.id !== tmpl.bookId) {
      errors.push(`${slot.primaryKpId} not in book ${tmpl.bookId}`);
    }
  }
  return errors;
}

/** 无 LLM 时的模板题（可自测标记闭环） */
export function templateItemFromSlot(
  slot: BlueprintSlot,
  paperId: string
): {
  slotId: string;
  itemId: string;
  source: "template";
  stem: string;
  answer: string;
  solution: string;
  primaryKpId: string;
  secondaryKpIds: string[];
  bookId: BlueprintSlot["bookId"];
  moduleId: string;
  suggestPoints: number;
} {
  const found = findKp(slot.primaryKpId);
  const name = found?.kp.name ?? slot.primaryKpId;
  const bookName = found?.book.name ?? slot.bookId;
  return {
    slotId: slot.slotId,
    itemId: `${paperId}-${slot.slotId}`,
    source: "template",
    stem: `【${bookName} · ${slot.suggestPoints} 分】（预测模板题）\n请围绕考点「${name}」完成一道综合应用题。\n\n要求：\n1. 先写出本题涉及的核心定义/定理/算法步骤；\n2. 给出可检验的关键步骤与复杂度（如适用）；\n3. 若不会，直接标记「不会」或展开选择薄弱子考点。\n\n（正式版将由组卷蓝图驱动 LLM/题库生成完整题干。）`,
    answer: `主考点：${name}`,
    solution: `复习建议：回到模块「${found?.module.name ?? slot.moduleId}」，优先看先修 ${
      (found?.kp.prereqs ?? []).join("、") || "（无）"
    }，再做近 5 年同考点真题。`,
    primaryKpId: slot.primaryKpId,
    secondaryKpIds: slot.secondaryKpIds,
    bookId: slot.bookId,
    moduleId: slot.moduleId,
    suggestPoints: slot.suggestPoints,
  };
}
