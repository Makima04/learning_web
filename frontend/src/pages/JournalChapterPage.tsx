import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { findModule } from "@/data/kg";
import { dayKey } from "@/lib/day";
import { isKgJournalEntry, sortDueEntries } from "@/lib/journal";
import { moduleIdOfJournalEntry } from "@/lib/kg/journalBridge";
import { useJournal } from "@/stores/journal";
import { categoryMap, EntryCard } from "@/pages/journalCards";

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

  const dueInChapter = useMemo(() => {
    const kgDue = sortDueEntries(entries.filter(isKgJournalEntry), today);
    return kgDue.filter((e) => moduleIdOfJournalEntry(e) === moduleId);
  }, [entries, moduleId, today]);

  const loc = findModule(moduleId);
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
          {bookName} · {dueInChapter.length} 个知识点待复盘
        </p>
      </div>

      {dueInChapter.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Check className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-medium">本章今日没有待复盘的知识点</p>
              <p className="mt-1 text-sm text-muted-foreground">
                记得 / 模糊 / 忘了 会回写图谱掌握度，并按 1 / 3 / 7 / 14 天再提醒
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/journal")}>
              返回今日复盘
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dueInChapter.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              cat={cats.get(entry.categoryId)}
              showReview
              onReview={(result) => reviewEntry(entry.id, result)}
              onArchive={() => archiveEntry(entry.id)}
              onDelete={() => confirmDelete(entry.id, entry.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
