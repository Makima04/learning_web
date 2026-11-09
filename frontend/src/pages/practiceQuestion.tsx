import { useEffect, useState } from "react";
import { BookOpen, Check, Clock3 } from "lucide-react";
import { prefetchQuestionMedia } from "@/lib/kg/catalogLoad";
import { canRevealAnswer } from "@/lib/kg/explain";
import type { MarkLevel } from "@/lib/kg/types";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { mathBookLabel, practiceBandLabel, practiceKindLabel } from "@/lib/kg/mathPractice";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ItemNoteField } from "@/pages/itemNoteField";
import { QuestionKpLine, WangdaoAnalysis, WangdaoStem } from "@/pages/wangdaoQuestion";
import { practiceQuestionLocation } from "@/lib/kg/practiceLocation";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("button, a, summary, select, [role='button'], [role='tab']"))))
  );
}

function isInteractiveClick(e: React.MouseEvent): boolean {
  const el = e.target;
  return el instanceof Element && Boolean(el.closest("button, a, input, textarea, select, label, summary"));
}

export const PRACTICE_MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "会", cls: "bg-success text-success-foreground" },
  { id: "fuzzy", label: "模糊", cls: "bg-warning text-warning-foreground" },
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
                      ? "bg-destructive/10 text-ink-danger"
                      : "bg-warning/10 text-ink-warning"
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
  size = "compact",
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
  /** large：大屏作答台，题面放大、留白加宽 */
  size?: "compact" | "large";
}) {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const showAns = revealedId === item.id;
  const canReveal = canRevealAnswer(item);
  const large = size === "large";

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
  const source = item.source === "lilin880" || item.source === "zhangyu1000"
    ? mathBookLabel(item.source)
    : "王道";
  const part = item.part === "base" ? "基础" : item.part === "hard" ? "强化" : "";
  return (
    <Card
      className={cn(canReveal && !showAns && "cursor-pointer", large && "ring-1 ring-border/60")}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (!canReveal || showAns || isInteractiveClick(e)) return;
        setRevealedId(item.id);
      }}
    >
      <CardContent className={cn("space-y-4", large ? "p-6 md:p-7" : "p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* 出处和阶段贴近题面，大屏作答时也能直接辨认。 */}
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold" aria-label="题目来源与阶段">
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-primary">{source}</span>
              {part && <span className={cn(
                "rounded-md px-2.5 py-1",
                item.part === "hard" ? "bg-warning/15 text-ink-warning" : "bg-primary/10 text-primary"
              )}>{part}</span>}
            </div>
            {/* 王道出处在大屏与窄屏均完整展示，原书题号与队列序号分开。 */}
            {(!large || source === "王道") && (
              <p className="mt-2 break-words text-xs leading-5 text-muted-foreground" aria-label="题目原书位置">
                {!large && `${index + 1} / ${total} · `}
                {source === "王道" ? practiceQuestionLocation(item) : <>
                  {practiceBandLabel(item) ? `${practiceBandLabel(item)} · ` : ""}{kind} · §{item.section} #{item.qno}
                </>}
                {item.pdf_page ? ` · 做题本 p.${item.pdf_page}` : ""}
                {item.book_ans_page != null ? ` · 原书【P${item.book_ans_page}】` : ""}
                {item.year ? ` · ${item.year}真题` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className={cn("shrink-0 text-xs text-muted-foreground hover:underline", large && "ml-auto")}
            onClick={onExit}
          >
            结束
          </button>
        </div>
        <QuestionKpLine item={item} />
        <WangdaoStem item={item} size={size} />
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
                "rounded-md font-medium",
                large ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-sm",
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
              "ml-auto inline-flex items-center gap-1 rounded-md border text-sm",
              large ? "px-4 py-2" : "px-3 py-1.5",
              collected
                ? "border-destructive/40 bg-destructive/10 text-ink-danger"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {collected ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
            {collected ? "设为永久学会" : "加入复习计划"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
