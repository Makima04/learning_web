// 按李林880 / 张宇1000 原书章节顺序刷。会/不会仍写回题目自己的图谱考点。
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { getBook, getModule } from "@/data/kg";
import {
  kgBookDrillPath,
  kgMapPath,
  kgModulePath,
  kgSubjectSlug,
  parseKgSubject,
} from "@/lib/kg/paths";
import {
  bookDrillGroups,
  facetsInItems,
  itemsForBookDrill,
  itemsWithFacet,
  matchBookDrill,
} from "@/lib/kg/mathBookToc";
import { mathFacetName, useDrillCatalog } from "@/lib/kg/mathPractice";
import {
  countPoolDrill,
  learnQueueFrom,
  reviewQueueFrom,
  type WangdaoItem,
} from "@/lib/kg/wangdao408";
import {
  applyWangdaoPractice,
  isCollected,
  toggleWangdaoCollect,
} from "@/lib/kg/wangdaoPractice";
import type { BookId, MarkLevel } from "@/lib/kg/types";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LearnReviewButtons, PracticeQuestionCard } from "@/pages/practiceQuestion";

type DrillMode = "learn" | "review";

export function KgBookDrillPage() {
  const { subject: rawSubject, bookId = "", moduleId = "" } = useParams();
  const [params] = useSearchParams();
  const src = params.get("src");
  const part = params.get("part");
  const section = params.get("section");
  const facet = params.get("facet");
  const book = getBook(bookId as BookId);
  const mod = getModule(bookId as BookId, moduleId);
  const groups = useMemo(() => bookDrillGroups(moduleId), [moduleId]);
  const spec = useMemo(
    () => matchBookDrill(groups, src, part, section),
    [groups, src, part, section]
  );
  const { items, error } = useDrillCatalog();
  const load = useKgProgress((s) => s.load);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const entries = useJournal((s) => s.entries);

  useEffect(() => {
    load();
  }, [load]);

  const [mode, setMode] = useState<DrillMode | "idle">("idle");
  const [queue, setQueue] = useState<WangdaoItem[]>([]);
  const [pos, setPos] = useState(0);
  const [tick, setTick] = useState(0);

  const chapterItems = useMemo(() => {
    if (!items || !spec) return [];
    return itemsForBookDrill(items, spec);
  }, [items, spec]);

  const pool = useMemo(() => itemsWithFacet(chapterItems, facet), [chapterItems, facet]);
  const facetIds = useMemo(() => facetsInItems(chapterItems), [chapterItems]);

  const counts = useMemo(
    () => countPoolDrill(pool, itemMarks, entries),
    [pool, itemMarks, entries, tick]
  );

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  useEffect(() => {
    if (!items || queue.length === 0) return;
    const byId = new Map(items.map((q) => [q.id, q]));
    setQueue((prev) => {
      let changed = false;
      const next = prev.map((q) => {
        const fresh = byId.get(q.id);
        if (fresh && fresh !== q) {
          changed = true;
          return fresh;
        }
        return q;
      });
      return changed ? next : prev;
    });
  }, [items, queue.length]);

  function start(next: DrillMode) {
    const q =
      next === "learn" ? learnQueueFrom(pool, itemMarks, entries) : reviewQueueFrom(pool, entries);
    setMode(next);
    setQueue(q);
    setPos(0);
  }

  function onMark(item: WangdaoItem, mark: MarkLevel) {
    applyWangdaoPractice(item, mark);
    setTick((n) => n + 1);
    if (pos + 1 < queue.length) setPos(pos + 1);
    else setMode("idle");
  }

  if (!book || !mod) {
    return (
      <div className="p-6">
        <p>模块不存在</p>
        <Button asChild variant="link">
          <Link to={kgMapPath(book?.subject)}>返回</Link>
        </Button>
      </div>
    );
  }

  const urlSubject = parseKgSubject(rawSubject);
  if (urlSubject && urlSubject !== kgSubjectSlug(book.subject)) {
    return <Navigate to={kgModulePath(book.id, mod.id, book.subject)} replace />;
  }
  if (!spec) {
    return <Navigate to={kgModulePath(book.id, mod.id, book.subject)} replace />;
  }

  const current = mode !== "idle" ? queue[pos] : undefined;
  const drillHref = (nextFacet: string | null) =>
    kgBookDrillPath(book.id, mod.id, {
      subject: book.subject,
      src: spec.source,
      part: spec.part,
      section: spec.section,
      facet: nextFacet,
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <Link
          to={kgModulePath(book.id, mod.id, book.subject)}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {book.name} · {mod.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{spec.bookLabel}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {spec.chapterLabel}
          {facet ? ` · ${mathFacetName(facet)}` : ""}
          {mode === "idle"
            ? " · 按原书顺序"
            : ` · ${mode === "learn" ? "学习新题" : "复习错题"}`}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!items && !error && <p className="text-sm text-muted-foreground">加载题目…</p>}

      {items && mode === "idle" && (
        <div className="space-y-4">
          {facetIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Link
                to={drillHref(null)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  !facet ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                全部 {chapterItems.length}
              </Link>
              {facetIds.map((id) => {
                const n = itemsWithFacet(chapterItems, id).length;
                return (
                  <Link
                    key={id}
                    to={drillHref(id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs",
                      facet === id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {mathFacetName(id)} {n}
                  </Link>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            共 {counts.total} · 新学 {counts.learn} · 复习 {counts.review}
            {counts.waiting > 0 ? ` · 间隔中 ${counts.waiting}` : ""}
          </p>
          <LearnReviewButtons learn={counts.learn} review={counts.review} onStart={start} />
        </div>
      )}

      {mode !== "idle" && current && (
        <PracticeQuestionCard
          key={current.id}
          item={current}
          index={pos}
          total={queue.length}
          mark={markMap.get(current.id)}
          collected={isCollected(current.id)}
          onMark={(m) => onMark(current, m)}
          onCollect={() => {
            toggleWangdaoCollect(current, !isCollected(current.id));
            setTick((n) => n + 1);
          }}
          onExit={() => setMode("idle")}
        />
      )}

      {mode !== "idle" && queue.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            这一组是空的。
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => setMode("idle")}>
                返回
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
