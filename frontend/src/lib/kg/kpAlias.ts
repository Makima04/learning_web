/** 旧考点 id → 现行 id。日志 / 进度里可能还留着已拆掉的点。 */
export const KP_ID_ALIASES: Record<string, string> = {
  "la.eq.gauss": "la.eq.structure",
};

export function canonicalKpId(id: string | undefined | null): string {
  if (!id) return "";
  return KP_ID_ALIASES[id] ?? id;
}
