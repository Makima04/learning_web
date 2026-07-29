import { speakEnglish } from "@/lib/tts";
import type { TodayWordRow } from "@/lib/todayWords";
import { cn } from "@/lib/utils";

export function TodayWordList({
  words,
  mask,
  rate,
  startIndex = 0,
  onReveal,
  revealed,
  compact,
}: {
  words: TodayWordRow[];
  /** 遮罩回忆：默认隐藏中文 */
  mask?: boolean;
  rate: number;
  startIndex?: number;
  /** 遮罩模式下点击展开的 wordIdx 集合 */
  revealed?: Set<number>;
  onReveal?: (wordIdx: number) => void;
  compact?: boolean;
}) {
  if (words.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        今天还没有学过词
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {words.map((w, i) => {
        const showCn = !mask || (revealed?.has(w.wordIdx) ?? false);
        return (
          <li
            key={w.wordIdx}
            className={cn(
              "flex items-start gap-3 hover:bg-accent/30",
              compact ? "px-3 py-2 md:px-4" : "px-3 py-2.5 md:px-4"
            )}
          >
            <span className="tnum w-6 shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
              {startIndex + i + 1}
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                if (mask && !showCn) onReveal?.(w.wordIdx);
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium tracking-wide">{w.en}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    w.type === "new"
                      ? "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
                      : "bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-300"
                  )}
                >
                  {w.type === "new" ? "新" : "复"}
                </span>
              </div>
              {w.cn ? (
                showCn ? (
                  <div className="mt-0.5 text-sm leading-snug text-muted-foreground">{w.cn}</div>
                ) : (
                  <div className="mt-0.5 text-sm text-muted-foreground/60">点击显示释义</div>
                )
              ) : null}
            </button>
            <button
              type="button"
              className="shrink-0 pt-0.5 text-sm opacity-50 hover:opacity-100"
              aria-label={`朗读 ${w.en}`}
              onClick={() => speakEnglish(w.en, rate)}
            >
              🔊
            </button>
          </li>
        );
      })}
    </ul>
  );
}
