import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Check, ChevronDown, ChevronRight, HelpCircle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dayKey } from "@/lib/day";
import { isExamItemId, parseExamItemId } from "@/lib/kg/examJournal";
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
            ? "bg-destructive/10 text-ink-danger"
            : "bg-info/10 text-ink-info"
        )}
      >
        {KIND_LABEL[entry.kind]}
      </span>
      {(entry.fromKg || entry.kpId) && (
        <span className="rounded-full bg-app-purple/10 px-2 py-0.5 text-ink-purple">
          知识图谱
        </span>
      )}
      {entry.status === "archived" ? (
        <span className="rounded-full bg-muted px-2 py-0.5">已归档</span>
      ) : (
        <>
          <span>间隔 {entry.step} 天</span>
          <span className={overdue ? "font-medium text-ink-danger" : undefined}>
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

/** 章节大卡展开后的一条到期条目：真题给重做/解析深链，其它走章节页逐题复盘 */
function ChapterEntryRow({
  entry,
  onOpenChapter,
}: {
  entry: JournalEntry;
  onOpenChapter: () => void;
}) {
  const today = dayKey();
  const pos = isExamItemId(entry.sourceItemId)
    ? parseExamItemId(entry.sourceItemId as string)
    : null;
  const overdue = entry.nextReviewOn < today;
  const actionCls =
    "inline-flex min-h-[32px] shrink-0 items-center rounded-full border border-border/80 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-muted/60 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={entry.title}>
          {entry.title}
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {pos ? "真题" : "知识图谱"} · 间隔 {entry.step} 天 ·{" "}
          {overdue ? (
            <span className="font-medium text-ink-danger">逾期 · 应复 {entry.nextReviewOn}</span>
          ) : (
            `下次 ${entry.nextReviewOn}`
          )}
          {entry.lapses > 0 && ` · 遗忘 ${entry.lapses} 次`}
        </p>
      </div>
      {pos ? (
        <div className="flex shrink-0 gap-1">
          <Link to={`/kg/exams/practice/${pos.year}?q=${pos.n}&mode=practice`} className={actionCls}>
            重做
          </Link>
          <Link to={`/kg/exams/${pos.year}#q${pos.n}`} className={actionCls}>
            解析
          </Link>
        </div>
      ) : (
        <button type="button" onClick={onOpenChapter} className={actionCls}>
          逐题复习
        </button>
      )}
    </li>
  );
}

export function ChapterReviewCard({
  chapter,
  onOpen,
}: {
  chapter: KgChapterCard;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const examCount = chapter.entries.filter((e) => isExamItemId(e.sourceItemId)).length;
  const listId = `chapter-due-${chapter.moduleId.replace(/[^\w-]/g, "-")}`;

  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-2xl text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{chapter.bookName}</p>
              <CardTitle className="text-base leading-snug">{chapter.moduleName}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-app-purple/10 px-2 py-0.5 text-ink-purple">
                  知识图谱
                </span>
                <span>
                  {chapter.entries.some((e) => e.sourceItemId)
                    ? `${chapter.entries.length} 道错题`
                    : `${chapter.entries.length} 个知识点`}
                </span>
                {examCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    真题 {examCount}
                  </span>
                )}
                {chapter.firstReviewCount > 0 && (
                  <span>首次 {chapter.firstReviewCount}</span>
                )}
                {chapter.overdueCount > 0 && (
                  <span className="font-medium text-ink-danger">
                    逾期 {chapter.overdueCount}
                  </span>
                )}
                <span className="text-ink-info">{open ? "收起" : "展开看具体题目"}</span>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </div>
        </CardHeader>
      </button>

      {open && (
        <CardContent id={listId} className="space-y-3 pt-0">
          <ul className="space-y-1.5">
            {chapter.entries.map((entry) => (
              <ChapterEntryRow key={entry.id} entry={entry} onOpenChapter={onOpen} />
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={onOpen} className="gap-1">
            进入章节逐题复盘
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
