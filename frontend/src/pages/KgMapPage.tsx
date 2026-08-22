// 知识图谱作战地图：模块卡片 + 双层进度 + 三入口
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  booksForSubject,
  filterMathBooks,
  findKp,
} from "@/data/kg";
import { dueKpIds, subjectProgress } from "@/lib/kg/progress";
import type { BookId, SubjectId } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", className)}
        style={{ width: `${Math.min(100, Math.round(value * 100))}%` }}
      />
    </div>
  );
}

export function KgMapPage() {
  const settings = useSettings();
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  const [subject, setSubject] = useState<SubjectId>(() =>
    settings.enableCs408 ? "cs408" : "math"
  );

  useEffect(() => {
    load();
  }, [load]);

  const mathTrack = settings.mathTrack;
  const books = useMemo(() => {
    if (subject === "math") return filterMathBooks(mathTrack);
    return booksForSubject("cs408");
  }, [subject, mathTrack]);

  const progress = useMemo(
    () => subjectProgress(subject, states, mathTrack),
    [subject, states, mathTrack]
  );

  const due = useMemo(() => {
    const ids = dueKpIds(states);
    return ids
      .map((id) => findKp(id))
      .filter((x): x is NonNullable<typeof x> => {
        if (!x) return false;
        if (subject === "cs408") return x.book.subject === "cs408";
        if (x.book.subject !== "math") return false;
        const sc = x.kp.scope;
        return !sc || sc === "both" || sc === mathTrack;
      })
      .slice(0, 12);
  }, [states, subject, mathTrack]);

  const tabs: { id: SubjectId; label: string; show: boolean }[] = [
    { id: "cs408", label: "408", show: settings.enableCs408 },
    {
      id: "math",
      label: mathTrack === "math2" ? "数学二" : "数学一",
      show: settings.enableMath,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">知识图谱</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            模块卡片标记进度 · 真题/预测卷回写弱项 · 遗忘曲线提醒复习
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subject === "cs408" && (
            <Button asChild size="sm">
              <Link to="/kg/predict">408 大题预测卷</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/kg/exams">真题入口</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubject(t.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm",
                subject === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {subject === "math" && (
        <p className="text-xs text-muted-foreground">
          当前数学轨：
          <span className="font-medium text-foreground">
            {mathTrack === "math2" ? "数学二" : "数学一"}
          </span>
          （在 设置 → 学习 中切换；数二只显示数二考点）
        </p>
      )}

      {/* 四入口（图解演示为移动端进入 /viz 的主要路径） */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "模块学习",
            desc: "按章过知识点，标记已学（覆盖进度）",
            to: null as string | null,
          },
          {
            title: "真题演练",
            desc: "历年卷按题标 会/模糊/不会",
            to: "/kg/exams",
          },
          {
            title: "预测/诊断",
            desc:
              subject === "cs408"
                ? "固定大题配额组卷，检测弱项"
                : "数学预测卷后续开放",
            to: subject === "cs408" ? "/kg/predict" : null,
          },
          ...(settings.enableCs408
            ? [
                {
                  title: "图解演示",
                  desc: "数据结构动画：链表/排序/图论等",
                  to: "/viz",
                },
              ]
            : []),
        ].map((x) => (
          <Card key={x.title} className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{x.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{x.desc}</p>
              {x.to ? (
                <Button asChild size="sm" variant="secondary">
                  <Link to={x.to}>进入</Link>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">见下方模块卡片</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {due.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">今日待复习考点</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {due.map((d) => (
              <Link
                key={d.kp.id}
                to={`/kg/module/${d.book.id}/${d.module.id}`}
                className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
              >
                {d.kp.name}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {books.map((book) => {
        const bp = progress.find((p) => p.bookId === book.id);
        return (
          <section key={book.id} className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <h2 className="text-lg font-medium">{book.name}</h2>
              {bp && (
                <span className="text-xs text-muted-foreground">
                  覆盖 {pct(bp.coverage)} · 掌握 {pct(bp.mastery)}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {book.modules.map((mod) => {
                const mp = bp?.modules.find((m) => m.moduleId === mod.id);
                const freqMax = Math.max(...mod.kps.map((k) => k.freq), 1);
                return (
                  <Link
                    key={mod.id}
                    to={`/kg/module/${book.id as BookId}/${mod.id}`}
                    className="group rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold group-hover:text-primary">
                        {mod.name}
                      </h3>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        考频≈{freqMax}★
                      </span>
                    </div>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div>
                        <div className="mb-0.5 flex justify-between">
                          <span>覆盖</span>
                          <span>{mp ? pct(mp.coverage) : "0%"}</span>
                        </div>
                        <Bar value={mp?.coverage ?? 0} className="bg-sky-500" />
                      </div>
                      <div>
                        <div className="mb-0.5 flex justify-between">
                          <span>掌握</span>
                          <span>{mp ? pct(mp.mastery) : "0%"}</span>
                        </div>
                        <Bar value={mp?.mastery ?? 0} className="bg-emerald-500" />
                      </div>
                      <div className="flex justify-between pt-1">
                        <span>{mod.kps.length} 个考点</span>
                        {(mp?.dueCount ?? 0) > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {mp!.dueCount} 待复习
                          </span>
                        )}
                      </div>
                      {mp && mp.weakKpIds.length > 0 && (
                        <p className="line-clamp-2 text-[11px] text-destructive/90">
                          弱项：
                          {mp.weakKpIds
                            .map((id) => findKp(id)?.kp.name)
                            .filter(Boolean)
                            .join("、")}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
