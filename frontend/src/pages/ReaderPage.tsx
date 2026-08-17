import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStudy } from "@/stores/study";
import { useSettings } from "@/stores/settings";
import { isClickableSurface, lookupWord, restoreInflection } from "@/lib/lookup";
import {
  loadPassageReader,
  parsePassageReaderParams,
  passageReaderMatches,
} from "@/lib/passageReader";
import { esc, cn } from "@/lib/utils";
import { translate } from "@/lib/llm";
import { speakEnglish } from "@/lib/tts";
import { useTrans } from "@/stores/trans";
import { Button } from "@/components/ui/button";
import { WordPopover } from "@/components/WordPopover";
import type { PassageItem } from "@/types/words";

/**
 * 分句：句末 .!? 后跟空白/引号再接大写或文末。
 * 避免把 9.8 / U.S. / Mr. 等小数与缩写拆开。
 */
function splitSentences(body: string): string[] {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (!/[.!?]/.test(ch)) continue;
    // 小数：digit . digit
    if (ch === "." && /\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || "")) {
      continue;
    }
    // 常见缩写：单字母. / U.S. / Mr. / Mrs. / Dr. / etc.
    if (ch === ".") {
      const before = buf.slice(0, -1);
      if (/(?:^|[^A-Za-z])[A-Za-z]$/.test(before)) continue; // X.
      if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|etc|e\.g|i\.e|U\.S|U\.K)$/i.test(before))
        continue;
    }
    // 吞掉尾部引号
    let j = i + 1;
    while (j < text.length && /["'”’)]/.test(text[j])) {
      buf += text[j];
      j++;
    }
    // 需要空白或文末才算句界
    if (j >= text.length || /\s/.test(text[j])) {
      const s = buf.trim();
      if (s) out.push(s);
      buf = "";
      i = j - 1;
      // 跳过空格（下一句开头会 trim）
      while (i + 1 < text.length && /\s/.test(text[i + 1])) i++;
    }
  }
  const rest = buf.trim();
  if (rest) out.push(rest);
  return out.length ? out : [text];
}

/** 按空行/换行切段；无换行则整篇一段（卷面式连续段落） */
function splitParagraphs(body: string): string[] {
  const text = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (/\n\s*\n/.test(text)) {
    return text
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/[ \t\n]+/g, " ").trim())
      .filter(Boolean);
  }
  if (/\n/.test(text)) {
    return text
      .split(/\n+/)
      .map((p) => p.replace(/[ \t\n]+/g, " ").trim())
      .filter(Boolean);
  }
  return [text.replace(/\s+/g, " ").trim()];
}

interface ParaSent {
  text: string;
  globalIndex: number;
}

/**
 * 段 → 句；保留全局句下标供译句 / active。
 * sentences 顺序与原先整篇分句一致（段内空白折叠后）。
 */
function buildParagraphs(body: string): {
  paragraphs: ParaSent[][];
  sentences: string[];
} {
  const paragraphs: ParaSent[][] = [];
  const sentences: string[] = [];
  let globalIndex = 0;
  for (const para of splitParagraphs(body)) {
    const sents = splitSentences(para);
    const row: ParaSent[] = [];
    for (const text of sents) {
      row.push({ text, globalIndex });
      sentences.push(text);
      globalIndex++;
    }
    if (row.length) paragraphs.push(row);
  }
  return { paragraphs, sentences };
}

/**
 * 词级高亮：篇章目标词用 r-hl；其余可点实词（词库 + 词库外 LLM）用 c-word。
 */
function highlightBody(text: string, wordSet: Set<string>): string {
  return String(text).replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
    const low = m.toLowerCase();
    const restored = restoreInflection(low);
    const e = esc(m);
    const isTarget =
      wordSet.has(low) || wordSet.has(restored) || wordSet.has(restoreInflection(restored));
    if (isTarget) {
      return `<span class="r-hl c-word" data-w="${e}">${e}</span>`;
    }
    if (lookupWord(low)) {
      return `<span class="c-word" data-w="${e}">${e}</span>`;
    }
    if (isClickableSurface(m)) {
      return `<span class="c-word c-word-oov" data-w="${e}">${e}</span>`;
    }
    return e;
  });
}

/** 清洗选项里夹带的页脚噪声 */
function cleanOptionText(s: string): string {
  return String(s || "")
    .replace(/\s*英语试题\s*[.．]?\s*\d+\s*[.．]?\s*（共\s*\d+\s*页）\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 译句请求世代：换句 / 新请求递增，stale 的 then/finally 不得写译文或清旗 */
export type TransReqGate = { latest: number };

export function startTransReq(gate: TransReqGate): number {
  gate.latest += 1;
  return gate.latest;
}

/** cleanup 作废本轮。仍是最新一轮时调用方必须复位 loading / translatingRef */
export function invalidateTransReq(gate: TransReqGate, reqId: number): boolean {
  if (gate.latest !== reqId) return false;
  gate.latest += 1;
  return true;
}

export function isCurrentTransReq(gate: TransReqGate, reqId: number): boolean {
  return gate.latest === reqId;
}

/** 早退 / 换篇：作废一切 in-flight，调用方接着复位 loading 旗 */
export function abandonTransReq(gate: TransReqGate): void {
  gate.latest += 1;
}

export type ReaderTransAction = "busy" | "next" | "retry" | "translate";

/** 失败不算已译：保持译本句 / 重试，空格再请求而不是跳下一句 */
export function readerTransAction(
  loading: boolean,
  hasTrans: boolean,
  hasErr: boolean
): ReaderTransAction {
  if (loading) return "busy";
  if (hasTrans) return "next";
  return hasErr ? "retry" : "translate";
}

const TRANS_BTN_LABEL: Record<ReaderTransAction, string> = {
  busy: "翻译中…",
  next: "下一句",
  retry: "重试",
  translate: "译本句",
};

function omitIdx(
  prev: Record<number, string>,
  idx: number
): Record<number, string> {
  if (prev[idx] == null) return prev;
  const next = { ...prev };
  delete next[idx];
  return next;
}

type RightTab = "trans" | "explain";

export function ReaderPage() {
  const params = useParams<{ variant: string; year: string; label: string }>();
  const reader = useStudy((s) => s.passageReader);
  const setPassageReader = useStudy((s) => s.setPassageReader);
  const navigate = useNavigate();
  const settings = useSettings();
  const [active, setActive] = useState(0);
  const [transMap, setTransMap] = useState<Record<number, string>>({});
  const [transErr, setTransErr] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("trans");
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const [pop, setPop] = useState<{
    word: string;
    x: number;
    y: number;
    context?: string;
  } | null>(
    null
  );
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const translatingRef = useRef(false);
  const transMapRef = useRef(transMap);
  transMapRef.current = transMap;
  const transReqGateRef = useRef<TransReqGate>({ latest: 0 });

  const routeKey = useMemo(
    () => parsePassageReaderParams(params),
    [params.variant, params.year, params.label]
  );

  // URL 深链：刷新后从 window.PAPERS 重建 passageReader
  useEffect(() => {
    if (!routeKey) {
      navigate("/papers", { replace: true });
      return;
    }
    if (passageReaderMatches(reader, routeKey)) {
      setHydrateFailed(false);
      return;
    }
    const loaded = loadPassageReader(routeKey);
    if (loaded) {
      setPassageReader(loaded);
      setHydrateFailed(false);
    } else {
      setHydrateFailed(true);
      navigate("/papers", { replace: true });
    }
  }, [routeKey, reader, setPassageReader, navigate]);

  const { paragraphs, sentences } = useMemo(
    () => (reader ? buildParagraphs(reader.body) : { paragraphs: [], sentences: [] }),
    [reader]
  );
  const wordSet = useMemo(() => {
    const s = new Set<string>();
    (reader?.words || []).forEach((w) => s.add(w.toLowerCase()));
    return s;
  }, [reader]);

  const items: PassageItem[] = useMemo(
    () => (Array.isArray(reader?.items) ? reader!.items! : []),
    [reader]
  );
  const answers = reader?.answers || {};
  const hasMcq = items.length > 0;

  // 切换篇章时重置作答状态
  useEffect(() => {
    setActive(0);
    setTransMap({});
    setTransErr({});
    abandonTransReq(transReqGateRef.current);
    setLoading(false);
    translatingRef.current = false;
    setPicks({});
    setRevealed({});
    setShowAllAnswers(false);
    setRightTab(hasMcq ? "explain" : "trans");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader?.title, reader?.body, routeKey?.year, routeKey?.label, routeKey?.variant]);

  /**
   * 切换当前句时自动拉译文：
   * 1) 本地 trans 缓存瞬间显示
   * 2) 否则请求服务端（库里已有则秒回 cached，无需再点「译本句」）
   * 点按钮仍可手动触发；已译时变为「下一句」。
   * 换句必须作废旧 req 并复位 loading，避免早退路径留下「翻译中…」。
   */
  useEffect(() => {
    const gate = transReqGateRef.current;
    const resetFlag = () => {
      translatingRef.current = false;
      setLoading(false);
    };

    const en = sentences[active];
    if (!en) {
      abandonTransReq(gate);
      resetFlag();
      return;
    }
    const idx = active;
    if (transMapRef.current[idx] != null) {
      abandonTransReq(gate);
      resetFlag();
      return;
    }

    const local = useTrans.getState().getTrans(en);
    if (local !== undefined) {
      abandonTransReq(gate);
      setTransMap((m) => ({ ...m, [idx]: local }));
      setTransErr((e) => omitIdx(e, idx));
      resetFlag();
      return;
    }

    const reqId = startTransReq(gate);
    translatingRef.current = true;
    setLoading(true);
    void translate(en)
      .then((zh) => {
        if (!isCurrentTransReq(gate, reqId)) return;
        setTransMap((m) => ({ ...m, [idx]: zh }));
        setTransErr((e) => omitIdx(e, idx));
      })
      .catch((e: unknown) => {
        if (!isCurrentTransReq(gate, reqId)) return;
        const msg = e instanceof Error ? e.message : "翻译失败";
        setTransErr((er) => ({ ...er, [idx]: msg }));
      })
      .finally(() => {
        // 只清自己的请求，慢回包不得清新句 loading
        if (!isCurrentTransReq(gate, reqId)) return;
        resetFlag();
      });

    return () => {
      if (invalidateTransReq(gate, reqId)) resetFlag();
    };
  }, [active, sentences]);

  const showCurrentTrans = useCallback(async () => {
    if (!sentences[active] || translatingRef.current) return;
    const en = sentences[active];
    const idx = active;
    if (transMap[idx] == null) {
      const gate = transReqGateRef.current;
      const reqId = startTransReq(gate);
      translatingRef.current = true;
      setLoading(true);
      setRightTab("trans");
      try {
        const zh = await translate(en);
        if (!isCurrentTransReq(gate, reqId)) return;
        setTransMap((m) => ({ ...m, [idx]: zh }));
        setTransErr((e) => omitIdx(e, idx));
      } catch (e: unknown) {
        if (!isCurrentTransReq(gate, reqId)) return;
        const msg = e instanceof Error ? e.message : "翻译失败";
        setTransErr((er) => ({ ...er, [idx]: msg }));
      } finally {
        if (isCurrentTransReq(gate, reqId)) {
          setLoading(false);
          translatingRef.current = false;
        }
      }
      return;
    }
    if (active < sentences.length - 1) {
      setActive((a) => a + 1);
      requestAnimationFrame(() => {
        document
          .querySelector(`.r-sent[data-i="${active + 1}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [active, sentences, transMap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void showCurrentTrans();
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, Math.max(0, sentences.length - 1)));
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCurrentTrans, sentences.length]);

  function onWordClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    const w = t.closest(".c-word") as HTMLElement | null;
    if (!w) return;
    e.stopPropagation();
    const surface = w.getAttribute("data-w") || w.textContent || "";
    const rect = w.getBoundingClientRect();
    // 所在句子作 LLM 选义上下文
    const sentEl = w.closest("[data-en]") as HTMLElement | null;
    const context = sentEl?.getAttribute("data-en") || undefined;
    setPop({
      word: surface,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
      context,
    });
    if (settings.speakOnWordClick) speakEnglish(surface, settings.rate);
  }

  function pickOption(n: number, key: string) {
    setPicks((p) => ({ ...p, [n]: key }));
    setRevealed((r) => ({ ...r, [n]: true }));
    setRightTab("explain");
  }

  function scoreSummary() {
    if (!hasMcq) return null;
    let correct = 0;
    let answered = 0;
    for (const it of items) {
      const ans = answers[String(it.n)];
      if (!ans) continue;
      if (picks[it.n] || showAllAnswers) {
        answered++;
        if ((picks[it.n] || "").toUpperCase() === ans.toUpperCase()) correct++;
      }
    }
    return { correct, answered, total: items.length };
  }

  if (!reader) {
    if (hydrateFailed) return null;
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
        正在载入篇章…
      </div>
    );
  }

  const score = scoreSummary();
  const activeZh = transMap[active];
  const activeErr = transErr[active];
  const transAction = readerTransAction(loading, activeZh != null, activeErr != null);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] min-h-0">
      <header className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          ‹
        </Button>
        <div className="font-medium truncate flex-1">{reader.title}</div>
        <div className="text-xs text-muted-foreground shrink-0 hidden sm:block">
          空格译句 · ↑↓ 换句
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/papers")}>
          返回真题
        </Button>
      </header>

      {/* 左右分栏：小屏上下叠 */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* 左：原文 + 选择题 */}
        <div className="flex-1 min-h-0 overflow-auto border-b lg:border-b-0 lg:border-r">
          <div className="p-4 md:p-8 max-w-3xl mx-auto w-full">
            <div
              className="reader-body text-[1.08rem] leading-[1.95] tracking-[0.01em]"
              onClick={onWordClick}
            >
              {paragraphs.map((para, pi) => (
                <p key={pi} className="reader-para">
                  {para.map((sent, si) => (
                    <span key={sent.globalIndex}>
                      {si > 0 ? " " : null}
                      <span
                        className={cn(
                          "r-sent cursor-pointer rounded-sm transition-colors",
                          sent.globalIndex === active && "r-sent-active"
                        )}
                        data-i={sent.globalIndex}
                        data-en={sent.text}
                        dangerouslySetInnerHTML={{
                          __html: highlightBody(sent.text, wordSet),
                        }}
                        onClick={() => {
                          setActive(sent.globalIndex);
                          setRightTab("trans");
                        }}
                      />
                    </span>
                  ))}
                </p>
              ))}
            </div>

            {hasMcq && (
              <div className="mt-8 space-y-5 border-t pt-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-sm tracking-wide text-muted-foreground">
                    选择题 · 共 {items.length} 题
                  </h2>
                  {score && score.answered > 0 && (
                    <span className="text-xs text-muted-foreground tnum">
                      已答 {score.answered}/{score.total}
                      {showAllAnswers || score.answered === score.total
                        ? ` · 对 ${score.correct}`
                        : ""}
                    </span>
                  )}
                </div>
                {items.map((it) => {
                  const ans = answers[String(it.n)];
                  const picked = picks[it.n];
                  const open = !!revealed[it.n] || showAllAnswers;
                  const opts = Object.entries(it.options || {});
                  return (
                    <div
                      key={it.n}
                      className="rounded-lg border bg-card p-3 md:p-4 space-y-2"
                    >
                      <div className="font-medium text-sm leading-relaxed">
                        <span className="text-primary tnum mr-1.5">{it.n}.</span>
                        {it.stem
                          ? cleanOptionText(it.stem)
                          : `第 ${it.n} 题（完形填空）`}
                      </div>
                      <div className="grid gap-1.5">
                        {opts.map(([k, v]) => {
                          const key = k.toUpperCase();
                          const isPick = picked?.toUpperCase() === key;
                          const isAns = ans?.toUpperCase() === key;
                          let tone =
                            "border-transparent bg-muted/40 hover:bg-muted";
                          if (open && isAns)
                            tone =
                              "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
                          else if (open && isPick && !isAns)
                            tone =
                              "border-destructive/50 bg-destructive/10 text-destructive";
                          else if (isPick)
                            tone = "border-primary/50 bg-primary/10";
                          return (
                            <button
                              key={k}
                              type="button"
                              className={cn(
                                "text-left text-sm rounded-md border px-2.5 py-1.5 transition-colors",
                                tone
                              )}
                              onClick={() => pickOption(it.n, key)}
                            >
                              <span className="font-semibold mr-2 tnum">
                                {key}.
                              </span>
                              {cleanOptionText(v)}
                            </button>
                          );
                        })}
                      </div>
                      {open && ans && (
                        <div className="text-xs text-muted-foreground pt-1">
                          正确答案：
                          <b className="text-foreground ml-1">{ans.toUpperCase()}</b>
                          {picked &&
                            picked.toUpperCase() !== ans.toUpperCase() && (
                              <span className="ml-2 text-destructive">
                                你的选择：{picked.toUpperCase()}
                              </span>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAllAnswers(true);
                      setRightTab("explain");
                    }}
                  >
                    显示全部答案
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPicks({});
                      setRevealed({});
                      setShowAllAnswers(false);
                    }}
                  >
                    清空作答
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右：译文 / 解析 */}
        <aside className="lg:w-[min(420px,40%)] shrink-0 flex flex-col min-h-[40vh] lg:min-h-0 border-t lg:border-t-0 bg-muted/20">
          <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
            <Button
              size="sm"
              variant={rightTab === "trans" ? "default" : "ghost"}
              onClick={() => setRightTab("trans")}
            >
              译文
            </Button>
            {hasMcq && (
              <Button
                size="sm"
                variant={rightTab === "explain" ? "default" : "ghost"}
                onClick={() => setRightTab("explain")}
              >
                答案解析
              </Button>
            )}
            <div className="flex-1" />
            {rightTab === "trans" && (
              <Button
                size="sm"
                onClick={() => void showCurrentTrans()}
                disabled={loading || !sentences[active]}
              >
                {TRANS_BTN_LABEL[transAction]}
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {rightTab === "trans" && (
              <>
                <div className="text-xs text-muted-foreground">
                  第 {sentences.length ? active + 1 : 0} / {sentences.length} 句
                  · 点左侧句子自动出译 · 空格下一句
                </div>
                <div className="rounded-lg border bg-background p-3 text-sm leading-relaxed">
                  <div className="text-muted-foreground text-xs mb-2">原文</div>
                  <p className="whitespace-pre-wrap">
                    {sentences[active] || "（无原文）"}
                  </p>
                </div>
                <div className="rounded-lg border bg-background p-3 text-sm leading-relaxed min-h-[5rem]">
                  <div className="text-muted-foreground text-xs mb-2">中文</div>
                  {loading && activeZh == null ? (
                    <p className="text-muted-foreground">正在请求翻译…</p>
                  ) : activeZh != null ? (
                    <p className="whitespace-pre-wrap">{activeZh}</p>
                  ) : activeErr != null ? (
                    <p className="whitespace-pre-wrap text-destructive">
                      {activeErr}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      尚未翻译。按空格或点「译本句」。
                      <br />
                      <span className="text-xs">
                        提示：网关 503 时请稍后再试，已成功的句子会本地缓存。
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}

            {rightTab === "explain" && hasMcq && (
              <>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  点左侧选项即可对照标准答案。数据来自真题解析字段（标准答案）；
                  尚无逐题文字解析时，右侧汇总作答与答案键。
                </div>
                {score && (
                  <div className="rounded-lg border bg-background p-3 text-sm">
                    <div className="font-medium mb-1">作答进度</div>
                    <div className="text-muted-foreground tnum">
                      已答 {score.answered} / {score.total}
                      {(showAllAnswers || score.answered > 0) && (
                        <>
                          {" "}
                          · 正确{" "}
                          <b className="text-foreground">{score.correct}</b>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {items.map((it) => {
                    const ans = answers[String(it.n)]?.toUpperCase() || "—";
                    const picked = picks[it.n]?.toUpperCase();
                    const open = !!revealed[it.n] || showAllAnswers;
                    const ok =
                      open && picked && ans !== "—" && picked === ans;
                    const bad =
                      open && picked && ans !== "—" && picked !== ans;
                    return (
                      <div
                        key={it.n}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm",
                          ok && "border-emerald-500/40 bg-emerald-500/5",
                          bad && "border-destructive/40 bg-destructive/5"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tnum">{it.n}.</span>
                          {open ? (
                            <>
                              <span>
                                答案 <b>{ans}</b>
                              </span>
                              {picked && (
                                <span
                                  className={cn(
                                    "text-xs",
                                    ok
                                      ? "text-emerald-700 dark:text-emerald-300"
                                      : "text-destructive"
                                  )}
                                >
                                  {ok ? "正确" : `你选 ${picked}`}
                                </span>
                              )}
                              {!picked && showAllAnswers && (
                                <span className="text-xs text-muted-foreground">
                                  未作答
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              未揭晓 · 点左栏选项
                            </span>
                          )}
                        </div>
                        {open && it.stem && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {cleanOptionText(it.stem)}
                          </div>
                        )}
                        {open && ans !== "—" && it.options?.[ans] && (
                          <div className="text-xs mt-1">
                            <span className="text-muted-foreground">选项：</span>
                            {cleanOptionText(it.options[ans])}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!Object.keys(answers).length && (
                  <p className="text-sm text-muted-foreground">
                    本篇暂无标准答案数据。
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {pop && (
        <WordPopover
          key={`${pop.word}-${pop.x}-${pop.y}`}
          surface={pop.word}
          x={pop.x}
          y={pop.y}
          context={pop.context}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}
