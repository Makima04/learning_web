import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy } from "@/stores/study";
import { useSettings } from "@/stores/settings";
import { lookupWord, restoreInflection } from "@/lib/lookup";
import { esc, cn } from "@/lib/utils";
import { translate } from "@/lib/llm";
import { speakEnglish } from "@/lib/tts";
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

function highlightBody(text: string, wordSet: Set<string>): string {
  return String(text).replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
    const low = m.toLowerCase();
    const restored = restoreInflection(low);
    const hit = wordSet.has(low) || wordSet.has(restored) || !!lookupWord(low);
    const e = esc(m);
    if (hit) return `<span class="r-hl c-word" data-w="${e}">${e}</span>`;
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

type RightTab = "trans" | "explain";

export function ReaderPage() {
  const reader = useStudy((s) => s.passageReader);
  const navigate = useNavigate();
  const settings = useSettings();
  const [active, setActive] = useState(0);
  const [transMap, setTransMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("trans");
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const [pop, setPop] = useState<{ word: string; x: number; y: number } | null>(
    null
  );
  const translatingRef = useRef(false);

  const sentences = useMemo(
    () => (reader ? splitSentences(reader.body) : []),
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

  useEffect(() => {
    if (!reader) navigate("/papers", { replace: true });
  }, [reader, navigate]);

  // 切换篇章时重置作答状态
  useEffect(() => {
    setActive(0);
    setTransMap({});
    setPicks({});
    setRevealed({});
    setShowAllAnswers(false);
    setRightTab(hasMcq ? "explain" : "trans");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader?.title, reader?.body]);

  const showCurrentTrans = useCallback(async () => {
    if (!sentences[active] || translatingRef.current) return;
    const en = sentences[active];
    if (transMap[active] == null) {
      translatingRef.current = true;
      setLoading(true);
      try {
        const zh = await translate(en);
        setTransMap((m) => ({ ...m, [active]: zh }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "翻译失败";
        setTransMap((m) => ({ ...m, [active]: msg }));
      } finally {
        setLoading(false);
        translatingRef.current = false;
      }
      setRightTab("trans");
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
    setPop({ word: surface, x: rect.left + rect.width / 2, y: rect.bottom + 6 });
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

  if (!reader) return null;

  const score = scoreSummary();
  const activeZh = transMap[active];

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
          <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
            <div
              className="space-y-2 leading-8 text-base"
              onClick={onWordClick}
            >
              {sentences.map((s, i) => (
                <div key={i}>
                  <span
                    className={cn(
                      "r-sent rounded px-0.5 transition-colors cursor-pointer",
                      i === active && "bg-primary/10 ring-1 ring-primary/30"
                    )}
                    data-i={i}
                    data-en={s}
                    dangerouslySetInnerHTML={{
                      __html: highlightBody(s, wordSet),
                    }}
                    onClick={() => {
                      setActive(i);
                      setRightTab("trans");
                    }}
                  />
                </div>
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
                {loading
                  ? "翻译中…"
                  : activeZh != null
                    ? "下一句"
                    : "译本句"}
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {rightTab === "trans" && (
              <>
                <div className="text-xs text-muted-foreground">
                  第 {sentences.length ? active + 1 : 0} / {sentences.length} 句
                  · 点左侧句子或空格译出
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
                    <p
                      className={cn(
                        "whitespace-pre-wrap",
                        /503|失败|未配置|错误|gateway/i.test(activeZh) &&
                          "text-destructive"
                      )}
                    >
                      {activeZh}
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
                {/* 已译句速览 */}
                {Object.keys(transMap).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      已译句子
                    </div>
                    {sentences.map((s, i) =>
                      transMap[i] != null ? (
                        <button
                          key={i}
                          type="button"
                          className={cn(
                            "w-full text-left rounded-md border px-2.5 py-2 text-xs hover:bg-muted/50",
                            i === active && "ring-1 ring-primary/40"
                          )}
                          onClick={() => setActive(i)}
                        >
                          <div className="text-muted-foreground tnum mb-0.5">
                            #{i + 1}
                          </div>
                          <div className="line-clamp-2 text-foreground/90">
                            {transMap[i]}
                          </div>
                        </button>
                      ) : null
                    )}
                  </div>
                )}
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
          surface={pop.word}
          x={pop.x}
          y={pop.y}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}
