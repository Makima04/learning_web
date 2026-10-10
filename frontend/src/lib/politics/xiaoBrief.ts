// 肖 1000 选择题二次解析：会话内记一份，服务端按题缓存。
import * as api from "@/lib/api";
import type { XiaoBriefResult } from "@/lib/api";
import { normalizeXiaoAnswer, optionKeys, type XiaoQuestion } from "@/lib/politics/xiao";

const mem = new Map<string, XiaoBriefResult>();

export function peekXiaoBrief(itemId: string): XiaoBriefResult | null {
  return mem.get(itemId) ?? null;
}

export function rememberXiaoBrief(itemId: string, result: XiaoBriefResult) {
  if (result.status === "ok" && result.key) mem.set(itemId, result);
}

export async function loadXiaoBrief(item: XiaoQuestion): Promise<XiaoBriefResult> {
  const hit = peekXiaoBrief(item.id);
  if (hit) return hit;
  const result = await api.xiaoBrief({
    item_id: item.id,
    kind: item.kind,
    stem: item.stem,
    options: optionKeys(item).map((k) => ({ k, text: item.options[k] ?? "" })),
    answer: normalizeXiaoAnswer(item.answer),
    explain: item.explain ?? "",
  });
  rememberXiaoBrief(item.id, result);
  return result;
}
