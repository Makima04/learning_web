// 王道大题 LLM 解析：登录后调 /api/kg/explain；会话内记一份，避免来回点重复请求。
import { findKp } from "@/data/kg";
import * as api from "@/lib/api";
import type { KgExplainResult } from "@/lib/api";
import type { WangdaoItem } from "@/lib/kg/wangdao408";

const mem = new Map<string, KgExplainResult>();

export function canExplain(item: Pick<WangdaoItem, "kind" | "stem">): boolean {
  return item.kind === "big" && Boolean((item.stem || "").trim());
}

export function canRevealAnswer(
  item: Pick<WangdaoItem, "kind" | "stem" | "answer" | "ans_img" | "facets">
): boolean {
  return Boolean(
    item.answer || item.ans_img || (item.facets && item.facets.length) || canExplain(item)
  );
}

export function peekExplain(itemId: string): KgExplainResult | null {
  return mem.get(itemId) ?? null;
}

export function rememberExplain(itemId: string, result: KgExplainResult) {
  if (result.status === "ok" && (result.answer || result.solution)) {
    mem.set(itemId, result);
  }
}

/** 测试用 */
export function clearExplainCache() {
  mem.clear();
}

export function explainPayload(item: WangdaoItem): api.KgExplainBody {
  const kpName = (item.kp_ids || [])
    .map((id) => findKp(id)?.kp.name)
    .filter((n): n is string => Boolean(n))
    .join("、");
  return {
    item_id: item.id,
    stem: (item.stem || "").trim(),
    book: item.book,
    section: item.section,
    qno: item.qno,
    kind: item.kind,
    kp_name: kpName || undefined,
  };
}

export async function explainQuestion(item: WangdaoItem): Promise<KgExplainResult> {
  const hit = peekExplain(item.id);
  if (hit) return hit;
  const r = await api.kgExplain(explainPayload(item));
  rememberExplain(item.id, r);
  return r;
}
