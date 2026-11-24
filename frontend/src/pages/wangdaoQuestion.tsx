import { lazy, Suspense, useEffect, useState } from "react";
import { findKp } from "@/data/kg";
import { ApiError } from "@/lib/api";
import type { KgExplainResult } from "@/lib/api";
import { canExplain, explainQuestion, peekExplain } from "@/lib/kg/explain";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { mediaUrl } from "@/lib/kg/catalogLoad";
import { mathFacetLabels } from "@/lib/kg/mathPractice";
import { cn } from "@/lib/utils";

type LlmPane = "answer" | "explain";

/** 服务端 detail 兜底文案：裸英文错误映射成中文 */
function explainErrorText(detail?: string): string {
  if (!detail) return "生成失败";
  if (detail === "parse failed") return "模型返回格式异常，请重试";
  return detail;
}

const MathExplanationPanel = lazy(() => import("./MathExplanationPanel").then((m) => ({ default: m.MathExplanationPanel })));

const OPT_KEYS = ["A", "B", "C", "D"] as const;

// 与做题本原图逐行核对的纯文字题面，保留小问、数值及原书定位。
const REVIEWED_TEXT_STEMS: Readonly<Partial<Record<string, string>>> = {
  "os-big-4.2-2": [
    "在实现文件系统时，为加快文件目录的检索速度，可利用“FCB 分解法”。假设目录文件存放在磁盘上，每个盘块 512 B。FCB 占 64 B，其中文件名占 8 B。通常将 FCB 分解成两部分，第一部分占 10 B（包括文件名和文件内部号），第二部分占 56 B（包括文件内部号和文件的其他描述信息）。",
    "（1）假设某一目录文件共有 254 个 FCB，试分别给出采用分解法前和分解法后，查找该目录文件的某个 FCB 的平均访问磁盘次数（访问每个文件的概率相同）。",
    "（2）一般地，若目录文件分解前占用 n 个盘块，分解后改用 m 个盘块存放文件名和文件内部号，请给出访问磁盘次数减少的条件（假设 m 和 n 个盘块中都正好装满）。",
  ].join("\n\n"),
};

export function WangdaoStem({
  item,
  size = "compact",
  fitImage = false,
  selectedOption = null,
  correctOption = null,
  revealCorrect = false,
  onSelectOption,
}: {
  item: WangdaoItem;
  /** large：大屏作答台用，题面与选项整体放大一档 */
  size?: "compact" | "large";
  /** 手稿单题页限制原图尺寸，细节仍可按原尺寸查看。 */
  fitImage?: boolean;
  /** 选择题当前已选选项（A-D） */
  selectedOption?: string | null;
  /** 选择题参考答案（A-D） */
  correctOption?: string | null;
  /** 是否高亮参考答案（例如已作答或展开解析后） */
  revealCorrect?: boolean;
  /** 传入后选项变为可点击按钮 */
  onSelectOption?: (key: string) => void;
}) {
  const large = size === "large";
  const reviewedStem = REVIEWED_TEXT_STEMS[item.id];
  const optionClass = (k: string) => {
    const isPicked = selectedOption === k;
    const isCorrect = Boolean(correctOption && k === correctOption);
    const showCorrect = isCorrect && (revealCorrect || Boolean(selectedOption));
    const showWrong = isPicked && Boolean(correctOption) && !isCorrect;
    const showNeutral = isPicked && !correctOption;
    return cn(
      "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer",
      showCorrect
        ? "border-[var(--mh-ok)] bg-[var(--mh-ok-bg)] text-[var(--mh-ok)]"
        : showWrong
          ? "border-[var(--mh-err)] bg-[var(--mh-err-bg)] text-[var(--mh-err)]"
          : showNeutral
            ? "border-[var(--mh-accent)] bg-[var(--mh-accent-soft)]"
            : "border-transparent hover:border-[var(--mh-line-strong)] hover:bg-[var(--mh-surface)]",
    );
  };

  if (item.img && !reviewedStem) {
    const src = mediaUrl(item.img)!;
    const alt = item.stem ? item.stem.slice(0, 80) : `第${item.qno}题`;
    const quickKeys = onSelectOption && item.kind === "mcq" ? OPT_KEYS : [];
    const quickBar = quickKeys.length > 0 && (
      <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="选择答案">
        {quickKeys.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={selectedOption === k}
            onClick={() => onSelectOption?.(k)}
            className={cn(optionClass(k), "w-auto min-w-[3.5rem] justify-center border-[var(--mh-line-strong)] font-semibold")}
          >
            {k}
          </button>
        ))}
      </div>
    );
    if (fitImage) {
      return (
        <div className="space-y-2">
          <figure className="max-w-[46rem] space-y-1.5">
            <img src={src} alt={alt} className="block h-auto max-h-[min(64vh,36rem)] w-auto max-w-full rounded-md bg-white object-contain" />
            <a href={src} target="_blank" rel="noreferrer" className="inline-block text-xs" aria-label="查看原尺寸题图（新标签页）">
              查看原图
            </a>
          </figure>
          {quickBar}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className={cn("overflow-hidden rounded-md bg-white", large ? "" : "-mx-1 sm:mx-0")}>
          <img
            src={src}
            alt={alt}
            className="h-auto w-full bg-white"
          />
        </div>
        {quickBar}
      </div>
    );
  }
  const opts = item.options;
  const keys = OPT_KEYS.filter((k) => opts?.[k]);
  return (
    <div className={large ? "space-y-4" : "space-y-3"}>
      <p className={cn("whitespace-pre-wrap leading-relaxed", large ? "text-[17px] leading-8" : "text-base")}>
        {reviewedStem ?? item.stem}
      </p>
      {keys.length > 0 && (
        <ul className={cn("leading-relaxed", large ? "space-y-2 text-base" : "space-y-1.5 text-sm")}>
          {keys.map((k) => (
            <li key={k}>
              {onSelectOption ? (
                <button
                  type="button"
                  aria-pressed={selectedOption === k}
                  onClick={() => onSelectOption(k)}
                  className={optionClass(k)}
                >
                  <span className="w-5 shrink-0 font-semibold">{k}.</span>
                  <span className="min-w-0 whitespace-pre-wrap break-words">{opts![k]}</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <span className="w-5 shrink-0 font-medium text-muted-foreground">{k}.</span>
                  <span className="min-w-0 whitespace-pre-wrap">{opts![k]}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuestionKpLine({ item }: { item: WangdaoItem }) {
  const names = (item.kp_ids || [])
    .map((id) => findKp(id)?.kp.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return null;
  return <p className="text-xs text-muted-foreground">考点：{names.join(" · ")}</p>;
}

export function QuestionFacetChips({ item }: { item: WangdaoItem }) {
  const labels = mathFacetLabels(item.facets);
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((f) => (
        <span
          key={f.id}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {f.name}
        </span>
      ))}
    </div>
  );
}

export function WangdaoAnalysis({
  item,
  revealAnswer = false,
}: { item: WangdaoItem; revealAnswer?: boolean }) {
  if (item.source === "lilin880" || item.source === "zhangyu1000") {
    return <Suspense fallback={<p className="text-xs text-muted-foreground">正在加载解析入口…</p>}><MathExplanationPanel key={item.id} itemId={item.id} revealAnswer={revealAnswer} /></Suspense>;
  }
  return <LegacyWangdaoAnalysis item={item} revealAnswer={revealAnswer} />;
}

function LegacyWangdaoAnalysis({
  item,
  revealAnswer = false,
}: {
  item: WangdaoItem;
  /** 空格 / 点卡片空白处：展开书本答案或书面答题 */
  revealAnswer?: boolean;
}) {
  const labels = mathFacetLabels(item.facets);
  const hasBook = Boolean(item.ans_img || item.answer);
  const llmOk = canExplain(item);
  const [open, setOpen] = useState(() => revealAnswer && (hasBook || labels.length > 0));
  const [pane, setPane] = useState<LlmPane | null>(() => (revealAnswer && llmOk ? "answer" : null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [llm, setLlm] = useState<KgExplainResult | null>(() => peekExplain(item.id));
  const src = mediaUrl(item.ans_img);

  useEffect(() => {
    setOpen(false);
    setPane(null);
    setBusy(false);
    setErr("");
    setLlm(peekExplain(item.id));
  }, [item.id]);

  useEffect(() => {
    if (!revealAnswer) return;
    if (hasBook || labels.length > 0) setOpen(true);
    if (!llmOk) return;
    setPane("answer");
    const hit = peekExplain(item.id);
    if (hit?.status === "ok") {
      setLlm(hit);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setErr("");
    void explainQuestion(item)
      .then((r) => {
        if (cancelled) return;
        if (r.status === "unconfigured") setErr("未配置 LLM（服务端）");
        else if (r.status !== "ok") setErr(explainErrorText(r.detail));
        else setLlm(r);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          setErr("请登录后生成（已缓存的仍可匿名读取）");
        } else {
          setErr(e instanceof Error ? e.message : "生成失败");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // 只在揭开/换题时拉一次；item 随 id 变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealAnswer, item.id]);

  if (!hasBook && labels.length === 0 && !llmOk) return null;

  async function fetchLlm() {
    if (llm?.status === "ok") return;
    setBusy(true);
    setErr("");
    try {
      const r = await explainQuestion(item);
      if (r.status === "unconfigured") {
        setErr("未配置 LLM（服务端）");
      } else if (r.status !== "ok") {
        setErr(explainErrorText(r.detail));
      } else {
        setLlm(r);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        setErr("请登录后生成（已缓存的仍可匿名读取）");
      } else {
        setErr(e instanceof Error ? e.message : "生成失败");
      }
    } finally {
      setBusy(false);
    }
  }

  function loadLlm(next: LlmPane) {
    if (pane === next && !busy) {
      setPane(null);
      return;
    }
    setPane(next);
    if (busy || llm?.status === "ok") return;
    void fetchLlm();
  }

  return (
    <div className="space-y-2">
      {(hasBook || labels.length > 0) && (
        <>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起解析" : item.ans_img || item.answer ? "看解析" : "看题型分类"}
          </button>
          {open && (
            <div className="space-y-2 overflow-hidden rounded-md border border-dashed bg-white p-3 dark:bg-background">
              {labels.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">解析分类</p>
                  <QuestionFacetChips item={item} />
                </div>
              )}
              {item.answer && (
                <p className="text-sm">
                  <span className="font-medium">答案：</span>
                  {item.answer}
                </p>
              )}
              {src && (
                <img
                  src={src}
                  alt={`第${item.qno}题解析`}
                  className="h-auto w-full bg-white"
                />
              )}
            </div>
          )}
        </>
      )}
      {llmOk && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["answer", "书面答题"],
                ["explain", "解析"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs",
                  pane === id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={() => loadLlm(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {pane && (
            <div className="space-y-2 overflow-hidden rounded-md border border-dashed bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                {pane === "answer"
                  ? "考场书面作答（可对照誊到答题纸）"
                  : "解析（思路、取整、易错点）"}
              </p>
              {busy && (
                <p className="text-sm text-muted-foreground">正在生成书面答题与解析…</p>
              )}
              {err && <p className="text-sm text-destructive">{err}</p>}
              {llm?.status === "ok" && pane === "answer" && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {llm.answer || llm.solution}
                </p>
              )}
              {llm?.status === "ok" && pane === "explain" && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {llm.solution || "暂无解析"}
                </p>
              )}
              {llm?.status === "ok" && (
                <p className="text-[11px] text-muted-foreground">
                  由模型生成{llm.cached ? "（已缓存）" : ""}，仅供参考
                  {item.book_ans_page != null ? `，以原书【P${item.book_ans_page}】为准` : ""}
                  {llm.model ? ` · ${llm.model}` : ""}
                </p>
              )}
              {err && !busy && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => void fetchLlm()}
                >
                  重试
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
