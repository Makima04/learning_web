import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { findKp } from "@/data/kg";
import { syncAccountData } from "@/lib/accountSync";
import { MATH1_ITEMS, MATH1_KIND_NAMES, type Math1Question } from "@/lib/kg/math1Analysis";
import { math1PracticePath, math1QuestionImage } from "@/lib/kg/math1Practice";
import { practiceReturnLabel, practiceReturnPath, reviewPriorityPath } from "@/lib/kg/paths";
import { useAuth } from "@/stores/auth";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ItemNoteField } from "@/pages/itemNoteField";
import { PRACTICE_MARKS } from "@/pages/practiceQuestion";
import { cn } from "@/lib/utils";

function QuestionImage({ question, answer = false }: { question: Math1Question; answer?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-ink-danger">{answer ? "解析" : "题目"}图片加载失败，请刷新重试。</p> : (
    <img src={math1QuestionImage(question, answer)} alt={`${question.year} 年数学一第 ${question.n} 题${answer ? "参考解析" : "题目与完整小问"}`}
      className="h-auto w-full rounded-lg bg-white" onError={() => setFailed(true)} />
  );
}

function Math1Question({ question, answerInitially }: { question: Math1Question; answerInitially: boolean }) {
  const [revealed, setRevealed] = useState(answerInitially);
  const mark = useKgProgress((s) => s.itemMarks.find((m) => m.itemId === question.id)?.mark);
  const markItem = useKgProgress((s) => s.markItem);

  useEffect(() => {
    setRevealed(answerInitially);
  }, [answerInitially]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest("input, textarea, button, a, select, summary, [contenteditable='true'], [role='button']")) return;
      if (event.code !== "Space") return;
      event.preventDefault();
      setRevealed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <p className="text-xs leading-6 text-muted-foreground">考点：{[question.kpId, ...question.secondaryKpIds].map((id) => findKp(id)?.kp.name).filter(Boolean).join(" · ")}</p>
        <QuestionImage key={question.id} question={question} />
        <Button variant="outline" className="gap-2" aria-expanded={revealed} aria-controls="math1-answer" onClick={() => setRevealed((v) => !v)}>
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{revealed ? "收起解析" : "查看答案与解析"}
        </Button>
        {!revealed && <p className="text-[11px] text-muted-foreground">先独立作答，空格或点击按钮显示答案。</p>}
        {revealed && <section id="math1-answer" aria-label="参考答案与解析" className="space-y-4 border-t border-border/60 pt-5">
          <h2 className="text-sm font-bold">参考答案与解析</h2>
          <QuestionImage key={`${question.id}-answer`} question={question} answer />
          <ItemNoteField itemId={question.id} />
        </section>}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4" aria-label="题目自评">
          {PRACTICE_MARKS.map((m) => <button key={m.id} type="button" aria-pressed={mark === m.id}
            className={cn("rounded-md px-4 py-2 text-sm font-medium", m.cls, mark === m.id && "ring-2 ring-primary ring-offset-2")}
            onClick={() => markItem({ itemId: question.id, mark: m.id, primaryKpId: question.kpId, secondaryKpIds: question.secondaryKpIds })}>{m.label}</button>)}
          {mark && <span role="status" className="text-xs text-muted-foreground">已记录自评</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export function Math1PracticePage() {
  const { year, n } = useParams();
  const [params] = useSearchParams();
  const load = useKgProgress((s) => s.load);
  const loggedIn = useAuth((s) => s.loggedIn);
  const userId = useAuth((s) => s.user?.id);
  const [syncError, setSyncError] = useState(false);
  const question = MATH1_ITEMS.find((q) => String(q.year) === year && String(q.n) === n);
  const fallback = question ? `/review-priority?${new URLSearchParams({ subject: "math", kind: question.kind, book: question.book, kp: question.kpId })}` : reviewPriorityPath("math");
  const returnTo = practiceReturnPath(params.get("returnTo")) ?? fallback;

  useEffect(() => {
    load();
    setSyncError(false);
    let cancelled = false;
    if (loggedIn) void syncAccountData().catch(() => { if (!cancelled) setSyncError(true); });
    return () => { cancelled = true; };
  }, [load, loggedIn, userId]);

  if (!question) return <div className="space-y-4"><p>未找到这道数学真题。</p><Button asChild variant="outline"><Link to={returnTo}>返回复习性价比</Link></Button></div>;
  // 与考点抽屉的真题顺序一致，换题始终留在当前考点和题型。
  const related = MATH1_ITEMS.filter((q) => q.kpId === question.kpId && q.kind === question.kind).sort((a, b) => b.year - a.year || a.n - b.n);
  const index = related.findIndex((q) => q.id === question.id);
  const previous = related[index - 1];
  const next = related[index + 1];
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to={returnTo} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" />{practiceReturnLabel(returnTo)}</Link>
      <header className="space-y-2">
        <p className="text-xs font-bold text-primary">数学一真题 · {MATH1_KIND_NAMES[question.kind]} · {question.points} 分</p>
        <h1 className="text-2xl font-extrabold">{question.year} 年 · 第 {question.n} 题</h1>
        <p className="text-xs leading-6 text-muted-foreground">原题与解析保留原卷公式和图形。{loggedIn ? "自评与思路备注随账号同步。" : "自评与思路备注保存在当前设备，登录后按账号同步。"}</p>
      </header>
      {syncError && <p role="status" className="text-xs text-ink-warning">同步暂未完成，当前展示已有学习记录。</p>}
      <Math1Question key={`${question.id}-${userId ?? "guest"}`} question={question} answerInitially={params.get("answer") === "1"} />
      <nav aria-label="同考点真题换题" className="flex items-center justify-between gap-3">
        {previous ? <Button asChild variant="outline" size="sm"><Link to={math1PracticePath(previous, false, returnTo)}><ChevronLeft className="mr-1 h-4 w-4" />上一题</Link></Button> : <Button variant="outline" size="sm" disabled>上一题</Button>}
        <span className="text-center text-xs text-muted-foreground">同考点{MATH1_KIND_NAMES[question.kind]} · {index + 1}/{related.length}</span>
        {next ? <Button asChild variant="outline" size="sm"><Link to={math1PracticePath(next, false, returnTo)}>下一题<ChevronRight className="ml-1 h-4 w-4" /></Link></Button> : <Button variant="outline" size="sm" disabled>下一题</Button>}
      </nav>
      <p className="text-[11px] leading-5 text-muted-foreground">试卷与详解来自 <a className="text-primary hover:underline" href="https://github.com/CHNragdoll/anki-pipeline/releases/tag/math-exams" target="_blank" rel="noreferrer">anki-pipeline 社区重排版</a>。</p>
    </div>
  );
}
