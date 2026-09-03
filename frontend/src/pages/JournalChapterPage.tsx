import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { findModule } from "@/data/kg";
import { dayKey } from "@/lib/day";
import { sortDueEntries } from "@/lib/journal";
import { isKgChapterReviewEntry, moduleIdOfJournalEntry } from "@/lib/kg/journalBridge";
import { useHydratedItems } from "@/lib/kg/catalogLoad";
import { itemById } from "@/lib/kg/wangdao408";
import { practiceKindLabel, practiceSourceLabel, useDrillCatalog } from "@/lib/kg/mathPractice";
import { applyWangdaoPractice, toggleWangdaoCollect } from "@/lib/kg/wangdaoPractice";
import type { MarkLevel } from "@/lib/kg/types";
import { useJournal } from "@/stores/journal";
import { cn } from "@/lib/utils";
import { categoryMap, EntryCard } from "@/pages/journalCards";
import { QuestionKpLine, WangdaoAnalysis, WangdaoStem } from "@/pages/wangdaoQuestion";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "会", cls: "bg-emerald-600 text-white" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
];

export function JournalChapterPage() {
  const { moduleId: rawId = "" } = useParams<{ moduleId: string }>();
  const moduleId = decodeURIComponent(rawId);
  const navigate = useNavigate();
  const entries = useJournal((s) => s.entries);
  const categories = useJournal((s) => s.categories);
  const reviewEntry = useJournal((s) => s.reviewEntry);
  const archiveEntry = useJournal((s) => s.archiveEntry);
  const deleteEntry = useJournal((s) => s.deleteEntry);
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const today = dayKey();
  const loc = findModule(moduleId);
  const which =
    loc?.book.subject === "math" ? "math" : loc?.book.subject === "cs408" ? "wangdao" : "all";
  const { items: catalog } = useDrillCatalog(which);

  const dueInChapter = useMemo(() => {
    const kgDue = sortDueEntries(entries.filter(isKgChapterReviewEntry), today);
    return kgDue.filter((e) => moduleIdOfJournalEntry(e) === moduleId);
  }, [entries, moduleId, today]);

  const dueItems = useMemo(() => {
    if (!catalog) return null;
    const ids = new Set(
      dueInChapter.map((e) => e.sourceItemId).filter((id): id is string => Boolean(id))
    );
    return catalog.filter((q) => ids.has(q.id));
  }, [catalog, dueInChapter]);
  const hydrated = useHydratedItems(dueItems);
  const isWrong = dueInChapter.some((e) => e.sourceItemId);
  const title = loc?.module.name || dueInChapter[0]?.title || "章节";
  const bookName = loc?.book.name || "知识图谱";

  function confirmDelete(id: string, titleText: string) {
    if (window.confirm(`确定删除「${titleText}」？此操作不可撤销。`)) {
      deleteEntry(id);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <Link to="/journal" className="text-xs text-muted-foreground hover:underline">
          ← 今日复盘
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {bookName} · {dueInChapter.length} {isWrong ? "道错题待复习" : "个知识点待复盘"}
        </p>
      </div>

      {dueInChapter.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Check className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-medium">
                {isWrong ? "本章今日没有待复习的错题" : "本章今日没有待复盘的知识点"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                会 / 模糊 / 不会 按 1 / 3 / 7 / 14 天再提醒，并回写图谱掌握度
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/journal")}>
              返回今日复盘
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dueInChapter.map((entry) => {
            const q =
              entry.sourceItemId && hydrated
                ? itemById(hydrated, entry.sourceItemId)
                : undefined;
            if (q) {
              return (
                <Card key={entry.id}>
                  <CardContent className="space-y-3 p-5">
                    <p className="text-xs text-muted-foreground">
                      {practiceSourceLabel(q)} · {practiceKindLabel(q.kind)} · §{q.section} #{q.qno}
                      {q.pdf_page ? ` · 做题本 p.${q.pdf_page}` : ""}
                      {q.book_ans_page != null ? ` · 原书【P${q.book_ans_page}】` : ""}
                      {entry.nextReviewOn < today ? " · 逾期" : ""}
                    </p>
                    <QuestionKpLine item={q} />
                    <WangdaoStem item={q} />
                    <WangdaoAnalysis item={q} />
                    <div className="flex flex-wrap items-center gap-2">
                      {MARKS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", m.cls)}
                          onClick={() => applyWangdaoPractice(q, m.id)}
                        >
                          {m.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-rose-700 dark:text-rose-300"
                        onClick={() => toggleWangdaoCollect(q, false)}
                      >
                        <Bookmark className="h-4 w-4 fill-current" />
                        移出错题集
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return (
              <EntryCard
                key={entry.id}
                entry={entry}
                cat={cats.get(entry.categoryId)}
                showReview
                onReview={(result) => reviewEntry(entry.id, result)}
                onArchive={() => archiveEntry(entry.id)}
                onDelete={() => confirmDelete(entry.id, entry.title)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
