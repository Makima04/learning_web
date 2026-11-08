import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ExternalLink, Eye, EyeOff, Lightbulb, Play, Route, ScanLine } from "lucide-react";
import { findKp } from "@/data/kg";
import { MATH_EXTREMA_REVIEW } from "@/data/kg/mathExtremaReview";
import { MathFormula } from "@/components/MathFormula";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { syncAccountData } from "@/lib/accountSync";
import { hydratePracticeItems } from "@/lib/kg/catalogLoad";
import { REVIEW_SOURCE_LABELS, resolveReviewLesson, type KnowledgeReview, type ReviewBlock, type ReviewLesson, type ReviewReference } from "@/lib/kg/knowledgeReview";
import { MATH1_ITEMS, parseMath1Kind } from "@/lib/kg/math1Analysis";
import { useDrillCatalog } from "@/lib/kg/mathPractice";
import { kgKpPath, reviewPriorityPath } from "@/lib/kg/paths";
import { reviewQuestionHref } from "@/lib/kg/reviewPriority";
import { applyWangdaoPractice, toggleWangdaoCollect } from "@/lib/kg/wangdaoPractice";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { cn } from "@/lib/utils";
import { PracticeQuestionCard } from "@/pages/practiceQuestion";
import { useAuth } from "@/stores/auth";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";

function ReviewBlocks({ blocks }: { blocks: ReviewBlock[] }) {
  return (
    <div className="min-w-0 space-y-2 text-sm leading-7">
      {blocks.map((block, index) => {
        if (block.type === "math") return <MathFormula key={index} tex={block.tex} />;
        if (block.type === "table") return (
          <div key={index} className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-xs leading-6">
              <thead><tr>{block.headers.map((header, at) => <th key={at} scope="col" className="border-b border-border px-2 py-2 font-semibold text-muted-foreground">{header}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, at) => <tr key={at}>{row.map((cell, col) => <td key={col} className="border-b border-border/50 px-2 py-2 last:tabular-nums">{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

function ExamLinks({ questionId }: { questionId: string }) {
  const question = MATH1_ITEMS.find((q) => q.id === questionId);
  if (!question) return <span className="text-xs text-muted-foreground">原题暂不可用</span>;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-primary">
      <a className="inline-flex items-center gap-1 hover:underline" href={reviewQuestionHref("math", question)} target="_blank" rel="noreferrer">
        打开原题<ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
      <a className="inline-flex items-center gap-1 hover:underline" href={reviewQuestionHref("math", question, true)} target="_blank" rel="noreferrer">
        参考解析<ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}

function ReferenceList({ references, onPractice, busyId, catalogReady, catalogError }: {
  references: ReviewReference[];
  onPractice: (id: string) => void;
  busyId: string | null;
  catalogReady: boolean;
  catalogError: string;
}) {
  return (
    <section aria-labelledby="review-references-title">
      <h2 id="review-references-title" className="text-sm font-extrabold">配套题：各补一处变化</h2>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">真题 → 李林综合大题 → 张宇强化题</p>
      <div className="mt-1 divide-y divide-border/60">
        {references.map((ref, index) => {
          const exam = ref.source === "exam" ? MATH1_ITEMS.find((q) => q.id === ref.questionId) : undefined;
          const label = ref.source === "exam" ? (exam ? `${exam.year} 年 · 第 ${exam.n} 题` : ref.questionId) : ref.label;
          return (
            <div key={ref.questionId} className="space-y-2 py-4">
              <p className="text-[11px] font-bold text-primary">{index === 0 ? "主例" : "补变化"} · {REVIEW_SOURCE_LABELS[ref.source]}</p>
              <h3 className="text-xs font-bold leading-6">{label}</h3>
              <p className="text-xs leading-6 text-muted-foreground">{ref.purpose}</p>
              {ref.source === "exam" ? <ExamLinks questionId={ref.questionId} /> : (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" disabled={busyId !== null || !catalogReady} onClick={() => onPractice(ref.questionId)}>
                  <Play className="h-3 w-3" aria-hidden="true" />{busyId === ref.questionId ? "正在加载…" : !catalogReady && !catalogError ? "目录加载中…" : "练这道题"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {catalogError && <p role="alert" className="text-xs leading-6 text-ink-danger">配套题目录加载失败：{catalogError}。可刷新重试，知识内容与真题仍可查看。</p>}
    </section>
  );
}

/** 遮挡、展开及口头自测只控制当前阅读；真正的练习评分复用已有账号写路径。 */
function LessonContent({ lesson, items, catalogError }: { lesson: ReviewLesson; items: WangdaoItem[] | null; catalogError: string }) {
  const [recall, setRecall] = useState(false);
  const [working, setWorking] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [practice, setPractice] = useState<WangdaoItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [practiceError, setPracticeError] = useState("");
  const requestId = useRef(0);
  const practiceRef = useRef<HTMLDivElement>(null);
  const marks = useKgProgress((s) => s.itemMarks);
  const entries = useJournal((s) => s.entries);
  const userId = useAuth((s) => s.user?.id);
  const loggedIn = useAuth((s) => s.loggedIn);
  const question = MATH1_ITEMS.find((q) => q.id === lesson.examId);

  useEffect(() => {
    requestId.current++;
    setPractice(null);
    setBusyId(null);
    setNotice("");
    setPracticeError("");
    return () => { requestId.current++; };
  }, [userId, loggedIn]);

  useEffect(() => {
    if (practice) practiceRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [practice?.id]);

  async function openPractice(id: string) {
    const item = items?.find((q) => q.id === id);
    if (!item) { setPracticeError("这道配套题暂未在目录中找到，请刷新后重试。"); return; }
    const request = ++requestId.current;
    setBusyId(id);
    setPracticeError("");
    setNotice("");
    try {
      const [full] = await hydratePracticeItems([item]);
      if (request !== requestId.current) return;
      setPractice(full);
    } catch (error: unknown) {
      if (request === requestId.current) setPracticeError(error instanceof Error ? error.message : "题目加载失败，请重试。");
    } finally {
      if (request === requestId.current) setBusyId(null);
    }
  }

  return (
    <>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="min-w-0">
          <CardContent className="space-y-6 p-5 md:p-6">
            <section aria-labelledby="review-recognition-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="review-recognition-title" className="flex items-center gap-2 text-sm font-extrabold"><ScanLine className="h-4 w-4 text-primary" aria-hidden="true" />从题目识别</h2>
                <span className="text-xs text-muted-foreground">{question ? `${question.year} 年 · 第 ${question.n} 题` : lesson.label}</span>
              </div>
              <div className="mt-3 rounded-xl bg-secondary/45 p-4"><ReviewBlocks blocks={lesson.prompt} /></div>
              <div className="mt-3"><ExamLinks questionId={lesson.examId} /></div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:gap-4">
                <h3 className="shrink-0 text-xs font-bold leading-7 text-primary">识别信号</h3>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">{lesson.signals.map((signal) => <span key={signal} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{signal}</span>)}</div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{lesson.recognition}</p>
                </div>
              </div>
            </section>

            <section aria-labelledby="review-route-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="review-route-title" className="flex items-center gap-2 text-sm font-extrabold"><Route className="h-4 w-4 text-primary" aria-hidden="true" />解题路线</h2>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" aria-expanded={!recall} aria-controls="review-route-steps" onClick={() => setRecall((v) => !v)}>
                  {recall ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}{recall ? "显示路线，核对回忆" : "遮住路线，先回忆"}
                </Button>
              </div>
              {recall && <p className="mt-3 rounded-xl bg-secondary/45 p-5 text-sm leading-7 text-muted-foreground">看到这些条件，你会先算什么？候选点从哪里找？最后用什么理由下结论？</p>}
              <div id="review-route-steps" hidden={recall}>
                <ol className="mt-4 space-y-5">
                  {lesson.steps.map((step, index) => (
                    <li key={step.title} className="flex min-w-0 gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-extrabold tabular-nums text-primary">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold leading-6">{step.title}</h3>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">{step.action}</p>
                        {working && <div className="mt-3 min-w-0 rounded-xl bg-secondary/40 p-3 md:p-4"><ReviewBlocks blocks={step.working} /></div>}
                      </div>
                    </li>
                  ))}
                </ol>
                <Button variant="outline" size="sm" className="mt-5 gap-1.5 text-xs" aria-expanded={working} onClick={() => setWorking((v) => !v)}>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", working && "rotate-180")} aria-hidden="true" />{working ? "收起演算，只看路线" : "展开本题演算"}
                </Button>
                <p className="mt-5 rounded-xl bg-warning/10 p-3 text-xs leading-6 text-ink-warning"><span className="font-bold">收尾检查：</span>{lesson.checkpoint.replace(/^收尾检查：/, "")}</p>
              </div>
            </section>

            <section aria-labelledby="review-check-title" className="border-t border-border/60 pt-5">
              <h2 id="review-check-title" className="text-xs font-extrabold text-primary">停一下，检验路线</h2>
              <p className="mt-2 text-sm leading-7">{lesson.selfCheck.question}</p>
              <div role="group" aria-label="自测选项" className="mt-3 flex flex-wrap gap-2">
                {lesson.selfCheck.options.map((option, index) => (
                  <Button key={option} variant={answer === index ? "secondary" : "outline"} size="sm" className="h-auto min-h-9 whitespace-normal py-2 text-left text-xs" aria-pressed={answer === index} onClick={() => setAnswer(index)}>{option}</Button>
                ))}
              </div>
              {answer !== null && <p role="status" className={cn("mt-3 rounded-xl p-3 text-xs leading-6", answer === lesson.selfCheck.correctIndex ? "bg-success/10 text-ink-success" : "bg-warning/10 text-ink-warning")}>{answer === lesson.selfCheck.correctIndex ? "判断正确。" : "再看一下。"}{lesson.selfCheck.explanation}</p>}
            </section>
          </CardContent>
        </Card>

        <Card className="min-w-0 xl:sticky xl:top-5">
          <CardContent className="space-y-6 p-5">
            <section aria-labelledby="review-technique-title">
              <h2 id="review-technique-title" className="flex items-center gap-2 text-sm font-extrabold"><Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />具体技巧<span className="ml-auto text-[11px] font-normal text-muted-foreground">按需展开</span></h2>
              <div className="mt-2 divide-y divide-border/60">
                {lesson.techniques.map((technique) => (
                  <details key={technique.title} className="group py-3">
                    <summary className="cursor-pointer text-xs font-bold leading-6 marker:text-primary">{technique.title}</summary>
                    <div className="mt-3 min-w-0 text-muted-foreground"><ReviewBlocks blocks={technique.content} /></div>
                  </details>
                ))}
              </div>
            </section>
            <ReferenceList references={lesson.references} onPractice={(id) => void openPractice(id)} busyId={busyId} catalogReady={items !== null} catalogError={catalogError} />
          </CardContent>
        </Card>
      </div>

      {practiceError && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-ink-danger">{practiceError}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-success/10 p-4 text-sm text-ink-success"><Check className="h-4 w-4 shrink-0" aria-hidden="true" />{notice}</p>}
      {practice && (
        <section ref={practiceRef} aria-label="配套题作答" className="scroll-mt-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold"><BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />用配套题检验这条路线</h2>
          <PracticeQuestionCard
            key={practice.id}
            item={practice}
            index={0}
            total={1}
            mark={marks.find((m) => m.itemId === practice.id)?.mark}
            collected={entries.some((entry) => entry.sourceItemId === practice.id && entry.status === "active")}
            onCollect={() => toggleWangdaoCollect(practice, !entries.some((entry) => entry.sourceItemId === practice.id && entry.status === "active"))}
            onMark={(mark) => {
              applyWangdaoPractice(practice, mark);
              setNotice("已记录这道题的练习结果，图谱掌握度与错题复习已更新。");
              setPractice(null);
            }}
            onExit={() => setPractice(null)}
          />
        </section>
      )}
    </>
  );
}

function KnowledgeReviewContent({ template }: { template: KnowledgeReview }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { route, lesson } = resolveReviewLesson(template, params.get("route"), params.get("example"));
  const { items, error } = useDrillCatalog("math");
  const loggedIn = useAuth((s) => s.loggedIn);
  const userId = useAuth((s) => s.user?.id);
  const load = useKgProgress((s) => s.load);
  const [syncError, setSyncError] = useState("");
  const found = findKp(template.kpId);
  const returnParams = new URLSearchParams({ subject: "math", book: found?.book.id ?? "calc", kind: parseMath1Kind(params.get("kind")), kp: template.kpId });
  const order = params.get("order");
  if (order === "personal" || order === "recent" || order === "frequency") returnParams.set("order", order);

  useEffect(() => {
    load();
    setSyncError("");
    let cancelled = false;
    // 与原复习入口一致：先推 pending 再拉权威快照，支持直接打开知识深链。
    if (loggedIn) void syncAccountData().catch(() => { if (!cancelled) setSyncError("账号同步暂未完成，当前显示已有记录，可稍后重试。"); });
    return () => { cancelled = true; };
  }, [load, loggedIn, userId]);

  function choose(routeId: string, exampleId?: string) {
    const next = new URLSearchParams(params);
    next.set("route", routeId);
    if (exampleId) next.set("example", exampleId);
    else next.delete("example");
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 md:p-6 md:pb-16">
      <header>
        <Link to={`/review-priority?${returnParams}`} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />返回复习性价比</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-primary">知识复习 · 高等数学 · 多元函数</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{template.title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1 text-xs"><Link to={kgKpPath(template.kpId, { subject: "math", returnTo: location.pathname + location.search + location.hash })}>考点与全部练习<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></Button>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="rounded-xl bg-secondary/50 p-4 text-sm leading-7"><span className="mr-3 font-bold">读题先问两句</span>{template.opening}</div>
          <div role="group" aria-label="选择解题路线" className="grid gap-2 sm:grid-cols-3">
            {template.routes.map((item, index) => (
              <button key={item.id} type="button" aria-pressed={item.id === route.id} onClick={() => choose(item.id)} className={cn("flex min-w-0 items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:block sm:p-4", item.id === route.id ? "border-primary/60 bg-accent/60" : "border-border/70 bg-card-soft/30 hover:border-primary/40 hover:bg-secondary/40")}>
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold sm:mb-2", item.id === route.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{index + 1}</span>
                <span><span className="block text-sm font-bold">{item.title}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">“{item.cue}”</span></span>
              </button>
            ))}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">{template.scope}</p>
          {route.lessons.length > 1 && (
            <div role="group" aria-label="选择真题例子" className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
              {route.lessons.map((item) => <Button key={item.id} variant={item.id === lesson.id ? "default" : "outline"} size="sm" className="text-xs" aria-pressed={item.id === lesson.id} onClick={() => choose(route.id, item.id)}>{item.label}</Button>)}
            </div>
          )}
        </CardContent>
      </Card>

      {syncError && <p role="status" className="text-xs text-ink-warning">{syncError}</p>}
      <LessonContent key={lesson.id} lesson={lesson} items={items} catalogError={error} />
    </div>
  );
}

export function KnowledgeReviewPage() {
  const { kpId = "" } = useParams();
  if (kpId === MATH_EXTREMA_REVIEW.kpId) return <KnowledgeReviewContent template={MATH_EXTREMA_REVIEW} />;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-extrabold">这个考点的知识模板还在整理中</h1>
      <p className="text-sm text-muted-foreground">先从已整理的“求极值与最值”复习，或返回考点选择练习。</p>
      <Button asChild variant="outline"><Link to={reviewPriorityPath("math")}>返回复习性价比</Link></Button>
    </div>
  );
}
