import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpen, Check, ChevronDown, ChevronRight, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XIAO_SUBJECTS,
  XIAO_SUBJECT_LABEL,
  findKp,
  findChapter,
  chaptersForSubject,
  kpsForSubject,
  loadXiaoCatalog,
  loadXiaoSubject,
  normalizeXiaoAnswer,
  optionKeys,
  parseXiaoSubject,
  parseChapterRouteParam,
  kpMarkId,
  isXiaoDue,
  questionsForKp,
  questionsForSubject,
  hasKpExplain,
  xiaoPath,
  type XiaoChapterGroup,
  type XiaoKp,
  type XiaoKind,
  type XiaoMarkLevel,
  type XiaoQuestion,
  type XiaoSubject,
  type XiaoCatalog,
  type XiaoPack,
} from "@/lib/politics/xiao";
import { ApiError, type XiaoBriefResult } from "@/lib/api";
import { loadXiaoBrief, peekXiaoBrief } from "@/lib/politics/xiaoBrief";
import { useAuth } from "@/stores/auth";
import { usePolitics } from "@/stores/politics";
import { cn } from "@/lib/utils";

const MARKS: { id: XiaoMarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "会", cls: "bg-emerald-600 text-white" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
];

export function PoliticsXiaoPage() {
  const { subject: rawSubject, kpId: rawKp, chapterNo: rawChapter } = useParams<{
    subject?: string;
    kpId?: string;
    chapterNo?: string;
  }>();
  const loggedIn = useAuth((s) => s.loggedIn);
  const load = usePolitics((s) => s.load);
  const syncFromServer = usePolitics((s) => s.syncFromServer);
  const [catalog, setCatalog] = useState<XiaoCatalog | null>(null);
  const [pack, setPack] = useState<XiaoPack | null>(null);
  const [packSubject, setPackSubject] = useState<XiaoSubject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subject = parseXiaoSubject(rawSubject);
  const kpId = rawKp ? decodeURIComponent(rawKp) : undefined;
  const chapterNo = parseChapterRouteParam(rawChapter);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (loggedIn) void syncFromServer();
  }, [loggedIn, syncFromServer]);
  useEffect(() => {
    let alive = true;
    setError(null);
    if (subject) {
      setPack(null);
      setPackSubject(null);
    }
    const request = subject ? loadXiaoSubject(subject) : loadXiaoCatalog();
    request
      .then((data) => {
        if (!alive) return;
        if (subject) {
          setPack(data as XiaoPack);
          setPackSubject(subject);
        }
        else setCatalog(data as XiaoCatalog);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [subject]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button asChild variant="link" className="px-0">
          <Link to="/politics">返回政治</Link>
        </Button>
      </div>
    );
  }
  const readyPack = subject && packSubject === subject ? pack : null;

  if (subject && !readyPack) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted-foreground">加载肖 1000…</div>
    );
  }
  if (!subject && !catalog) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted-foreground">加载肖 1000 目录…</div>
    );
  }
  if (subject && kpId) {
    if (!readyPack) return null;
    const kp = findKp(readyPack.kps, kpId);
    if (!kp || kp.subject !== subject) {
      return (
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
          <p className="text-sm text-destructive">没有这个考点</p>
          <Button asChild variant="outline">
            <Link to={xiaoPath(subject)}>返回{XIAO_SUBJECT_LABEL[subject]}</Link>
          </Button>
        </div>
      );
    }
    return (
      <KpView
        kp={kp}
        questions={questionsForKp(readyPack.questions, kp.id)}
        subject={subject}
      />
    );
  }
  if (subject && rawChapter !== undefined) {
    if (!readyPack) return null;
    if (chapterNo === undefined) {
      return (
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
          <p className="text-sm text-destructive">没有这一章</p>
          <Button asChild variant="outline">
            <Link to={xiaoPath(subject)}>返回{XIAO_SUBJECT_LABEL[subject]}</Link>
          </Button>
        </div>
      );
    }
    const chapters = chaptersForSubject(
      kpsForSubject(readyPack.kps, subject),
      questionsForSubject(readyPack.questions, subject)
    );
    const chapter = findChapter(chapters, chapterNo);
    if (!chapter) {
      return (
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
          <p className="text-sm text-destructive">没有这一章</p>
          <Button asChild variant="outline">
            <Link to={xiaoPath(subject)}>返回{XIAO_SUBJECT_LABEL[subject]}</Link>
          </Button>
        </div>
      );
    }
    return (
      <ChapterView
        subject={subject}
        chapter={chapter}
        questions={questionsForSubject(readyPack.questions, subject)}
      />
    );
  }
  if (subject) {
    if (!readyPack) return null;
    return (
      <SubjectView
        subject={subject}
        kps={kpsForSubject(readyPack.kps, subject)}
        questions={questionsForSubject(readyPack.questions, subject)}
      />
    );
  }
  return <Hub catalog={catalog!} />;
}

function Hub({ catalog }: { catalog: XiaoCatalog }) {
  const xiaoMarks = usePolitics((s) => s.xiaoMarks);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link to="/politics" className="hover:underline">
            考研政治
          </Link>
          <span className="mx-1">/</span>
          肖 1000
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">先看考点，再做对应题</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每天一小时：打开一章卡片看两分钟，立刻刷该章选择。不要整科学完再进题库。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {XIAO_SUBJECTS.map((s) => {
          const info = catalog.subjects.find((item) => item.id === s.id);
          const subjectPrefix = `xiao-${s.id}-`;
          const marked = Object.values(xiaoMarks).filter((mark) => mark.itemId.startsWith(subjectPrefix));
          const done = marked.filter((mark) => mark.mark === "pass").length;
          const due = marked.filter((mark) => isXiaoDue(mark.nextReviewOn)).length;
          return (
            <Link key={s.id} to={xiaoPath(s.id)} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    {s.label}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>{s.hint}</p>
                  <p className="mt-2">
                    {info?.kpCount ?? 0} 个考点 · {info?.questionCount ?? 0} 题
                    {(info?.questionCount ?? 0) > 0 ? ` · 会 ${done}` : ""}
                    {due ? ` · 今日复习 ${due}` : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SubjectView({
  subject,
  kps,
  questions,
}: {
  subject: XiaoSubject;
  kps: XiaoKp[];
  questions: XiaoQuestion[];
}) {
  const xiaoMarks = usePolitics((s) => s.xiaoMarks);
  const chapters = useMemo(() => chaptersForSubject(kps, questions), [kps, questions]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link to="/politics" className="hover:underline">
            考研政治
          </Link>
          <span className="mx-1">/</span>
          <Link to={xiaoPath()} className="hover:underline">
            肖 1000
          </Link>
          <span className="mx-1">/</span>
          {XIAO_SUBJECT_LABEL[subject]}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{XIAO_SUBJECT_LABEL[subject]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">先选大章，再进小考点。</p>
      </div>
      <div className="space-y-3">
        {chapters.map((chapter) => {
          const done = chapter.kps.reduce(
            (n, kp) => n + questionsForKp(questions, kp.id).filter((q) => xiaoMarks[q.id]?.mark === "pass").length,
            0
          );
          const due = chapter.kps.some((kp) => isXiaoDue(xiaoMarks[kpMarkId(kp.id)]?.nextReviewOn));
          return (
            <Link
              key={`${chapter.chapter_no ?? "unknown"}-${chapter.chapter}`}
              to={xiaoPath(subject, { chapter: chapter.chapter_no })}
              className="block"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{chapter.chapter}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {chapter.kps.length} 个考点 · {chapter.questionCount} 题
                      {done ? ` · 会 ${done}` : ""}
                      {due ? " · 今日复习" : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ChapterView({
  subject,
  chapter,
  questions,
}: {
  subject: XiaoSubject;
  chapter: XiaoChapterGroup;
  questions: XiaoQuestion[];
}) {
  const xiaoMarks = usePolitics((s) => s.xiaoMarks);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link to="/politics" className="hover:underline">
            考研政治
          </Link>
          <span className="mx-1">/</span>
          <Link to={xiaoPath()} className="hover:underline">
            肖 1000
          </Link>
          <span className="mx-1">/</span>
          <Link to={xiaoPath(subject)} className="hover:underline">
            {XIAO_SUBJECT_LABEL[subject]}
          </Link>
          <span className="mx-1">/</span>
          {chapter.chapter}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{chapter.chapter}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {chapter.kps.length} 个考点 · {chapter.questionCount} 题 · 打开卡片学完立刻刷题
        </p>
      </div>
      <div className="space-y-2">
        {chapter.kps.map((kp) => {
          const qs = questionsForKp(questions, kp.id);
          const done = qs.filter((q) => xiaoMarks[q.id]?.mark === "pass").length;
          const fail = qs.filter((q) => xiaoMarks[q.id]?.mark === "fail").length;
          const due = isXiaoDue(xiaoMarks[kpMarkId(kp.id)]?.nextReviewOn);
          return (
            <Link key={kp.id} to={xiaoPath(subject, kp.id)} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{kp.name}</p>
                    {kp.summary ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{kp.summary}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {qs.length} 题 · 会 {done}
                      {fail ? ` · 不会 ${fail}` : ""}
                      {due ? " · 今日复习" : ""}
                      {kp.provisional ? " · 先按章刷，细考点稍后补上" : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function KpView({
  kp,
  questions,
  subject,
}: {
  kp: XiaoKp;
  questions: XiaoQuestion[];
  subject: XiaoSubject;
}) {
  const [phase, setPhase] = useState<"card" | "quiz">("card");
  const [kind, setKind] = useState<XiaoKind | "all">("all");
  const pool = useMemo(
    () => (kind === "all" ? questions : questions.filter((q) => q.kind === kind)),
    [questions, kind]
  );
  const chapterPath = xiaoPath(subject, { chapter: kp.chapter_no });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link to={xiaoPath(subject)} className="hover:underline">
            {XIAO_SUBJECT_LABEL[subject]}
          </Link>
          <span className="mx-1">/</span>
          <Link to={chapterPath} className="hover:underline">
            {kp.chapter}
          </Link>
          <span className="mx-1">/</span>
          {kp.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{kp.name}</h1>
      </div>

      {phase === "card" ? (
        <LearnCard kp={kp} count={questions.length} onStart={() => setPhase("quiz")} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "single", "multi"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kind === k ? "default" : "outline"}
                onClick={() => setKind(k)}
              >
                {k === "all" ? "全部" : k === "single" ? "单选" : "多选"}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setPhase("card")}>
              回看卡片
            </Button>
          </div>
          {pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">这一类还没有题</p>
          ) : (
            <QuizQueue key={kind} kpId={kp.id} items={pool} />
          )}
        </>
      )}
    </div>
  );
}

function LearnCard({
  kp,
  count,
  onStart,
}: {
  kp: XiaoKp;
  count: number;
  onStart: () => void;
}) {
  const markXiao = usePolitics((s) => s.markXiao);
  const kpMark = usePolitics((s) => s.xiaoMarks[kpMarkId(kp.id)]);
  const explainRef = useRef<HTMLElement>(null);
  const deep = hasKpExplain(kp);
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  function scrollToExplain() {
    explainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (!deep) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "ArrowDown") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      const el = explainRef.current;
      if (!el) return;
      if (el.getBoundingClientRect().top <= 96) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deep]);

  const condensed = (
    <div className="space-y-4">
      {kp.summary ? <p className="text-base leading-relaxed">{kp.summary}</p> : null}
      {kp.bullets.length > 0 ? (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {kp.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          细考点卡片还在整理。先用本章题目当讲义：做完一对解析，把错项对应的那句话记下来。
        </p>
      )}
      {kp.confusions.length > 0 ? (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">容易混</p>
          {kp.confusions.map((c) => (
            <p key={c.wrong}>
              <span className="text-destructive">不是</span> {c.wrong}
              <span className="mx-1 text-muted-foreground">→</span>
              <span className="text-emerald-700 dark:text-emerald-400">而是</span> {c.right}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );

  const actions = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">这张卡现在：</span>
        {MARKS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              m.cls,
              kpMark?.mark === m.id && "ring-2 ring-offset-2 ring-primary"
            )}
            onClick={() => markXiao(kpMarkId(kp.id), m.id, "", kp.id)}
          >
            {m.label}
          </button>
        ))}
        {kpMark?.nextReviewOn ? (
          <span className="text-xs text-muted-foreground">下次：{kpMark.nextReviewOn}</span>
        ) : null}
      </div>
      <Button className="w-full gap-2" onClick={onStart} disabled={count <= 0}>
        <BookOpen className="h-4 w-4" />
        学完，刷这 {count} 题
      </Button>
    </div>
  );

  if (!deep) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          {condensed}
          {actions}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex min-h-[calc(100dvh-17.5rem)] flex-col md:min-h-[calc(100dvh-11rem)]">
        <CardContent className="flex flex-1 flex-col p-5">
          <div className="flex-1 space-y-4">{condensed}</div>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={scrollToExplain}
              className="flex w-full flex-col items-center gap-0.5 text-xs text-muted-foreground"
            >
              <span>上滑看解释</span>
              <ChevronDown className="h-4 w-4 animate-bounce" />
            </button>
            {actions}
          </div>
        </CardContent>
      </Card>
      <section ref={explainRef} className="scroll-mt-20 space-y-3 pt-2">
        <Card>
          <CardContent className="space-y-6 p-5">
            <p className="text-xs font-medium text-muted-foreground">为什么是这样</p>
            {(kp.explain ?? []).map((sec) => (
              <div key={sec.title} className="space-y-2">
                <h3 className="text-sm font-semibold tracking-tight">{sec.title}</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{sec.body}</p>
                {sec.simple ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">简单说：</span>
                    {sec.simple}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
        {(kp.checks?.length ?? 0) > 0 ? (
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="text-xs font-medium text-muted-foreground">看完点一下，确认有没有分清</p>
              {(kp.checks ?? []).map((c, i) => {
                const choice = picked[i];
                const answered = choice !== undefined;
                const ok = answered && choice === c.answer;
                return (
                  <div key={c.prompt} className="space-y-2 rounded-md border p-3">
                    <p className="text-sm leading-relaxed">{c.prompt}</p>
                    <div className="flex gap-2">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm",
                            !answered && "hover:bg-muted/60",
                            answered && choice === v && (ok ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-400/10" : "border-destructive bg-destructive/10"),
                            answered && choice !== v && "opacity-50"
                          )}
                          onClick={() => setPicked((prev) => ({ ...prev, [i]: v }))}
                        >
                          {v ? "对" : "错"}
                        </button>
                      ))}
                    </div>
                    {answered ? (
                      <p
                        className={cn(
                          "text-xs leading-relaxed",
                          ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
                        )}
                      >
                        {ok ? "对" : "再看一眼"}
                        {c.why ? ` · ${c.why}` : ""}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </>
  );
}

function XiaoBriefView({ brief }: { brief: XiaoBriefResult }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <p className="text-sm font-medium leading-relaxed">{brief.key}</p>
      {brief.trap ? <p className="text-xs leading-relaxed text-muted-foreground">易混：{brief.trap}</p> : null}
      <ul className="space-y-1 text-sm leading-relaxed">
        {(brief.options ?? []).map((opt) => (
          <li key={opt.k}>
            <span className={cn("font-medium", opt.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
              {opt.k} {opt.ok ? "对" : "错"}
            </span>
            {opt.why ? <span> · {opt.why}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuizQueue({ kpId, items }: { kpId: string; items: XiaoQuestion[] }) {
  const marks = usePolitics((s) => s.xiaoMarks);
  const [pos, setPos] = useState(0);
  const item = items[pos];
  if (!item) return null;
  return (
    <XiaoQuizCard
      key={item.id}
      item={item}
      kpId={kpId}
      index={pos}
      total={items.length}
      mark={marks[item.id]?.mark}
      onNext={() => setPos((p) => Math.min(p + 1, items.length - 1))}
      onPrev={() => setPos((p) => Math.max(p - 1, 0))}
    />
  );
}

function XiaoQuizCard({
  item,
  kpId,
  index,
  total,
  mark,
  onNext,
  onPrev,
}: {
  item: XiaoQuestion;
  kpId: string;
  index: number;
  total: number;
  mark?: XiaoMarkLevel;
  onNext: () => void;
  onPrev: () => void;
}) {
  const markXiao = usePolitics((s) => s.markXiao);
  const keys = optionKeys(item);
  const correct = normalizeXiaoAnswer(item.answer);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [brief, setBrief] = useState<XiaoBriefResult | null>(() => peekXiaoBrief(item.id));
  const [briefState, setBriefState] = useState<"idle" | "loading" | "error" | "needLogin" | "unconfigured">("idle");
  const [showRaw, setShowRaw] = useState(false);
  const navigate = useNavigate();

  const pickedStr = normalizeXiaoAnswer([...picked].join(""));
  const ok = submitted && correct.length > 0 && pickedStr === correct;

  function toggle(k: string) {
    if (submitted) return;
    setPicked((prev) => {
      if (item.kind === "single") return new Set([k]);
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function submit() {
    if (picked.size === 0) return;
    setSubmitted(true);
  }

  async function askBrief() {
    if (!correct || briefState === "loading") return;
    setBriefState("loading");
    try {
      const result = await loadXiaoBrief(item);
      if (result.status === "ok" && result.key) {
        setBrief(result);
        setBriefState("idle");
        return;
      }
      setBriefState(result.status === "unconfigured" ? "unconfigured" : "error");
    } catch (error) {
      setBriefState(error instanceof ApiError && error.status === 401 ? "needLogin" : "error");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <p>
            {index + 1} / {total} · {item.kind === "single" ? "单选" : "多选"} · 第 {item.qno} 题
            {item.source_ref ? ` · ${item.source_ref}` : ""}
          </p>
          <button
            type="button"
            className="hover:underline"
            onClick={() => navigate(xiaoPath(item.subject, { chapter: item.chapter_no }))}
          >
            结束
          </button>
        </div>
        <p className="whitespace-pre-wrap text-base leading-relaxed">{item.stem}</p>
        <ul className="space-y-2">
          {keys.map((k) => {
            const chosen = picked.has(k);
            const inAns = submitted && correct.includes(k);
            const wrongPick = submitted && chosen && !inAns;
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => toggle(k)}
                  className={cn(
                    "flex w-full gap-2 rounded-md border px-3 py-2 text-left text-sm leading-relaxed",
                    chosen && !submitted && "border-primary bg-primary/5",
                    inAns && "border-emerald-600 bg-emerald-50 dark:bg-emerald-400/10",
                    wrongPick && "border-destructive bg-destructive/10"
                  )}
                >
                  <span className="w-5 shrink-0 font-medium">{k}.</span>
                  <span className="min-w-0 whitespace-pre-wrap">{item.options[k]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!submitted ? (
          <Button onClick={submit} disabled={picked.size === 0} className="gap-2">
            <ListChecks className="h-4 w-4" />
            {item.kind === "multi" ? "提交多选" : "确认"}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className={cn("text-sm font-medium", ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
              {correct ? (ok ? `正确 · ${correct}` : `正确答案 ${correct}`) : "这题还没有挂上答案，先看解析"}
            </p>
            {brief?.status === "ok" && brief.key ? (
              <XiaoBriefView brief={brief} />
            ) : correct ? (
              <div className="space-y-1">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => void askBrief()} disabled={briefState === "loading"}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {briefState === "loading" ? "正在抽出关键…" : "看关键"}
                </Button>
                {briefState === "needLogin" ? (
                  <p className="text-xs text-muted-foreground">
                    <button type="button" className="underline" onClick={() => navigate("/settings")}>
                      登录
                    </button>
                    后可以生成，生成过的题会直接打开。
                  </p>
                ) : null}
                {briefState === "unconfigured" ? (
                  <p className="text-xs text-muted-foreground">还没配好模型，先看原解析。</p>
                ) : null}
                {briefState === "error" ? (
                  <p className="text-xs text-muted-foreground">这次没抽出关键，可以再点一次。</p>
                ) : null}
              </div>
            ) : null}
            {item.explain ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setShowRaw((open) => !open)}
                >
                  {showRaw ? "收起原解析" : "原解析"}
                </button>
                {showRaw ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.explain}</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {MARKS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium", m.cls, mark === m.id && "ring-2 ring-offset-2 ring-primary")}
                  onClick={() => {
                    markXiao(item.id, m.id, pickedStr, kpId);
                    if (index < total - 1) onNext();
                  }}
                >
                  {m.label}
                </button>
              ))}
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={onPrev} disabled={index === 0}>
                  上一题
                </Button>
                <Button size="sm" variant="outline" onClick={onNext} disabled={index === total - 1}>
                  下一题
                  {index === total - 1 ? <Check className="ml-1 h-3.5 w-3.5" /> : null}
                </Button>
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
