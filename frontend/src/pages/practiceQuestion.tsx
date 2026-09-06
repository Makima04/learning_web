import { useEffect, useState } from "react";
import { Bookmark, BookOpen, Clock3 } from "lucide-react";
import { prefetchQuestionMedia } from "@/lib/kg/catalogLoad";
import { canRevealAnswer } from "@/lib/kg/explain";
import type { MarkLevel } from "@/lib/kg/types";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { practiceKindLabel, practiceSourceLabel } from "@/lib/kg/mathPractice";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ItemNoteField } from "@/pages/itemNoteField";
import { QuestionKpLine, WangdaoAnalysis, WangdaoStem } from "@/pages/wangdaoQuestion";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isInteractiveClick(e: React.MouseEvent): boolean {
  const el = e.target;
  return el instanceof Element && Boolean(el.closest("button, a, input, textarea, select, label"));
}

export const PRACTICE_MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "会", cls: "bg-emerald-600 text-white" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
];

export function LearnReviewButtons({
  learn,
  review,
  onStart,
}: {
  learn: number;
  review: number;
  onStart: (mode: "learn" | "review") => void;
}) {
  const reviewFirst = review > 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(reviewFirst ? (["review", "learn"] as const) : (["learn", "review"] as const)).map(
        (key) => {
          const n = key === "learn" ? learn : review;
          const primary = reviewFirst ? key === "review" : key === "learn";
          return (
            <button
              key={key}
              type="button"
              disabled={n <= 0}
              onClick={() => onStart(key)}
              className={cn(
                "flex min-h-24 flex-col justify-between rounded-lg p-4 text-left disabled:cursor-not-allowed disabled:opacity-50",
                primary
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg",
                  primary
                    ? "bg-white/15"
                    : key === "review"
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-400/10"
                )}
              >
                {key === "review" ? (
                  <Clock3 className="h-4 w-4" />
                ) : (
                  <BookOpen className="h-4 w-4" />
                )}
              </span>
              <span>
                <span className="block font-semibold">
                  {key === "learn" ? "学习新题" : "复习错题"}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-sm",
                    primary ? "text-white/80" : "text-muted-foreground"
                  )}
                >
                  {n > 0
                    ? `${n} 题`
                    : key === "learn"
                      ? "没有未做过的题"
                      : "今天没有到期错题"}
                </span>
              </span>
            </button>
          );
        }
      )}
    </div>
  );
}

export function PracticeQuestionCard({
  item,
  nextItem,
  index,
  total,
  mark,
  collected,
  onMark,
  onCollect,
  onExit,
}: {
  item: WangdaoItem;
  nextItem?: WangdaoItem;
  index: number;
  total: number;
  mark?: MarkLevel;
  collected: boolean;
  onMark: (m: MarkLevel) => void;
  onCollect: () => void;
  onExit: () => void;
}) {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const showAns = revealedId === item.id;
  const canReveal = canRevealAnswer(item);

  useEffect(() => {
    prefetchQuestionMedia(item);
    prefetchQuestionMedia(nextItem);
  }, [item, nextItem]);

  useEffect(() => {
    if (!canReveal) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key !== " " && event.code !== "Space") return;
      event.preventDefault();
      setRevealedId(item.id);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canReveal, item.id]);

  const kind = practiceKindLabel(item.kind);
  return (
    <Card
      className={cn(canReveal && !showAns && "cursor-pointer")}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (!canReveal || showAns || isInteractiveClick(e)) return;
        setRevealedId(item.id);
      }}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {index + 1} / {total} · {practiceSourceLabel(item)} · {kind} · §{item.section} #
            {item.qno}
            {item.pdf_page ? ` · 做题本 p.${item.pdf_page}` : ""}
            {item.book_ans_page != null ? ` · 原书【P${item.book_ans_page}】` : ""}
            {item.year ? ` · ${item.year}真题` : ""}
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground hover:underline"
            onClick={onExit}
          >
            结束
          </button>
        </div>
        <QuestionKpLine item={item} />
        <WangdaoStem item={item} />
        {canReveal && !showAns && (
          <p className="text-[11px] text-muted-foreground">空格或点卡片空白处显示答案</p>
        )}
        <WangdaoAnalysis item={item} revealAnswer={showAns} />
        {(!canReveal || showAns) && <ItemNoteField key={item.id} itemId={item.id} />}
        <div className="flex flex-wrap items-center gap-2">
          {PRACTICE_MARKS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                m.cls,
                mark === m.id && "ring-2 ring-offset-2 ring-primary"
              )}
              onClick={() => onMark(m.id)}
            >
              {m.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onCollect}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm",
              collected
                ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-400/10 dark:text-rose-300"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Bookmark className={cn("h-4 w-4", collected && "fill-current")} />
            {collected ? "已收藏" : "错题集"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
