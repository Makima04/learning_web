// 408 真题练习会话：逐题练习 / 整卷模考 / 交卷复盘
// 硬约束（设计稿 09 状态机）：提交前页面里不出现任何答案文本；自评只在揭晓之后。
// 数据全部经 useKgProgress.recordAttempt 写入 KgDoc，随 /api/kg 整包跨设备同步。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Bookmark, Check, Clock3, X } from "lucide-react";
import {
  examItemId,
  loadCs408ExamPaper,
  type ExamItem,
  type ExamPaper,
} from "@/lib/kg/exams408";
import {
  bookLabel,
  formatDuration,
  sessionReport,
  verdictFor,
  type ExamAttempt,
  type ExamSession,
  type Verdict,
} from "@/lib/kg/examAttempts";
import { syncExamAttemptToJournal } from "@/lib/kg/examJournal";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ItemNoteField } from "@/pages/itemNoteField";
import { SessionReportView } from "@/pages/sessionReportView";
import { cn } from "@/lib/utils";

const TAP = "min-h-[44px] md:min-h-9";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

type SelfLevel = "self_pass" | "self_fuzzy" | "self_fail";
type Mode = "practice" | "mock";

interface AnswerState {
  chosen?: string;
  self?: SelfLevel;
  submitted: boolean;
  verdict?: Verdict;
}

const SELF_OPTIONS: { id: SelfLevel; label: string; cls: string }[] = [
  { id: "self_pass", label: "会了", cls: "bg-success text-success-foreground" },
  { id: "self_fuzzy", label: "模糊", cls: "bg-warning text-warning-foreground" },
  { id: "self_fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
];

function Notice({
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
        <Button size="sm" variant="outline" className={cn("mt-3", TAP, FOCUS)} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function RevealPanel({
  item,
  year,
  itemId,
  verdict,
  favorite,
  onToggleFavorite,
}: {
  item: ExamItem;
  year: number;
  itemId: string;
  verdict?: Verdict;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const pageImages = item.answer_meta?.page_images ?? [];
  const correct = verdict?.kind === "auto" && verdict.correct;
  const wrong = verdict?.kind === "auto" && !verdict.correct;
  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed p-3">
      {verdict?.kind === "auto" && (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
            correct
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-destructive/15 text-destructive"
          )}
        >
          {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          <span>{correct ? "回答正确" : "回答错误"}</span>
          <span className="font-normal">正确答案 {verdict.key}</span>
        </div>
      )}
      {verdict?.kind === "manual" && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          大题已记录自评，不计入客观正确率；下面可对照答案与解析。
        </p>
      )}
      {verdict?.kind === "unjudgeable" && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          本题答案格式不支持自动判分，已记录你的作答，请对照下方答案自行核对。
        </p>
      )}
      {item.answer && (
        <p className="text-sm">
          <span className="font-medium">答案：</span>
          <b className="tabular-nums">{item.answer}</b>
        </p>
      )}
      {item.explanation ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">解析</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.explanation}</p>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
          <p className="font-semibold">本卷源答案页未提供本题的逐题解析</p>
          <p className="mt-0.5 opacity-90">可先对照答案键，再看下方原版答案页；补全后会显示在这里。</p>
        </div>
      )}
      {item.answer_meta?.note && <p className="text-xs text-muted-foreground">{item.answer_meta.note}</p>}
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
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <button
          type="button"
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 text-xs",
            TAP,
            FOCUS,
            favorite
              ? "border-destructive/40 bg-destructive/10 text-ink-danger"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Bookmark className={cn("h-4 w-4", favorite && "fill-current")} />
          {favorite ? "已收藏" : "收藏这题"}
        </button>
      </div>
      <ItemNoteField itemId={itemId} />
    </div>
  );
}

export function Cs408PracticePage() {
  const { year: yearParam } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(yearParam);
  const mode: Mode = search.get("mode") === "mock" ? "mock" : "practice";
  const startQ = Math.max(1, Number(search.get("q")) || 1);

  const load = useKgProgress((s) => s.load);
  const recordAttempt = useKgProgress((s) => s.recordAttempt);
  const toggleFavorite = useKgProgress((s) => s.toggleFavorite);
  const saveExamSession = useKgProgress((s) => s.saveExamSession);
  const finishExamSession = useKgProgress((s) => s.finishExamSession);
  const favorites = useKgProgress((s) => s.favorites);
  const attempts = useKgProgress((s) => s.attempts);
  const examSessions = useKgProgress((s) => s.examSessions);

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(startQ - 1);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<{ id: string; startedAt: number } | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!Number.isFinite(year) || year < 2000) {
      setErr("年份不合法");
      return;
    }
    let cancelled = false;
    setPaper(null);
    setErr("");
    setAnswers({});
    setFinished(false);
    loadCs408ExamPaper(year)
      .then((p) => {
        if (cancelled) return;
        setPaper(p);
        const id = `cs408-${year}-${Date.now().toString(36)}`;
        const startedAt = Date.now();
        sessionRef.current = { id, startedAt };
        saveExamSession({
          id,
          year,
          mode,
          startedAt,
          itemIds: p.items.map((it) => examItemId(year, it.n)),
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [year, mode, saveExamSession]);

  useEffect(() => {
    if (!paper || finished) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [paper, finished]);

  const items = paper?.items ?? [];
  const item = items[idx];
  const itemId = item ? examItemId(year, item.n) : "";
  const state: AnswerState = answers[itemId] ?? { submitted: false };
  const elapsed = sessionRef.current ? Math.max(0, now - sessionRef.current.startedAt) : 0;

  const finish = useCallback(() => {
    const s = sessionRef.current;
    if (!s || finished) return;
    finishExamSession(s.id, Date.now() - s.startedAt);
    setFinished(true);
  }, [finishExamSession, finished]);

  const next = useCallback(() => {
    if (idx + 1 < items.length) setIdx(idx + 1);
    else finish();
  }, [idx, items.length, finish]);

  const setChosen = useCallback(
    (k: string) => {
      setAnswers((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] ?? { submitted: false }), chosen: k },
      }));
    },
    [itemId]
  );

  const setSelf = useCallback(
    (v: SelfLevel) => {
      setAnswers((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] ?? { submitted: false }), self: v },
      }));
    },
    [itemId]
  );

  const canSubmit = item
    ? item.kind === "big"
      ? Boolean(state.self)
      : !item.options || Boolean(state.chosen)
    : false;

  const submit = useCallback(() => {
    const s = sessionRef.current;
    if (!item || !s || state.submitted || !canSubmit) return;
    const v = verdictFor(item, state.chosen ?? null);
    let outcome: ExamAttempt["outcome"];
    if (v.kind === "auto") outcome = v.correct ? "correct" : "wrong";
    else if (v.kind === "unjudgeable") outcome = "unjudgeable";
    else if (state.self) outcome = state.self;
    else outcome = "skipped";
    recordAttempt({
      itemId,
      year,
      n: item.n,
      kind: item.kind === "big" ? "big" : "mcq",
      book: item.book,
      chosen: state.chosen,
      outcome,
      sessionId: s.id,
    });
    // 错题与复习队列交给 journal（按条合并 + 墓碑）；attempts 只做履历与统计
    syncExamAttemptToJournal({ item, year, outcome });
    setAnswers((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { submitted: false }), submitted: true, verdict: v },
    }));
    // 模考：提交只记录、不揭晓，自动进入下一题；最后一题直接交卷
    if (mode === "mock") {
      if (idx + 1 < items.length) setIdx(idx + 1);
      else finish();
    }
  }, [item, state, canSubmit, itemId, year, recordAttempt, mode, idx, items.length, finish]);

  useEffect(() => {
    if (!paper || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (!state.submitted && item && item.kind !== "big" && /^[A-D]$/.test(k) && item.options?.[k]) {
        setChosen(k);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!state.submitted) submit();
        else if (mode === "practice") next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paper, finished, state.submitted, item, setChosen, submit, next, mode]);

  const report = useMemo(() => {
    const s = sessionRef.current;
    if (!s || !paper || !finished) return null;
    const stored = examSessions.find((x) => x.id === s.id);
    const session: ExamSession = stored ?? {
      id: s.id,
      year,
      mode,
      startedAt: s.startedAt,
      itemIds: items.map((it) => examItemId(year, it.n)),
    };
    return sessionReport(
      { ...session, durationMs: session.durationMs ?? Date.now() - s.startedAt },
      attempts
    );
  }, [finished, paper, examSessions, year, mode, items, attempts]);

  if (err) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <Notice
          tone="error"
          title="这套卷没能加载"
          description={`${year} 年真题数据读取失败：${err}。`}
          actionLabel="返回年份列表"
          onAction={() => navigate("/kg/exams")}
        />
      </div>
    );
  }
  if (!paper) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <Notice title="正在准备练习" description={`正在加载 ${year} 年真题与答案键…`} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <Notice
          title="这套卷暂时没有题目"
          description="题库数据可能尚未补齐，可以先从其他年份开始。"
          actionLabel="返回年份列表"
          onAction={() => navigate("/kg/exams")}
        />
      </div>
    );
  }

  if (finished && report) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <SessionReportView
          year={year}
          mode={mode}
          report={report}
          backTo="/kg/exams"
          backLabel="返回年份列表"
        />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <Notice title="题号超出范围" description="请从年份列表重新进入。" actionLabel="返回年份列表" onAction={() => navigate("/kg/exams")} />
      </div>
    );
  }

  const pct = Math.round(((idx + 1) / items.length) * 100);
  const reveal = mode === "practice" && state.submitted;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="sticky top-16 z-10 rounded-2xl border-2 border-border/70 bg-card/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold">
            {year} 年 · {mode === "mock" ? "整卷模考" : "逐题练习"}
          </span>
          <span className="text-muted-foreground">
            第 <b className="tabular-nums text-foreground">{idx + 1}</b>/{items.length} 题
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {formatDuration(elapsed)}
          </span>
          <div className="ml-auto flex gap-1">
            {mode === "mock" && (
              <Button size="sm" variant="outline" className={cn(TAP, FOCUS)} onClick={finish}>
                交卷
              </Button>
            )}
            <Button size="sm" variant="ghost" className={cn(TAP, FOCUS)} onClick={() => navigate(`/kg/exams/${year}`)}>
              结束
            </Button>
          </div>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="练习进度"
        >
          <div className="h-full rounded-full bg-primary/80 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">第 {item.n} 题</span>
            <span>{item.kind === "big" ? "大题" : "选择题"} · {item.book_name || bookLabel(item.book)}</span>
            {item.points != null && <span>· {item.points} 分</span>}
            {state.submitted && <span className="rounded-full bg-muted px-2 py-0.5">已提交</span>}
          </div>

          <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">{item.stem}</pre>

          {item.options && (
            <div role="group" aria-label="选项" className="grid gap-2">
              {Object.entries(item.options).map(([k, v]) => {
                const chosen = state.chosen === k;
                return state.submitted ? (
                  <div
                    key={k}
                    className={cn(
                      "flex gap-3 rounded-xl border-2 px-3 py-2.5 text-sm",
                      chosen ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted/40"
                    )}
                  >
                    <span className="w-5 shrink-0 font-semibold text-muted-foreground">{k}.</span>
                    <span className="min-w-0 flex-1">{v}</span>
                    {chosen && <span className="shrink-0 text-[11px] text-primary">你的选择</span>}
                  </div>
                ) : (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setChosen(k)}
                    className={cn(
                      "flex gap-3 rounded-xl border-2 px-3 text-left text-sm transition-colors",
                      TAP,
                      FOCUS,
                      chosen ? "border-primary bg-primary/10" : "border-border/70 hover:bg-accent/40"
                    )}
                  >
                    <span className="w-5 shrink-0 font-semibold text-muted-foreground">{k}.</span>
                    <span className="min-w-0 flex-1">{v}</span>
                  </button>
                );
              })}
            </div>
          )}

          {item.kind === "big" && !state.submitted && (
            <div role="group" aria-label="大题自评" className="space-y-2">
              <p className="text-xs text-muted-foreground">主观题没有唯一选项，先写出思路再自评掌握情况。</p>
              <div className="flex flex-wrap gap-2">
                {SELF_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={state.self === o.id}
                    onClick={() => setSelf(o.id)}
                    className={cn(
                      "rounded-md px-3 text-xs font-medium",
                      TAP,
                      FOCUS,
                      o.cls,
                      state.self === o.id && "ring-2 ring-offset-2 ring-primary"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!state.submitted && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button disabled={!canSubmit} className={cn(TAP, FOCUS)} onClick={submit}>
                提交作答
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {item.kind === "big" ? "选择自评后提交" : "键盘 A–D 选项 · Enter 提交"}
                {mode === "mock" && " · 模考交卷前不显示答案"}
              </span>
            </div>
          )}

          {reveal && (
            <RevealPanel
              item={item}
              year={year}
              itemId={itemId}
              verdict={state.verdict}
              favorite={favorites.includes(itemId)}
              onToggleFavorite={() => toggleFavorite(itemId)}
            />
          )}

          {reveal && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button className={cn(TAP, FOCUS)} onClick={next}>
                {idx + 1 < items.length ? "下一题" : "查看复盘"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button asChild variant="ghost" className={cn(TAP, FOCUS)}>
                <Link to="/kg/exams/mistakes">错题本</Link>
              </Button>
            </div>
          )}

          {mode === "mock" && !state.submitted && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              整卷模考：提交后自动进入下一题，答案与解析在交卷后统一查看。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
