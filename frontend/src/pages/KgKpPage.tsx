// 考点刷题：像背单词一样先看新学/复习数量，再按队列过题。
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Bookmark, BookOpen, Clock3 } from "lucide-react";
import { findKp } from "@/data/kg";
import { kgKpPath, kgMapPath, kgModulePath, kgSubjectSlug, parseKgSubject } from "@/lib/kg/paths";
import { vizFor } from "@/viz/registry";
import {
  countKpDrill,
  learnQueue,
  reviewQueue,
  type WangdaoItem,
} from "@/lib/kg/wangdao408";
import {
  itemsForSource,
  mathBookLabel,
  MATH_BOOK_SOURCES,
  practiceKindLabel,
  practiceSourceLabel,
  useDrillCatalog,
  type MathBookSource,
} from "@/lib/kg/mathPractice";
import {
  applyWangdaoPractice,
  isCollected,
  toggleWangdaoCollect,
} from "@/lib/kg/wangdaoPractice";
import type { MarkLevel } from "@/lib/kg/types";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WangdaoStem } from "@/pages/wangdaoQuestion";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "会", cls: "bg-emerald-600 text-white" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
];

type DrillMode = "learn" | "review";

function LearnReviewButtons({
  learn,
  review,
  onStart,
}: {
  learn: number;
  review: number;
  onStart: (mode: DrillMode) => void;
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

export function KgKpPage() {
  const { subject: rawSubject, kpId = "" } = useParams();
  const [params] = useSearchParams();
  const found = findKp(kpId);
  const { items, error } = useDrillCatalog();
  const load = useKgProgress((s) => s.load);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const entries = useJournal((s) => s.entries);
  const isMath = found?.book.subject === "math";
  const srcPref = params.get("src");

  useEffect(() => {
    load();
  }, [load]);
  const [mode, setMode] = useState<DrillMode | "idle">("idle");
  const [queue, setQueue] = useState<WangdaoItem[]>([]);
  const [pos, setPos] = useState(0);
  const [tick, setTick] = useState(0);
  const [activeSource, setActiveSource] = useState<MathBookSource | null>(null);

  // 目录热更新后，用新题干/选项替换队列里的旧对象（避免刷题中途仍显示截断摘要）
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

  const counts = useMemo(() => {
    if (!items || !kpId) return { total: 0, learn: 0, review: 0, waiting: 0 };
    return countKpDrill(items, kpId, itemMarks, entries);
  }, [items, kpId, itemMarks, entries, tick]);

  const mathCounts = useMemo(() => {
    if (!items || !kpId || !isMath) return null;
    return MATH_BOOK_SOURCES.map((s) => ({
      ...s,
      drill: countKpDrill(itemsForSource(items, s.id), kpId, itemMarks, entries),
    }));
  }, [items, kpId, itemMarks, entries, tick, isMath]);

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  function start(next: DrillMode, source?: MathBookSource) {
    if (!items || !kpId) return;
    const pool = source ? itemsForSource(items, source) : items;
    const q =
      next === "learn"
        ? learnQueue(pool, kpId, itemMarks, entries)
        : reviewQueue(pool, kpId, entries);
    setActiveSource(source ?? null);
    setMode(next);
    setQueue(q);
    setPos(0);
  }

  function onMark(item: WangdaoItem, mark: MarkLevel) {
    applyWangdaoPractice(item, mark);
    setTick((n) => n + 1);
    if (pos + 1 < queue.length) setPos(pos + 1);
    else {
      setMode("idle");
      setActiveSource(null);
    }
  }

  function onCollect(item: WangdaoItem) {
    toggleWangdaoCollect(item, !isCollected(item.id));
    setTick((n) => n + 1);
  }

  if (!found) {
    return (
      <div className="p-6">
        <p>考点不存在</p>
        <Button asChild variant="link">
          <Link to={kgMapPath(parseKgSubject(rawSubject))}>返回</Link>
        </Button>
      </div>
    );
  }

  const { kp, module, book } = found;
  const current = mode !== "idle" ? queue[pos] : undefined;
  const urlSubject = parseKgSubject(rawSubject);
  if (urlSubject && urlSubject !== kgSubjectSlug(book.subject)) {
    return (
      <Navigate
        to={kgKpPath(kp.id, { subject: book.subject, src: srcPref })}
        replace
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <Link
          to={kgModulePath(book.id, module.id, book.subject)}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {book.name} · {module.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{kp.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isMath
            ? mode === "idle"
              ? "李林880 与 张宇1000 分开刷"
              : `${mathBookLabel(activeSource)} · ${mode === "learn" ? "学习新题" : "复习错题"}`
            : `王道 ${counts.total} 题 · 新学 ${counts.learn} · 复习 ${counts.review}${
                counts.waiting > 0 ? ` · 间隔中 ${counts.waiting}` : ""
              }`}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!items && !error && <p className="text-sm text-muted-foreground">加载题目…</p>}

      {items && mode === "idle" && isMath && mathCounts && (
        <div className="space-y-4">
          {[...mathCounts]
            .sort((a, b) =>
              a.id === srcPref ? -1 : b.id === srcPref ? 1 : 0
            )
            .map((s) => (
              <div key={s.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold">{s.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    共 {s.drill.total} · 新学 {s.drill.learn} · 复习 {s.drill.review}
                    {s.drill.waiting > 0 ? ` · 间隔中 ${s.drill.waiting}` : ""}
                  </p>
                </div>
                <LearnReviewButtons
                  learn={s.drill.learn}
                  review={s.drill.review}
                  onStart={(key) => start(key, s.id)}
                />
              </div>
            ))}
        </div>
      )}

      {items && mode === "idle" && !isMath && (
        <LearnReviewButtons
          learn={counts.learn}
          review={counts.review}
          onStart={(key) => start(key)}
        />
      )}

      {vizFor(kp.id) && mode === "idle" && (
        <Button asChild size="sm" variant="outline">
          <Link to={`/viz/${kp.id}`}>▶ 图解演示</Link>
        </Button>
      )}

      {mode !== "idle" && current && (
        <QuestionCard
          key={current.id}
          item={current}
          index={pos}
          total={queue.length}
          mark={markMap.get(current.id)}
          collected={isCollected(current.id)}
          onMark={(m) => onMark(current, m)}
          onCollect={() => onCollect(current)}
          onExit={() => {
            setMode("idle");
            setActiveSource(null);
          }}
        />
      )}

      {mode !== "idle" && queue.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            这一组是空的。
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMode("idle");
                  setActiveSource(null);
                }}
              >
                返回
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuestionCard({
  item,
  index,
  total,
  mark,
  collected,
  onMark,
  onCollect,
  onExit,
}: {
  item: WangdaoItem;
  index: number;
  total: number;
  mark?: MarkLevel;
  collected: boolean;
  onMark: (m: MarkLevel) => void;
  onCollect: () => void;
  onExit: () => void;
}) {
  const kind = practiceKindLabel(item.kind);
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {index + 1} / {total} · {practiceSourceLabel(item)} · {kind} · §{item.section} #{item.qno}
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
        <WangdaoStem item={item} />
        <div className="flex flex-wrap items-center gap-2">
          {MARKS.map((m) => (
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
