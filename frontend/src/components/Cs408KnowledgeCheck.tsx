import { useEffect, useRef, useState } from "react";
import { Check, Eye, RotateCcw } from "lucide-react";
import { ReviewBlocks } from "@/components/ReviewBlocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cs408CheckProgress, CS408_CHECK_LABELS, type Cs408CheckPart } from "@/lib/kg/cs408Diagnostic";
import { cs408KnowledgeChecks } from "@/lib/kg/cs408KnowledgeChecks";
import type { KnowledgeReview } from "@/lib/kg/knowledgeReview";
import type { MarkLevel } from "@/lib/kg/types";
import { cn } from "@/lib/utils";
import { useKgProgress } from "@/stores/kgProgress";

const LABELS = { unseen: "待检验", learning: "检验中", weak: "需补强", preliminary: "首轮通过", due: "待复测", stable: "复测通过" };

export function Cs408KnowledgeCheck({ template, focus = false }: { template: KnowledgeReview; focus?: boolean }) {
  const marks = useKgProgress((s) => s.itemMarks);
  const record = useKgProgress((s) => s.recordKnowledgeCheck);
  const [now, setNow] = useState(() => Date.now());
  const progress = cs408CheckProgress(template.kpId, marks, now);
  const checks = cs408KnowledgeChecks(template);
  const [part, setPart] = useState<Cs408CheckPart>(() =>
    progress.find((p) => p.status === "weak" || p.status === "due" || p.status === "unseen")?.part ?? "principle");
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLElement>(null);
  const check = checks.find((c) => c.part === part);
  const passed = progress.filter((p) => p.status === "preliminary" || p.status === "due" || p.status === "stable").length;
  const pending = progress.find((p) => p.part !== part && (p.status === "unseen" || p.status === "weak" || p.status === "due"));
  const nextReview = progress.flatMap((p) => p.reviewOn ? [p.reviewOn] : []).sort()[0];

  useEffect(() => {
    if (focus) root.current?.scrollIntoView({ block: "start" });
  }, [focus]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  function choose(value: Cs408CheckPart) {
    setPart(value);
    setRevealed(false);
    setNotice("");
  }
  function grade(mark: Exclude<MarkLevel, "skip">) {
    record(template.kpId, part, mark);
    setNow(Date.now());
    setRevealed(false);
    const next = cs408CheckProgress(template.kpId, useKgProgress.getState().itemMarks).find((p) => p.part === part);
    setNotice(mark === "pass" ? `已记录闭卷自评通过；${next?.reviewOn} 再独立复测。` : "已记录薄弱项，可回看下方讲解后择日重试。");
  }
  if (!check) return null;

  return (
    <section ref={root} id="knowledge-check" aria-label="408 闭卷基础检验" className="scroll-mt-24">
      <Card className="border-primary/30">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">闭卷基础检验</h2>
            <span className="text-xs font-semibold text-primary">首轮通过 {passed}/3 项</span>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">先口述或在纸上作答，再展开核对。刚看过讲解、需要提示或只记得答案，请选“模糊”。这三项是基础自评，应用题与全部考法仍需原题检验。</p>
          <div role="group" aria-label="选择检验能力" className="grid grid-cols-3 gap-2">
            {progress.map((p) => <button key={p.part} type="button" aria-pressed={part === p.part} onClick={() => choose(p.part)}
              className={cn("rounded-xl border p-3 text-left text-xs", part === p.part ? "border-primary bg-primary/10" : "border-border hover:bg-secondary")}>
              <span className="block font-bold">{CS408_CHECK_LABELS[p.part]}</span>
              <span className={cn("mt-1 block text-[11px]", p.status === "weak" ? "text-ink-danger" : "text-muted-foreground")}>{LABELS[p.status]}</span>
            </button>)}
          </div>
          <div className="rounded-xl bg-secondary/40 p-4"><ReviewBlocks blocks={check.prompt} /></div>
          {!revealed ? <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setRevealed(true)}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />已独立作答，展开核对
          </Button> : <div className="space-y-4 rounded-xl border border-border p-4">
            <h3 className="text-xs font-bold">核对要点</h3>
            <ReviewBlocks blocks={check.rubric} />
            <p className="text-xs leading-6 text-muted-foreground">能独立讲清关键条件和过程再选通过；猜中结论或遗漏关键条件选模糊。</p>
            <div role="group" aria-label="记录闭卷检验结果" className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => grade("fail")}>不会</Button>
              <Button size="sm" variant="outline" onClick={() => grade("fuzzy")}>模糊／靠提示</Button>
              <Button size="sm" className="gap-1" onClick={() => grade("pass")}><Check className="h-3.5 w-3.5" aria-hidden="true" />独立通过</Button>
            </div>
          </div>}
          {notice && <p role="status" className="text-xs leading-6 text-primary">{notice}</p>}
          {pending && <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => choose(pending.part)}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />检验下一项：{CS408_CHECK_LABELS[pending.part]}</Button>}
          {passed === 3 && <p className="rounded-xl bg-success/10 p-3 text-xs leading-6 text-ink-success">三项基础已有通过记录。{progress.some((p) => p.status === "due") ? "现在有到期项，请闭卷复测。" : `今天可结束基础自检${nextReview ? `，${nextReview} 再复测` : ""}。`}完整应用能力以原题抽检为准。</p>}
        </CardContent>
      </Card>
    </section>
  );
}
