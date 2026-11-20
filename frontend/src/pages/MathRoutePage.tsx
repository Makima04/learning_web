// 章级解题路线：一条主线 + 「看到什么式子，第一步写什么」。红笔题按考点自动归位到索引行。
import { useEffect, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb, Route as RouteIcon, ScanLine } from "lucide-react";
import { findKp, findModule, getBook } from "@/data/kg";
import { MATH_ROUTE_GUIDES, MATH_ROUTE_CHAPTERS, routeChapterById } from "@/data/kg/mathRouteGuides";
import { MathFormula } from "@/components/MathFormula";
import { Button } from "@/components/ui/button";
import { syncAccountData } from "@/lib/accountSync";
import { MATH1_ITEMS } from "@/lib/kg/math1Analysis";
import { math1PracticePath } from "@/lib/kg/math1Practice";
import { firstRowForKp, routeChapterPath, routeIndexPath, type RouteChapter, type RouteRow } from "@/lib/kg/mathRoute";
import { kgKpPath, knowledgeReviewPath } from "@/lib/kg/paths";
import { practiceSourceLabel, useDrillCatalog } from "@/lib/kg/mathPractice";
import type { BookId } from "@/lib/kg/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useKgProgress } from "@/stores/kgProgress";

interface RedItem {
  itemId: string;
  label: string;
  kpId: string;
  href: string;
  mark: "fail" | "fuzzy";
  first?: string;
}

const BOOK_LABELS: Record<string, string> = { linear: "线性代数", prob: "概率论与数理统计" };

/** 索引行统一编号，便于在红笔题里回指「你是卡在第几条」。 */
function RouteRowCard({ row, index }: { row: RouteRow; index: number }) {
  const kpName = findKp(row.kpId)?.kp.name;
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground">看到的式子</p>
            <p className="mt-1 text-sm font-semibold leading-6">{row.signal}</p>
            {row.tex && <MathFormula tex={row.tex} className="mt-1 text-xs" />}
          </div>
          <div className="rounded-xl bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-primary"><Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />第一步写什么</p>
            <p className="mt-1 text-sm leading-6">{row.first}</p>
          </div>
          <p className="text-xs leading-6 text-muted-foreground"><span className="font-semibold text-foreground">接着做：</span>{row.chain}</p>
          <p className="flex items-start gap-1.5 text-xs leading-6 text-ink-danger"><ScanLine className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{row.trap}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] font-semibold">
            <Link className="inline-flex items-center gap-1 text-primary hover:underline" to={knowledgeReviewPath(row.kpId)}>
              <BookOpen className="h-3 w-3" aria-hidden="true" />看这个考点的讲解与例题
            </Link>
            {kpName && <span className="text-muted-foreground">{kpName}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

function SpineBlock({ chapter }: { chapter: RouteChapter }) {
  return (
    <section aria-labelledby="route-spine" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 id="route-spine" className="flex items-center gap-2 text-sm font-extrabold"><RouteIcon className="h-4 w-4" aria-hidden="true" />本章主线</h2>
      <p className="mt-2 text-sm leading-7">{chapter.spine}</p>
      <ol className="mt-4 space-y-2">
        {chapter.steps.map((step, index) => (
          <li key={step.label} className="flex items-start gap-3 text-xs leading-6">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary tabular-nums">{index + 1}</span>
            <span><span className="font-bold">{step.label}：</span>{step.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RedItems({ chapter }: { chapter: RouteChapter }) {
  const marks = useKgProgress((s) => s.itemMarks);
  const load = useKgProgress((s) => s.load);
  const { items: catalog } = useDrillCatalog("math");

  useEffect(() => {
    load();
  }, [load]);

  const reds = useMemo<RedItem[]>(() => {
    const label = new Map<string, { kpId: string; label: string; href: string }>();
    for (const q of MATH1_ITEMS) {
      label.set(q.id, { kpId: q.kpId, label: `${q.year} 年 · 第 ${q.n} 题`, href: math1PracticePath(q, false, routeChapterPath(chapter.moduleId)) });
    }
    for (const q of catalog ?? []) {
      const kpId = q.kp_ids?.[0];
      if (!kpId) continue;
      label.set(q.id, { kpId, label: `${practiceSourceLabel(q)} · ${q.section_name ? `${q.section_name} ` : ""}第 ${q.qno} 题`, href: kgKpPath(kpId, { subject: "math" }) });
    }
    const kpIds = new Set(chapter.rows.map((row) => row.kpId));
    const out: RedItem[] = [];
    for (const item of marks) {
      if (item.mark !== "fail" && item.mark !== "fuzzy") continue;
      const found = label.get(item.itemId);
      if (!found || !kpIds.has(found.kpId)) continue;
      out.push({ itemId: item.itemId, mark: item.mark, kpId: found.kpId, label: found.label, href: found.href, first: firstRowForKp(chapter, found.kpId)?.first });
    }
    return out.sort((a, b) => (a.mark === b.mark ? 0 : a.mark === "fail" ? -1 : 1));
  }, [marks, catalog, chapter]);

  return (
    <section aria-labelledby="route-red" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 id="route-red" className="text-sm font-extrabold">我的红笔题 · 按题型归位</h2>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">本体是题卡上点过「不会」或「模糊」的题。每题后面直接给出该题型的第一步，先按这一步重做，再回看整条主线。</p>
      {reds.length === 0 ? (
        <p className="mt-3 rounded-xl bg-secondary/40 p-3 text-xs leading-6 text-muted-foreground">本章还没有红笔题。做题时在题卡上点「不会／模糊」，这里会按考点自动排到对应题型下；纸质题按上面的索引对号即可，不必手工录入。</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {reds.map((item) => (
            <li key={item.itemId} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", item.mark === "fail" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground")}>{item.mark === "fail" ? "不会" : "模糊"}</span>
                <Link className="text-xs font-bold text-primary hover:underline" to={item.href}>{item.label}</Link>
              </div>
              {item.first && <p className="mt-1 text-xs leading-6 text-muted-foreground">先写：{item.first}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MathRoutePage() {
  const { moduleId } = useParams();
  const [params, setParams] = useSearchParams();
  const loggedIn = useAuth((s) => s.loggedIn);
  const marks = useKgProgress((s) => s.itemMarks);
  const { items: catalog } = useDrillCatalog("math");

  useEffect(() => {
    if (loggedIn) void syncAccountData().catch(() => {});
  }, [loggedIn]);

  const chapter = moduleId ? routeChapterById(moduleId) : undefined;
  const bookId = useMemo(() => {
    if (chapter) return Object.keys(MATH_ROUTE_GUIDES).find((key) => MATH_ROUTE_GUIDES[key].some((c) => c.moduleId === chapter.moduleId)) ?? "linear";
    const wanted = params.get("book");
    return wanted && MATH_ROUTE_GUIDES[wanted] ? wanted : "linear";
  }, [chapter, params]);

  /** 红笔题计数只在目录页用，按考点归属汇总一次。 */
  const redCount = useMemo(() => {
    const kpOf = new Map<string, string>();
    for (const q of MATH1_ITEMS) kpOf.set(q.id, q.kpId);
    for (const q of catalog ?? []) if (q.kp_ids?.[0]) kpOf.set(q.id, q.kp_ids[0]);
    const count = new Map<string, number>();
    for (const item of marks) {
      if (item.mark !== "fail" && item.mark !== "fuzzy") continue;
      const kpId = kpOf.get(item.itemId);
      if (!kpId) continue;
      const hit = MATH_ROUTE_CHAPTERS.find((c) => c.rows.some((row) => row.kpId === kpId));
      if (hit) count.set(hit.moduleId, (count.get(hit.moduleId) ?? 0) + 1);
    }
    return count;
  }, [marks, catalog]);

  if (chapter) {
    const located = findModule(chapter.moduleId);
    return <div className="mx-auto max-w-4xl space-y-5 p-4 pb-24 md:p-6">
      <header>
        <Link to={routeIndexPath(bookId)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" />返回路线目录</Link>
        <p className="mt-4 text-[11px] font-bold tracking-wide text-muted-foreground">{located?.book.name ?? BOOK_LABELS[bookId]}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{located?.module.name ?? "解题路线"}</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">共 {chapter.rows.length} 种起手式。先按主线定位置，再在索引里找到「看到的式子」，照第一步写下去。</p>
      </header>
      <SpineBlock chapter={chapter} />
      <section aria-labelledby="route-index" className="space-y-3">
        <div>
          <h2 id="route-index" className="text-sm font-extrabold">题型索引</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">每张卡上半是题目给你的信号，下面是落笔的第一句。信号认错，后面算得再对也不得分。</p>
        </div>
        <ol className="space-y-3">{chapter.rows.map((row, index) => <RouteRowCard key={`${row.kpId}-${index}`} row={row} index={index} />)}</ol>
      </section>
      <section aria-labelledby="route-transfer" className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <h2 id="route-transfer" className="text-sm font-extrabold">带走一句</h2>
        <p className="mt-2 text-sm leading-7">{chapter.transfer}</p>
      </section>
      <RedItems chapter={chapter} />
    </div>;
  }

  const chapters = MATH_ROUTE_GUIDES[bookId] ?? MATH_ROUTE_GUIDES.linear;
  return <div className="mx-auto max-w-4xl space-y-5 p-4 pb-24 md:p-6">
    <header>
      <Link to="/review-priority/knowledge?subject=math" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" />返回知识复习</Link>
      <h1 className="mt-4 text-2xl font-extrabold">解题路线</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">每章只有一条主线：先判断这道题卡在哪一步，再按「看到的式子 → 第一步写什么」落笔。概念与例题仍在考点讲解里，这里只解决起手。</p>
    </header>
    <div role="group" aria-label="选择科目" className="flex flex-wrap gap-2">
      {Object.keys(MATH_ROUTE_GUIDES).map((key) => <Button key={key} size="sm" variant={bookId === key ? "default" : "outline"} aria-pressed={bookId === key} onClick={() => setParams({ book: key }, { replace: true })}>{getBook(key as BookId)?.name ?? BOOK_LABELS[key] ?? key}</Button>)}
    </div>
    <div className="space-y-3">
      {chapters.map((item) => {
        const mod = findModule(item.moduleId);
        const red = redCount.get(item.moduleId) ?? 0;
        return <Link key={item.moduleId} to={routeChapterPath(item.moduleId)} className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-secondary/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold">{mod?.module.name ?? item.moduleId}</h2>
              <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">{item.spine}</p>
              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{item.rows.length} 种起手式{red > 0 ? ` · 红笔题 ${red}` : ""}</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
        </Link>;
      })}
    </div>
  </div>;
}
