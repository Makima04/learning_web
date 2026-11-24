import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { ReviewBlocks } from "@/components/ReviewBlocks";
import { hydratePracticeItems, mediaUrl } from "@/lib/kg/catalogLoad";
import type { Cs408HandoutMark, Cs408HandoutQuestion } from "@/lib/kg/cs408Handouts";
import type { ReviewLesson } from "@/lib/kg/knowledgeReview";
import { practiceQuestionLocation } from "@/lib/kg/practiceLocation";
import type { UserItemMark } from "@/lib/kg/types";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { WangdaoStem } from "@/pages/wangdaoQuestion";
import { cn } from "@/lib/utils";

export function handoutQuestionLabel(question: Cs408HandoutQuestion): string {
  if (question.source === "exam") {
    const edition = question.edition ? ` · ${question.edition}` : "";
    return `${question.year} 年真题 · 第 ${question.item.n} 题${edition}`;
  }
  return practiceQuestionLocation(question.item);
}

const MARKS = [
  { mark: "pass", label: "会", className: "is-pass" },
  { mark: "fuzzy", label: "模糊", className: "is-fuzzy" },
  { mark: "fail", label: "不会", className: "is-fail" },
] as const;

function QuestionSteps({ question, lesson }: { question: Cs408HandoutQuestion; lesson?: ReviewLesson }) {
  const { item } = question;
  return (
    <div className="space-y-4 rounded-xl bg-[var(--mh-surface)] px-4 py-3" id="cs408-handout-steps">
      {lesson && (
        <ol className="list-decimal space-y-3 pl-5">
          {lesson.steps.map(step => (
            <li key={step.title}>
              <h3 className="text-sm font-bold">{step.title}</h3>
              <ReviewBlocks blocks={step.working} />
            </li>
          ))}
        </ol>
      )}
      {item.answer && <p className="whitespace-pre-wrap break-words text-sm"><strong>参考答案</strong> {item.answer}</p>}
      {question.source === "exam" ? (
        <>
          {question.item.explanation && (
            <div>
              <h3 className="text-sm font-bold">题库解析</h3>
              <p className="whitespace-pre-wrap break-words text-sm">{question.item.explanation}</p>
            </div>
          )}
          {question.item.answer_meta?.note && <p className="text-xs text-[var(--mh-muted)]">{question.item.answer_meta.note}</p>}
          {!!question.item.answer_meta?.page_images?.length && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">查看原版答案页</summary>
              {question.item.answer_meta.page_images.map((src, index) => (
                <img key={src} src={src} alt={`原版答案第 ${index + 1} 页`} className="my-2 w-full rounded-md bg-white" loading="lazy" />
              ))}
            </details>
          )}
          {!lesson && !question.item.explanation && !question.item.answer && !question.item.answer_meta?.page_images?.length && (
            <p className="text-sm text-[var(--mh-muted)]">题库暂缺这道题的答案与解析。</p>
          )}
        </>
      ) : (
        <>
          {question.item.ans_img && <img src={mediaUrl(question.item.ans_img) ?? undefined} alt="王道原书解析" className="w-full rounded-md bg-white" />}
          {question.item.book_ans_page != null && <p className="text-sm text-[var(--mh-muted)]">原书解析第 {question.item.book_ans_page} 页</p>}
          {!lesson && !question.item.answer && !question.item.ans_img && question.item.book_ans_page == null && (
            <p className="text-sm text-[var(--mh-muted)]">题库暂缺这道王道题的解析。</p>
          )}
        </>
      )}
    </div>
  );
}

interface QuestionProps {
  question: Cs408HandoutQuestion;
  lesson?: ReviewLesson;
  record?: UserItemMark;
  stepsOpen: boolean;
  onToggleSteps: () => void;
  onMark: (question: Cs408HandoutQuestion, mark: Cs408HandoutMark) => void;
  onToggleRetired: (question: Cs408HandoutQuestion) => void;
}

export function Cs408HandoutQuestionPage({ question, ...props }: QuestionProps) {
  const wangdao = question.source === "wangdao" ? question.item : null;
  const [full, setFull] = useState<WangdaoItem | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!wangdao) return;
    let live = true;
    hydratePracticeItems([wangdao]).then(([item]) => {
      if (!live) return;
      if (item?.stem || item?.img) setFull(item);
      else setError(true);
    }).catch(() => {
      if (live) setError(true);
    });
    return () => { live = false; };
  }, [wangdao, retry]);

  if (question.source === "exam") return <QuestionContent {...props} question={question} />;
  if (full) return <QuestionContent {...props} question={{ ...question, item: full }} />;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold">{handoutQuestionLabel(question)}</h3>
      {error ? (
        <div role="alert" className="flex items-center gap-3 text-sm">
          王道题目加载失败
          <button type="button" className="mh-btn" onClick={() => { setError(false); setRetry(n => n + 1); }}>重试</button>
        </div>
      ) : <p role="status" className="text-sm text-[var(--mh-muted)]">正在加载王道题目…</p>}
    </div>
  );
}

function QuestionContent({ question, lesson, record, stepsOpen, onToggleSteps, onMark, onToggleRetired }: QuestionProps) {
  const label = handoutQuestionLabel(question);
  return (
    <article className="space-y-4" aria-label={label}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--mh-line)] pb-2">
        <h3 className="text-base font-bold">{label}</h3>
        {question.source === "exam" && (
          <span className="text-xs text-[var(--mh-muted)]">{question.item.kind === "big" ? "大题" : "选择题"}</span>
        )}
      </div>
      {question.source === "wangdao" ? <WangdaoStem item={question.item} fitImage /> : (
        <div className="space-y-3 break-words">
          <p className="whitespace-pre-wrap">{question.item.stem}</p>
          {question.item.stem_images?.map((src, index) => (
            <img key={src} src={src} alt={`第 ${question.item.n} 题附图 ${index + 1}`} className="max-w-full rounded-md bg-white" />
          ))}
          {question.item.options && (
            <ul className="space-y-1">
              {Object.entries(question.item.options).map(([key, value]) => (
                <li key={key} className={cn("flex gap-2 rounded-md px-2 py-1", stepsOpen && question.item.answer === key && "bg-[var(--mh-ok-bg)] text-[var(--mh-ok)]")}>
                  <span className="w-5 shrink-0 font-semibold">{key}.</span>
                  <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mh-btn" aria-expanded={stepsOpen} aria-controls={stepsOpen ? "cs408-handout-steps" : undefined} onClick={onToggleSteps}>
          {stepsOpen ? "收起步骤与解析" : "展开步骤与解析"}
          <kbd className="mh-kbd">Space</kbd>
        </button>
      </div>
      {stepsOpen && <QuestionSteps question={question} lesson={lesson} />}
      <div className="flex flex-wrap items-center gap-2">
        {MARKS.map(({ mark, label: markLabel, className }) => (
          <button key={mark} type="button" disabled={record?.retired} aria-pressed={record?.mark === mark}
            className={cn("mh-mark-btn min-h-9 disabled:opacity-50", record?.mark === mark && className)}
            onClick={() => onMark(question, mark)}>
            {markLabel}
          </button>
        ))}
        <button type="button" className="mh-btn mh-btn-subtle" onClick={() => onToggleRetired(question)}>
          <Scissors className="h-4 w-4" />{record?.retired ? "移回题目" : "斩掉"}
        </button>
      </div>
    </article>
  );
}
