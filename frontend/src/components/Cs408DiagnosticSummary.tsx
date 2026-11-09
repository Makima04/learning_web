import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cs408SingleQuestionPath } from "@/lib/kg/paths";
import { CS408_DIAGNOSTIC_STATUS, type Cs408Diagnostic } from "@/lib/kg/cs408Diagnostic";
import { practiceQuestionLocation } from "@/lib/kg/practiceLocation";
import { practiceMinutes } from "@/lib/kg/reviewRoi";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { cn } from "@/lib/utils";

export function Cs408DiagnosticSummary({ plan, checkHref, returnTo, catalogReady, catalogError, onPractice, alternateHref, alternateLabel }: {
  plan: Cs408Diagnostic;
  checkHref: string;
  returnTo: string;
  catalogReady: boolean;
  catalogError: string;
  onPractice: (items: WangdaoItem[]) => void;
  alternateHref?: string;
  alternateLabel?: string;
}) {
  const practice = plan.recommendations.flatMap((r) => r.source === "wangdao" ? [r.item] : []);
  return <section aria-label="408 本轮抽检" className="space-y-3 rounded-xl border border-primary/30 bg-accent/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-extrabold">本轮抽检 · {plan.label}</h3>
      <span className="text-[11px] font-semibold">首轮通过 {plan.completed}/{plan.groups.length} 组</span>
    </div>
    <p className="text-xs leading-6 text-muted-foreground">{plan.basis === "methods"
      ? "按已逐题核对的王道考法选代表题和变式，再用真题抽检。"
      : "当前题型尚未细标考法，先按王道小节与真题抽检。"}每组两道不同题通过后停练，三天后复测，通过后七天再抽检。抽样结果只代表已检验范围。</p>
    {plan.canStop ? <p role="status" className="rounded-lg bg-success/10 p-3 text-xs leading-6 text-ink-success">
      <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />今天可以停，不必刷完题集。{plan.reviewOn ? `${plan.reviewOn} 再复测。` : ""}
    </p> : <p className="rounded-lg bg-secondary/70 p-3 text-xs leading-6">
      {plan.recommendations.length ? `本次先做 ${plan.recommendations.length} 题，约 ${plan.recommendations.reduce((sum, r) => sum + practiceMinutes(r.source === "wangdao" ? r.item.kind : r.question.kind), 0)} 分钟。${plan.remaining > 3 ? `当前待练建议共 ${plan.remaining} 道，可分轮完成。` : "做完后再看是否需要补练。"}`
        : plan.checksDue ? `有 ${plan.checksDue} 项基础检验已到期，请先闭卷复测。`
          : !catalogReady ? "正在核对题库关联；也可先做闭卷基础检验。"
          : plan.groups.some((g) => g.shortage) ? "部分组缺少两道不同的主考题，暂不能判定该组掌握。可先做基础检验，或在全部练习里补充。"
            : "当前没有可立即练习的题，间隔中的错题到期后会再次推荐。"}
    </p>}
    {!plan.groups.length && alternateHref && <Link className="block text-xs font-semibold text-primary hover:underline" to={alternateHref}>{alternateLabel} →</Link>}
    {!!plan.recommendations.length && <div className="space-y-2">
      {practice.length > 1 && <Button size="sm" className="w-full gap-1.5 text-xs" onClick={() => onPractice(practice)}><Play className="h-3 w-3" aria-hidden="true" />本轮王道抽检 · {practice.length} 题</Button>}
      {plan.recommendations.map((r) => r.source === "wangdao" ? <button key={r.item.id} type="button" onClick={() => onPractice([r.item])} className="flex w-full items-start gap-2 rounded-lg bg-card p-3 text-left text-xs hover:bg-secondary">
        <span className="min-w-0 flex-1"><span className="block font-semibold">{practiceQuestionLocation(r.item)}</span><span className="mt-1 block text-[11px] text-muted-foreground">{r.item.primaryFacet?.split("::")[1] ?? "同考点小节抽检"}</span></span><Play className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      </button> : <Link key={r.question.id} className="flex items-center gap-2 rounded-lg bg-card p-3 text-xs font-semibold text-primary hover:bg-secondary" to={cs408SingleQuestionPath(r.question.year, r.question.n, returnTo)}>
        <span className="flex-1">真题抽检 · {r.question.year} 年第 {r.question.n} 题 · 仅练这一题</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </Link>)}
    </div>}
    <Button asChild variant="outline" size="sm" className="h-auto min-h-9 w-full whitespace-normal py-2 text-xs"><Link to={checkHref}><BookOpen className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />闭卷基础检验 · 已通过 {plan.checksPassed}/3 项</Link></Button>
    {!!plan.groups.length && <details className="rounded-lg bg-card p-3">
      <summary className="cursor-pointer text-xs font-semibold">查看每组证据与待补项</summary>
      <ul className="mt-2 space-y-2">{plan.groups.map((g) => <li key={g.id} className="border-t border-border/60 pt-2 text-[11px] leading-5">
        <div className="flex items-start justify-between gap-2"><span>{g.label}</span><span className={cn("shrink-0 font-semibold", g.status === "weak" ? "text-ink-danger" : "text-primary")}>{CS408_DIAGNOSTIC_STATUS[g.status]}</span></div>
        <p className="text-muted-foreground">本轮通过 {g.passed}/2 道{g.shortage ? " · 代表题不足或缺主考题，证据待补" : ""}{g.reviewOn ? ` · ${g.reviewOn} 复测` : ""}</p>
      </li>)}</ul>
    </details>}
    {catalogError && <p role="alert" className="text-xs text-ink-danger">王道目录加载失败：{catalogError}。当前仍可进行真题抽检或基础检验。</p>}
  </section>;
}
