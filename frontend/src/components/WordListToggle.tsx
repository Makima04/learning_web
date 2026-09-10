import { useWordLists } from "@/stores/wordLists";
import { cn } from "@/lib/utils";

export function WordListToggle({
  idx,
  compact,
}: {
  idx: number;
  compact?: boolean;
}) {
  const kind = useWordLists((s) => s.kindOf(idx));
  const setKind = useWordLists((s) => s.setKind);

  return (
    <div
      className={cn("flex shrink-0 items-center gap-1", compact && "scale-95")}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
          kind === "new"
            ? "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300"
            : "border-transparent bg-muted/70 text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setKind(idx, "new")}
        title={kind === "new" ? "移出生词表" : "加入生词表，复习时会一直出现"}
      >
        生词
      </button>
      <button
        type="button"
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
          kind === "known"
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
            : "border-transparent bg-muted/70 text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setKind(idx, "known")}
        title={kind === "known" ? "移出熟词表" : "加入熟词表，学习和复习都不再出现"}
      >
        熟词
      </button>
    </div>
  );
}
