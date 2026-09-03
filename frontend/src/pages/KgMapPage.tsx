// 知识图谱作战地图：模块卡片 + 双层进度 + 三入口
import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  booksForSubject,
  filterMathBooks,
  findKp,
} from "@/data/kg";
import { examSetPath } from "@/data/kg/examTaxonomy";
import { wdCounts, wdSetPath } from "@/data/kg/wdTaxonomy";
import { useWangdao408 } from "@/lib/kg/wangdao408";
import { dueKpIds, subjectProgress } from "@/lib/kg/progress";
import { kgKpPath, kgMapPath, kgModulePath, parseKgSubject } from "@/lib/kg/paths";
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
  const { subject: rawSubject } = useParams();
  const settings = useSettings();
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  const parsed = parseKgSubject(rawSubject);
  const fallback: SubjectId = settings.enableCs408 ? "cs408" : "math";
  const subject: SubjectId = parsed ?? fallback;
  const { items: wangdao } = useWangdao408({ enabled: subject === "cs408" });

  useEffect(() => {
    load();
  }, [load]);

  const mathTrack = settings.mathTrack;
  const books = useMemo(() => {
    if (subject === "math") return filterMathBooks(mathTrack);
    return booksForSubject("cs408");
  }, [subject, mathTrack]);

  const wdByMod = useMemo(() => {
    if (!wangdao || subject !== "cs408") return null;
    const m = new Map<string, ReturnType<typeof wdCounts>>();
    for (const b of books) {
      for (const mod of b.modules) m.set(mod.id, wdCounts(wangdao, mod.id));
    }
    return m;
  }, [wangdao, books, subject]);

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

  if (!parsed) {
    return <Navigate to={kgMapPath(fallback)} replace />;
  }
  if (subject === "cs408" && !settings.enableCs408 && settings.enableMath) {
    return <Navigate to={kgMapPath("math")} replace />;
  }
  if (subject === "math" && !settings.enableMath && settings.enableCs408) {
    return <Navigate to={kgMapPath("cs408")} replace />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">知识图谱</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subject === "cs408"
              ? "按大类（章）过图谱 · 王道选择/大题分开刷 · 点开题目出小类"
              : "模块卡片标记进度 · 真题/预测卷回写弱项 · 遗忘曲线提醒复习"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subject === "cs408" && (
            <Button asChild size="sm">
              <Link to="/kg/predict">408 大题预测卷</Link>
            </Button>
          )}
          {subject === "cs408" && (
            <Button asChild size="sm" variant="outline">
              <Link to={wdSetPath()}>王道按大类</Link>
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
            <Link
              key={t.id}
              to={kgMapPath(t.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm",
                subject === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
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
            desc: subject === "math"
              ? "按 880 章进入考点，李林880 与 张宇1000 分开刷"
              : "按章过知识点，刷王道题或标记已学",
            to: null as string | null,
          },
          {
            title: "真题演练",
            desc: subject === "cs408" ? "王道选择/大题分开，按图谱大类校对，含夹带真题" : "历年卷按题标 会/模糊/不会",
            to: subject === "cs408" ? wdSetPath() : "/kg/exams",
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
                to={kgKpPath(d.kp.id, { subject: d.book.subject })}
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
                    to={kgModulePath(book.id as BookId, mod.id, subject)}
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
                        <span>
                          {mod.kps.length} 个考点
                          {wdByMod
                            ? ` · 选择 ${wdByMod.get(mod.id)?.mcq ?? 0} · 大题 ${wdByMod.get(mod.id)?.big ?? 0}`
                            : ""}
                        </span>
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
