import { useEffect, useState } from "react";
import { findKp } from "@/data/kg";
import { ApiError } from "@/lib/api";
import type { KgExplainResult } from "@/lib/api";
import { canExplain, explainQuestion, peekExplain } from "@/lib/kg/explain";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { mediaUrl } from "@/lib/kg/catalogLoad";
import { mathFacetLabels } from "@/lib/kg/mathPractice";
import { cn } from "@/lib/utils";

type LlmPane = "answer" | "explain";

const OPT_KEYS = ["A", "B", "C", "D"] as const;

export function WangdaoStem({ item }: { item: WangdaoItem }) {
  if (item.img) {
    const src = mediaUrl(item.img)!;
    return (
      <div className="-mx-1 overflow-hidden rounded-md bg-white sm:mx-0">
        <img
          src={src}
          alt={item.stem ? item.stem.slice(0, 80) : `第${item.qno}题`}
          className="h-auto w-full bg-white"
        />
      </div>
    );
  }
  const opts = item.options;
  const keys = OPT_KEYS.filter((k) => opts?.[k]);
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-base leading-relaxed">{item.stem}</p>
      {keys.length > 0 && (
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {keys.map((k) => (
            <li key={k} className="flex gap-2">
              <span className="w-5 shrink-0 font-medium text-muted-foreground">{k}.</span>
              <span className="min-w-0 whitespace-pre-wrap">{opts![k]}</span>
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
        else if (r.status !== "ok") setErr(r.detail || "生成失败");
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
        setErr(r.detail || "生成失败");
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
