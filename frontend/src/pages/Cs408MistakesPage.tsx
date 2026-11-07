// 408 真题错题本 / 收藏 / 今日复习。
// 错题与复习队列统一读 journal（按条 LWW 合并 + 墓碑，与王道题共用同一套 1/3/7/14 曲线）；
// 收藏仍是 KgDoc.favorites 的轻量标记，不进队列。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bookmark, RotateCcw } from "lucide-react";
import { dayKey } from "@/lib/day";
import { isDueOnOrBefore, type JournalEntry } from "@/lib/journal";
import {
  isExamItemId,
  migrateExamWrongsToJournal,
  parseExamItemId,
} from "@/lib/kg/examJournal";
import { latestAttempts, type ExamAttempt } from "@/lib/kg/examAttempts";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TAP = "min-h-[44px] md:min-h-9";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

type Tab = "wrong" | "favorite" | "due";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-2.5 sm:py-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Empty({ title, description, to }: { title: string; description: string; to: string }) {
  return (
    <div className="rounded-2xl border-2 border-border/70 bg-card p-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      <Button asChild size="sm" variant="outline" className={cn("mt-3", TAP, FOCUS)}>
        <Link to={to}>去练一套卷</Link>
      </Button>
    </div>
  );
}

function ExamRow({
  entry,
  favorite,
  due,
  onToggleFavorite,
  onMastered,
}: {
  entry: JournalEntry;
  favorite: boolean;
  due: boolean;
  onToggleFavorite: () => void;
  onMastered: () => void;
}) {
  const pos = entry.sourceItemId ? parseExamItemId(entry.sourceItemId) : null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="min-w-0">{entry.title}</span>
            {due && (
              <span className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-normal text-warning-foreground">
                今日到期
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            间隔 {entry.step} 天 · 下次 {entry.nextReviewOn}
            {entry.lastReviewedOn && ` · 上次练习 ${entry.lastReviewedOn}`}
            {entry.lapses > 0 && ` · 遗忘 ${entry.lapses} 次`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pos && (
            <>
              <Button asChild size="sm" className={cn(TAP, FOCUS)}>
                <Link to={`/kg/exams/practice/${pos.year}?q=${pos.n}&mode=practice`}>重做</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
                <Link to={`/kg/exams/${pos.year}#q${pos.n}`}>看解析</Link>
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={favorite}
            className={cn(TAP, FOCUS)}
            onClick={onToggleFavorite}
          >
            <Bookmark className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
            {favorite ? "已收藏" : "收藏"}
          </Button>
          <Button size="sm" variant="ghost" className={cn(TAP, FOCUS)} onClick={onMastered}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            已掌握
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Cs408MistakesPage() {
  const entries = useJournal((s) => s.entries);
  const archiveEntry = useJournal((s) => s.archiveEntry);
  const attempts = useKgProgress((s) => s.attempts);
  const favorites = useKgProgress((s) => s.favorites);
  const toggleFavorite = useKgProgress((s) => s.toggleFavorite);

  const [search] = useSearchParams();
  const initialTab = search.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab === "due" || initialTab === "favorite" ? initialTab : "wrong"
  );
  const [today, setToday] = useState(() => dayKey());
  const migrated = useRef(false);

  useEffect(() => {
    // 页面常开跨过北京时间 0 点，到期状态要跟着刷新
    const t = window.setInterval(() => setToday(dayKey()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // 老版本错题存在 attempts 里；切到 journal 后首次进入补一次，幂等
  useEffect(() => {
    if (migrated.current || attempts.length === 0) return;
    migrated.current = true;
    void migrateExamWrongsToJournal(attempts);
  }, [attempts]);

  const examEntries = useMemo(
    () => entries.filter((e) => e.status === "active" && isExamItemId(e.sourceItemId)),
    [entries]
  );
  const wrong = useMemo(() => examEntries, [examEntries]);
  const due = useMemo(() => examEntries.filter((e) => isDueOnOrBefore(e, today)), [examEntries, today]);

  // 收藏可能包含已归档的错题，所以标题优先取错题条目，其次按 itemId 还原
  const latest = useMemo(() => latestAttempts(attempts), [attempts]);
  const favRows = useMemo(() => {
    const byItem = new Map(examEntries.map((e) => [e.sourceItemId as string, e]));
    return (favorites ?? []).map((id) => ({
      itemId: id,
      entry: byItem.get(id) ?? null,
      attempt: latest.find((a) => a.itemId === id) as ExamAttempt | undefined,
      pos: parseExamItemId(id),
    }));
  }, [favorites, examEntries, latest]);

  const favSet = useMemo(() => new Set(favorites ?? []), [favorites]);
  const count = tab === "wrong" ? wrong.length : tab === "due" ? due.length : favRows.length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "wrong", label: "全部错题", count: wrong.length },
    { id: "due", label: "今日复习", count: due.length },
    { id: "favorite", label: "我的收藏", count: favRows.length },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/kg/exams" className={cn("rounded text-xs text-muted-foreground hover:underline", FOCUS)}>
            ← 408 真题
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link to="/journal" className={cn("rounded text-xs text-primary hover:underline", FOCUS)}>
              今日复习 →
            </Link>
            <Link to="/kg/exams/history" className={cn("rounded text-xs text-primary hover:underline", FOCUS)}>
              练习记录 →
            </Link>
          </div>
        </div>
        <h1 className="mt-1 text-2xl font-bold">错题本与复习</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          答错或自评未掌握的题进入 1 / 3 / 7 / 14 天复习队列，与王道题共用同一个错题集。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="错题" value={wrong.length} hint="在错题集里待复习" />
        <Stat label="今日到期" value={due.length} hint="到期后才进入复习" />
        <Stat label="收藏" value={favRows.length} hint="练习时点收藏" />
      </div>

      <div role="group" aria-label="错题本视图" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 text-xs font-medium",
              TAP,
              FOCUS,
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      {count === 0 ? (
        <Empty
          title={
            tab === "wrong"
              ? "还没有错题"
              : tab === "due"
                ? "今天没有到期的复习题"
                : "还没有收藏的题目"
          }
          description={
            tab === "wrong"
              ? "做一套真题后，答错或自评没掌握的题目会自动收进错题集，并按 1/3/7/14 天安排复习。"
              : tab === "due"
                ? "错题会在 1、3、7、14 天后依次到期；到期后再回来复习效果最好。"
                : "在练习会话的答案解析里点「收藏」，之后可以在这里快速找到。"
          }
          to="/kg/exams"
        />
      ) : tab === "favorite" ? (
        <div className="space-y-2">
          {favRows.map((row) => {
            const title = row.entry?.title ?? (row.pos ? `${row.pos.year} 真题 第 ${row.pos.n} 题` : row.itemId);
            return (
              <Card key={row.itemId}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      练习时收藏
                      {row.attempt &&
                        ` · ${row.attempt.kind === "big" ? "大题" : "选择题"}`}
                      {row.entry && ` · 也在错题集（间隔 ${row.entry.step} 天）`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.pos && (
                      <>
                        <Button asChild size="sm" className={cn(TAP, FOCUS)}>
                          <Link to={`/kg/exams/practice/${row.pos.year}?q=${row.pos.n}&mode=practice`}>
                            重做
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
                          <Link to={`/kg/exams/${row.pos.year}#q${row.pos.n}`}>看解析</Link>
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed
                      className={cn(TAP, FOCUS)}
                      onClick={() => toggleFavorite(row.itemId)}
                    >
                      <Bookmark className="h-3.5 w-3.5 fill-current" />
                      取消收藏
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {(tab === "wrong" ? wrong : due).map((entry) => {
            const itemId = entry.sourceItemId as string;
            return (
              <ExamRow
                key={entry.id}
                entry={entry}
                favorite={favSet.has(itemId)}
                due={isDueOnOrBefore(entry, today)}
                onToggleFavorite={() => toggleFavorite(itemId)}
                onMastered={() => archiveEntry(entry.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
