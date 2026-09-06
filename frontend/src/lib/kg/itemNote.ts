// 刷题思路备注：挂在题目 id 上，与会/模糊/不会标记独立。
export const MAX_ITEM_NOTE = 2000;

export function normalizeItemNote(note: string): string {
  return note.trim().slice(0, MAX_ITEM_NOTE);
}

/** 空备注删键；未变化则返回原对象，避免无谓 bump updatedAt。 */
export function upsertItemNotes(
  notes: Record<string, string>,
  itemId: string,
  note: string
): Record<string, string> {
  const trimmed = normalizeItemNote(note);
  if (!trimmed) {
    if (!(itemId in notes)) return notes;
    const next = { ...notes };
    delete next[itemId];
    return next;
  }
  if (notes[itemId] === trimmed) return notes;
  return { ...notes, [itemId]: trimmed };
}
