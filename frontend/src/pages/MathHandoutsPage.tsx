import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookMarked,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  Network,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  loadMathHandouts,
  useHandoutPriority,
  type HandoutExample,
  type MathHandout,
} from "@/lib/mathHandouts";
import { useKgProgress } from "@/stores/kgProgress";
import { findKp, MATH_BOOKS } from "@/data/kg";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UserItemMark } from "@/lib/kg/types";

const BOOK_FILTERS: { id: "all" | "calc" | "linear" | "prob"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "calc", label: "高等数学" },
  { id: "linear", label: "线性代数" },
  { id: "prob", label: "概率论与数理统计" },
];

const BOOK_ACCENT: Record<string, { bar: string; badge: string; text: string }> = {
  calc: {
    bar: "bg-app-teal",
    badge: "bg-app-teal/15 text-app-teal",
    text: "text-app-teal",
  },
  linear: {
    bar: "bg-app-purple",
    badge: "bg-app-purple/15 text-app-purple",
    text: "text-app-purple",
  },
  prob: {
    bar: "bg-app-orange",
    badge: "bg-app-orange/15 text-app-orange",
    text: "text-app-orange",
  },
};

interface EnrichedHandout {
  handout: MathHandout;
  kpName: string;
  freq: number;
  confidence: number;
  covered: boolean;
  examPassed: number;
  examTotal: number;
  lilinPassed: number;
  lilinTotal: number;
  retiredCount: number;
}

export function MathHandoutsPage() {
  const [handouts, setHandouts] = useState<MathHandout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookFilter, setBookFilter] = useState<"all" | "calc" | "linear" | "prob">("all");
  const [query, setQuery] = useState("");
  const [showRetiredPanel, setShowRetiredPanel] = useState(false);
  const [showPendingModules, setShowPendingModules] = useState(true);
  const [priority, setPriority] = useHandoutPriority();

  const states = useKgProgress((s) => s.states);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const unretireItem = useKgProgress((s) => s.unretireItem);

  useEffect(() => {
    let alive = true;
    loadMathHandouts()
      .then((hs) => {
        if (!alive) return;
        setHandouts(hs);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const markRecordMap = useMemo(() => {
    const m = new Map<string, UserItemMark>();
    for (const it of itemMarks) m.set(it.itemId, it);
    return m;
  }, [itemMarks]);

  const enriched = useMemo<EnrichedHandout[]>(() => {
    return handouts.map((h) => {
      const kpState = states[h.primaryKpId];
      const kpInfo = findKp(h.primaryKpId);
      const confidence = Math.round((kpState?.confidence ?? 0) * 100);
      const allExamples = h.groups.flatMap((g) => g.examples);
      const examExamples = allExamples.filter((e) => e.sourceType !== "lilin880");
      const lilinExamples = allExamples.filter(
        (e) => e.sourceType === "lilin880" || Boolean(e.lilin880Id)
      );

      const getMark = (e: HandoutExample) =>
        markRecordMap.get(e.id)?.mark ??
        (e.lilin880Id ? markRecordMap.get(e.lilin880Id)?.mark : undefined);
      const isRetired = (e: HandoutExample) =>
        Boolean(
          markRecordMap.get(e.id)?.retired ||
            (e.lilin880Id && markRecordMap.get(e.lilin880Id)?.retired)
        );

      const examPassed = examExamples.filter((e) => getMark(e) === "pass").length;
      const lilinPassed = lilinExamples.filter((e) => getMark(e) === "pass").length;
      const retiredCount = allExamples.filter(isRetired).length;

      return {
        handout: h,
        kpName: kpInfo?.kp.name ?? h.primaryKpId,
        freq: kpInfo?.kp.freq ?? 4,
        confidence,
        covered: kpState?.covered ?? false,
        examPassed,
        examTotal: examExamples.length,
        lilinPassed,
        lilinTotal: lilinExamples.length,
        retiredCount,
      };
    });
  }, [handouts, states, markRecordMap]);

  // 全部已斩题列表（按斩题时间倒序，最新误点的永远排第一）
  const retiredList = useMemo(() => {
    const rows: {
      handoutSlug: string;
      handoutTitle: string;
      ex: HandoutExample;
      retiredAt: number;
    }[] = [];
    for (const h of handouts) {
      for (const g of h.groups) {
        for (const ex of g.examples) {
          const rec =
            markRecordMap.get(ex.id) ??
            (ex.lilin880Id ? markRecordMap.get(ex.lilin880Id) : undefined);
          if (rec?.retired) {
            rows.push({
              handoutSlug: h.slug,
              handoutTitle: h.title,
              ex,
              retiredAt: rec.retiredAt ?? rec.ts ?? 0,
            });
          }
        }
      }
    }
    return rows.sort((a, b) => b.retiredAt - a.retiredAt);
  }, [handouts, markRecordMap]);

  // 按「学科 → 章节」树形分组（对齐数一知识图谱章节顺序）
  const groupedBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byModule = new Map<string, EnrichedHandout[]>();
    for (const row of enriched) {
      const mid = row.handout.moduleId;
      const list = byModule.get(mid) ?? [];
      list.push(row);
      byModule.set(mid, list);
    }

    return MATH_BOOKS.filter((book) => bookFilter === "all" || book.id === bookFilter).map(
      (book) => {
        const chapters = book.modules.map((mod) => {
          const rawRows = (byModule.get(mod.id) ?? []).sort(
            (a, b) => a.handout.order - b.handout.order
          );
          const matchedRows = !q
            ? rawRows
            : rawRows.filter(
                (r) =>
                  r.handout.title.toLowerCase().includes(q) ||
                  r.kpName.toLowerCase().includes(q) ||
                  mod.name.toLowerCase().includes(q) ||
                  r.handout.methods.some((m) => m.title.toLowerCase().includes(q))
              );
          const modMatchedQuery =
            !q ||
            mod.name.toLowerCase().includes(q) ||
            mod.kps.some((k) => k.name.toLowerCase().includes(q));

          const coveredKpIds = new Set<string>();
          for (const r of rawRows) {
            coveredKpIds.add(r.handout.primaryKpId);
            for (const sec of r.handout.secondaryKpIds ?? []) coveredKpIds.add(sec);
          }
          const missingKps = mod.kps.filter((k) => !coveredKpIds.has(k.id));

          return {
            module: mod,
            rows: matchedRows,
            totalInModule: rawRows.length,
            missingKps,
            modMatchedQuery,
          };
        });

        const activeChapters = chapters.filter((c) => c.rows.length > 0);
        const pendingChapters = chapters.filter(
          (c) => c.totalInModule === 0 && c.modMatchedQuery
        );
        const totalHandoutsInBook = chapters.reduce((s, c) => s + c.totalInModule, 0);
        const coveredChaptersCount = chapters.filter((c) => c.totalInModule > 0).length;

        return {
          book,
          activeChapters,
          pendingChapters,
          totalHandoutsInBook,
          coveredChaptersCount,
          totalChaptersCount: book.modules.length,
        };
      }
    );
  }, [enriched, bookFilter, query]);

  const totalExamItems = enriched.reduce((s, r) => s + r.examTotal, 0);
  const totalExamPassed = enriched.reduce((s, r) => s + r.examPassed, 0);
  const totalLilinItems = enriched.reduce((s, r) => s + r.lilinTotal, 0);
  const totalLilinPassed = enriched.reduce((s, r) => s + r.lilinPassed, 0);
  const totalChapters = MATH_BOOKS.reduce((s, b) => s + b.modules.length, 0);
  const coveredChapters = new Set(handouts.map((h) => h.moduleId)).size;

  const handleRestore = (ex: HandoutExample) => {
    unretireItem(ex.id);
    if (ex.lilin880Id && ex.lilin880Id !== ex.id) {
      unretireItem(ex.lilin880Id);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      {/* 头部 + 真题优先 / 李林880优先 切换 */}
      <div className="rounded-3xl border-2 border-border/80 bg-card p-5 shadow-edge-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-app-teal/15 px-3 py-1 text-xs font-bold text-app-teal">
              <BookMarked className="h-3.5 w-3.5" />
              小祥学习 · 考研数学一手稿
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">数学手稿</h1>
            <p className="text-sm text-muted-foreground">
              {priority === "exam"
                ? "按高等数学、线性代数、概率论的章节编排；当前「真题优先」，空格键显隐步骤，支持斩题与全站进度互通。"
                : "按高等数学、线性代数、概率论的章节编排；当前「李林 880 优先」，空格键显隐步骤，支持斩题与全站进度互通。"}
            </p>
          </div>

          <div
            className="inline-flex shrink-0 rounded-2xl border-2 border-border bg-secondary/70 p-1"
            role="tablist"
            aria-label="讲解例题优先级切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={priority === "exam"}
              onClick={() => setPriority("exam")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                priority === "exam"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              真题优先
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={priority === "lilin880"}
              onClick={() => setPriority("lilin880")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                priority === "lilin880"
                  ? "bg-app-orange text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              李林 880 优先
            </button>
          </div>
        </div>

        {/* 同步统计条 */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-secondary/50 px-3.5 py-2.5">
            <div className="text-xs font-semibold text-muted-foreground">章节与手稿</div>
            <div className="mt-0.5 text-lg font-extrabold">
              {handouts.length} 份
              <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                · {coveredChapters}/{totalChapters} 章
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-secondary/50 px-3.5 py-2.5">
            <div className="text-xs font-semibold text-muted-foreground">真题精讲已会</div>
            <div className="mt-0.5 text-lg font-extrabold">
              {totalExamPassed}{" "}
              <span className="text-xs font-semibold text-muted-foreground">/ {totalExamItems}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-secondary/50 px-3.5 py-2.5">
            <div className="text-xs font-semibold text-muted-foreground">李林 880 HTML精讲</div>
            <div className="mt-0.5 text-lg font-extrabold">
              {totalLilinPassed}{" "}
              <span className="text-xs font-semibold text-muted-foreground">/ {totalLilinItems}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRetiredPanel((v) => !v)}
            className="flex flex-col justify-between rounded-2xl bg-secondary/50 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary"
          >
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Scissors className="h-3.5 w-3.5" />
              已斩题（不再复习）
            </div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-lg font-extrabold">{retiredList.length} 题</span>
              <span className="text-[11px] font-bold text-primary">
                {showRetiredPanel ? "收起" : "管理 / 移回"}
              </span>
            </div>
          </button>
        </div>

        {/* 已斩题快速移回抽屉（按最新倒序） */}
        {showRetiredPanel && (
          <div className="mt-4 rounded-2xl border border-border bg-secondary/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold">
                已斩题列表（按斩题时间倒序，误点的排最前）
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link to="/kg/math" className="font-semibold text-app-purple hover:underline">
                  知识图谱
                </Link>
                <span>·</span>
                <Link to="/review-priority?subject=math" className="font-semibold text-app-orange hover:underline">
                  复习性价比
                </Link>
              </div>
            </div>
            {retiredList.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                目前还没有斩掉的题。在讲义中点「斩掉」后，题目会折叠成灰条并汇总到这里，随时可一键移回复习。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {retiredList.map(({ handoutSlug, handoutTitle, ex }) => (
                  <li
                    key={`${handoutSlug}-${ex.anchorId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/math-handouts/${handoutSlug}#${ex.anchorId}`}
                        className="font-bold text-foreground hover:text-primary hover:underline"
                      >
                        {ex.title}
                      </Link>
                      <p className="mt-0.5 text-muted-foreground">
                        {handoutTitle} · {ex.source}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => handleRestore(ex)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      移回复习
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 筛选、待补章节开关与搜索 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {BOOK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setBookFilter(f.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors",
                bookFilter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPendingModules((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              showPendingModules
                ? "border-border bg-secondary text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {showPendingModules ? "隐藏待补章节" : "显示待补章节"}
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜章节、讲义、考点或方法…"
            className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">正在加载数学手稿…</div>
      )}
      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          加载手稿失败：{error}
        </div>
      )}

      {/* 学科 → 章节 → 讲义 分层视图 */}
      {!loading && !error && (
        <div className="space-y-8">
          {groupedBooks.map(
            ({
              book,
              activeChapters,
              pendingChapters,
              totalHandoutsInBook,
              coveredChaptersCount,
              totalChaptersCount,
            }) => {
              if (activeChapters.length === 0 && (!showPendingModules || pendingChapters.length === 0)) {
                return null;
              }
              const accent = BOOK_ACCENT[book.id] ?? BOOK_ACCENT.calc;

              return (
                <section key={book.id} className="space-y-4">
                  {/* 学科大标题栏 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border/80 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("h-5 w-1.5 rounded-full", accent.bar)} />
                      <h2 className="text-lg font-extrabold tracking-tight">{book.name}</h2>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", accent.badge)}>
                        已建 {totalHandoutsInBook} 份讲义 · {coveredChaptersCount}/{totalChaptersCount} 章
                      </span>
                    </div>
                    <Link
                      to={`/kg/math?book=${book.id}`}
                      className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
                    >
                      查看{book.name}知识图谱 →
                    </Link>
                  </div>

                  {/* 已有讲义的章节列表 */}
                  <div className="space-y-5">
                    {activeChapters.map(({ module: mod, rows, missingKps }) => (
                      <div
                        key={mod.id}
                        className="rounded-3xl border border-border/80 bg-secondary/25 p-4 md:p-5"
                      >
                        {/* 章节标题条 */}
                        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-card px-2.5 py-1 text-xs font-extrabold text-foreground shadow-sm ring-1 ring-border/70">
                              <FolderOpen className={cn("h-3.5 w-3.5", accent.text)} />
                              第 {mod.order} 章 · {mod.name}
                            </span>
                            <span className="text-xs font-semibold text-muted-foreground">
                              已收 {rows.length} 份讲义（共 {mod.kps.length} 个核心考点）
                            </span>
                          </div>
                          {missingKps.length > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              本章待补：{missingKps.map((k) => k.name).join(" / ")}
                            </span>
                          )}
                        </div>

                        {/* 本章讲义卡片网格 */}
                        <div className="grid gap-3.5 md:grid-cols-2">
                          {rows.map((row) => {
                            const h = row.handout;
                            const show880Bar = priority === "lilin880" && row.lilinTotal > 0;
                            const activePassed = show880Bar ? row.lilinPassed : row.examPassed;
                            const activeTotal = show880Bar ? row.lilinTotal : row.examTotal;
                            const activePct =
                              activeTotal > 0 ? Math.round((activePassed / activeTotal) * 100) : 0;

                            return (
                              <div
                                key={h.slug}
                                className="group flex flex-col justify-between rounded-2xl border-2 border-border/80 bg-card p-4 shadow-edge-sm transition-all hover:border-primary/60"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {row.lilinTotal > 0 && (
                                        <span className="rounded-full bg-app-orange/15 px-2.5 py-0.5 text-[11px] font-bold text-app-orange">
                                          含 {row.lilinTotal} 题 880 精讲
                                        </span>
                                      )}
                                      {row.retiredCount > 0 && (
                                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                                          已斩 {row.retiredCount}
                                        </span>
                                      )}
                                      {row.lilinTotal === 0 && row.retiredCount === 0 && (
                                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                                          真题 {row.examTotal} 题
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={cn(
                                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                                        row.confidence >= 70
                                          ? "bg-app-green/15 text-app-green"
                                          : row.confidence > 0
                                          ? "bg-app-orange/15 text-app-orange"
                                          : "bg-secondary text-muted-foreground"
                                      )}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      图谱 {row.confidence}%
                                    </span>
                                  </div>

                                  <Link
                                    to={`/math-handouts/${h.slug}`}
                                    className="mt-2 block text-base font-extrabold tracking-tight group-hover:text-primary"
                                  >
                                    {h.title}
                                  </Link>

                                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                                    考点：{row.kpName}（考频 {row.freq}/5）
                                  </p>

                                  {/* 进度条 */}
                                  <div className="mt-3 space-y-1">
                                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                                      <span>
                                        {show880Bar
                                          ? `李林 880 HTML精讲：已会 ${row.lilinPassed}/${row.lilinTotal}`
                                          : `真题精讲：已会 ${row.examPassed}/${row.examTotal}`}
                                      </span>
                                      <span>{activePct}%</span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                      <div
                                        className={cn(
                                          "h-full rounded-full transition-all",
                                          show880Bar ? "bg-app-orange" : "bg-primary"
                                        )}
                                        style={{ width: `${activePct}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* 底部快捷联动 */}
                                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                                  <div className="flex items-center gap-1.5">
                                    <Link
                                      to={`/kg/math/kp/${h.primaryKpId}`}
                                      className="inline-flex items-center gap-1 rounded-full bg-app-purple/10 px-2.5 py-1 text-[11px] font-bold text-app-purple hover:bg-app-purple/20"
                                    >
                                      <Network className="h-3 w-3" />
                                      知识图谱
                                    </Link>
                                    <Link
                                      to={`/review-priority/knowledge/${h.primaryKpId}`}
                                      className="inline-flex items-center gap-1 rounded-full bg-app-orange/10 px-2.5 py-1 text-[11px] font-bold text-app-orange hover:bg-app-orange/20"
                                    >
                                      <Target className="h-3 w-3" />
                                      复习性价比
                                    </Link>
                                  </div>

                                  <Button
                                    asChild
                                    size="sm"
                                    variant="default"
                                    className="h-8 rounded-full px-3.5 text-xs font-bold"
                                  >
                                    <Link
                                      to={`/math-handouts/${h.slug}`}
                                      className="inline-flex items-center gap-1"
                                    >
                                      {row.covered && <CheckCircle2 className="h-3.5 w-3.5" />}
                                      开始精读
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 本学科尚未建稿的占位章节（轻量紧凑展示，一眼看清全貌） */}
                  {showPendingModules && pendingChapters.length > 0 && (
                    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-3">
                      <div className="text-xs font-bold text-muted-foreground">
                        {book.name} · 待补齐章节（{pendingChapters.length} 章）
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {pendingChapters.map(({ module: mod }) => (
                          <div
                            key={mod.id}
                            className="rounded-xl border border-border/70 bg-secondary/35 px-3 py-2 text-xs"
                          >
                            <div className="font-bold text-foreground/80">
                              第 {mod.order} 章 · {mod.name}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {mod.kps.map((k) => k.name).join(" · ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
