import { ChevronDown, Lightbulb } from "lucide-react";
import { MathFormula } from "@/components/MathFormula";
import type { MathExplanation, MathExplanationBlock } from "@/lib/kg/mathExplanation";

export function ExplanationBlocks({ blocks }: { blocks: MathExplanationBlock[] }) {
  return <div className="min-w-0 space-y-2 text-sm leading-7">{blocks.map((block, i) => block.type === "math"
    ? <MathFormula key={i} tex={block.tex} /> : <p key={i} className="whitespace-pre-wrap">{block.text}</p>)}</div>;
}
export function MathExplanationView({ data }: { data: MathExplanation }) {
  return <div className="min-w-0 space-y-5">
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">核对识别的题目与条件</summary><div className="mt-3"><ExplanationBlocks blocks={data.problem_readback} /></div></details>
    <section className="space-y-3 rounded-xl bg-accent/60 p-4" aria-label="本题突破点">
      <h3 className="flex items-center gap-2 text-sm font-bold text-primary"><Lightbulb className="h-4 w-4" aria-hidden="true" />本题突破点</h3>
      {data.breakthroughs.map((point) => <div key={point.id} className="space-y-1 text-sm leading-7">
        <p className="font-semibold">{point.clue}</p><p>{point.move}</p><p className="text-xs text-muted-foreground">依据：{point.why}</p>
      </div>)}
    </section>
    <section aria-label="解题路线" className="space-y-2">
      <h3 className="text-sm font-bold">解题路线</h3>
      {data.steps.map((step, index) => <details key={step.id} className="group border-b border-border/70 py-2">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-md py-2 [&::-webkit-details-marker]:hidden">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{step.title}</span><span className="mt-1 block text-xs leading-6 text-muted-foreground">{step.brief}</span></span>
          <span className="flex shrink-0 items-center gap-1 pt-1 text-xs text-primary"><span className="group-open:hidden">看细节</span><span className="hidden group-open:inline">收起</span><ChevronDown className="h-3 w-3 group-open:rotate-180" aria-hidden="true" /></span>
        </summary>
        <div className="mb-2 mt-2 min-w-0 space-y-3 rounded-xl bg-secondary/50 p-4 sm:ml-9">
          <ExplanationBlocks blocks={step.details} />
          {step.pitfalls.length > 0 && <div className="space-y-1 border-t border-border/60 pt-3"><p className="text-xs font-semibold text-ink-warning">这一步容易错在哪里</p>{step.pitfalls.map((tip, i) => <p key={i} className="text-xs leading-6 text-muted-foreground">{tip}</p>)}</div>}
        </div>
      </details>)}
    </section>
    <details className="rounded-xl border border-primary/25 p-4"><summary className="cursor-pointer text-sm font-bold text-primary">核对最终答案</summary><div className="mt-3"><ExplanationBlocks blocks={data.final_answer} /></div></details>
    <details className="text-sm"><summary className="cursor-pointer font-semibold">查看验算与适用条件</summary><div className="mt-3 space-y-4">
      {data.checks.map((check, index) => <div key={index}><h4 className="mb-2 text-xs font-semibold text-primary">{check.target}</h4><ExplanationBlocks blocks={check.evidence} /></div>)}
      <div className="space-y-1 rounded-xl bg-secondary/50 p-4 text-xs leading-6"><h4 className="font-semibold">下次遇到什么可以想到这招</h4><p>{data.transfer.signal}</p><p>{data.transfer.move}</p><p className="text-muted-foreground">条件：{data.transfer.conditions}</p></div>
    </div></details>
  </div>;
}

