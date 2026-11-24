import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock, FolderOpen, Scissors } from "lucide-react";
import { HandoutDirectorySearch, handoutDirectoryStyles, handoutFilterClass } from "@/components/handoutDirectory";
import { Button } from "@/components/ui/button";
import { findFileKnowledgeSection, type FileKnowledgeId, type FileKnowledgeSection } from "@/data/kg/cs408FileKnowledge";
import { CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import { syncAccountData } from "@/lib/accountSync";
import { dayKey } from "@/lib/day";
import { isDueOnOrBefore } from "@/lib/journal";
import { cs408Evidence } from "@/lib/kg/cs408Diagnostic";
import {
  CS408_HANDOUT_CHAPTERS,
  cs408HandoutProgressTarget,
  loadCs408HandoutQuestions,
  markCs408HandoutQuestion,
  type Cs408HandoutChapter,
  type Cs408HandoutPriority,
  type Cs408HandoutQuestion,
} from "@/lib/kg/cs408Handouts";
import type { ExamKind } from "@/lib/kg/exams408";
import type { BookId } from "@/lib/kg/types";
import { cn } from "@/lib/utils";
import { Cs408FileKnowledge } from "@/pages/Cs408FileKnowledge";
import { Cs408HandoutGuide } from "@/pages/Cs408HandoutGuide";
import { Cs408HandoutQuestionPage, handoutQuestionLabel } from "@/pages/cs408HandoutQuestion";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import "@/styles/mathHandout.css";

const ROOT = "/cs408-handouts";
const EMPTY: readonly Cs408HandoutQuestion[] = [];
const BOOKS = [...new Map(CS408_HANDOUT_CHAPTERS.map(chapter => [chapter.bookId, chapter.bookName]))];
const KINDS = [["mcq", "选择题"], ["big", "大题"]] as const;
const ACTIVE_LINK = "!border-[var(--mh-accent)] !bg-[var(--mh-accent)] !text-[var(--mh-paper)]";
type Questions = Awaited<ReturnType<typeof loadCs408HandoutQuestions>>;
const EMPTY_QUESTIONS: Questions = new Map();
const FILE_CHAPTER_ID = "os-file";

function readKind(value: string | null | undefined): ExamKind | undefined {
  return value === "mcq" || value === "big" ? value : undefined;
}

function bookIndexHref(bookId: BookId, kind: ExamKind): string {
  return `${ROOT}?book=${bookId}&kind=${kind}`;
}

function QuestionKindNav({ kind, hrefFor, replace = false, directory = false }: {
  kind: ExamKind;
  hrefFor: (kind: ExamKind) => string;
  replace?: boolean;
  directory?: boolean;
}) {
  return (
    <nav className="flex gap-2" aria-label="408手稿题型">
      {KINDS.map(([id, name]) => (
        <Link key={id} to={hrefFor(id)} replace={replace} state={{ preserveScroll: true }}
          aria-current={kind === id ? "page" : undefined}
          className={directory ? handoutFilterClass(kind === id) : cn("mh-btn", kind === id && ACTIVE_LINK)}>
          {name}
        </Link>
      ))}
    </nav>
  );
}

function useProgress() {
  const itemMarks = useKgProgress(s => s.itemMarks);
  const attempts = useKgProgress(s => s.attempts);
  const entries = useJournal(s => s.entries);
  const [today, setToday] = useState(dayKey);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(dayKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    const marks = new Map(cs408Evidence(itemMarks, attempts).map(mark => [mark.itemId, mark]));
    for (const mark of itemMarks) {
      if (mark.retired) marks.set(mark.itemId, mark);
    }
    const due = new Set<string>();
    const reviewedToday = new Set<string>();
    for (const entry of entries) {
      const id = entry.sourceItemId;
      if (!id) continue;
      if (!marks.get(id)?.retired && isDueOnOrBefore(entry, today)) due.add(id);
      if (entry.lastReviewedOn === today) reviewedToday.add(id);
    }
    return {
      marks,
      due,
      reviewedToday,
      passed: (questions: readonly Cs408HandoutQuestion[]) => questions.filter(q => marks.get(q.id)?.mark === "pass").length,
    };
  }, [itemMarks, attempts, entries, today]);
}

type Progress = ReturnType<typeof useProgress>;

function chapterQuestions(chapter: Cs408HandoutChapter, questions: Questions) {
  return [...new Map(chapter.kps.flatMap(kp => questions.get(kp.id) ?? EMPTY).map(q => [q.id, q])).values()];
}

export function Cs408HandoutsPage() {
  const { chapterId } = useParams<{ chapterId?: string }>();
  const [search] = useSearchParams();
  const [questions, setQuestions] = useState<Questions | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const progress = useProgress();

  useEffect(() => {
    void syncAccountData().catch(error => console.warn("408手稿进度同步失败", error));
  }, [chapterId]);

  useEffect(() => {
    let live = true;
    loadCs408HandoutQuestions().then(data => {
      if (live) setQuestions(data);
    }).catch(() => {
      if (live) setError(true);
    });
    return () => { live = false; };
  }, [retry]);

  const chapter = CS408_HANDOUT_CHAPTERS.find(item => item.id === chapterId);
  const knowledgeSection = chapter?.id === FILE_CHAPTER_ID ? findFileKnowledgeSection(search.get("knowledge")) : undefined;
  const requestedKind = readKind(search.get("kind"));
  const linkedId = search.get("q");
  // 旧题目链接没有 kind，从原题推断题型，保持直达。
  const linkedQuestion = !requestedKind && linkedId && questions && chapter
    ? chapterQuestions(chapter, questions).find(q => q.id === linkedId)
    : undefined;
  const linkedScene = search.get("scene");
  const linkedSceneQuestions = !requestedKind && linkedScene
    ? questions?.get(linkedScene) ?? EMPTY
    : EMPTY;
  const guideKind = linkedSceneQuestions.length > 0 && linkedSceneQuestions.every(q => q.item.kind === "big") ? "big" : "mcq";
  const kind = requestedKind ?? readKind(linkedQuestion?.item.kind) ?? guideKind;
  const kindQuestions = useMemo(() => questions
    ? new Map([...questions].map(([id, items]) => [id, items.filter(q => q.item.kind === kind)]))
    : null, [questions, kind]);

  if (chapterId && !chapter) {
    return <div className="mh-reader space-y-3 p-8"><p>找不到该章节。</p><Link to={ROOT}>← 返回408手稿</Link></div>;
  }

  if (!chapter && !error) {
    return <HandoutIndex questions={kindQuestions} allQuestions={questions} progress={progress} kind={kind} />;
  }

  return (
    <div className={chapter ? "mh-reader rounded-xl" : handoutDirectoryStyles.page}>
      {chapter && (kindQuestions || knowledgeSection) ? (
        <HandoutReader key={chapter.id} chapter={chapter} questions={kindQuestions ?? EMPTY_QUESTIONS}
          progress={progress} kind={kind} knowledgeSection={knowledgeSection} />
      ) : error ? (
        <div role="alert" className={cn("flex flex-wrap items-center gap-4 text-sm", chapter ? "p-8" : handoutDirectoryStyles.header)}>
          408手稿题库加载失败
          <Button type="button" size="sm" variant="outline" onClick={() => { setError(false); setRetry(n => n + 1); }}>重试</Button>
          {chapter && <Link to={bookIndexHref(chapter.bookId, kind)}>返回{chapter.bookName}目录</Link>}
        </div>
      ) : (
        <p role="status" className="p-8 text-sm text-[var(--mh-muted)]">正在加载408手稿…</p>
      )}
    </div>
  );
}

function HandoutStats({ questions, progress }: { questions: Questions; progress: Progress }) {
  const [showRetired, setShowRetired] = useState(false);
  const unretireItem = useKgProgress(s => s.unretireItem);
  const stats = useMemo(() => {
    const seen = new Set<string>();
    const totals = { exam: { all: 0, passed: 0 }, wangdao: { all: 0, passed: 0 } };
    const retired: { question: Cs408HandoutQuestion; href: string; chapterName: string; retiredAt: number }[] = [];
    let due = 0;
    let reviewed = 0;
    for (const chapter of CS408_HANDOUT_CHAPTERS) {
      for (const scene of chapter.kps) {
        for (const question of questions.get(scene.id) ?? EMPTY) {
          if (seen.has(question.id)) continue;
          seen.add(question.id);
          const mark = progress.marks.get(question.id);
          totals[question.source].all += 1;
          if (mark?.mark === "pass") totals[question.source].passed += 1;
          if (progress.due.has(question.id)) due += 1;
          else if (progress.reviewedToday.has(question.id)) reviewed += 1;
          if (mark?.retired) {
            const params = new URLSearchParams({ kind: question.item.kind, scene: scene.id, q: question.id });
            retired.push({
              question,
              href: `${ROOT}/${chapter.id}?${params}`,
              chapterName: chapter.name,
              retiredAt: mark.retiredAt ?? mark.ts,
            });
          }
        }
      }
    }
    retired.sort((a, b) => b.retiredAt - a.retiredAt);
    return { totals, due, reviewed, retired };
  }, [questions, progress]);

  const card = handoutDirectoryStyles.stat;
  const label = "flex items-center gap-1 text-xs font-semibold text-muted-foreground";
  const value = "mt-0.5 text-lg font-extrabold";
  const detail = "text-xs font-semibold text-muted-foreground";
  const reviewDetail = stats.due > 0 ? `待复习 ${stats.due} 题` : stats.reviewed > 0 ? "今日已全部复盘" : "今日暂无待复习";

  return (
    <section aria-label="408手稿总览" className="space-y-3">
      <dl className={handoutDirectoryStyles.stats}>
        <div className={cn(card, "col-span-2 sm:col-span-1", stats.due > 0 && "bg-app-orange/10")}>
          <dt className={label}><Clock className="h-3.5 w-3.5" aria-hidden="true" />今日复习</dt>
          <dd className={cn(value, stats.due > 0 && "text-app-orange")}>
            {stats.reviewed}/{stats.reviewed + stats.due} <span className={detail}>题</span>
          </dd>
          <dd className={detail}>{reviewDetail}</dd>
        </div>
        <div className={card}>
          <dt className={label}>章节与场景</dt>
          <dd className={value}>
            {CS408_HANDOUT_CHAPTERS.length} 章{" "}
            <span className={detail}>· {CS408_HANDOUT_CHAPTERS.reduce((sum, chapter) => sum + chapter.kps.length, 0)} 场景</span>
          </dd>
        </div>
        <div className={card}>
          <dt className={label}>真题已会</dt>
          <dd className={value}>
            {stats.totals.exam.passed} <span className={detail}>/ {stats.totals.exam.all}</span>
          </dd>
        </div>
        <div className={card}>
          <dt className={label}>王道题已会</dt>
          <dd className={value}>
            {stats.totals.wangdao.passed} <span className={detail}>/ {stats.totals.wangdao.all}</span>
          </dd>
        </div>
        <div className={card}>
          <dt className={label}><Scissors className="h-3.5 w-3.5" aria-hidden="true" />已斩题</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2">
            <span className={value}>{stats.retired.length} 题</span>
            <button type="button" aria-expanded={showRetired} onClick={() => setShowRetired(open => !open)}
              className="rounded text-xs font-bold text-primary hover:underline">
              {showRetired ? "收起已斩题" : "管理已斩题"}
            </button>
          </dd>
        </div>
      </dl>
      {showRetired && (
        <div className="rounded-2xl border border-border bg-secondary/35 px-3.5 py-2.5">
          {stats.retired.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无已斩题。</p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {stats.retired.map(({ question, href, chapterName }) => (
                <li key={question.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link to={href} className="font-semibold hover:text-primary hover:underline">
                    {chapterName} · {handoutQuestionLabel(question)}
                  </Link>
                  <Button type="button" variant="outline" size="sm" onClick={() => unretireItem(question.id)}>移回练习</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function HandoutIndex({ questions, allQuestions, progress, kind }: {
  questions: Questions | null;
  allQuestions: Questions | null;
  progress: Progress;
  kind: ExamKind;
}) {
  const [search] = useSearchParams();
  const [book, bookName] = BOOKS.find(([id]) => id === search.get("book")) ?? BOOKS[0];
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const filtered = CS408_HANDOUT_CHAPTERS.filter(chapter => chapter.bookId === book)
    .map(chapter => ({ chapter, scenes: chapter.kps.filter(kp => questions === null || questions.get(kp.id)?.length) }))
    .filter(({ chapter, scenes }) => scenes.length > 0 &&
      [chapter.name, ...scenes.map(kp => kp.name)].some(label => label.toLowerCase().includes(term)));

  return (
    <section className={handoutDirectoryStyles.page}>
      <div className={cn(handoutDirectoryStyles.header, "space-y-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={handoutDirectoryStyles.title}>408手稿</h1>
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/kg/exams#year-grid">按年份练习与模考 <ChevronRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
        {allQuestions ? (
          <HandoutStats questions={allQuestions} progress={progress} />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">正在加载题库与进度…</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5 sm:gap-2" aria-label="408手稿科目">
          {BOOKS.map(([id, name]) => (
            <Link key={id} to={bookIndexHref(id, kind)} aria-current={book === id ? "page" : undefined}
              state={{ preserveScroll: true }}
              className={handoutFilterClass(book === id)}>
              {name}
            </Link>
          ))}
        </nav>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <QuestionKindNav kind={kind} hrefFor={id => bookIndexHref(book, id)} directory />
          <HandoutDirectorySearch value={query} onChange={setQuery} placeholder="搜索章节或考点" className="min-w-0 flex-1 sm:flex-none" />
        </div>
      </div>
      {filtered.length > 0 && (
        <section className="space-y-4" aria-label={bookName}>
          <div className={handoutDirectoryStyles.sectionHeading}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="h-5 w-1.5 rounded-full bg-app-blue" />
              <h2 className={handoutDirectoryStyles.sectionTitle}>{bookName}</h2>
            </div>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            {filtered.map(({ chapter, scenes }) => {
              const items = questions ? chapterQuestions(chapter, questions) : null;
              const examCount = items?.filter(q => q.source === "exam").length ?? 0;
              const nextDue = questions && scenes.find(kp => questions.get(kp.id)?.some(q => progress.due.has(q.id)));
              const dueQuestion = nextDue && questions?.get(nextDue.id)?.find(q => progress.due.has(q.id));
              const dueCount = items?.filter(q => progress.due.has(q.id)).length ?? 0;
              const passed = items ? progress.passed(items) : 0;
              const percent = items?.length ? Math.round(passed / items.length * 100) : 0;
              const href = `${ROOT}/${chapter.id}?kind=${kind}`;
              return (
                <article key={chapter.id} className={cn(
                  handoutDirectoryStyles.card,
                  "group flex min-w-0 flex-col",
                  dueCount ? "border-app-orange/70 hover:border-app-orange" : "border-border/80 hover:border-primary/60",
                )}>
                  <Link to={href} className="block flex-1 rounded-2xl p-4">
                    <h3 className="flex items-center gap-2 text-base font-extrabold group-hover:text-primary">
                      <FolderOpen aria-hidden="true" className="h-4 w-4 shrink-0 text-app-blue" />
                      {chapter.name}
                      <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    </h3>
                    <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                      {chapter.kps.length} 场景{items && ` · 真题 ${examCount} · 王道 ${items.length - examCount}`}
                    </span>
                    {items && (
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between gap-2 text-xs font-semibold text-muted-foreground">
                          <span>已会 {passed}/{items.length}</span><span>{percent}%</span>
                        </div>
                        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    )}
                  </Link>
                  {dueQuestion && (
                    <Link className="mx-4 mb-4 inline-flex items-center gap-1 self-start rounded-full bg-app-orange/10 px-2.5 py-1 text-xs font-bold text-app-orange hover:bg-app-orange/20"
                      to={`${href}&scene=${nextDue.id}&q=${dueQuestion.id}`}>
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" /> 待复习 {dueCount} 题
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {!filtered.length && (
        <p role="status" className="py-4 text-sm text-muted-foreground">{term ? "没有匹配的章节或考点。" : "本科目暂无该题型的题目。"}</p>
      )}
    </section>
  );
}

function HandoutReader({ chapter, questions, progress, kind, knowledgeSection }: {
  chapter: Cs408HandoutChapter;
  questions: Questions;
  progress: Progress;
  kind: ExamKind;
  knowledgeSection?: FileKnowledgeSection;
}) {
  const [search, setSearch] = useSearchParams();
  const directoryHref = bookIndexHref(chapter.bookId, kind);
  const [priority, setPriority] = useState<Cs408HandoutPriority>("exam");
  const [allSteps, setAllSteps] = useState(false);
  const [stepOverrides, setStepOverrides] = useState<Record<string, boolean>>({});
  const [hideRetired, setHideRetired] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const pageNumbers = useRef<HTMLDivElement>(null);
  const activePage = useRef<HTMLButtonElement>(null);
  const mobileSettings = useRef<HTMLDetailsElement>(null);

  const requestedScene = search.get("scene");
  const requestedQuestion = search.get("q");
  const oldGuide = search.has("kind") || requestedQuestion ? null : requestedScene;
  const withQuestions = chapter.kps.filter(kp => kp.id === oldGuide || questions.get(kp.id)?.length);
  const scenes = withQuestions.length > 0 ? withQuestions : chapter.kps;
  const scene = scenes.find(kp => kp.id === requestedScene)
    ?? scenes.find(kp => questions.get(kp.id)?.some(q => q.id === requestedQuestion))
    ?? scenes[0];
  const nextScene = scenes[scenes.indexOf(scene) + 1];
  const allQuestions = chapterQuestions(chapter, questions);
  const retiredCount = allQuestions.filter(q => progress.marks.get(q.id)?.retired).length;
  const candidates = questions.get(scene.id) ?? EMPTY;
  const visible = hideRetired ? candidates.filter(q => !progress.marks.get(q.id)?.retired) : candidates;
  const queue = [...visible.filter(q => q.source === priority), ...visible.filter(q => q.source !== priority)];
  const questionIndex = queue.findIndex(q => q.id === requestedQuestion);
  const question = queue[questionIndex];
  const example = CS408_KNOWLEDGE_REVIEWS[scene.id]?.routes[0]?.lessons[0];
  const lesson = example?.sourceQuestion?.questionId === question?.id ? example : undefined;
  const stepsOpen = question ? (stepOverrides[question.id] ?? allSteps) : false;
  const prevPage = questionIndex >= 0 ? { scene: scene.id, q: queue[questionIndex - 1]?.id } : null;
  const nextQuestion = queue[questionIndex + 1];
  const nextPage = nextQuestion ? { scene: scene.id, q: nextQuestion.id } : nextScene ? { scene: nextScene.id } : null;

  function knowledgeHref(id: string, node?: FileKnowledgeId): string {
    const params = new URLSearchParams(search);
    if (!params.has("q")) {
      if (!params.has("kind")) params.set("kind", kind);
      if (!params.has("scene")) params.set("scene", knowledgeSection?.id ?? scene.id);
    }
    params.set("knowledge", id);
    if (node) params.set("node", node);
    else params.delete("node");
    return `?${params}`;
  }

  function openPage(page: { scene: string; q?: string }) {
    const params = new URLSearchParams({ kind, scene: page.scene });
    if (page.q) params.set("q", page.q);
    setSearch(params, { replace: true, state: { preserveScroll: true } });
    if (page.scene !== scene.id && mobileSettings.current) mobileSettings.current.open = false;
    stage.current?.focus({ preventScroll: true });
    if ((stage.current?.getBoundingClientRect().top ?? 0) < 72) {
      stage.current?.scrollIntoView({ block: "start" });
    }
  }

  function flipSteps() {
    if (question) setStepOverrides(current => ({ ...current, [question.id]: !(current[question.id] ?? allSteps) }));
  }

  useEffect(() => {
    if (knowledgeSection) return;
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.metaKey || event.ctrlKey || event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      if (event.code === "Space" && question && !(target instanceof HTMLElement && target.closest("button, a, summary"))) {
        event.preventDefault();
        flipSteps();
      } else if (event.key === "ArrowLeft" && prevPage) {
        event.preventDefault();
        openPage(prevPage);
      } else if (event.key === "ArrowRight" && nextPage) {
        event.preventDefault();
        openPage(nextPage);
      } else if (question && !event.repeat) {
        const retired = Boolean(progress.marks.get(question.id)?.retired);
        if (event.key === "1" && !retired) {
          event.preventDefault();
          markCs408HandoutQuestion(question, "pass");
        } else if (event.key === "2" && !retired) {
          event.preventDefault();
          markCs408HandoutQuestion(question, "fuzzy");
        } else if (event.key === "3" && !retired) {
          event.preventDefault();
          markCs408HandoutQuestion(question, "fail");
        } else if (event.key === "4") {
          event.preventDefault();
          toggleRetired(question);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const strip = pageNumbers.current;
    const active = activePage.current;
    if (!strip || !active) return;
    const viewport = strip.getBoundingClientRect();
    const button = active.getBoundingClientRect();
    if (button.left < viewport.left) strip.scrollLeft += button.left - viewport.left;
    if (button.right > viewport.right) strip.scrollLeft += button.right - viewport.right;
  }, [questionIndex, scene.id, knowledgeSection]);

  if (knowledgeSection) {
    const returnParams = new URLSearchParams(search);
    returnParams.delete("knowledge");
    returnParams.delete("node");
    if (!returnParams.has("scene") && !returnParams.has("q")) returnParams.set("scene", knowledgeSection.id);
    return <Cs408FileKnowledge key={`${knowledgeSection.id}-${search.get("node") ?? ""}`} section={knowledgeSection}
      initialNode={search.get("node")} backHref={`?${returnParams}`} hrefFor={knowledgeHref} />;
  }

  function toggleRetired(item: Cs408HandoutQuestion) {
    const target = cs408HandoutProgressTarget(item);
    if (!target) return;
    const kg = useKgProgress.getState();
    if (progress.marks.get(item.id)?.retired) kg.unretireItem(item.id);
    else {
      kg.retireItem(target);
      if (hideRetired) openPage({ scene: scene.id, q: nextQuestion?.id ?? queue[questionIndex - 1]?.id });
    }
  }

  function toggleHidden() {
    if (!hideRetired && question && progress.marks.get(question.id)?.retired) {
      const nextVisible = queue.find((q, index) => index > questionIndex && !progress.marks.get(q.id)?.retired);
      openPage({ scene: scene.id, q: nextVisible?.id });
    }
    setHideRetired(value => !value);
  }

  const kindNav = <QuestionKindNav kind={kind} replace hrefFor={id =>
    id === kind ? `?${search}` : `?kind=${id}&scene=${scene.id}`
  } />;

  const controls = (
    <>
      <div className="mh-seg" aria-label="题目排序">
        <button type="button" aria-pressed={priority === "exam"} className={priority === "exam" ? "is-active" : ""} onClick={() => setPriority("exam")}>真题优先</button>
        <button type="button" aria-pressed={priority === "wangdao"} className={priority === "wangdao" ? "is-active-880" : ""} onClick={() => setPriority("wangdao")}>王道优先</button>
      </div>
      <button type="button" className="mh-btn w-full justify-center" aria-pressed={allSteps}
        onClick={() => { setAllSteps(value => !value); setStepOverrides({}); }}>
        {allSteps ? "全部收起步骤" : "全部展开步骤"} <kbd className="mh-kbd">Space</kbd>
      </button>
      {retiredCount > 0 && <button type="button" className="mh-btn mh-btn-subtle w-full justify-center" aria-pressed={hideRetired} onClick={toggleHidden}>
        {hideRetired ? "显示已斩" : "隐藏已斩"}（{retiredCount}）
      </button>}
    </>
  );

  const fileChapter = chapter.id === FILE_CHAPTER_ID;
  const currentKnowledge = fileChapter ? findFileKnowledgeSection(scene.id) : undefined;
  const navScenes = fileChapter ? chapter.kps : scenes;
  const sceneList = (
    <nav className="mh-scene-nav" aria-label="判别场景导航">
      {navScenes.map(kp => {
        const items = questions.get(kp.id) ?? EMPTY;
        const passed = progress.passed(items);
        const due = items.filter(q => progress.due.has(q.id)).length;
        const knowledge = fileChapter ? findFileKnowledgeSection(kp.id) : undefined;
        const practice = scenes.includes(kp);
        const active = scene.id === kp.id;
        const button = practice ? (
          <button type="button" aria-current={active ? "true" : undefined}
            className={cn("mh-scene-item", active && "is-active", knowledge && "cfk-scene-practice")} onClick={() => openPage({ scene: kp.id })}>
            <span>{kp.name}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5">
              {due > 0 && <span className="mh-scene-due-badge">待复习 {due}</span>}
              <span className={cn("mh-scene-prog", items.length > 0 && passed === items.length && "is-done")}>
                {items.length > 0 && passed === items.length ? <Check className="h-4 w-4" aria-label="全部已会" /> : `${passed}/${items.length}`}
              </span>
            </span>
          </button>
        ) : <span className="cfk-scene-name">{kp.name}</span>;

        return knowledge ? (
          <div key={kp.id} className="cfk-scene-row">
            {button}
            <Link to={knowledgeHref(kp.id)} state={{ openedFileKnowledge: true }} className="cfk-entry"
              aria-label={`${kp.name} · 知识点`}>知识点</Link>
          </div>
        ) : <div key={kp.id}>{button}</div>;
      })}
    </nav>
  );

  return (
    <div className="mh-layout">
      <h1 className="sr-only">{chapter.bookName} · {chapter.name}</h1>
      <aside className="mh-toc">
        <Link to={directoryHref} className="mh-toc-back">← 返回{chapter.bookName}目录</Link>
        <p className="mh-toc-title">{chapter.name}</p>
        <p className="mh-toc-meta">{chapter.bookName} · 已会 {progress.passed(allQuestions)}/{allQuestions.length}</p>
        <div className="my-3">{kindNav}</div>
        <div className="mh-toc-label">判别场景</div>
        {sceneList}
        <div className="mh-toc-group space-y-2">{controls}</div>
      </aside>
      <div className="mh-main">
        <div className="mh-mobile-bar gap-3">
          <div className="mh-mobile-head">
            <Link to={directoryHref} className="mh-toc-back">← 返回{chapter.bookName}目录</Link>
            <span className="mh-mobile-title">{chapter.name}</span>
          </div>
          {kindNav}
          {currentKnowledge && <Link to={knowledgeHref(currentKnowledge.id)} state={{ openedFileKnowledge: true }}
            className="mh-btn">本小节知识点</Link>}
          <details ref={mobileSettings} className="w-full rounded-lg border border-[var(--mh-line)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold">判别场景与设置</summary>
            <div className="mt-2 space-y-2">{sceneList}{controls}</div>
          </details>
        </div>
        <section className="mh-stage scroll-mt-20 focus:outline-none" ref={stage} tabIndex={-1} aria-label={scene.name}>
          <div className="mh-stage-header">
            <div className="mh-stage-title-row">
              <h2 className="mh-stage-title">{scene.name}</h2>
              <span className="mh-stage-status">{question ? `第 ${questionIndex + 1} / ${queue.length} 题` : "核心讲解"} · 已会 {progress.passed(candidates)}/{candidates.length}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" aria-current={!question ? "step" : undefined}
                className={cn("mh-q-dot is-guide-dot shrink-0", !question && "is-current")} onClick={() => openPage({ scene: scene.id })}>
                <BookOpen className="h-3.5 w-3.5" />讲解
              </button>
              <div ref={pageNumbers} className="mh-q-dots min-w-0 !flex-nowrap overflow-x-auto pb-1" role="navigation" aria-label="本场景题号">
                {queue.map((item, index) => {
                  const record = progress.marks.get(item.id);
                  const due = progress.due.has(item.id);
                  const active = question?.id === item.id;
                  const label = `第 ${index + 1} 页 · ${handoutQuestionLabel(item)}${due ? " · 待复习" : ""}`;
                  return (
                    <button key={item.id} ref={active ? activePage : undefined} type="button" title={label} aria-label={label}
                      aria-current={active ? "step" : undefined}
                      className={cn("mh-q-dot shrink-0", active && "is-current", item.source === "exam" && "is-exam-badge",
                        due ? "is-due" : record?.retired ? "is-retired" : record?.mark && `is-${record.mark}`)}
                      onClick={() => openPage({ scene: scene.id, q: item.id })}>
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mh-stage-body">
            {question ? (
              <Cs408HandoutQuestionPage key={question.id} question={question} record={progress.marks.get(question.id)} lesson={lesson}
                stepsOpen={stepsOpen} onToggleSteps={flipSteps} onMark={markCs408HandoutQuestion} onToggleRetired={toggleRetired} />
            ) : (
              <>
                <Cs408HandoutGuide key={`${scene.id}-${kind}`} kpId={scene.id} kind={kind} questions={queue}
                  onOpenQuestion={item => openPage({ scene: scene.id, q: item.id })} />
                {!candidates.length && <p className="text-sm text-[var(--mh-muted)]">本场景暂无该题型的题目。</p>}
              </>
            )}
          </div>
          <div className="mh-stage-footer">
            <button type="button" className="mh-step-nav-btn" disabled={!prevPage} onClick={() => prevPage && openPage(prevPage)}>
              <ChevronLeft className="h-4 w-4" />{questionIndex === 0 ? "核心讲解" : "上一题"}
            </button>
            <span className="mh-stage-kbd-hint"><kbd className="mh-kbd">←</kbd> <kbd className="mh-kbd">→</kbd> 切页{question && <> · <kbd className="mh-kbd">Space</kbd> 显隐步骤 · <kbd className="mh-kbd">1</kbd>-<kbd className="mh-kbd">4</kbd> 会/模糊/不会/斩掉</>}</span>
            {nextPage ? (
              <button type="button" className="mh-step-nav-btn is-primary" onClick={() => openPage(nextPage)}>
                {nextQuestion ? (question ? "下一题" : "开始刷题（第 1 题）") : `下一场景：${nextScene.name}`}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : <Link className="mh-step-nav-btn" to={directoryHref}>返回{chapter.bookName}目录</Link>}
          </div>
        </section>
      </div>
    </div>
  );
}
