import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ReviewBlocks } from "@/components/ReviewBlocks";
import { CS408_HANDOUT_METHODS } from "@/data/kg/cs408HandoutMethods";
import { CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import { loadCs408BigGuide, type BigGuide } from "@/lib/kg/cs408BigGuide";
import type { Cs408HandoutQuestion } from "@/lib/kg/cs408Handouts";
import { examItemId, type ExamKind } from "@/lib/kg/exams408";
import type { ReviewBlock, ReviewLesson } from "@/lib/kg/knowledgeReview";
import { cn } from "@/lib/utils";
import { handoutQuestionLabel } from "@/pages/cs408HandoutQuestion";

interface GuideProps {
  kpId: string;
  kind: ExamKind;
  questions: readonly Cs408HandoutQuestion[];
  onOpenQuestion: (question: Cs408HandoutQuestion) => void;
}

const panel = "min-w-0 rounded-xl border border-[var(--mh-line)] px-4 py-3 sm:px-5";
const summary = "cursor-pointer text-sm font-semibold";
const muted = "text-sm text-[var(--mh-muted)]";

function WorkedSteps({ lesson }: { lesson: ReviewLesson }) {
  return (
    <ol className="list-decimal space-y-3 pl-5 text-sm">
      {lesson.steps.map(step => <li key={step.title}><ReviewBlocks blocks={step.working} /></li>)}
    </ol>
  );
}

function QuestionLink({ question, onOpenQuestion }: Pick<GuideProps, "onOpenQuestion"> & {
  question: Cs408HandoutQuestion;
}) {
  return (
    <button type="button" className="mh-btn max-w-full text-left" onClick={() => onOpenQuestion(question)}>
      做这道题 <ArrowRight className="h-3.5 w-3.5 shrink-0" />
      <span>{handoutQuestionLabel(question)}</span>
    </button>
  );
}

function OriginalExample({ lesson, question, onOpenQuestion }: Pick<GuideProps, "onOpenQuestion"> & {
  lesson: ReviewLesson;
  question: Cs408HandoutQuestion;
}) {
  const transfer = lesson.techniques[0];

  return (
    <section className={panel} aria-label="原题示范">
      <h3 className="text-base font-bold">原题示范</h3>
      <p className={muted}>{handoutQuestionLabel(question)}</p>
      <ReviewBlocks blocks={lesson.prompt} />
      {lesson.sourceQuestion?.excerpt && <p className={muted}>题面节选，完整条件与附图见原题。</p>}
      <details className="mt-3 border-t border-[var(--mh-line)] pt-3">
        <summary className={summary}>{question.item.kind === "mcq" ? "展开判断过程" : "展开分步推演"}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm">{lesson.recognition}</p>
          <WorkedSteps lesson={lesson} />
          {transfer && (
            <div className="rounded-lg bg-[var(--mh-surface)] p-3">
              <h4 className="text-sm font-semibold">条件变了怎么办</h4>
              <ReviewBlocks blocks={transfer.content} />
            </div>
          )}
        </div>
      </details>
      <div className="mt-3"><QuestionLink question={question} onOpenQuestion={onOpenQuestion} /></div>
    </section>
  );
}

function BoundaryCheck({ check }: { check: ReviewLesson["selfCheck"] }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <section className={panel} aria-label="边界自测">
      <h3 className="text-base font-bold">边界自测</h3>
      <p className="text-sm">{check.question}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="判断选项">
        {check.options.map((option, index) => (
          <button key={option} type="button" className="mh-btn text-left" aria-pressed={selected === index}
            onClick={() => setSelected(index)}>
            {option}
          </button>
        ))}
      </div>
      {selected !== null && (
        <p role="status" className="text-sm">
          <strong>{selected === check.correctIndex ? "判断正确。" : `正确判断是「${check.options[check.correctIndex]}」。`}</strong>
          {check.explanation}
        </p>
      )}
    </section>
  );
}

function FoundationExample({ lesson }: { lesson: ReviewLesson }) {
  return (
    <section className={panel} aria-label="基础算例">
      <h3 className="mb-2 text-base font-bold">基础算例</h3>
      <ReviewBlocks blocks={lesson.prompt} />
      <details className="mt-3">
        <summary className={summary}>展开算例推演</summary>
        <div className="mt-3"><WorkedSteps lesson={lesson} /></div>
      </details>
    </section>
  );
}

function BigMethodReferences({ questions, onOpenQuestion }: Pick<GuideProps, "questions" | "onOpenQuestion">) {
  const [guide, setGuide] = useState<BigGuide | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    loadCs408BigGuide().then(data => {
      if (live) setGuide(data);
    }).catch(() => {
      if (live) setFailed(true);
    });
    return () => { live = false; };
  }, [retry]);

  if (failed) return (
    <p className={cn(muted, "flex flex-wrap items-center gap-2")} role="status">
      大题答题方法加载失败。
      <button type="button" className="mh-btn" onClick={() => { setFailed(false); setRetry(n => n + 1); }}>重试</button>
    </p>
  );
  if (!guide) return <p role="status" className={muted}>正在加载大题答题方法…</p>;

  // 用本场景的真题编号匹配答题方法，避免只凭知识点标签套模板。
  const examQuestions = new Map(questions.filter(q => q.source === "exam").map(q => [q.id, q]));
  const matches = guide.types.map(method => {
    const examples = method.questions.flatMap(ref => {
      const question = examQuestions.get(examItemId(ref.year, ref.n));
      return question ? [{ question, topic: ref.topic }] : [];
    });
    return { method, examples };
  }).filter(({ examples }) => examples.length > 0).sort((a, b) => b.examples.length - a.examples.length);

  if (!matches.length) return null;

  return (
    <div className="space-y-3">
      {matches.map(({ method, examples }) => {
        const { question, topic } = examples[examples.length - 1];
        return (
          <section key={method.id} className={panel} aria-label="真题示例">
            <h4 className="text-sm font-semibold">真题示例</h4>
            <p className="text-sm">{topic}</p>
            <QuestionLink question={question} onOpenQuestion={onOpenQuestion} />
            <details className="mt-3 border-t border-[var(--mh-line)] pt-3">
              <summary className={summary}>同类模板 · {method.name}</summary>
              <p className={muted}>选取对应小问的步骤，参数和触发条件以题设为准。</p>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-7" aria-label="同类模板步骤">
                {method.template.map(step => <li key={step}>{step.replace(/^[①-⑳]\s*/u, "")}</li>)}
              </ol>
              {method.pitfalls.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 border-t border-[var(--mh-line)] pl-5 pt-2 text-sm leading-6" aria-label="同类题易错点">
                  {method.pitfalls.map(pitfall => <li key={pitfall}>{pitfall}</li>)}
                </ul>
              )}
            </details>
          </section>
        );
      })}
    </div>
  );
}

export function Cs408HandoutGuide({ kpId, kind, questions, onOpenQuestion }: GuideProps) {
  const review = CS408_KNOWLEDGE_REVIEWS[kpId];
  if (!review) return <p className={muted}>本场景暂无讲解。</p>;
  const foundation = review.routes.find(route => route.id === "method")?.lessons[0];
  const curated = review.routes.find(route => route.id === "question")?.lessons[0];
  const example = questions.find(question => question.id === curated?.sourceQuestion?.questionId);
  const opening = foundation?.recognition ?? review.opening;
  const method = CS408_HANDOUT_METHODS[kpId];
  const hasExam = questions.some(q => q.source === "exam");
  const knowledge: ReviewBlock[] = review.knowledge?.filter(block => block.type !== "text" || block.text !== opening) ?? [];

  return (
    <div className="space-y-4">
      <section className={cn(panel, "border-l-4 border-l-[var(--mh-accent)] bg-[var(--mh-accent-soft)]")} aria-label={kind === "mcq" ? "判断依据" : "起手条件"}>
        <h3 className="mb-2 text-base font-bold">{kind === "mcq" ? "判断依据" : "起手条件"}</h3>
        <p className="text-sm">{opening}</p>
        {knowledge.length > 0 && <ReviewBlocks blocks={knowledge} />}
      </section>
      {kind === "big" && (method || hasExam) && (
        <section className="space-y-3" aria-label="大题答题方法">
          <h3 className="text-base font-bold">大题答题方法</h3>
          {method && (
            <div className={cn(panel, "bg-[var(--mh-surface)]")}>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-7" aria-label="卷面步骤">
                {method.steps.map(step => <li key={step}>{step}</li>)}
              </ol>
              <div className="mt-3 border-t border-[var(--mh-line)] pt-3">
                <h4 className="text-sm font-semibold">交卷前检查</h4>
                <p className={muted}>{method.check}</p>
              </div>
            </div>
          )}
          {hasExam && <BigMethodReferences questions={questions} onOpenQuestion={onOpenQuestion} />}
        </section>
      )}
      {curated && example ? (
        <OriginalExample lesson={curated} question={example} onOpenQuestion={onOpenQuestion} />
      ) : foundation && <FoundationExample lesson={foundation} />}
      {kind === "mcq" && foundation && <BoundaryCheck check={foundation.selfCheck} />}
    </div>
  );
}
