// 模块学习：考点列表。408 刷王道；数学按 880 章，李林880 与 张宇1000 分开刷。
import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getBook, getModule, findKp } from "@/data/kg";
import { moduleProgress } from "@/lib/kg/progress";
import { countKpDrill, countPoolDrill } from "@/lib/kg/wangdao408";
import { itemsForSource, MATH_BOOK_SOURCES, useDrillCatalog } from "@/lib/kg/mathPractice";
import { bookDrillGroups, itemsForBookDrill } from "@/lib/kg/mathBookToc";
import { kgBookDrillPath, kgKpPath, kgMapPath, kgModulePath, kgSubjectSlug, parseKgSubject } from "@/lib/kg/paths";
import { osMemSetPath } from "@/data/kg/osMemTopics";
import { wdCounts, wdSetPath } from "@/data/kg/wdTaxonomy";
import { itemsForKp } from "@/lib/kg/wangdao408";
import { vizFor } from "@/viz/registry";
import type { BookId, MarkLevel } from "@/lib/kg/types";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "pass", label: "会", cls: "bg-emerald-600 text-white" },
  { id: "skip", label: "跳过", cls: "bg-muted text-muted-foreground" },
];

export function KgModulePage() {
  const { subject: rawSubject, bookId = "", moduleId = "" } = useParams();
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const setCovered = useKgProgress((s) => s.setCovered);
  const setModuleCovered = useKgProgress((s) => s.setModuleCovered);
  const markItem = useKgProgress((s) => s.markItem);
  const kgChapterLimit = useSettings((s) => s.journalKgChapterDailyLimit);
  const journalEntries = useJournal((s) => s.entries);
  const book = getBook(bookId as BookId);
  const which =
    book?.subject === "math" ? "math" : book?.subject === "cs408" ? "wangdao" : "none";
  const { items: catalog } = useDrillCatalog(which);

  useEffect(() => {
    load();
  }, [load]);

  const mod = getModule(bookId as BookId, moduleId);
  const hasDrill = book?.subject === "cs408" || book?.subject === "math";
  const isMath = book?.subject === "math";
  const prog = useMemo(
    () => moduleProgress(bookId as BookId, moduleId, states),
    [bookId, moduleId, states]
  );
  const wdMod = useMemo(
    () => (catalog ? wdCounts(catalog, moduleId) : null),
    [catalog, moduleId]
  );

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

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={kgMapPath(book.subject)}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← 知识图谱
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {book.name} · {mod.name}
          </h1>
          {prog && (
            <p className="mt-1 text-sm text-muted-foreground">
              覆盖 {Math.round(prog.coverage * 100)}% · 掌握{" "}
              {Math.round(prog.mastery * 100)}%
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {hasDrill
              ? isMath
                ? "可以按 880/1000 原书顺序刷，也可以按考点刷。不会/模糊或收藏会进错题集，按 1/3/7/14 天提醒。"
                : "点进考点：新学是还没做过的题，复习是错题集里今天到期的。不会/模糊或收藏会进错题集，按 1/3/7/14 天提醒。"
              : `标记已学后，本章会作为一张大卡片进入「学习日志」（明天起提醒，每天最多 ${kgChapterLimit} 章）；点进去复盘各知识点，会回写掌握度`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModuleCovered(mod.kps.map((k) => k.id), true)}
          >
            全部标已学
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModuleCovered(mod.kps.map((k) => k.id), false)}
          >
            清除覆盖
          </Button>
        </div>
      </div>

      {book.subject === "cs408" && wdMod && wdMod.total > 0 && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">王道题集 · {mod.name}</p>
              <p className="text-xs text-muted-foreground">
                选择 {wdMod.mcq} · 大题 {wdMod.big}
                {wdMod.exam > 0 ? ` · 真题 ${wdMod.exam}` : ""}
                {" · 点开题目出小类，选择/大题分开校对"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={wdSetPath({ group: mod.id, kind: "mcq", mode: "proof" })}>
                  选择校对
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to={wdSetPath({ group: mod.id, kind: "big", mode: "proof" })}>
                  大题校对
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={wdSetPath({ group: mod.id, kind: "mcq" })}>题集</Link>
              </Button>
              {mod.id === "os-mem" && (
                <Button asChild size="sm" variant="ghost">
                  <Link to={osMemSetPath()}>内存细分</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasDrill && !catalog && (
        <p className="text-sm text-muted-foreground">正在加载题量…</p>
      )}

      {isMath && catalog && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">按书顺序刷</h2>
          {bookDrillGroups(mod.id).map((spec) => {
            const pool = itemsForBookDrill(catalog, spec);
            if (pool.length === 0) return null;
            const drill = countPoolDrill(pool, itemMarks, journalEntries);
            return (
              <Card key={`${spec.source}-${spec.part}-${spec.section}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{spec.bookLabel}</p>
                    <p className="text-xs text-muted-foreground">{spec.chapterLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      共 {drill.total} · 新学 {drill.learn} · 复习 {drill.review}
                      {drill.waiting > 0 ? ` · 间隔中 ${drill.waiting}` : ""}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link
                      to={kgBookDrillPath(book.id, mod.id, {
                        subject: book.subject,
                        src: spec.source,
                        part: spec.part,
                        section: spec.section,
                      })}
                    >
                      {drill.review > 0
                        ? `复习 ${drill.review}`
                        : drill.learn > 0
                          ? `开始 ${drill.learn} 题`
                          : "进入"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {isMath && <h2 className="text-sm font-semibold">按考点刷</h2>}
        {mod.kps.map((kp) => {
          const st = states[kp.id];
          const drill = catalog
            ? countKpDrill(catalog, kp.id, itemMarks, journalEntries)
            : null;
          const mathDrills =
            isMath && catalog
              ? MATH_BOOK_SOURCES.map((s) => ({
                  ...s,
                  drill: countKpDrill(
                    itemsForSource(catalog, s.id),
                    kp.id,
                    itemMarks,
                    journalEntries
                  ),
                }))
              : null;
          return (
            <Card key={kp.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  {hasDrill ? (
                    <Link
                      to={kgKpPath(kp.id, { subject: book.subject })}
                      className="min-w-0 hover:underline"
                    >
                      <CardTitle className="text-sm font-medium leading-snug">
                        {kp.name}
                      </CardTitle>
                    </Link>
                  ) : (
                    <CardTitle className="text-sm font-medium leading-snug">
                      {kp.name}
                    </CardTitle>
                  )}
                  <div className="flex shrink-0 gap-1 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">频{kp.freq}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      大题{Math.round(kp.bigWeight * 100)}%
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {hasDrill && isMath && mathDrills && (
                  <div className="space-y-1.5 text-sm">
                    {mathDrills.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2">
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">
                          {s.label}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5",
                            s.drill.learn > 0
                              ? "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          新学 {s.drill.learn}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5",
                            s.drill.review > 0
                              ? "bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          复习 {s.drill.review}
                        </span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                          共 {s.drill.total}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {hasDrill && !isMath && drill && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5",
                        drill.learn > 0
                          ? "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      新学 {drill.learn}
                    </span>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5",
                        drill.review > 0
                          ? "bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      复习 {drill.review}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                      共 {drill.total}
                    </span>
                    {catalog && (() => {
                      const pool = itemsForKp(catalog, kp.id);
                      const mcqN = pool.filter((q) => q.kind !== "big").length;
                      const bigN = pool.filter((q) => q.kind === "big").length;
                      return (
                        <span className="text-xs text-muted-foreground">
                          选择 {mcqN} · 大题 {bigN}
                        </span>
                      );
                    })()}
                    {drill.waiting > 0 && (
                      <span className="text-xs text-muted-foreground">
                        间隔中 {drill.waiting}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5",
                      st?.covered
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {st?.covered ? "已覆盖" : "未学"}
                  </span>
                  <span className="text-muted-foreground">
                    掌握 {Math.round((st?.confidence ?? 0) * 100)}%
                  </span>
                  {kp.prereqs && kp.prereqs.length > 0 && (
                    <span className="text-muted-foreground">
                      先修：
                      {kp.prereqs
                        .map((id) => findKp(id)?.kp.name ?? id)
                        .join("、")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasDrill && isMath && mathDrills
                    ? mathDrills.map((s) => (
                        <Button key={s.id} asChild size="sm" variant="secondary">
                          <Link to={kgKpPath(kp.id, { subject: book.subject, src: s.id })}>
                            {s.label}
                            {s.drill.review > 0
                              ? ` 复习 ${s.drill.review}`
                              : s.drill.learn > 0
                                ? ` ${s.drill.learn} 题`
                                : ""}
                          </Link>
                        </Button>
                      ))
                    : hasDrill && (
                        <Button asChild size="sm">
                          <Link to={kgKpPath(kp.id, { subject: book.subject })}>
                            {drill && drill.review > 0
                              ? `复习 ${drill.review} 题`
                              : drill && drill.learn > 0
                                ? `学习 ${drill.learn} 题`
                                : "进入"}
                          </Link>
                        </Button>
                      )}
                  {vizFor(kp.id) && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/viz/${kp.id}`}>▶ 演示</Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={st?.covered ? "outline" : "secondary"}
                    onClick={() => setCovered(kp.id, !st?.covered)}
                  >
                    {st?.covered ? "取消已学" : "标记已学"}
                  </Button>
                  {!hasDrill &&
                    MARKS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium",
                          m.cls,
                          st?.lastMark === m.id && "ring-2 ring-offset-2 ring-primary"
                        )}
                        onClick={() =>
                          markItem({
                            itemId: `self:${kp.id}`,
                            mark: m.id,
                            primaryKpId: kp.id,
                            secondaryKpIds: [],
                          })
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
