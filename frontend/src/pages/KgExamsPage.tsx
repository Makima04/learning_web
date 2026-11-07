// 408 真题：年份列表（备考首屏） → 试卷逐题练习
// 设计基准：15 屏改版稿的 01/02/04/10/11/12/13 屏
//   · 首屏给考生任务入口，把数据核对工具收进次级区
//   · 统一筛选（桌面横排 / 移动抽屉），带结果数、条件摘要与一键清空
//   · 题目卡固定 8 段顺序；揭晓前页面里不存在任何答案文本，自评只在揭晓后出现
//   · 加载 / 失败 / 空结果用同一套状态面板，给出下一步动作
//   · 触控 ≥44px、aria-expanded / aria-pressed / progressbar / 图片 alt 带年份题号
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { BellRing, ChevronRight, Filter, RotateCcw, X } from "lucide-react";
import { dayKey } from "@/lib/day";
import { isDueOnOrBefore } from "@/lib/journal";
import { isExamItemId } from "@/lib/kg/examJournal";
import { useJournal } from "@/stores/journal";
import { findKp } from "@/data/kg";
import { kgMapPath, kgModulePath } from "@/lib/kg/paths";
import {
  examItemId,
  loadCs408ExamIndex,
  loadCs408ExamPaper,
  primaryKpId,
  secondaryKpIds,
  type ExamIndex,
  type ExamItem,
  type ExamKind,
  type ExamPaper,
  type ExamPaperMeta,
} from "@/lib/kg/exams408";
import type { MarkLevel } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { examSetPath } from "@/data/kg/examTaxonomy";
import { wdSetPath } from "@/data/kg/wdTaxonomy";
import { osMemSetPath } from "@/data/kg/osMemTopics";
import { ExamTags } from "@/pages/examTags";
import { ItemNoteField } from "@/pages/itemNoteField";

/** 手机端所有可点元素至少 44px；桌面恢复紧凑尺寸 */
const TAP = "min-h-[44px] md:min-h-9";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
  { id: "fuzzy", label: "模糊", cls: "bg-warning text-warning-foreground" },
  { id: "pass", label: "会了", cls: "bg-success text-success-foreground" },
  { id: "skip", label: "跳过", cls: "bg-muted text-muted-foreground" },
];

const KIND_OPTIONS = [
  { id: "all", label: "全部" },
  { id: "mcq", label: "选择题" },
  { id: "big", label: "大题" },
] as const;

const BOOK_OPTIONS = [
  { id: "all", label: "全科" },
  { id: "ds", label: "数据结构" },
  { id: "co", label: "组成原理" },
  { id: "os", label: "操作系统" },
  { id: "cn", label: "计算机网络" },
] as const;

const BOOK_LABEL: Record<string, string> = {
  ds: "数据结构",
  co: "组成原理",
  os: "操作系统",
  cn: "计算机网络",
};

type KindFilter = "all" | ExamKind;
type BookFilter = "all" | string;

/** 版本/质量标记：避免把回忆版、OCR 待校对卷当成与重构卷等价的权威数据 */
function MetaBadges({ meta, compact = false }: { meta?: Partial<ExamPaperMeta> | null; compact?: boolean }) {
  if (!meta) return null;
  const base = "rounded px-1.5 py-0.5 text-[10px] font-medium";
  return (
    <>
      {meta.edition === "recall" && (
        <span className={cn(base, "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
          回忆版·答案键已核对
        </span>
      )}
      {meta.quality === "needs_review" && (
        <span className={cn(base, "bg-orange-500/15 text-orange-700 dark:text-orange-300")}>
          OCR 待校对
        </span>
      )}
      {!compact && meta.annotation === "rules" && (
        <span className={cn(base, "bg-muted text-muted-foreground")}>规则草稿标注</span>
      )}
      {!compact && meta.excluded_from_stats && (
        <span className={cn(base, "bg-muted text-muted-foreground")}>不参与考频校准</span>
      )}
    </>
  );
}

/** 加载 / 失败 / 空结果统一状态：说清原因，并给出下一步动作 */
function StatePanel({
  title,
  description,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-2xl border-2 p-6 text-center",
        tone === "error" ? "border-destructive/30 bg-destructive/5" : "border-border/70 bg-card"
      )}
    >
      <p className={cn("text-sm font-semibold", tone === "error" && "text-destructive")}>{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button
          size="sm"
          variant="outline"
          className={cn("mt-3", TAP, FOCUS)}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-2xl bg-muted/60" />
      <div className="h-14 animate-pulse rounded-2xl bg-muted/40" />
      <p className="sr-only">{label}</p>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn("rounded text-xs text-muted-foreground hover:underline", FOCUS)}
      onClick={onClick}
    >
      ← 返回年份列表
    </button>
  );
}

function TaskCard({
  badge,
  title,
  description,
  to,
  tone,
}: {
  badge: string;
  title: string;
  description: string;
  to: string;
  tone: string;
}) {
  const cls = cn(
    "group flex min-h-[124px] flex-col justify-between gap-3 rounded-2xl border-2 border-transparent bg-card p-4 shadow-edge transition hover:border-primary/40 hover:bg-accent/40",
    FOCUS
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tone)}>{badge}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </>
  );
  // 同页锚点用原生滚动：React Router 改 hash 不会自动把页面滚到目标区块
  if (to.startsWith("#")) {
    return (
      <a
        href={to}
        className={cls}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        {content}
      </a>
    );
  }
  return <Link to={to} className={cls}>{content}</Link>;
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold text-muted-foreground">{label}</span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-3 text-xs font-medium transition-colors",
            TAP,
            FOCUS,
            value === o.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 统一筛选条：桌面横排、手机收进底部抽屉，条件可清空、可恢复 */
function ExamFilterBar({
  kind,
  setKind,
  book,
  setBook,
  onlyUnmarked,
  setOnlyUnmarked,
  expandAll,
  setExpandAll,
  count,
  total,
  onReset,
}: {
  kind: KindFilter;
  setKind: (v: KindFilter) => void;
  book: BookFilter;
  setBook: (v: BookFilter) => void;
  onlyUnmarked: boolean;
  setOnlyUnmarked: (v: boolean | ((prev: boolean) => boolean)) => void;
  expandAll: boolean;
  setExpandAll: (v: boolean | ((prev: boolean) => boolean)) => void;
  count: number;
  total: number;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const chips: string[] = [];
  if (kind !== "all") chips.push(kind === "mcq" ? "选择题" : "大题");
  if (book !== "all") chips.push(BOOK_OPTIONS.find((o) => o.id === book)?.label ?? book);
  if (onlyUnmarked) chips.push("只看未练");
  const activeCount = chips.length;

  const renderControls = () => (
    <div className="space-y-4">
      <FilterGroup label="题型" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      <FilterGroup label="科目" options={BOOK_OPTIONS} value={book} onChange={setBook} />
      <div role="group" aria-label="练习状态" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold text-muted-foreground">状态</span>
        <button
          type="button"
          aria-pressed={onlyUnmarked}
          onClick={() => setOnlyUnmarked((v) => !v)}
          className={cn(
            "rounded-full px-3 text-xs font-medium",
            TAP,
            FOCUS,
            onlyUnmarked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          只看未练
        </button>
        <button
          type="button"
          aria-pressed={expandAll}
          onClick={() => setExpandAll((v) => !v)}
          className={cn(
            "rounded-full px-3 text-xs font-medium",
            TAP,
            FOCUS,
            expandAll ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          {expandAll ? "全部收起" : "全部展开"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 桌面：条件始终可见，结果与清空按钮同屏 */}
      <div className="hidden space-y-3 rounded-2xl border-2 border-border/70 bg-card p-3 md:block">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            筛选结果 <b className="tabular-nums text-foreground">{count}</b> / {total} 题
            {activeCount > 0 && <span className="ml-2">· {chips.join(" · ")}</span>}
          </p>
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" className={cn(TAP, FOCUS)} onClick={onReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              清空筛选
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{renderControls()}</div>
      </div>

      {/* 手机：一行摘要 + 底部抽屉，避免十几个小按钮折成三四行 */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-border/70 bg-card p-2.5">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground",
              TAP,
              FOCUS
            )}
          >
            <Filter className="h-4 w-4" />
            筛选{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {chips.length > 0 ? chips.join(" · ") : "全部题目"}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {count}/{total}
          </span>
        </div>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="筛选条件">
            <button
              type="button"
              aria-label="关闭筛选"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t-2 border-border bg-card p-4 shadow-[0_-6px_24px_rgb(0_0_0/0.15)]"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">筛选条件</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">当前 {count} 题符合条件</p>
                </div>
                <button
                  type="button"
                  aria-label="关闭筛选抽屉"
                  onClick={() => setOpen(false)}
                  className={cn("grid h-11 w-11 place-items-center rounded-full hover:bg-muted", FOCUS)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4">{renderControls()}</div>
              <div className="mt-5 flex gap-2">
                <Button variant="outline" className={cn("flex-1", TAP, FOCUS)} onClick={onReset}>
                  重置条件
                </Button>
                <Button className={cn("flex-1", TAP, FOCUS)} onClick={() => setOpen(false)}>
                  查看 {count} 题
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function YearList({ index }: { index: ExamIndex }) {
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const attempts = useKgProgress((s) => s.attempts);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // 页面常开时跨过北京时间 0 点，到期提醒也要跟着刷新
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const { byYear, correctByYear, lastByYear, lastPractice, practiced, totalQuestions } = useMemo(() => {
    // 老的自评标记与新作答记录都算「练过」，取并集兼容历史数据
    const seen = new Set<string>();
    const correct = new Map<number, number>();
    const last = new Map<number, number>();
    for (const x of itemMarks) {
      const match = /^cs408-(\d{4})-q\d+$/.exec(x.itemId);
      if (!match) continue;
      seen.add(x.itemId);
      const y = Number(match[1]);
      last.set(y, Math.max(last.get(y) ?? 0, x.ts ?? 0));
    }
    for (const a of attempts) {
      seen.add(a.itemId);
      if (a.outcome === "correct") correct.set(a.year, (correct.get(a.year) ?? 0) + 1);
      last.set(a.year, Math.max(last.get(a.year) ?? 0, a.ts));
    }
    const m = new Map<number, number>();
    let n = 0;
    for (const id of seen) {
      const match = /^cs408-(\d{4})-q\d+$/.exec(id);
      if (!match) continue;
      n++;
      const y = Number(match[1]);
      m.set(y, (m.get(y) ?? 0) + 1);
    }
    let latest = 0;
    for (const v of last.values()) if (v > latest) latest = v;
    return {
      byYear: m,
      correctByYear: correct,
      lastByYear: last,
      lastPractice: latest,
      practiced: n,
      totalQuestions: index.papers.reduce((s, p) => s + p.total, 0),
    };
  }, [itemMarks, attempts, index.papers]);

  // 到期数走 journal（与错题本、今日复习同一真相源），不再从 attempts 另算一套
  const journalEntries = useJournal((s) => s.entries);
  const dueCount = useMemo(
    () => journalEntries.filter((e) => isDueOnOrBefore(e, dayKey(now)) && isExamItemId(e.sourceItemId)).length,
    [journalEntries, now]
  );

  const overallPct = totalQuestions ? Math.round((practiced / totalQuestions) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <Link to={kgMapPath("cs408")} className={cn("rounded text-xs text-muted-foreground hover:underline", FOCUS)}>
          ← 知识图谱
        </Link>
        <h1 className="mt-1 text-2xl font-bold">408 真题</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {index.paper_count} 套历年卷（{index.years[0]}–{index.years[index.years.length - 1]}）· 每卷 47 题 ·
          按年份、考点或大题范式开始练习
        </p>
      </div>

      {/* 整体进度：真实数据，不用演示数字 */}
      <div className="rounded-2xl border-2 border-border/70 bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">累计已练</p>
          <p className="text-xs text-muted-foreground">
            <b className="tabular-nums text-foreground">{practiced}</b> / {totalQuestions} 题（{overallPct}%）
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={overallPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="408 真题累计练习进度"
        >
          <div className="h-full rounded-full bg-primary/80 transition-all" style={{ width: `${Math.min(100, overallPct)}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs">
          <span className="text-muted-foreground">
            最近练习 {lastPractice > 0 ? dayKey(lastPractice) : "—"}
          </span>
          <Link to="/kg/exams/history" className={cn("rounded font-medium text-primary hover:underline", FOCUS)}>
            练习记录 →
          </Link>
        </div>
      </div>

      {/* 间期复习召回：只在真有到期题时出现，复习完自然消失 */}
      {dueCount > 0 && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:gap-3"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-relaxed text-amber-900 dark:text-amber-100">
                今天有 <b className="tabular-nums">{dueCount}</b> 道错题到期复习
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                按 1 / 3 / 7 / 14 天节奏回顾最省力
              </p>
            </div>
          </div>
          <Link
            to="/kg/exams/mistakes?tab=due"
            className={cn(
              "inline-flex w-full items-center justify-center rounded-full bg-amber-600 px-3 text-[11px] font-semibold text-white hover:bg-amber-700 sm:w-auto sm:justify-start",
              TAP,
              FOCUS
            )}
          >
            开始复习 →
          </Link>
        </div>
      )}

      {/* 首次使用的四条主路径，不再让考生从九个「校对」按钮里挑 */}
      <section aria-label="开始练习" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TaskCard
          badge="按年份"
          title="从整卷开始"
          description="18 套卷任选一年，逐题练习或整卷模考"
          to="#year-grid"
          tone="bg-app-blue text-white"
        />
        <TaskCard
          badge="按考点"
          title="专项补漏"
          description="按四科考点定位真题与题集"
          to={kgMapPath("cs408")}
          tone="bg-app-purple text-white"
        />
        <TaskCard
          badge="大题"
          title="答题模板"
          description="18 类解题范式，含思路与易错点"
          to="/kg/exams/big-guide"
          tone="bg-app-green text-white"
        />
        <TaskCard
          badge="复习"
          title="错题本"
          description="错题 / 收藏 / 1·3·7·14 天到期复习"
          to="/kg/exams/mistakes"
          tone="bg-app-orange text-white"
        />
      </section>

      <section aria-labelledby="year-grid-title" id="year-grid" className="space-y-3 scroll-mt-20">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
          <h2 id="year-grid-title" className="text-base font-semibold">
            按年份练习
          </h2>
          <p className="text-xs text-muted-foreground">每套卷的版本与解析覆盖已标注在卡片上</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...index.papers].reverse().map((p) => {
            const done = byYear.get(p.year) ?? 0;
            const pct = p.total ? Math.round((done / p.total) * 100) : 0;
            const exps = p.explanations ?? 0;
            const correctCount = correctByYear.get(p.year) ?? 0;
            const lastTs = lastByYear.get(p.year) ?? 0;
            return (
              <div
                key={p.year}
                className="rounded-2xl border-2 border-transparent bg-card p-4 shadow-edge transition hover:border-primary/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    to={`/kg/exams/${p.year}`}
                    aria-label={`浏览 ${p.year} 年整卷，共 ${p.total} 题，逐题解析 ${exps} 题`}
                    className={cn("rounded text-lg font-semibold hover:underline", FOCUS)}
                  >
                    {p.year}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {p.mcq} 选 + {p.big} 大
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <MetaBadges meta={p} compact />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  已练 <b className="tabular-nums text-foreground">{done}</b>/{p.total}
                  <span className="mx-1">·</span>解析 <span className="tabular-nums">{exps}</span>/{p.total}
                </p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${p.year} 年练习进度`}
                >
                  <div className="h-full rounded-full bg-primary/80 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                {correctCount > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    累计答对 <b className="tabular-nums text-foreground">{correctCount}</b> 题
                    {lastTs > 0 && ` · 上次练习 ${dayKey(lastTs)}`}
                  </p>
                )}
                {exps < p.total / 2 && (
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
                    部分题目暂无逐题解析，可对照原版答案页
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5">
                  <Link
                    to={`/kg/exams/practice/${p.year}?mode=practice`}
                    className={cn(
                      "inline-flex items-center rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground",
                      TAP,
                      FOCUS
                    )}
                  >
                    逐题练习
                  </Link>
                  <Link
                    to={`/kg/exams/practice/${p.year}?mode=mock`}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted",
                      TAP,
                      FOCUS
                    )}
                  >
                    整卷模考
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 维护者工具仍在，但不再占考生首屏 */}
      <details className="group rounded-2xl border-2 border-border/70 bg-card p-3">
        <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2 text-sm font-semibold", TAP, FOCUS)}>
          <span>
            题库与数据工具
            <span className="ml-2 text-xs font-normal text-muted-foreground">版本核对 / 题集 / 跨模块入口</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to="/kg/exams/overview">题库总览 / 数据质量</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to={examSetPath()}>历年卷分类题集</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to={osMemSetPath()}>OS 内存细分</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to="/kg/predict">大题预测 / 诊断卷</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to={wdSetPath()}>王道按大类</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to={wdSetPath({ group: "all", kind: "mcq", mode: "proof" })}>王道选择题</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to={wdSetPath({ group: "all", kind: "big", mode: "proof" })}>王道大题</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to={kgMapPath("cs408")}>按模块学习</Link>
          </Button>
        </div>
      </details>
    </div>
  );
}

function PaperView({ year }: { year: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const load = useKgProgress((s) => s.load);
  const markItem = useKgProgress((s) => s.markItem);
  const itemMarks = useKgProgress((s) => s.itemMarks);

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [err, setErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [kind, setKind] = useState<KindFilter>("all");
  const [book, setBook] = useState<BookFilter>("all");
  const [showAns, setShowAns] = useState<Record<string, boolean>>({});
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [openNs, setOpenNs] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setPaper(null);
    setErr("");
    setOpenNs(new Set());
    setExpandAll(false);
    setShowAns({});
    loadCs408ExamPaper(year)
      .then((p) => {
        if (!cancelled) setPaper(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [year, reloadKey]);

  // 深链 /kg/exams/<year>#q<n>：来自大题模板页。同一年份内换 hash 时组件不重挂载，
  // 所以必须依赖 location.hash/key，且要清掉筛选、展开题卡并直接展开答案/解析。
  useEffect(() => {
    if (!paper) return;
    const id = location.hash.replace(/^#/, "");
    const m = /^q(\d+)$/.exec(id);
    if (!m) return;
    const n = Number(m[1]);
    setKind("all");
    setBook("all");
    setOnlyUnmarked(false);
    setOpenNs((prev) => (prev.has(n) ? prev : new Set(prev).add(n)));
    setShowAns((prev) => ({ ...prev, [examItemId(year, n)]: true }));
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [paper, location.hash, location.key, year]);

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  const filtered = useMemo(() => {
    if (!paper) return [] as ExamItem[];
    return paper.items.filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      if (book !== "all" && it.book !== book) return false;
      if (onlyUnmarked && markMap.has(examItemId(year, it.n))) return false;
      return true;
    });
  }, [paper, kind, book, onlyUnmarked, year, markMap]);

  const stats = useMemo(() => {
    if (!paper) return { marked: 0, total: 0 };
    let marked = 0;
    for (const it of paper.items) {
      if (markMap.has(examItemId(year, it.n))) marked++;
    }
    return { marked, total: paper.items.length };
  }, [paper, markMap, year]);

  const onMark = useCallback(
    (it: ExamItem, mark: MarkLevel) => {
      const pk = primaryKpId(it);
      if (!pk) return;
      markItem({
        itemId: examItemId(year, it.n),
        mark,
        primaryKpId: pk,
        secondaryKpIds: secondaryKpIds(it),
      });
    },
    [markItem, year]
  );

  const resetFilters = useCallback(() => {
    setKind("all");
    setBook("all");
    setOnlyUnmarked(false);
  }, []);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (kind !== "all") parts.push(kind === "mcq" ? "选择题" : "大题");
    if (book !== "all") parts.push(BOOK_OPTIONS.find((o) => o.id === book)?.label ?? book);
    if (onlyUnmarked) parts.push("只看未练");
    return parts.length > 0 ? parts.join("、") : "全部";
  }, [kind, book, onlyUnmarked]);

  if (err) {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => navigate("/kg/exams")} />
        <StatePanel
          tone="error"
          title="这套卷没能加载"
          description={`${year} 年真题数据读取失败：${err}。可以重试，或返回年份列表换一套卷。`}
          actionLabel="重试加载"
          onAction={() => {
            setErr("");
            setReloadKey((k) => k + 1);
          }}
        />
        <div className="text-center">
          <Button variant="ghost" size="sm" className={cn(TAP, FOCUS)} onClick={() => navigate("/kg/exams")}>
            返回年份列表
          </Button>
        </div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => navigate("/kg/exams")} />
        <LoadingSkeleton label={`正在加载 ${year} 年真题`} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <BackLink onClick={() => navigate("/kg/exams")} />
        <h1 className="mt-1 text-xl font-semibold">{year} 年 408 真题</h1>
        <p className="mt-1 text-sm text-muted-foreground">{paper.title}</p>
        {paper.meta && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <MetaBadges meta={paper.meta} />
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {paper.meta.edition_label}
            </span>
          </div>
        )}
        {paper.meta?.warning && (
          <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">
            <p className="font-semibold text-amber-800 dark:text-amber-200">数据版本提示</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">{paper.meta.warning}</p>
            {paper.meta.verification && (
              <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
                校对状态：{paper.meta.verification.status === "verified_against_source" ? "已与来源页核对" : paper.meta.verification.status}
                （选择题答案键 {paper.meta.verification.answer_key_match}，{paper.meta.verification.checked_at}）；
                未提供官方 PDF，暂不参与考频校准。取得正式卷后可按 SOURCES.md 的流程替换。
                {paper.meta.verification.source_url && (
                  <>
                    {" "}
                    <a
                      href={paper.meta.verification.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn("rounded underline", FOCUS)}
                    >
                      查看来源页
                    </a>
                  </>
                )}
              </p>
            )}
            {paper.meta.page_images > 0 && (
              <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
                本题库附 {paper.meta.page_images} 张原版答案页，展开题目后可对照核对。
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border-2 border-border/70 bg-card px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">
            已练 <b className="tabular-nums text-foreground">{stats.marked}</b>/{stats.total}
          </span>
          <span className="text-muted-foreground">
            逐题解析 <b className="tabular-nums text-foreground">{paper.meta?.explanations ?? 0}</b>/{stats.total}
          </span>
          <span className="text-muted-foreground">
            当前筛选 <b className="tabular-nums text-foreground">{filtered.length}</b> 题
          </span>
          <span className="ml-auto hidden text-muted-foreground sm:inline">逐题练习 · 自评记入考点掌握情况</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild size="sm" className={cn(TAP, FOCUS)}>
            <Link to={`/kg/exams/practice/${year}?mode=practice`}>逐题练习 →</Link>
          </Button>
          <Button asChild size="sm" variant="secondary" className={cn(TAP, FOCUS)}>
            <Link to={`/kg/exams/practice/${year}?mode=mock`}>整卷模考 →</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to="/kg/exams/mistakes">错题本与复习</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className={cn(TAP, FOCUS)}>
            <Link to="/kg/exams/big-guide">大题答题模板</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className={cn(TAP, FOCUS)}>
            <Link to="/kg/exams/overview">题库与数据质量</Link>
          </Button>
        </div>
      </div>

      <ExamFilterBar
        kind={kind}
        setKind={setKind}
        book={book}
        setBook={setBook}
        onlyUnmarked={onlyUnmarked}
        setOnlyUnmarked={setOnlyUnmarked}
        expandAll={expandAll}
        setExpandAll={setExpandAll}
        count={filtered.length}
        total={stats.total}
        onReset={resetFilters}
      />

      <div className="space-y-3">
        {filtered.map((it) => {
          const id = examItemId(year, it.n);
          const marked = markMap.get(id);
          const pk = primaryKpId(it);
          const found = pk ? findKp(pk) : null;
          const secs = secondaryKpIds(it);
          const open = expandAll || openNs.has(it.n);
          const ansOpen = showAns[id] === true;
          const pageImages = it.answer_meta?.page_images ?? [];
          const hasAnswerContent = Boolean(it.answer || it.explanation || pageImages.length || found);
          // 没有答案内容的题无法「揭晓」，仍要允许自评，避免功能被锁死
          const canSelfAssess = ansOpen || !hasAnswerContent;
          const preview = it.stem.replace(/\s+/g, " ").slice(0, 72);
          const stemId = `stem-${id}`;
          const ansId = `ans-${id}`;
          return (
            <Card key={id} id={`q${it.n}`} className="scroll-mt-20">
              <CardHeader className="pb-2">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={stemId}
                  className={cn("w-full rounded-xl text-left", FOCUS)}
                  onClick={() =>
                    setOpenNs((prev) => {
                      const next = new Set(prev);
                      if (next.has(it.n)) next.delete(it.n);
                      else next.add(it.n);
                      return next;
                    })
                  }
                >
                  <CardTitle className="text-sm">
                    第 {it.n} 题
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {it.kind === "big" ? "大题" : "选择题"} ·{" "}
                      {it.book_name || BOOK_LABEL[it.book] || it.book}
                      {it.points != null ? ` · ${it.points} 分` : ""}
                    </span>
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ExamTags year={year} n={it.n} showMinor={open} link={false} />
                    {marked && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        已自评 · {MARKS.find((m) => m.id === marked)?.label ?? marked}
                      </span>
                    )}
                  </div>
                  {!open && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview}</p>}
                </button>
              </CardHeader>

              {open && (
                <CardContent id={stemId} className="space-y-3">
                  {/* ① 题号/元信息、② 考点标签在卡头；③ 考点明细 */}
                  <p className="text-xs text-muted-foreground">
                    考点：
                    {it.kps.length === 0 && "（未标注）"}
                    {it.kps.map((k, i) => {
                      const foundKp = findKp(k.id);
                      const name = foundKp?.kp.name ?? k.id;
                      return (
                        <span key={`${k.id}-${i}`}>
                          {i > 0 && "、"}
                          <Link
                            to={
                              foundKp
                                ? kgModulePath(foundKp.book.id, foundKp.module.id, foundKp.book.subject)
                                : kgMapPath("cs408")
                            }
                            className={cn("rounded hover:underline", FOCUS)}
                          >
                            {name}
                            {k.role === "primary" ? "" : "·次"}
                          </Link>
                        </span>
                      );
                    })}
                  </p>
                  <div>
                    <Link
                      to={examSetPath({ group: "all", mode: "proof", q: `${year}-${it.n}` })}
                      className={cn("rounded text-[11px] text-primary hover:underline", FOCUS)}
                    >
                      查看同考点题目 →
                    </Link>
                  </div>

                  {/* ④ 题干 */}
                  <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">{it.stem}</pre>
                  {/* ⑤ 选项 */}
                  {it.options && (
                    <ul className="space-y-1 text-sm">
                      {Object.entries(it.options).map(([k, v]) => (
                        <li key={k} className="flex gap-2">
                          <span className="w-5 shrink-0 font-medium text-muted-foreground">{k}.</span>
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* ⑥ 揭晓答案：揭晓前这一块下方不存在任何答案文本 */}
                  {hasAnswerContent && (
                    <div className="border-t pt-3">
                      <Button
                        size="sm"
                        variant={ansOpen ? "ghost" : "default"}
                        aria-expanded={ansOpen}
                        aria-controls={ansId}
                        className={cn(TAP, FOCUS)}
                        onClick={() => setShowAns((e) => ({ ...e, [id]: !e[id] }))}
                      >
                        {ansOpen ? "收起答案与解析" : "查看答案解析"}
                      </Button>
                      {!ansOpen && (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                          先看题再核对：答案与解析在展开前不会显示。
                        </p>
                      )}
                    </div>
                  )}

                  {/* ⑦ 答案与解析（仅揭晓后进入 DOM） */}
                  {ansOpen && (
                    <div
                      id={ansId}
                      role="region"
                      aria-label={`第 ${it.n} 题答案与解析`}
                      className="space-y-2 rounded-xl border-2 border-dashed p-3 text-sm"
                    >
                      {it.answer && (
                        <p>
                          <span className="font-medium">答案：</span>
                          <b className="tabular-nums">{it.answer}</b>
                        </p>
                      )}
                      {it.explanation ? (
                        <div className="space-y-1">
                          <p className="font-medium">解析</p>
                          <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{it.explanation}</p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                          <p className="font-semibold">本卷源答案页未提供本题的逐题解析</p>
                          <p className="mt-0.5 opacity-90">
                            {it.answer ? "可先对照答案键，再看下方原版答案页；" : ""}
                            补全后会直接显示在这里。
                          </p>
                        </div>
                      )}
                      {it.answer_meta?.note && <p className="text-xs text-muted-foreground">{it.answer_meta.note}</p>}
                      {pageImages.length > 0 && (
                        <details className="text-xs">
                          <summary className={cn("flex cursor-pointer items-center text-muted-foreground hover:text-foreground", TAP, FOCUS)}>
                            查看原版答案页（{pageImages.length} 页）
                          </summary>
                          <div className="mt-2 space-y-2">
                            {pageImages.map((src, i) => (
                              <img
                                key={src}
                                src={src}
                                alt={`${year} 年 408 原版答案页，第 ${i + 1}/${pageImages.length} 页`}
                                loading="lazy"
                                className="w-full rounded border bg-white"
                              />
                            ))}
                          </div>
                        </details>
                      )}
                      {found && (
                        <p className="text-muted-foreground">
                          主考点「{found.kp.name}」考频 {found.kp.freq}/5 · 大题权 {found.kp.bigWeight}
                          {secs.length > 0 && ` · 次考点 ${secs.map((sid) => findKp(sid)?.kp.name ?? sid).join("、")}`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ⑧ 笔记与自评：自评只在看过解析后出现 */}
                  <ItemNoteField itemId={id} />
                  {canSelfAssess ? (
                    <div role="group" aria-label={`第 ${it.n} 题自评`} className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="text-xs text-muted-foreground">做完这题，记一下掌握情况</span>
                      {MARKS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          disabled={!pk}
                          aria-pressed={marked === m.id}
                          aria-label={`第 ${it.n} 题：${m.label}`}
                          className={cn(
                            "rounded-md px-3 text-xs font-medium disabled:opacity-40",
                            TAP,
                            FOCUS,
                            m.cls,
                            marked === m.id && "ring-2 ring-offset-2 ring-primary"
                          )}
                          onClick={() => onMark(it, m.id)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      看过答案解析后即可自评，自评会记入考点掌握情况。
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <StatePanel
            title="当前条件下没有题目"
            description={`本卷共 ${stats.total} 题，按「${filterSummary}」筛选后为空。清空条件即可看回整卷。`}
            actionLabel="清空筛选"
            onAction={resetFilters}
          />
        )}
      </div>
    </div>
  );
}

export function KgExamsPage() {
  const { year: yearParam } = useParams();
  const location = useLocation();
  const load = useKgProgress((s) => s.load);
  const [index, setIndex] = useState<ExamIndex | null>(null);
  const [err, setErr] = useState("");
  const year = yearParam ? Number(yearParam) : NaN;
  const hasYear = Number.isFinite(year) && year >= 2000;

  useEffect(() => {
    load();
  }, [load]);

  // 从题库总览页带 #year-grid 跳回来时，列表是异步渲染的，需要等它出现再滚动
  useEffect(() => {
    if (hasYear || !index || location.hash !== "#year-grid") return;
    const timer = window.setTimeout(() => {
      document.getElementById("year-grid")?.scrollIntoView({ block: "start" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [hasYear, index, location.hash]);

  useEffect(() => {
    let cancelled = false;
    loadCs408ExamIndex()
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "索引加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      {hasYear ? (
        <PaperView year={year} />
      ) : err ? (
        <StatePanel
          tone="error"
          title="真题索引没能加载"
          description={`${err}。请检查网络后重试；已练进度不会受影响。`}
          actionLabel="刷新页面重试"
          onAction={() => window.location.reload()}
        />
      ) : index ? (
        <YearList index={index} />
      ) : (
        <LoadingSkeleton label="正在加载真题索引" />
      )}
    </div>
  );
}
