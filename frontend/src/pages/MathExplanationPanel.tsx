import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { mediaUrl } from "@/lib/kg/catalogLoad";
import { isMathExplanationRunning, validateMathExplanation, type MathExplanationResponse } from "@/lib/kg/mathExplanation";
import { useAuth } from "@/stores/auth";
import { MathExplanationView } from "./MathExplanationView";
import { WangdaoStem } from "@/pages/wangdaoQuestion";

export function MathExplanationPanel({ itemId, revealAnswer = false, standalone = false }: { itemId: string; revealAnswer?: boolean; standalone?: boolean }) {
  const loggedIn = useAuth((s) => s.loggedIn);
  const userId = useAuth((s) => s.user?.id);
  const [open, setOpen] = useState(standalone || revealAnswer);
  const [value, setValue] = useState<MathExplanationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [retryAfter, setRetryAfter] = useState(0);
  const context = useRef("");
  context.current = `${itemId}:${userId ?? "guest"}`;
  const active = value?.question.id === itemId ? value : null;
  useEffect(() => { setRetryAfter(active?.retry_after_seconds ?? 0); }, [active?.updated_at, active?.retry_after_seconds]);
  useEffect(() => { if (retryAfter <= 0) return; const timer = setTimeout(() => setRetryAfter((v) => Math.max(0, v - 1)), 1000); return () => clearTimeout(timer); }, [retryAfter]);
  useEffect(() => { setValue(null); setError(""); setStarting(false); setOpen(standalone || revealAnswer); }, [itemId, userId]);
  useEffect(() => { if (revealAnswer) setOpen(true); }, [revealAnswer]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      setLoading(true);
      try {
        const raw = await api.getMathExplanation(itemId);
        let next: MathExplanationResponse;
        try { next = validateMathExplanation(raw); }
        catch (error) { if (!cancelled && raw.protocol === "math_explanation.v1" && raw.question?.id === itemId) setValue({ ...raw, explanation: null }); throw error; }
        if (cancelled) return;
        setValue(next); setError("");
        if (isMathExplanationRunning(next)) timer = setTimeout(read, 3000);
      } catch (e: unknown) { if (!cancelled) setError(e instanceof Error ? e.message : "解析读取失败"); }
      finally { if (!cancelled) setLoading(false); }
    };
    void read();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [open, itemId, userId, revision]);
  async function generate(regenerate = false) {
    if (!loggedIn) { window.dispatchEvent(new Event(api.OPEN_AUTH_DIALOG_EVENT)); return; }
    const scope = context.current;
    setStarting(true); setError("");
    try {
      const next = validateMathExplanation(await api.startMathExplanation(itemId, regenerate));
      if (context.current !== scope) return;
      setValue(next); setRevision((v) => v + 1);
    } catch (e: unknown) { if (context.current === scope) setError(e instanceof Error ? e.message : "生成请求失败"); }
    finally { if (context.current === scope) setStarting(false); }
  }
  const running = isMathExplanationRunning(active);
  const bookImage = active?.question.ans_img?.startsWith("/math/img/") ? mediaUrl(active.question.ans_img) : null;
  return <div className="min-w-0 space-y-3" onClick={(event) => event.stopPropagation()}>
    {!standalone && <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant={open ? "default" : "outline"} onClick={() => setOpen((v) => !v)}><BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{open ? "收起逐题解析" : "逐题解析 · 突破点与细节"}</Button>
      <Link to={`/review-priority/explain/${encodeURIComponent(itemId)}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">单独打开</Link>
    </div>}
    {open && <div className={standalone ? "min-w-0 space-y-5" : "min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 md:p-5"}>
      {standalone && active && <div className="space-y-3"><p className="text-xs text-muted-foreground">{active.question.source === "lilin880" ? "李林 880" : "张宇 1000"} · §{active.question.section} · 第 {active.question.qno} 题</p><WangdaoStem item={active.question} /></div>}
      {error && <p role="alert" className="text-sm leading-7 text-destructive">{error}</p>}
      {loading && !active && <p role="status" className="text-sm text-muted-foreground">正在读取服务端解析…</p>}
      {!error && active?.status === "ready" && active.explanation && <>
        <MathExplanationView key={`${itemId}:${active.updated_at ?? active.model}`} data={active.explanation} />
        <p className="text-xs leading-6 text-muted-foreground">{active.review_status === "reviewed" ? "已校对示例：原方程与初值已核对，教学说明已校对。" : "模型生成稿，尚未人工校对；可与原书解析对照。"} · {active.model}</p>
      </>}
      {running && <div role="status" aria-live="polite" className="space-y-2 rounded-xl bg-secondary/50 p-4"><p className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{active?.phase === "formatting" ? "正在整理突破点、步骤与演算细节…" : active?.status === "queued" ? "任务已排队，等待模型处理…" : "正在读取题图、解题并核对原始条件…"}</p><p className="text-xs text-muted-foreground">任务由服务端继续处理，离开后可回来查看。</p></div>}
      {active && !running && active.status !== "ready" && <div className="space-y-3">
        <p className="text-sm leading-7 text-muted-foreground">{active.message || "先生成这道题的突破点、解题路线与展开细节。"}</p>
        <Button size="sm" onClick={() => void generate()} disabled={starting || !active.configured || retryAfter > 0}>{starting ? "正在提交…" : retryAfter > 0 ? `${retryAfter} 秒后可重试` : !active.configured ? "请管理员先配置模型" : !loggedIn ? "登录后生成逐题解析" : active.status === "missing" ? "生成逐题解析" : "重试生成"}</Button>
      </div>}
      {active?.status === "ready" && active.review_status === "model_draft" && <Button variant="outline" size="sm" disabled={starting || retryAfter > 0} onClick={() => void generate(true)}>{starting ? "正在提交…" : retryAfter > 0 ? `${retryAfter} 秒后可重新生成` : "重新生成解析"}</Button>}
      {error && !running && <Button variant="outline" size="sm" onClick={() => setRevision((v) => v + 1)}>重试读取</Button>}
      {active && (bookImage || active.question.answer) && <details className="border-t border-border/60 pt-3"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">对照原书答案与解析</summary><div className="mt-3 space-y-2">{active.question.answer && <p className="text-sm">答案：{active.question.answer}</p>}{bookImage && <img src={bookImage} alt={`第${active.question.qno}题原书解析`} className="h-auto w-full rounded-md bg-white" />}</div></details>}
    </div>}
  </div>;
}
