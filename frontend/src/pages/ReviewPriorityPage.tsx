import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Info, Maximize2, Minimize2, Play, Target, Timer, X } from "lucide-react";
import { findKp } from "@/data/kg";
import { syncAccountData } from "@/lib/accountSync";
import { isDueOnOrBefore } from "@/lib/journal";
import { kgKpPath, kgMapPath, knowledgeReviewPath, knowledgeCheckPath, legacyMathReviewPath } from "@/lib/kg/paths";
import { KNOWLEDGE_REVIEW_TOPICS } from "@/lib/kg/knowledgeReview";
import { MATH1_KINDS, MATH1_KIND_NAMES, parseMath1Kind, type AnalysisOrder } from "@/lib/kg/math1Analysis";
import {
  buildReviewTopics, matchReviewTraining, sortReviewTopics, REVIEW_DATASETS, REVIEW_BOOKS,
  REVIEW_BOOK_NAMES, reviewQuestionHref, type ReviewTopic,
} from "@/lib/kg/reviewPriority";
import { computeRoi, kindPointsPerPaper, pct, practiceMinutes, type RoiInfo } from "@/lib/kg/reviewRoi";
import type { BookId, SubjectId } from "@/lib/kg/types";
import { itemsForSource, MATH_BOOK_SOURCES, mathFacetName, practiceSourceLabel, useDrillCatalog } from "@/lib/kg/mathPractice";
import { buildTemplatePlan, type TemplatePlan, type TemplateReason } from "@/lib/kg/mathTemplatePlan";
import { mathTemplateName } from "@/data/kg/mathTemplates";
import type { Math1TrainingMatch } from "@/lib/kg/math1Analysis";
import { hydratePracticeItems } from "@/lib/kg/catalogLoad";
import { applyWangdaoPractice, isCollected, toggleWangdaoCollect } from "@/lib/kg/wangdaoPractice";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { useAuth } from "@/stores/auth";
import { useKgProgress } from "@/stores/kgProgress";
import { useJournal } from "@/stores/journal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Cs408DiagnosticSummary } from "@/components/Cs408DiagnosticSummary";
import { buildCs408Diagnostic } from "@/lib/kg/cs408Diagnostic";
import { PracticeQuestionCard } from "@/pages/practiceQuestion";
import { practiceQuestionLocation } from "@/lib/kg/practiceLocation";

/** 知识复习入口的考点数随图谱定义动态统计，考点合并/拆分后不再需要手改文案。 */
const KNOWLEDGE_KP_COUNT = Object.keys(KNOWLEDGE_REVIEW_TOPICS).reduce(
  (acc, id) => {
    const subject = findKp(id)?.book.subject;
    if (subject === "math" || subject === "cs408") acc[subject] += 1;
    return acc;
  },
  { math: 0, cs408: 0 } as Record<"math" | "cs408", number>,
);

const STATUS = {
  unknown: { text: "待诊断", cls: "bg-muted text-muted-foreground" },
  weak: { text: "优先补弱", cls: "bg-destructive/10 text-ink-danger" },
  learning: { text: "巩固提升", cls: "bg-warning/10 text-ink-warning" },
  stable: { text: "保持熟练", cls: "bg-success/10 text-ink-success" },
};
const COST = ["", "较低", "中等", "较高"];
const SOURCE_NAMES: Record<string, string> = { lilin880: "李林 880", zhangyu1000: "张宇 1000", wangdao: "王道 408" };
const TEMPLATE_STATUS = {
  unseen: "待检验", learning: "检验中", weak: "需补练", preliminary: "初步掌握", due: "待复测", stable: "掌握较稳",
};
const TRAINING_REASON: Record<TemplateReason, string> = {
  representative: "模板代表题", supplement: "薄弱模板补练", verify: "延迟复测",
};
type TrainingRow = Math1TrainingMatch & { templateIds?: string[]; reason?: TemplateReason };

function selectTemplateTraining(plan: TemplatePlan, fallback: Math1TrainingMatch[], dueIds: ReadonlySet<string>): TrainingRow[] {
  if (!plan.groups.length) return fallback;
  const rows = new Map<string, TrainingRow>();
  // 仍保留到期错题和必要的先修；主队列按模板推荐（真题优先），并跨模板去重。
  for (const row of fallback) if (row.review || row.match === "foundation") rows.set(row.item.id, row);
  for (const r of plan.recommendations) rows.set(r.item.id, {
    ...r, match: "method", review: dueIds.has(r.item.id) || r.reason === "verify",
  });
  return [...rows.values()];
}
const ORDER_LABEL: Record<AnalysisOrder, string> = {
  personal: "个人优先", frequency: "历年考频", recent: "近五年",
};

// ---------- 小组件 ----------

/** 宽屏判定：宽屏把题面放左侧作答台，窄屏仍放在抽屉里，避免同一份作答卡挂两处。 */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function Status({ topic, plan }: { topic: ReviewTopic; plan?: TemplatePlan }) {
  if (topic.diagnostic) {
    const diagnostic = topic.diagnostic;
    return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
      diagnostic.status === "weak" ? STATUS.weak.cls : diagnostic.status === "stable" ? STATUS.stable.cls : STATUS.learning.cls)}>{diagnostic.label}</span>;
  }
  if (plan?.groups.length) {
    const total = plan.groups.length;
    const label = plan.weak ? "优先补弱" : plan.preliminary < total ? "题型待覆盖"
      : plan.stable === total ? "掌握较稳" : plan.groups.some((g) => g.status === "due") ? "待复测" : "首轮完成";
    return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
      plan.weak ? STATUS.weak.cls : plan.stable === total ? STATUS.stable.cls : STATUS.learning.cls)}>{label}</span>;
  }
  const status = STATUS[topic.status];
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", status.cls)}>{status.text}</span>;
}

function Seg({ value, items, onChange, label }: {
  value: string;
  items: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-0.5 rounded-full bg-secondary/80 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          aria-pressed={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
            value === it.value ? "bg-primary text-primary-foreground shadow-edge-primary-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {it.label}
          {it.hint && <span className="ml-1 text-[10px] font-semibold opacity-70">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
        active ? "bg-card text-foreground shadow-edge-sm ring-2 ring-primary/50" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// 每行的「性价比」一栏：数字 + 条，样本不足时只给高/中/低。
function RoiCell({ info }: { info: RoiInfo }) {
  if (info.unallocated) return <span title="近年作为辅助考点出现，未拆分小问分值，不能据此评为低收益" className="text-[11px] font-semibold text-muted-foreground">综合考查<br />收益未估</span>;
  if (info.score === null) {
    return (
      <span title="掌握记录不足 3 类，先用高/中/低显示" className="inline-block whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
        {info.tier}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-right text-sm font-extrabold tabular-nums">{info.score}</span>
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${info.score}%` }} />
      </span>
    </div>
  );
}

export function LegacyMathReviewRedirect() {
  const { search } = useLocation();
  return <Navigate to={legacyMathReviewPath(search)} replace />;
}

export function ReviewPriorityPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const subject: SubjectId = params.get("subject") === "cs408" ? "cs408" : "math";
  const books = REVIEW_BOOKS[subject];
  const dataset = REVIEW_DATASETS[subject];
  const rawBook = params.get("book");
  const book: BookId = books.includes(rawBook as BookId) ? rawBook as BookId : books[0];
  const rawOrder = params.get("order");
  const order: AnalysisOrder = rawOrder === "frequency" || rawOrder === "recent" ? rawOrder : "personal";
  const parsedKind = parseMath1Kind(params.get("kind"));
  const kind = subject === "cs408" && parsedKind === "fill" ? "big" : parsedKind;
  const kinds = subject === "math" ? MATH1_KINDS : (["big", "mcq"] as const);
  const kindLabel = MATH1_KIND_NAMES[kind];
  const recentSamples = dataset.years.filter((y) => y >= dataset.recentStart).length;
  const rawSource = params.get("src");
  const source = subject === "math" && (rawSource === "lilin880" || rawSource === "zhangyu1000") ? rawSource : null;
  const sourceLabel = source ? SOURCE_NAMES[source] : "李林 880、张宇 1000";

  const [open, setOpen] = useState(() => params.has("kp"));
  const [infoOpen, setInfoOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [allEvidence, setAllEvidence] = useState(false);
  const [showAllTraining, setShowAllTraining] = useState(false);
  const [queue, setQueue] = useState<WangdaoItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [active, setActive] = useState<WangdaoItem | null>(null);
  const [notice, setNotice] = useState("");
  const [expand, setExpand] = useState(false);
  const trainingRequest = useRef(0);
  const narrowCardRef = useRef<HTMLDivElement>(null);
  const evidenceRef = useRef<HTMLDetailsElement>(null);
  const wide = useMediaQuery("(min-width: 768px)");
  /** 键盘监听里读最新的换题位置，避免每次渲染重绑监听。 */
  const latestIndex = useRef(0);

  const states = useKgProgress((s) => s.states);
  const marks = useKgProgress((s) => s.itemMarks);
  const attempts = useKgProgress((s) => s.attempts);
  const load = useKgProgress((s) => s.load);
  const loggedIn = useAuth((s) => s.loggedIn);
  const userId = useAuth((s) => s.user?.id);
  const entries = useJournal((s) => s.entries);
  const { items, error } = useDrillCatalog(subject === "math" ? "math" : "wangdao");
  // 来源仅限制本次训练候选；个人排序仍使用完整题库中的历史作答证据。
  const trainingItems = useMemo(() => items ? itemsForSource(items, source) : null, [items, source]);

  useEffect(() => {
    load();
    trainingRequest.current++;
    setActive(null);
    setQueue([]);
    setQueueIndex(0);
    setExpand(false);
    setNotice("");
    setAllEvidence(false);
    // 复用账号同步：先推离线 pending，再拉服务端图谱/错题快照。
    if (loggedIn) void syncAccountData().catch(() => setNotice("同步暂未完成，可稍后重试；当前展示已有学习记录。"));
  }, [load, loggedIn, userId]);

  const filtersReady = useRef(false);
  useEffect(() => {
    // 抽屉开合只跟随用户点击（openTopic / closeDrawer），这里只重置下钻里的临时状态，
    // 免得 StrictMode 二次挂载把 URL 深链的 kp 关掉。
    if (!filtersReady.current) {
      filtersReady.current = true;
      return;
    }
    setActive(null);
    setQueue([]);
    setQueueIndex(0);
    setExpand(false);
    setNotice("");
    setExpanded(false);
    setAllEvidence(false);
    setShowAllTraining(false);
    setInfoOpen(false);
    trainingRequest.current++;
  }, [subject, book, kind, source]);

  latestIndex.current = queueIndex;

  // Esc：大屏态先退回双栏，再关抽屉
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (expand) setExpand(false);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, expand]);

  // 作答台键盘：← / → 换题，f 切换大屏。输入框、下拉里不抢键。
  useEffect(() => {
    if (!open || !wide || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(latestIndex.current - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goTo(latestIndex.current + 1); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); setExpand((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, active]);

  // 窄屏换题时把作答卡滚进视野；宽屏由左侧大屏承担，不需要滚
  const activeId = active?.id;
  useEffect(() => {
    if (wide || !activeId) return;
    narrowCardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeId, wide]);

  const [trainingNow, setTrainingNow] = useState(() => Date.now());
  const topics = useMemo(
    () => buildReviewTopics(dataset, states, marks, items ?? [], trainingNow, kind, attempts),
    [dataset, states, marks, items, kind, attempts, trainingNow]
  );
  const pointsPerPaper = useMemo(() => kindPointsPerPaper(dataset.items, kind), [dataset, kind]);
  const roi = useMemo(() => computeRoi(topics, pointsPerPaper), [topics, pointsPerPaper]);
  const ranked = useMemo(() => sortReviewTopics(topics.filter((t) => t.book === book), order), [topics, book, order]);
  const selected = ranked.find((t) => t.kpId === params.get("kp")) ?? ranked[0];
  const top3 = ranked.slice(0, 3);

  const wrong = entries.filter((e) => e.status === "active" && e.sourceItemId);
  const dueIds = new Set(wrong.filter((e) => isDueOnOrBefore(e)).map((e) => e.sourceItemId!));
  const waitingIds = new Set(wrong.filter((e) => !isDueOnOrBefore(e)).map((e) => e.sourceItemId!));
  useEffect(() => {
    const refresh = () => setTrainingNow(Date.now());
    // 开着页面跨过北京时间零点，或从后台回来，也能看到到期复测。
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const templatePlans = useMemo(() => new Map(topics.map((t) => [t.kpId,
    buildTemplatePlan(t, trainingItems ?? [], marks, dueIds, waitingIds, trainingNow),
  ])), [topics, trainingItems, marks, entries, trainingNow]);
  const templatePlan = selected ? templatePlans.get(selected.kpId) : undefined;
  const hasTemplates = (templatePlan?.groups.length ?? 0) > 0;
  const examGroups = templatePlan?.groups.filter((g) => g.examCount > 0) ?? [];
  const diagnostic = selected && subject === "cs408" ? buildCs408Diagnostic(selected, trainingItems ?? [], marks, attempts, trainingNow, dueIds, waitingIds) : undefined;
  const alternateKind = kind === "big" ? "mcq" : "big";
  const alternateCount = selected && subject === "cs408" ? (items ?? []).filter((q) => q.kind === alternateKind && q.kp_ids.includes(selected.kpId)).length : 0;
  const alternateParams = new URLSearchParams(params);
  alternateParams.set("kind", alternateKind);
  const training: TrainingRow[] = selected && templatePlan ? selectTemplateTraining(templatePlan,
    matchReviewTraining(selected, trainingItems ?? [], marks, states, dueIds, waitingIds), dueIds) : [];
  const trainingIds = new Set(training.map((r) => r.item.id));
  const allTraining: TrainingRow[] = selected ? [...training,
    ...matchReviewTraining(selected, trainingItems ?? [], marks, states, dueIds, waitingIds, true).filter((r) => !trainingIds.has(r.item.id)),
  ] : [];

  // 首屏行动卡：每个考点给一道「现在就能做」的题。
  const starters = useMemo(() => {
    const map = new Map<string, WangdaoItem>();
    if (!trainingItems) return map;
    for (const t of top3) {
      const plan = templatePlans.get(t.kpId)!;
      const [first] = selectTemplateTraining(plan, matchReviewTraining(t, trainingItems, marks, states, dueIds, waitingIds), dueIds);
      if (first) map.set(t.kpId, first.item);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top3, trainingItems, marks, states, dueIds, waitingIds, templatePlans]);

  const unknownCount = ranked.filter((t) => t.status === "unknown").length;
  const weakCount = ranked.filter((t) => t.status === "weak").length;
  const topShare = top3.reduce((sum, t) => sum + t.recentPointShare, 0);
  const verdictTitle = order === "personal"
    ? (unknownCount === ranked.length ? `先做诊断：${kindLabel}从这 3 类开始` : "今晚先补这 3 个考点")
    : order === "frequency" ? `历年${kindLabel}考得最多的 3 类`
    : `近五年${kindLabel}最常出现的 3 类`;
  const verdictSub = unknownCount === ranked.length
    ? `${ranked.length} 类考点都还没有${kindLabel}记录。下面是按真题价值排出的诊断顺序，做完前几道就会按你的错处重排。`
    : `${ranked.length} 类考点里 ${unknownCount} 类还没有记录${weakCount ? `、${weakCount} 类已标为薄弱` : ""}；前 3 名覆盖近五年 ${pct(topShare)} 的${kindLabel}分值。`;

  function choose(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === "src" && value === "all") next.delete(key);
    else next.set(key, value);
    if (key === "subject") {
      next.delete("book");
      next.delete("kp");
      next.delete("src");
      if (value === "cs408" && kind === "fill") next.set("kind", "big");
    }
    if (key === "book" || key === "kind") next.delete("kp");
    if (key === "subject" || key === "book" || key === "kind") setOpen(false);
    // 切换题集时立即作废未完成的加载，避免旧题目异步回来覆盖新筛选。
    trainingRequest.current++;
    setParams(next, { replace: true });
    setActive(null);
    setQueue([]);
    setQueueIndex(0);
    setExpand(false);
    setNotice("");
    setAllEvidence(false);
    setShowAllTraining(false);
  }

  function openTopic(kpId: string) {
    const next = new URLSearchParams(params);
    next.set("kp", kpId);
    setParams(next, { replace: true });
    setOpen(true);
    // 换考点时清掉上一条的作答状态，避免抽屉里还挂着别的题的卡
    setActive(null);
    setQueue([]);
    setQueueIndex(0);
    setAllEvidence(false);
    setShowAllTraining(false);
    setExpand(false);
    trainingRequest.current++;
  }

  function startTopic(kpId: string, list: WangdaoItem[]) {
    openTopic(kpId);
    void openPractice(list);
  }

  function closeDrawer() {
    const next = new URLSearchParams(params);
    next.delete("kp");
    setParams(next, { replace: true });
    setOpen(false);
    setExpand(false);
  }

  async function openPractice(list: WangdaoItem[], startAt = 0) {
    if (!list.length) return;
    const request = ++trainingRequest.current;
    setOpen(true);
    setNotice("正在加载题目…");
    try {
      const hydrated = await hydratePracticeItems(list);
      if (request !== trainingRequest.current) return;
      const at = Math.min(Math.max(startAt, 0), hydrated.length - 1);
      setQueue(hydrated);
      setQueueIndex(at);
      setActive(hydrated[at]);
      setNotice("");
    } catch (e: unknown) {
      if (request === trainingRequest.current) setNotice(e instanceof Error ? e.message : "题目加载失败，请重试。");
    }
  }

  /** 上一题 / 下一题：换题只改索引，题面与抽屉列表同时跟着走。 */
  function goTo(next: number) {
    if (!queue.length) return;
    const at = Math.min(Math.max(next, 0), queue.length - 1);
    if (at === queueIndex) return;
    setQueueIndex(at);
    setActive(queue[at]);
    setNotice("");
  }

  function markActive(mark: Parameters<typeof applyWangdaoPractice>[1]) {
    if (!active) return;
    applyWangdaoPractice(active, mark);
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      setQueueIndex(nextIndex);
      setActive(queue[nextIndex]);
      setNotice(`已完成 ${nextIndex} / ${queue.length} 题`);
      return;
    }
    const done = queue.length;
    setActive(null);
    setQueue([]);
    setQueueIndex(0);
    setNotice(`已完成 ${done} 道，图谱与复习顺序已更新。`);
  }

  const visibleRows = expanded ? ranked : ranked.slice(0, 8);
  const queueList = showAllTraining ? allTraining : training;
  const queueMinutes = queueList.reduce((sum, t) => sum + practiceMinutes(t.item.kind ?? kind), 0);
  const drawerRoi = selected ? roi.get(selected.kpId) : undefined;
  // 作答卡的共享属性：宽屏给左侧作答台，窄屏留在抽屉里，两处只有一份在挂载。
  const practiceProps = active ? {
    item: active,
    nextItem: queue[queueIndex + 1],
    index: queueIndex,
    total: queue.length || 1,
    mark: marks.find((m) => m.itemId === active.id)?.mark,
    collected: isCollected(active.id),
    onCollect: () => toggleWangdaoCollect(active, !isCollected(active.id)),
    onMark: markActive,
    onExit: () => { setActive(null); setQueue([]); setQueueIndex(0); setExpand(false); },
  } : null;
  /** 大屏只看题面：作答台在场时才生效，否则隐藏右栏会变成空白页。 */
  const stageFull = expand && wide && !!practiceProps;
  const sourceFilter = subject === "math" && (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground">练习题集</span>
      <Seg label="选择练习题集" value={source ?? "all"} onChange={(v) => choose("src", v)}
        items={[{ value: "all", label: "全部题集" }, ...MATH_BOOK_SOURCES.map((s) => ({ value: s.id, label: SOURCE_NAMES[s.id] }))]} />
    </div>
  );

  return (
    <div className="min-h-full">

      {/* ---------- 工具条：学科 / 题型 / 分科 / 排序，数学另有题集筛选 ---------- */}
      <div className="sticky top-0 z-20 border-b-2 border-border/60 bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2 md:flex-nowrap md:px-6">
          {/* 手机：学科 + 题型在首行、分科折到第二行；桌面合并成一行。筛选项多时各自横向滚动，排序与口径固定在右侧 */}
          <div className="order-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-none">
            <Seg
              label="选择学科"
              value={subject}
              onChange={(v) => choose("subject", v)}
              items={[{ value: "math", label: "数学一" }, { value: "cs408", label: "408" }]}
            />
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
            <Seg
              label="选择真题题型"
              value={kind}
              onChange={(v) => choose("kind", v)}
              items={kinds.map((k) => ({ value: k, label: MATH1_KIND_NAMES[k], hint: String(dataset.items.filter((q) => q.kind === k).length) }))}
            />
          </div>

          <div className="order-2 flex shrink-0 items-center gap-1 md:order-3">
            <label className="sr-only" htmlFor="review-order">排序方式</label>
            <select
              id="review-order"
              value={order}
              onChange={(e) => choose("order", e.target.value)}
              className="rounded-full border-2 border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-3"
            >
              {(["personal", "frequency", "recent"] as AnalysisOrder[]).map((o) => (
                <option key={o} value={o}>{ORDER_LABEL[o]}</option>
              ))}
            </select>
            <div className="relative">
              <button
                type="button"
                aria-label="统计口径与排序依据"
                aria-expanded={infoOpen}
                onClick={() => setInfoOpen((v) => !v)}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-colors", infoOpen ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary")}
              >
                <Info className="h-4 w-4" />
              </button>
              {infoOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setInfoOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-border bg-popover p-4 text-[11px] leading-5 text-muted-foreground shadow-edge">
                    <p className="mb-2 text-xs font-bold text-foreground">统计口径</p>
                    <p>{dataset.classificationNote} 各题型分别统计，频次按年份去重，分值按当年该题型总分归一化。</p>
                    <p className="mt-2">近五年为 {dataset.recentStart}—{dataset.years[dataset.years.length - 1]}，其中 {recentSamples} 个有效年份。</p>
                    <p className="mt-2"><span className="font-semibold text-foreground">排序：</span>个人优先综合分值占比、掌握缺口与补齐成本；未记录的考点采用中性起点，不视为不会。排名不代表下一年命题概率。</p>
                    {subject === "math" && <p className="mt-2"><span className="font-semibold text-foreground">题池：</span>李林 880、张宇 1000 合并推荐；真题仅作依据与性价比参考，不作检验题。题型模板只是辅助归类。</p>}
                    <p className="mt-2"><span className="font-semibold text-foreground">成本：</span>{dataset.costNote}</p>
                    <Link className="mt-3 inline-block font-semibold text-primary hover:underline" to={kgMapPath(subject)}>查看{subject === "math" ? "数学" : "408"}知识图谱 →</Link>
                  </div>
                </>
              )}
            </div>
          </div>

          <div role="group" aria-label="选择分科" className="order-3 flex w-full min-w-0 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:order-2 md:w-auto">
            {books.map((id) => <Chip key={id} active={book === id} onClick={() => choose("book", id)}>{REVIEW_BOOK_NAMES[id]}</Chip>)}
          </div>
        </div>
        {sourceFilter && <div className="mx-auto max-w-6xl px-3 pb-2 md:px-6">{sourceFilter}</div>}
      </div>

      <div className="mx-auto max-w-6xl space-y-5 p-4 pb-16 md:p-6">
        <Link to={`/review-priority/knowledge?${new URLSearchParams({ subject, kind, order })}`} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-primary hover:bg-accent/70">
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{subject === "math" ? `数学知识复习 · ${KNOWLEDGE_KP_COUNT.math} 个考点` : `408知识复习 · ${KNOWLEDGE_KP_COUNT.cs408} 个考点`}</span><span className="mt-1 block text-xs text-muted-foreground">{subject === "math" ? "高数、线代、概率统计 · 公式与完整演算" : "数据结构、计组、操作系统、计网 · 原理与过程推演"}</span></span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
        {/* ---------- 结论层：一句话 + Top3 行动卡 ---------- */}
        <section aria-label="本周推荐" className="rounded-2xl bg-card p-5 shadow-edge md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground">
                <span className="rounded-full bg-app-orange/20 px-2 py-0.5 text-ink-warning">{subject === "math" ? "数学一" : "408"} · {kindLabel} · {REVIEW_BOOK_NAMES[book]}</span>
                <span>{dataset.years[0]}—{dataset.years[dataset.years.length - 1]} · {dataset.years.length} 年样本</span>
              </p>
              <h1 className="mt-2 text-xl font-extrabold tracking-tight md:text-2xl">{verdictTitle}</h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-muted-foreground">{verdictSub}</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />按{ORDER_LABEL[order]}排序</span>
              <span className="text-border">|</span>
              <span>{ranked.length} 类考点</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {top3.map((topic, index) => {
              const info = roi.get(topic.kpId);
              const starter = starters.get(topic.kpId);
              if (!info) return null;
              return (
                <div
                  key={topic.kpId}
                  className={cn(
                    "group relative flex min-w-0 flex-col rounded-xl border-2 p-3 transition-colors",
                    index === 0 ? "border-primary/50 bg-accent/40" : "border-border/70 bg-card-soft/40"
                  )}
                >
                  <button type="button" onClick={() => openTopic(topic.kpId)} className="w-full min-w-0 text-left">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-extrabold", index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{index + 1}</span>
                      <span className="min-w-0 truncate text-sm font-bold">{topic.name}</span>
                    </span>
                    <span className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold tabular-nums leading-none">{info.unallocated ? "待估" : info.score ?? info.tier}</span>
                      <span className="text-[11px] text-muted-foreground">性价比{info.score === null ? "（档）" : ""}</span>
                      <span className={cn("ml-auto text-[11px] font-semibold", info.score === null ? "text-muted-foreground" : "text-ink-danger")}>{info.score === null ? "待诊断" : `缺口 ${pct(info.gap, 0)}`}</span>
                    </span>
                    {info.score !== null && (
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${info.score}%` }} />
                      </span>
                    )}
                    <span className="mt-2 block text-[11px] leading-5 text-muted-foreground">
                      主考归属每年约 {info.perPaper.toFixed(1)} 分 · 补齐约 {info.estMinutes} 分钟
                      <br />
                      <span className="text-foreground">{info.unallocated ? "综合考查分值未拆分，收益待估" : `预计可拿回 ${info.estGain} 分（估算）`}</span>
                    </span>
                  </button>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[10px] text-muted-foreground">{topic.years.length}/{dataset.years.length} 年考过</span>
                    <Button
                      size="sm"
                      className="h-8 gap-1 px-3 text-[11px]"
                      disabled={subject === "math" && !starter}
                      onClick={() => subject === "cs408" ? openTopic(topic.kpId) : starter && startTopic(topic.kpId, [starter])}
                    >
                      <Play className="h-3 w-3" />{subject === "cs408" ? "开始检验" : starter ? "直接练题" : "暂无题"}
                    </Button>
                  </div>
                  {KNOWLEDGE_REVIEW_TOPICS[topic.kpId] && (
                    <Link to={knowledgeReviewPath(topic.kpId, params.toString())} className="mt-3 inline-flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-xs font-bold text-primary hover:underline">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />知识模板 · 先学知识与解题路线<ArrowRight className="ml-auto h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          {notice && <p role="status" className="mt-3 text-xs font-semibold text-primary">{notice}</p>}
          {error && <p role="alert" className="mt-3 text-xs font-semibold text-destructive">{error}</p>}
        </section>

        {/* ---------- 排行表 ---------- */}
        <section aria-label="考点性价比排行" className="overflow-hidden rounded-2xl bg-card shadow-edge">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Target className="h-4 w-4 text-primary" />
              {REVIEW_BOOK_NAMES[book]} · {kindLabel}
              <span className="text-[11px] font-semibold text-muted-foreground">按{ORDER_LABEL[order]}降序</span>
            </h2>
            <span className="text-[11px] text-muted-foreground">点一行看依据，点 ▶ 直接开练</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <th className="w-9 py-2 pl-4 pr-1">#</th>
                <th className="py-2 pr-2">考点</th>
                <th className="w-24 py-2 pr-2">性价比</th>
                <th className="hidden w-24 py-2 pr-2 md:table-cell">主考占分 / 考查年份</th>
                <th className="hidden w-20 py-2 pr-2 sm:table-cell">掌握</th>
                <th className="hidden w-16 py-2 pr-2 lg:table-cell">成本</th>
                <th className="w-12 py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((topic, index) => {
                const info = roi.get(topic.kpId);
                const starter = starters.get(topic.kpId) ?? matchReviewTraining(topic, items ?? [], marks, states, dueIds, waitingIds)[0]?.item;
                return (
                  <tr
                    key={topic.kpId}
                    onClick={() => openTopic(topic.kpId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTopic(topic.kpId); } }}
                    tabIndex={0}
                    aria-label={`查看 ${topic.name} 的依据`}
                    className={cn(
                      "cursor-pointer border-b border-border/40 transition-colors last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      selected?.kpId === topic.kpId && open ? "bg-accent/50" : "hover:bg-secondary/50"
                    )}
                  >
                    <td className="py-2.5 pl-4 pr-1 align-middle">
                      <span className={cn("grid h-6 w-6 place-items-center rounded-md text-[11px] font-extrabold", index < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{index + 1}</span>
                    </td>
                    <td className="py-2.5 pr-2 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold">{topic.name}</span>
                        <Status topic={topic} plan={templatePlans.get(topic.kpId)} />
                        {KNOWLEDGE_REVIEW_TOPICS[topic.kpId] && (
                          <Link
                            to={knowledgeReviewPath(topic.kpId, params.toString())}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                          >
                            <BookOpen className="h-3 w-3" aria-hidden="true" />知识复习
                          </Link>
                        )}
                        {topic.due && <span className="text-[10px] font-semibold text-ink-danger">到期</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                        考查 {topic.recentYears.length}/{recentSamples} 年 · 主考归属每年约 {info?.perPaper.toFixed(1)} 分
                      </p>
                    </td>
                    <td className="py-2.5 pr-2 align-middle">{info ? <RoiCell info={info} /> : null}</td>
                    <td className="hidden py-2.5 pr-2 align-middle md:table-cell">
                      <span className="text-xs font-semibold tabular-nums">{pct(topic.recentPointShare)}</span>
                      <span className="block text-[10px] text-muted-foreground">考查 {topic.recentYears.length}/{recentSamples} 年</span>
                    </td>
                    <td className="hidden py-2.5 pr-2 align-middle sm:table-cell">
                      <span className="text-xs font-semibold tabular-nums">{topic.diagnostic ? topic.diagnostic.label : topic.confidence === null ? "—" : pct(topic.confidence, 0)}</span>
                      <span className="block text-[10px] text-muted-foreground">{topic.diagnostic ? `抽检 ${topic.diagnostic.sampleCount} 题 · 基础 ${topic.diagnostic.checksPassed}/3` : topic.sampleCount ? `${topic.sampleCount} 道` : "无记录"}</span>
                    </td>
                    <td className="hidden py-2.5 pr-2 align-middle text-xs text-muted-foreground lg:table-cell">{COST[topic.cost]}</td>
                    <td className="py-2.5 pr-4 align-middle text-right">
                      <button
                        type="button"
                        disabled={subject === "math" && !starter}
                        aria-label={`${subject === "cs408" ? "开始检验" : "开始练"} ${topic.name}`}
                        onClick={(e) => { e.stopPropagation(); if (subject === "cs408") openTopic(topic.kpId); else if (starter) startTopic(topic.kpId, [starter]); }}
                        className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-30"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ranked.length > 8 && (
            <button type="button" className="w-full px-4 py-2.5 text-xs font-semibold text-primary hover:bg-secondary/50" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "收起" : `查看全部 ${ranked.length} 类考点`}
            </button>
          )}
        </section>

        {/* ---------- 口径与来源（下沉） ---------- */}
        <details className="rounded-2xl bg-card/60 px-4 py-3 text-[11px] leading-6 text-muted-foreground">
          <summary className="cursor-pointer text-xs font-bold text-foreground">统计口径、排序依据与资料来源</summary>
          <p className="mt-2">个人排序综合近五年与长期的主考点分值占比、当前掌握缺口、相对补齐成本和到期复习状态。未记录的考点采用中性起点，不视为不会；排名不代表下一年命题概率。</p>
          <p>{subject === "math" ? "2009—2020：选择 8 题/32 分、填空 6 题/24 分、大题 9 题/94 分。2021—2026：选择 10 题/50 分、填空 6 题/30 分、大题 6 题/70 分。" : "408 统计卷每年选择 40 题/80 分、大题 7 题/70 分。规则草稿、回忆版及分值合计异常卷暂不进入排行。"}各题型分别归一化、分别排序。近五年为 {dataset.recentStart}—{dataset.years[dataset.years.length - 1]}，其中 {recentSamples} 个有效年份。</p>
          <p>{dataset.classificationNote} {dataset.costNote} 性价比分是同科目同题型内的相对值，预计提分按当前缺口估算，不代表考试得分。</p>
          <p>{subject === "math" ? "数学真题按题展示，题面与解析保留社区重排版的公式和图形。" : "408 沿用项目已有真题与主考点标注，扫描答案的 OCR 质量提示在原题页展示。"}{loggedIn ? "练习标记沿用账号同步与错题复习队列。" : "当前使用访客学习记录，登录后按账号同步。"}</p>
          <div className="mt-1 flex flex-wrap gap-4">
            {subject === "math" ? (
              <>
                <a className="font-semibold text-primary hover:underline" href="https://github.com/CHNragdoll/anki-pipeline/releases/tag/math-exams" target="_blank" rel="noreferrer">试卷与详解来源</a>
                <a className="font-semibold text-primary hover:underline" href="https://github.com/lx-ruc/kaoyanshuxue" target="_blank" rel="noreferrer">历年考点标签来源</a>
              </>
            ) : <Link className="font-semibold text-primary hover:underline" to="/kg/exams">全部 408 真题与版本说明</Link>}
          </div>
        </details>
      </div>

      {/* ---------- 下钻抽屉：结论 / 三因子 / 训练队列 / 真题依据 ---------- */}
      {open && selected && drawerRoi && (
        <div
          className="fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
          aria-label={active ? `${selected.name} · 第 ${active.qno} 题作答与训练队列` : `${selected.name} 的依据与训练`}
        >
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} onClick={closeDrawer} aria-hidden />

          {/* ---------- 左侧大屏作答台：列表里选中哪道题，这里就放大哪道题 ---------- */}
          {wide && active && practiceProps && (
            <section aria-label="题目大屏" className="relative z-10 flex min-w-0 flex-1 flex-col bg-background">
              <div className="flex items-center gap-3 border-b-2 border-border/60 bg-background px-5 py-2.5">
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-primary px-1.5 text-[11px] font-extrabold tabular-nums text-primary-foreground">
                  {queueIndex + 1}/{queue.length || 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{selected.name}</p>
                  <p className="break-words text-[11px] leading-5 text-muted-foreground">
                    {practiceQuestionLocation(active)}
                    {active.year ? ` · ${active.year} 真题` : ""}
                    {active.pdf_page ? ` · 做题本 p.${active.pdf_page}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="mr-1 hidden items-center gap-1 text-[10px] text-muted-foreground lg:flex">
                    <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-sans">←</kbd>
                    <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-sans">→</kbd>
                    换题
                    <span className="mx-1 h-3 w-px bg-border" aria-hidden />
                    <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-sans">{expand ? "Esc" : "f"}</kbd>
                    {expand ? "退出大屏" : "大屏"}
                  </span>
                  <Button variant="outline" size="sm" className="h-8 gap-0.5 px-2 text-[11px]" disabled={queueIndex <= 0} onClick={() => goTo(queueIndex - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />上一题
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-0.5 px-2 text-[11px]" disabled={queueIndex >= queue.length - 1} onClick={() => goTo(queueIndex + 1)}>
                    下一题<ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 px-0"
                    aria-pressed={expand}
                    aria-label={expand ? "退出大屏，显示右侧队列" : "大屏只看题面，隐藏右侧队列"}
                    title={expand ? "退出大屏（f）" : "大屏（f）"}
                    onClick={() => setExpand((v) => !v)}
                  >
                    {expand ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {/* m-auto：题目短时垂直居中，长题时自然顶满并滚动；大屏态放宽到 1080 让题面更饱满 */}
                <div className={cn("m-auto w-full", stageFull ? "max-w-[1080px]" : "max-w-[880px]")}>
                  <PracticeQuestionCard key={practiceProps.item.id} {...practiceProps} size="large" />
                </div>
              </div>
              {notice && <p role="status" className="border-t border-border/60 px-5 py-2 text-[11px] font-semibold text-primary">{notice}</p>}
            </section>
          )}

          <div
            role="region"
            aria-label="考点依据与训练队列"
            aria-hidden={stageFull || undefined}
            style={stageFull ? { display: "none" } : undefined}
            className="relative mt-auto flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-card shadow-edge md:mt-0 md:ml-auto md:h-full md:max-h-none md:w-[520px] md:shrink-0 md:rounded-l-3xl md:rounded-tr-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold">{selected.name}</h2>
                  <Status topic={selected} plan={templatePlan} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {drawerRoi.unallocated ? "综合考查 · 分值未拆分，收益待估" : `性价比 ${drawerRoi.score ?? drawerRoi.tier} · 主考归属每年约 ${drawerRoi.perPaper.toFixed(1)} 分 · 补齐约 ${drawerRoi.estMinutes} 分钟`}
                </p>
              </div>
              <button type="button" onClick={closeDrawer} aria-label="关闭" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {KNOWLEDGE_REVIEW_TOPICS[selected.kpId] && (
                <Link to={knowledgeReviewPath(selected.kpId, params.toString())} className="flex items-start gap-3 rounded-xl border-2 border-primary/30 bg-accent/50 p-3 transition-colors hover:border-primary/60">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">先复习知识与解题路线</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{KNOWLEDGE_REVIEW_TOPICS[selected.kpId].summary}</span></span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                </Link>
              )}
              <p className="rounded-xl bg-accent/40 p-3 text-[13px] leading-6">
                当前{kindLabel}近五年考查 <strong>{selected.recentYears.length}/{recentSamples}</strong> 年{subject === "math" ? "（含辅助考点）" : ""}，主考点归属分值平均每年约 <strong>{drawerRoi.perPaper.toFixed(1)} 分</strong>。
                {selected.diagnostic
                  ? `已检验 ${selected.diagnostic.sampleCount} 道主考题；${selected.diagnostic.label}。掌握缺口仅作排序估计，完整考法覆盖仍需核对。`
                  : selected.confidence === null
                  ? "还没有同题型记录，建议先做一道代表题判断起点。"
                  : `最近 ${selected.sampleCount} 道同题型记录显示掌握度约 ${pct(selected.confidence, 0)}${selected.confidenceSource === "graph" ? "（暂用共享图谱参考）" : ""}。`}
                {selected.recentYears.length > 0 && drawerRoi.perPaper === 0
                  ? "近五年作为辅助考点出现，未拆分小问分值；主考占分为零不代表没考过，也不代表无需复习。"
                  : <>补齐预计 <strong>{drawerRoi.estMinutes} 分钟</strong>，按主考归属分值与当前缺口估算可拿回 <strong>{drawerRoi.estGain} 分</strong>。</>}
              </p>

              <div className="grid grid-cols-3 divide-x divide-border/60 rounded-xl bg-secondary/50 py-2.5 text-center">
                <div><strong className="block text-sm tabular-nums">{pct(selected.recentPointShare)}</strong><span className="text-[10px] text-muted-foreground">近五年主考归属占分</span></div>
                <div><strong className="block text-sm tabular-nums">{selected.confidence === null ? "—" : pct(drawerRoi.gap, 0)}</strong><span className="text-[10px] text-muted-foreground">掌握缺口</span></div>
                <div><strong className="block text-sm">{COST[selected.cost]}</strong><span className="text-[10px] text-muted-foreground">补齐成本</span></div>
              </div>

              {/* 窄屏：作答卡排在训练队列之前，点一下就能看到题；宽屏由左侧大屏承担 */}
              {!wide && practiceProps && (
                <div aria-label="推荐题作答" ref={narrowCardRef}>
                  <PracticeQuestionCard key={practiceProps.item.id} {...practiceProps} />
                </div>
              )}
              {!wide && practiceProps && queue.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-0.5 px-3 text-[11px]" disabled={queueIndex <= 0} onClick={() => goTo(queueIndex - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />上一题
                  </Button>
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{queueIndex + 1} / {queue.length}</span>
                  <Button variant="outline" size="sm" className="h-8 gap-0.5 px-3 text-[11px]" disabled={queueIndex >= queue.length - 1} onClick={() => goTo(queueIndex + 1)}>
                    下一题<ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {diagnostic ? <Cs408DiagnosticSummary plan={diagnostic}
                checkHref={knowledgeCheckPath(selected.kpId, params.toString())}
                returnTo={location.pathname + location.search} catalogReady={items !== null} catalogError={error}
                alternateHref={alternateCount ? `${location.pathname}?${alternateParams}` : undefined}
                alternateLabel={`当前暂无${kindLabel}关联，另有 ${alternateCount} 道${MATH1_KIND_NAMES[alternateKind]}`}
                onPractice={(list) => void openPractice(list)} /> : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-extrabold"><BookOpen className="h-3.5 w-3.5 text-primary" />{kindLabel}训练</h3>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Timer className="h-3 w-3" />共约 {queueMinutes} 分钟</span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {hasTemplates
                    ? "李林 880、张宇 1000 合为一个检验题池，按题型模板归类。真题只作依据与性价比参考，不进检验队列。每类先通过两道不同题（至少一道主考该考点），三天后复测。"
                    : "当前考点暂无模板细分，按知识点合池推荐。已会题及未到期错题会避开。"}
                </p>
                {sourceFilter && <div className="mt-3">{sourceFilter}</div>}
                {hasTemplates && templatePlan && (
                  <details open className="mt-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
                    <summary className="cursor-pointer text-xs font-bold">
                      题型模板 · 已练 {templatePlan.tested}/{templatePlan.groups.length} · 初步掌握 {templatePlan.preliminary}/{templatePlan.groups.length} · 掌握较稳 {templatePlan.stable}/{templatePlan.groups.length}
                    </summary>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">模板按「给什么条件、求什么结论」归类，技巧写在标准路线里，不再单独计覆盖。当天重复点会不算延迟复测；模糊或不会后需重新通过两道题。</p>
                    {examGroups.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-muted-foreground">真题考过</span>
                        {examGroups.map((g) => (
                          <button key={g.template.id} type="button"
                            title={`${g.template.name} · 真题考过 ${g.examCount} 道（${g.examYears.join("、")}），点击查看真题依据`}
                            onClick={() => { setAllEvidence(true); evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                            className="max-w-44 truncate rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-border transition-colors hover:bg-accent">
                            {g.template.name} ×{g.examCount}
                          </button>
                        ))}
                      </div>
                    )}
                    <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                      {templatePlan.groups.map((g) => (
                        <li key={g.template.id} className="rounded-lg bg-card p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold leading-5">{g.template.name}</span>
                            <span className={cn("shrink-0 text-[11px] font-semibold", g.status === "weak" ? "text-ink-danger" : g.status === "stable" ? "text-ink-success" : "text-primary")}>{TEMPLATE_STATUS[g.status]}</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">识别：{g.template.recognize}</p>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] font-semibold text-primary hover:underline">标准路线</summary>
                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{g.template.route}</p>
                          </details>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            880 {g.counts.lilin880} · 1000 {g.counts.zhangyu1000} · 真题考过 {g.examCount} · 练过 {g.practiced}/{g.total} · 本轮通过 {g.passed}/2
                            {g.reviewOn && g.status !== "stable" ? ` · ${g.reviewOn} 复测` : ""}
                          </p>
                          {g.total === 0 && g.examCount > 0 && <p className="mt-1 text-[11px] text-muted-foreground">教辅暂缺该模板题，可先查看真题依据。</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-3">
                            {g.recommendations.length > 0 && (
                              <button type="button" className="text-[11px] font-bold text-primary hover:underline"
                                onClick={() => void openPractice(g.recommendations)}>
                                {g.status === "weak" ? "针对补练" : g.status === "due" ? "开始复测" : "练这个模板"} · {g.recommendations.length} 题
                              </button>
                            )}
                            {g.total > 0 && (
                              <button type="button" className="text-[11px] font-semibold text-muted-foreground hover:text-primary hover:underline"
                                onClick={() => void openPractice(g.items)}>
                                全部 {g.total} 题
                              </button>
                            )}
                          </div>
                          {g.status === "weak" && !g.recommendations.length && <p className="mt-1 text-[11px] text-muted-foreground">暂没有可立即补练的题，已收录的错题到期后会重新推荐。</p>}
                        </li>
                      ))}
                    </ul>
                    {templatePlan.other.length > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        另有 {templatePlan.other.length} 道综合/未归类题，不计入模板覆盖。
                        <button type="button" className="ml-2 font-bold text-primary hover:underline" onClick={() => void openPractice(templatePlan.other)}>练综合题</button>
                      </p>
                    )}
                  </details>
                )}
                {items && queueList.length > 0 && (
                  <Button className="mt-2 h-9 w-full gap-1.5 text-xs" onClick={() => void openPractice(queueList.slice(0, 3).map((t) => t.item))}>
                    <Play className="h-3.5 w-3.5" />连续做 {Math.min(3, queueList.length)} 题 · 约 {queueList.slice(0, 3).reduce((s, t) => s + practiceMinutes(t.item.kind ?? kind), 0)} 分钟
                  </Button>
                )}
                {!items && !error && <p className="mt-2 text-xs text-muted-foreground">正在查找{subject === "math" ? sourceLabel : "王道 408"}的匹配题…</p>}
                {items && queueList.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{source ? `${sourceLabel}在当前考点和题型下暂无待练题，可切换题集或考点，或查看下方真题依据。` : hasTemplates ? "本轮暂没有待练题，可先换一个考点；复测到期后会重新推荐。缺题模板仍保留未完成状态。" : "当前没有适合的新题或到期题，可查看下方真题依据。"}</p>}
                {wide && active && (
                  <p className="mt-2 rounded-xl bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary">
                    第 {queueIndex + 1} 题正在左侧大屏作答，点下面任意一题可换题。
                  </p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {queueList.map(({ item, match, review, templateIds, reason }, at) => {
                    const current = active?.id === item.id;
                    return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={current}
                        onClick={() => void openPractice(queueList.map((t) => t.item), at)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-colors",
                          current ? "border-primary bg-accent/60 ring-1 ring-primary/40" : "border-border/60 bg-card hover:border-primary/50 hover:bg-accent/30"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{SOURCE_NAMES[item.source || "wangdao"]}</span>
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", match === "foundation" ? "bg-warning/15 text-ink-warning" : "bg-primary/10 text-primary")}>
                              {reason ? TRAINING_REASON[reason] : match === "foundation" ? "补基础" : match === "method" ? "方法匹配" : "同考点"}
                            </span>
                            {review && <span className="text-[10px] font-semibold text-ink-danger">到期重练</span>}
                            {current && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">作答中</span>}
                          </span>
                          <span className="mt-1 block break-words text-xs leading-5">
                            {item.source === "lilin880" || item.source === "zhangyu1000"
                              ? `${practiceSourceLabel(item)} · ${item.section_name || `章节 ${item.section}`} · 第 ${item.qno} 题`
                              : practiceQuestionLocation(item)}
                          </span>
                          {templateIds?.length ? <span className="mt-1 block truncate text-[10px] text-muted-foreground">{templateIds.map(mathTemplateName).join(" · ")}</span> : null}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">约 {practiceMinutes(item.kind ?? kind)} 分钟</span>
                        <Play className="h-3.5 w-3.5 shrink-0 text-primary" />
                      </button>
                    </li>
                    );
                  })}
                </ul>
                {allTraining.length > training.length && (
                  <button type="button" className="mt-2 text-[11px] font-semibold text-primary hover:underline" onClick={() => setShowAllTraining((v) => !v)}>
                    {showAllTraining ? "只看精选推荐" : `查看全部可练 ${allTraining.length} 题`}
                  </button>
                )}
              </div>

              )}

              {/* 窄屏：作答卡就放在抽屉里，且排在看训练队列之前；宽屏已移到左侧大屏，两处只挂一份 */}
              {wide && active && (
                <p className="rounded-xl bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
                  在左侧作答台完成这一题后，标记「会 / 模糊 / 不会」会自动跳到队列下一题。
                </p>
              )}
              {notice && !(wide && active) && <p role="status" className="text-xs font-semibold text-primary">{notice}</p>}

              <details ref={evidenceRef} className="rounded-xl bg-secondary/40 p-3" open>
                <summary className="cursor-pointer text-xs font-bold">真题依据 · {selected.questions.length} 道</summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.questions.map((q) => (
                    <Link
                      key={q.id}
                      to={reviewQuestionHref(subject, q, false, location.pathname + location.search)}
                      title={`${q.year} 年 · 第 ${q.n} 题 · ${q.kpId === selected.kpId ? "主考点" : "辅助考点"} · 整题 ${q.points} 分`}
                      className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[11px] font-semibold text-primary ring-1 ring-border hover:bg-accent"
                    >
                      {q.year}·{q.n}{q.kpId === selected.kpId ? "主" : "辅"}
                    </Link>
                  ))}
                </div>
                <button type="button" onClick={() => setAllEvidence((v) => !v)} className="mt-2 text-[11px] font-semibold text-primary hover:underline">
                  {allEvidence ? "收起题目清单" : "展开题目清单"}
                </button>
                {allEvidence && (
                  <div className="mt-2 divide-y divide-border/50">
                    {selected.questions.map((q) => (
                      <div key={q.id} className="py-2 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{q.year} 年 · {kindLabel} · 第 {q.n} 题 · {q.points} 分</span>
                          <span className="text-[10px] text-muted-foreground">{q.kpId === selected.kpId ? "主考点 · 分值归属" : "辅助考点 · 不重复计分"} · {q.classification === "question_reviewed" ? "逐题复核" : q.classification === "source_read" ? "按题补充分类" : q.classification === "llm" ? "LLM 主考点标注" : "来源主标签映射"}</span>
                        </div>
                        <p className="mt-1 leading-5 text-muted-foreground">主考点：{findKp(q.kpId)?.kp.name}；辅助：{q.secondaryKpIds.map((id) => findKp(id)?.kp.name).join("、") || "无"}。</p>
                        {q.reviewReason && <p className="mt-1 leading-5">分类依据：{q.reviewReason}</p>}
                        {subject === "math" && <p className="mt-1 leading-5 text-muted-foreground">考法：{q.facets.map(mathFacetName).join(" · ")}</p>}
                        <div className="mt-1 flex gap-3">
                          <Link className="font-semibold text-primary hover:underline" to={reviewQuestionHref(subject, q, false, location.pathname + location.search)}>打开原题</Link>
                          <Link className="font-semibold text-primary hover:underline" to={reviewQuestionHref(subject, q, true, location.pathname + location.search)}>参考答案</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </details>

              <Link className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline" to={kgKpPath(selected.kpId, { subject, src: source, returnTo: location.pathname + location.search + location.hash })}>
                查看图谱与全部练习 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
