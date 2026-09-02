// 考点刷题：像背单词一样先看新学/复习数量，再按队列过题。
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { findKp } from "@/data/kg";
import { kgKpPath, kgMapPath, kgModulePath, kgSubjectSlug, parseKgSubject } from "@/lib/kg/paths";
import { vizFor } from "@/viz/registry";
import { wdSetPath } from "@/data/kg/wdTaxonomy";
import {
  countKpDrill,
  itemsForKp,
  learnQueue,
  reviewQueue,
  type WangdaoItem,
  type WangdaoKind,
} from "@/lib/kg/wangdao408";
import {
  itemsForSource,
  mathBookLabel,
  MATH_BOOK_SOURCES,
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
import { LearnReviewButtons, PracticeQuestionCard } from "@/pages/practiceQuestion";

type DrillMode = "learn" | "review";

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
  const [kind, setKind] = useState<WangdaoKind>("mcq");
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

  const kindPool = useMemo(() => {
    if (!items || !kpId) return [] as WangdaoItem[];
    const pool = itemsForKp(items, kpId);
    if (isMath) return pool;
    return pool.filter((q) => (q.kind === "big" ? "big" : "mcq") === kind);
  }, [items, kpId, kind, isMath]);

  const counts = useMemo(() => {
    if (!items || !kpId) return { total: 0, learn: 0, review: 0, waiting: 0 };
    if (isMath) return countKpDrill(items, kpId, itemMarks, entries);
    return countKpDrill(kindPool, kpId, itemMarks, entries);
  }, [items, kpId, itemMarks, entries, tick, isMath, kindPool]);

  const kindTotals = useMemo(() => {
    if (!items || !kpId || isMath) return null;
    const pool = itemsForKp(items, kpId);
    return {
      mcq: pool.filter((q) => q.kind !== "big").length,
      big: pool.filter((q) => q.kind === "big").length,
    };
  }, [items, kpId, isMath]);

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
    const base = source ? itemsForSource(items, source) : items;
    const pool = isMath
      ? base
      : base.filter((q) => (q.kind === "big" ? "big" : "mcq") === kind);
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
  if (kpId !== kp.id) {
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
            : `王道${kind === "big" ? "大题" : "选择"} ${counts.total} · 新学 ${counts.learn} · 复习 ${counts.review}${
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
        <div className="space-y-3">
          {kindTotals && (
            <div className="flex flex-wrap gap-2">
              {(["mcq", "big"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs",
                    kind === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {k === "big" ? "大题" : "选择题"} {k === "big" ? kindTotals.big : kindTotals.mcq}
                </button>
              ))}
              <Link
                to={wdSetPath({
                  group: found?.module.id,
                  kind,
                  topic: kpId,
                })}
                className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:underline"
              >
                在题集中看
              </Link>
            </div>
          )}
          <LearnReviewButtons
            learn={counts.learn}
            review={counts.review}
            onStart={(key) => start(key)}
          />
        </div>
      )}

      {vizFor(kp.id) && mode === "idle" && (
        <Button asChild size="sm" variant="outline">
          <Link to={`/viz/${kp.id}`}>▶ 图解演示</Link>
        </Button>
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
