import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { useKgProgress } from "@/stores/kgProgress";

const TEXTAREA_CLS =
  "flex min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** 题目级思路备注：本地即时写，登录后随图谱进度同步。 */
export function ItemNoteField({ itemId }: { itemId: string }) {
  const stored = useKgProgress((s) => s.itemNotes?.[itemId] ?? "");
  const saveItemNote = useKgProgress((s) => s.saveItemNote);
  const [open, setOpen] = useState(() => Boolean(stored));
  const [text, setText] = useState(stored);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const n = useKgProgress.getState().itemNotes?.[itemId] ?? "";
    setText(n);
    setOpen(Boolean(n));
  }, [itemId]);

  function commit(next: string) {
    setText(next);
    saveItemNote(itemId, next);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => taRef.current?.focus(), 0);
        }}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        写思路备注
      </button>
    );
  }

  return (
    <div className="space-y-1.5" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
      <label className="flex items-center gap-1 text-xs text-muted-foreground" htmlFor={`item-note-${itemId}`}>
        <NotebookPen className="h-3.5 w-3.5" />
        思路备注
      </label>
      <textarea
        id={`item-note-${itemId}`}
        ref={taRef}
        value={text}
        rows={3}
        placeholder="卡在哪一步？下次复习会看到"
        className={TEXTAREA_CLS}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => commit(e.target.value)}
        onBlur={() => saveItemNote(itemId, text)}
      />
    </div>
  );
}
