import { Archive, Check, ChevronRight, HelpCircle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dayKey } from "@/lib/day";
import type { JournalEntry, JournalKind, ReviewResult } from "@/lib/journal";
import type { KgChapterCard } from "@/lib/kg/journalBridge";
import { cn } from "@/lib/utils";

export const KIND_LABEL: Record<JournalKind, string> = {
  learn: "学习",
  mistake: "错题",
};

export function categoryMap(
  categories: { id: string; name: string; color: string }[]
): Map<string, { name: string; color: string }> {
  return new Map(categories.map((c) => [c.id, { name: c.name, color: c.color }]));
}

function EntryMeta({
  entry,
  cat,
}: {
  entry: JournalEntry;
  cat?: { name: string; color: string };
}) {
  const today = dayKey();
  const overdue = entry.status === "active" && entry.nextReviewOn < today;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {cat && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-foreground"
          style={{ backgroundColor: `${cat.color}22` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
          {cat.name}
        </span>
      )}
      <span
        className={cn(
          "rounded-full px-2 py-0.5",
          entry.kind === "mistake"
            ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
            : "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300"
        )}
      >
        {KIND_LABEL[entry.kind]}
      </span>
      {(entry.fromKg || entry.kpId) && (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
          知识图谱
        </span>
      )}
      {entry.status === "archived" ? (
        <span className="rounded-full bg-muted px-2 py-0.5">已归档</span>
      ) : (
        <>
          <span>间隔 {entry.step} 天</span>
          <span className={overdue ? "font-medium text-rose-600 dark:text-rose-400" : undefined}>
            {overdue ? `逾期 · 应复 ${entry.nextReviewOn}` : `下次 ${entry.nextReviewOn}`}
          </span>
        </>
      )}
    </div>
  );
}

function ReviewActions({
  onReview,
}: {
  onReview: (result: ReviewResult) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="default" onClick={() => onReview("pass")}>
        <Check className="h-4 w-4" />
        记得
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onReview("hard")}>
        <HelpCircle className="h-4 w-4" />
        模糊
      </Button>
      <Button size="sm" variant="destructive" onClick={() => onReview("fail")}>
        <X className="h-4 w-4" />
        忘了
      </Button>
    </div>
  );
}

export function EntryCard({
  entry,
  cat,
  showReview,
  onReview,
  onArchive,
  onDelete,
}: {
  entry: JournalEntry;
  cat?: { name: string; color: string };
  showReview?: boolean;
  onReview?: (result: ReviewResult) => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-base leading-snug">{entry.title}</CardTitle>
            <EntryMeta entry={entry} cat={cat} />
          </div>
          <div className="flex shrink-0 gap-1">
            {onArchive && entry.status === "active" && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="归档"
                className="h-8 w-8 text-muted-foreground"
                onClick={onArchive}
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="删除"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entry.body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {entry.body}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">暂无详细说明</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>创建 {entry.createdOn}</span>
          {entry.lastReviewedOn && <span>上次复盘 {entry.lastReviewedOn}</span>}
          {entry.lapses > 0 && <span>回退 {entry.lapses} 次</span>}
        </div>
        {showReview && onReview && <ReviewActions onReview={onReview} />}
      </CardContent>
    </Card>
  );
}

export function ChapterReviewCard({
  chapter,
  onOpen,
}: {
  chapter: KgChapterCard;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="w-full text-left" onClick={onOpen}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{chapter.bookName}</p>
              <CardTitle className="text-base leading-snug">{chapter.moduleName}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                  知识图谱
                </span>
                <span>
                  {chapter.entries.some((e) => e.sourceItemId)
                    ? `${chapter.entries.length} 道错题`
                    : `${chapter.entries.length} 个知识点`}
                </span>
                {chapter.firstReviewCount > 0 && (
                  <span>首次 {chapter.firstReviewCount}</span>
                )}
                {chapter.overdueCount > 0 && (
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    逾期 {chapter.overdueCount}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
        </CardHeader>
      </Card>
    </button>
  );
}
