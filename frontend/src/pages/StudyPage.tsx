import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy } from "@/stores/study";
import type { Quality } from "@/lib/srs";
import * as SRS from "@/lib/srs";
import { useSettings } from "@/stores/settings";
import { getWords } from "@/lib/words";
import { highlightTarget, mulberry32, shuffle } from "@/lib/lookup";
import { esc } from "@/lib/utils";
import { speak, speakEnglish } from "@/lib/tts";
import { translate } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { WordPopover } from "@/components/WordPopover";
import { cn } from "@/lib/utils";

export function StudyPage() {
  const navigate = useNavigate();
  const mode = useStudy((s) => s.mode);
  const queue = useStudy((s) => s.queue);
  const qpos = useStudy((s) => s.qpos);
  const groupEnd = useStudy((s) => s.groupEnd);
  const uiPhase = useStudy((s) => s.uiPhase);
  const assessChoice = useStudy((s) => s.assessChoice);
  const quizChoices = useStudy((s) => s.quizChoices);
  const quizLocked = useStudy((s) => s.quizLocked);
  const sessionStats = useStudy((s) => s.sessionStats);
  const passageSkipped = useStudy((s) => s.passageSkipped);
  const flipped = useStudy((s) => s.flipped);
  const hintVisible = useStudy((s) => s.hintVisible);
  const currentItem = useStudy((s) => s.currentItem);
  const currentEntry = useStudy((s) => s.currentEntry);
  const getExample = useStudy((s) => s.getExample);
  const handleRate = useStudy((s) => s.handleRate);
  const assessFullNext = useStudy((s) => s.assessFullNext);
  const assessFullMistake = useStudy((s) => s.assessFullMistake);
  const quiz2Answer = useStudy((s) => s.quiz2Answer);
  const flip = useStudy((s) => s.flip);
  const setQuizChoices = useStudy((s) => s.setQuizChoices);
  const setHintVisible = useStudy((s) => s.setHintVisible);
  const advanceToNextGroup = useStudy((s) => s.advanceToNextGroup);
  const resetSession = useStudy((s) => s.resetSession);
  const settings = useSettings();

  const item = currentItem();
  const entry = currentEntry();
  const example = item ? getExample(item) : null;

  const previews = useMemo(() => {
    if (uiPhase !== "review-back" || !item) return null;
    return {
      again: SRS.preview(item.card, "again"),
      hard: SRS.preview(item.card, "hard"),
      good: SRS.preview(item.card, "good"),
      easy: SRS.preview(item.card, "easy"),
    };
  }, [uiPhase, item]);

  const [transText, setTransText] = useState<string | null>(null);
  const [transLoading, setTransLoading] = useState(false);
  const [transErr, setTransErr] = useState(false);
  const [pop, setPop] = useState<{ word: string; x: number; y: number } | null>(
    null
  );

  // quiz2 choices init
  useEffect(() => {
    if (uiPhase !== "quiz2" || !item || !entry) return;
    const correctCn = entry[2]?.[0]?.[1] || "";
    const WORDS = getWords();
    const pool = WORDS.filter((w) => w[0] !== item.idx);
    const picked: string[] = [];
    const used = new Set<string>();
    while (picked.length < 3 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      const w = pool.splice(i, 1)[0];
      const cn = w[2]?.[0]?.[1];
      if (!cn || used.has(cn)) continue;
      used.add(cn);
      picked.push(cn);
    }
    setQuizChoices(
      shuffle([
        { cn: correctCn, correct: true },
        ...picked.map((cn) => ({ cn, correct: false })),
      ])
    );
  }, [uiPhase, item?.idx, entry, setQuizChoices]);

  // reset trans on card change
  useEffect(() => {
    setTransText(null);
    setTransErr(false);
    setTransLoading(false);
    setPop(null);
  }, [qpos, uiPhase]);

  // 3s hint
  useEffect(() => {
    if (uiPhase !== "assess-front" && uiPhase !== "review-front") return;
    if (!example) return;
    const t = setTimeout(() => setHintVisible(true), 3000);
    return () => clearTimeout(t);
  }, [uiPhase, qpos, example, setHintVisible]);

  // auto speak
  useEffect(() => {
    if (!settings.autoSpeak || !entry) return;
    if (
      uiPhase === "assess-front" ||
      uiPhase === "quiz1-front" ||
      uiPhase === "quiz1-back" ||
      uiPhase === "quiz2" ||
      (uiPhase === "review-front" && !useCnFirst()) ||
      uiPhase === "assess-full" ||
      uiPhase === "review-back" ||
      uiPhase === "quiz3-back"
    ) {
      speakEnglish(entry[1], settings.rate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiPhase, qpos]);

  function useCnFirst() {
    if (!item) return false;
    const dir = settings.direction;
    return (
      dir === "cn2en" ||
      (dir === "random" && mulberry32(settings.orderSeed ^ item.idx)() < 0.5)
    );
  }

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (uiPhase === "done" || uiPhase === "group-done" || uiPhase === "idle") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (uiPhase === "assess-full") {
          assessFullNext();
        } else if (
          uiPhase === "quiz1-front" ||
          uiPhase === "quiz3-front" ||
          uiPhase === "review-front"
        ) {
          flip();
        } else if (
          uiPhase === "review-back" &&
          !transText &&
          example
        ) {
          void loadTrans();
        }
        return;
      }
      if (uiPhase === "assess-front") {
        if (e.key === "1") handleRate("good");
        if (e.key === "2") handleRate("hard");
        if (e.key === "3") handleRate("again");
      } else if (uiPhase === "assess-full") {
        if (e.key === "1") assessFullNext();
        if (e.key === "2" && assessChoice !== "again") assessFullMistake();
      } else if (uiPhase === "quiz2" && !quizLocked) {
        const i = parseInt(e.key, 10) - 1;
        if (i >= 0 && i < 4) quiz2Answer(i);
      } else if (uiPhase === "quiz1-back" || uiPhase === "quiz3-back") {
        if (e.key === "1") handleRate("good");
        if (e.key === "2") handleRate("again");
      } else if (uiPhase === "review-back") {
        const map: Record<string, Quality> = {
          "1": "again",
          "2": "hard",
          "3": "good",
          "4": "easy",
        };
        if (map[e.key]) handleRate(map[e.key]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uiPhase, assessChoice, quizLocked, transText, example]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  async function loadTrans() {
    if (!example || transLoading) return;
    setTransLoading(true);
    setTransErr(false);
    try {
      const zh = await translate(example);
      setTransText(zh);
    } catch (e: any) {
      setTransText(e?.message || "翻译失败");
      setTransErr(true);
    } finally {
      setTransLoading(false);
    }
  }

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

  function onCardBlankClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) void loadTrans();
  }

  // empty / wrong entry
  if (uiPhase === "idle") {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">没有进行中的学习会话</p>
        <Button onClick={() => navigate("/")}>回首页</Button>
      </div>
    );
  }

  if (uiPhase === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-semibold">
          {sessionStats.studied === 0 ? "今日任务已完成" : "本组学习完成"}
        </h2>
        <p className="text-muted-foreground">
          本轮 {sessionStats.studied} 词
          {sessionStats.newDone ? ` · 新词 ${sessionStats.newDone}` : ""}
          {sessionStats.reviewDone ? ` · 复习 ${sessionStats.reviewDone}` : ""}
          {passageSkipped ? ` · 跳过已背 ${passageSkipped}` : ""}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              resetSession();
              navigate("/");
            }}
          >
            回首页
          </Button>
          {mode === "passage" && (
            <Button variant="outline" onClick={() => navigate("/papers-recite")}>
              继续真题记词
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (uiPhase === "group-done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-semibold">本组完成</h2>
        <p className="text-muted-foreground">
          进度 {qpos} / {queue.length}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => advanceToNextGroup()}>下一组</Button>
          <Button
            variant="outline"
            onClick={() => {
              resetSession();
              navigate("/");
            }}
          >
            回首页
          </Button>
        </div>
      </div>
    );
  }

  if (!item || !entry) {
    return (
      <div className="p-8 text-center">
        <Button onClick={() => navigate("/")}>回首页</Button>
      </div>
    );
  }

  const senses = entry[2] || [];
  const sensesHTML = senses
    .map(
      (s) =>
        `<div class="flex gap-2 py-0.5"><span class="text-muted-foreground text-sm shrink-0">${esc(s[0])}</span><span>${esc(s[1])}</span></div>`
    )
    .join("");
  const cnJoin = senses.map((s) => s[1]).join("；");
  const exHTML = example ? highlightTarget(example, entry[1], esc) : "";

  const pct = queue.length ? (qpos / queue.length) * 100 : 0;

  function ExampleBlock({ withTrans }: { withTrans?: boolean }) {
    if (!example) return null;
    return (
      <div className="mt-4 text-left w-full" onClick={onWordClick}>
        <div className="text-xs text-muted-foreground mb-1">真题例句</div>
        <div
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: exHTML }}
        />
        {withTrans && (
          <div className="mt-2">
            {transText ? (
              <div
                className={cn(
                  "text-sm rounded-md bg-muted/50 px-3 py-2",
                  transErr && "text-destructive"
                )}
              >
                {transText}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={transLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  void loadTrans();
                }}
              >
                {transLoading ? "翻译中…" : "查看例句翻译"}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  function SpeakBtn({ withEx }: { withEx?: boolean }) {
    return (
      <button
        type="button"
        className="absolute top-3 right-3 text-lg opacity-70 hover:opacity-100"
        title="发音"
        onClick={(e) => {
          e.stopPropagation();
          if (withEx && example) {
            speak(entry![1], settings.rate, () =>
              setTimeout(() => speak(example, settings.rate), 400)
            );
          } else speakEnglish(entry![1], settings.rate);
        }}
      >
        🔊
      </button>
    );
  }

  let body: React.ReactNode = null;
  let rating: React.ReactNode = null;
  let showFlip = false;

  if (uiPhase === "assess-front") {
    body = (
      <div className="relative flex flex-col items-center justify-center min-h-[360px] p-6 md:min-h-[460px] md:p-8">
        <div className="text-xs text-muted-foreground mb-4 self-start">新词 · 评估</div>
        <SpeakBtn />
        <div className="text-3xl md:text-4xl font-semibold tracking-wide">{entry[1]}</div>
        {hintVisible && example && (
          <div className="mt-6 w-full opacity-70" onClick={onWordClick}>
            <div className="text-xs text-muted-foreground mb-1">真题例句 · 回忆提示</div>
            <div
              className="text-sm"
              dangerouslySetInnerHTML={{ __html: exHTML }}
            />
          </div>
        )}
      </div>
    );
    rating = (
      <RateRow
        className="grid-cols-3"
        btns={[
          { k: "1", l: "认识", q: "good" },
          { k: "2", l: "模糊", q: "hard" },
          { k: "3", l: "忘记", q: "again" },
        ]}
        onRate={handleRate}
      />
    );
  } else if (uiPhase === "assess-full") {
    const noteMap: Record<string, string> = {
      good: "已标记「认识」→ 进入复习队列",
      hard: "已标记「模糊」→ 进入 3 次练习",
      again: "已标记「忘记」→ 进入 3 次练习",
    };
    body = (
      <div
        className="relative flex flex-col items-center min-h-[360px] p-6 md:min-h-[460px] md:p-8"
        onClick={onCardBlankClick}
      >
        <div className="text-xs text-muted-foreground mb-3 self-start">
          {noteMap[assessChoice || ""] || ""}
        </div>
        <SpeakBtn withEx />
        <div className="text-3xl font-semibold mb-3">{entry[1]}</div>
        <div
          className="w-full text-left"
          dangerouslySetInnerHTML={{ __html: sensesHTML }}
        />
        <ExampleBlock withTrans />
      </div>
    );
    rating =
      assessChoice === "again" ? (
        <RateRow
          className="grid-cols-1"
          btns={[{ k: "1", l: "下一词", action: "next" }]}
          onAction={(a) => a === "next" && assessFullNext()}
        />
      ) : (
        <RateRow
          className="grid-cols-2"
          btns={[
            { k: "1", l: "下一词", action: "next" },
            { k: "2", l: "记错了", action: "mistake" },
          ]}
          onAction={(a) => {
            if (a === "next") assessFullNext();
            if (a === "mistake") assessFullMistake();
          }}
        />
      );
  } else if (uiPhase === "quiz1-front") {
    body = (
      <div
        className="relative flex flex-col items-center justify-center min-h-[360px] p-6 cursor-pointer md:min-h-[460px] md:p-8"
        onClick={() => flip()}
      >
        <div className="text-xs text-muted-foreground mb-4 self-start">练习 1 · 回想释义</div>
        <SpeakBtn withEx />
        <div className="text-3xl font-semibold">{entry[1]}</div>
        <div className="text-sm text-muted-foreground mt-6">点击卡片或按空格显示释义</div>
      </div>
    );
    showFlip = true;
  } else if (uiPhase === "quiz1-back") {
    body = (
      <div className="relative flex flex-col items-center min-h-[360px] p-6 md:min-h-[460px] md:p-8">
        <div className="text-xs text-muted-foreground mb-3 self-start">练习 1</div>
        <SpeakBtn withEx />
        <div className="text-3xl font-semibold mb-3">{entry[1]}</div>
        <div
          className="w-full text-left"
          dangerouslySetInnerHTML={{ __html: sensesHTML }}
        />
      </div>
    );
    rating = (
      <RateRow
        className="grid-cols-2"
        btns={[
          { k: "1", l: "认识", q: "good" },
          { k: "2", l: "记错了", q: "again" },
        ]}
        onRate={handleRate}
      />
    );
  } else if (uiPhase === "quiz2") {
    body = (
      <div className="relative flex min-h-[360px] flex-col p-6 md:min-h-[460px] md:p-8">
        <div className="text-xs text-muted-foreground mb-3">练习 2 · 选释义</div>
        <SpeakBtn withEx />
        {example ? (
          <div className="mb-4" onClick={onWordClick}>
            <div className="text-xs text-muted-foreground mb-1">
              练习 2 · 选出加粗词的含义
            </div>
            <div
              className="text-base leading-relaxed"
              dangerouslySetInnerHTML={{ __html: exHTML }}
            />
          </div>
        ) : (
          <div className="text-3xl font-semibold mb-4 text-center">{entry[1]}</div>
        )}
        <div className="grid gap-2 mt-auto">
          {quizChoices.map((c, i) => (
            <button
              key={i}
              disabled={quizLocked}
              onClick={() => quiz2Answer(i)}
              className={cn(
                "text-left rounded-lg border px-3 py-3 text-sm transition-colors",
                "hover:bg-accent disabled:opacity-80",
                quizLocked && c.correct && "border-emerald-500 bg-emerald-500/10",
                quizLocked && !c.correct && "opacity-50"
              )}
            >
              <span className="inline-flex w-6 h-6 items-center justify-center rounded bg-muted text-xs mr-2">
                {i + 1}
              </span>
              {c.cn}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (uiPhase === "quiz3-front") {
    body = (
      <div
        className="relative flex flex-col items-center justify-center min-h-[360px] p-6 cursor-pointer md:min-h-[460px] md:p-8"
        onClick={() => flip()}
      >
        <div className="text-xs text-muted-foreground mb-4 self-start">练习 3 · 回想单词</div>
        <div className="text-xl text-center">{cnJoin}</div>
        <div className="text-sm text-muted-foreground mt-6">点击卡片或按空格显示单词</div>
      </div>
    );
    showFlip = true;
  } else if (uiPhase === "quiz3-back") {
    body = (
      <div className="relative flex flex-col items-center min-h-[360px] p-6 md:min-h-[460px] md:p-8">
        <div className="text-xs text-muted-foreground mb-3 self-start">练习 3</div>
        <SpeakBtn withEx />
        <div className="text-3xl font-semibold mb-3">{entry[1]}</div>
        <div
          className="w-full text-left"
          dangerouslySetInnerHTML={{ __html: sensesHTML }}
        />
      </div>
    );
    rating = (
      <RateRow
        className="grid-cols-2"
        btns={[
          { k: "1", l: "认识", q: "good" },
          { k: "2", l: "记错了", q: "again" },
        ]}
        onRate={handleRate}
      />
    );
  } else if (uiPhase === "review-front") {
    const cnFirst = useCnFirst();
    body = (
      <div
        className="relative flex flex-col items-center justify-center min-h-[360px] p-6 cursor-pointer md:min-h-[460px] md:p-8"
        onClick={() => flip()}
      >
        <div className="text-xs text-muted-foreground mb-4 self-start">复习</div>
        {!cnFirst && <SpeakBtn withEx />}
        {cnFirst ? (
          <>
            <div className="text-sm text-muted-foreground mb-2">回想对应英文</div>
            <div className="text-xl text-center">{cnJoin}</div>
          </>
        ) : (
          <>
            <div className="text-3xl font-semibold">{entry[1]}</div>
            <div className="text-sm text-muted-foreground mt-2">回想中文释义</div>
          </>
        )}
        <div className="text-sm text-muted-foreground mt-6">点击卡片或按空格显示答案</div>
        {hintVisible && example && (
          <div className="mt-4 w-full opacity-70" onClick={onWordClick}>
            <div className="text-xs text-muted-foreground mb-1">真题例句 · 回忆提示</div>
            <div
              className="text-sm"
              dangerouslySetInnerHTML={{ __html: exHTML }}
            />
          </div>
        )}
      </div>
    );
    showFlip = true;
  } else if (uiPhase === "review-back") {
    body = (
      <div
        className="relative flex flex-col items-center min-h-[360px] p-6 md:min-h-[460px] md:p-8"
        onClick={onCardBlankClick}
      >
        <div className="text-xs text-muted-foreground mb-3 self-start">复习</div>
        <SpeakBtn withEx />
        <div className="text-3xl font-semibold mb-3">{entry[1]}</div>
        <div
          className="w-full text-left"
          dangerouslySetInnerHTML={{ __html: sensesHTML }}
        />
        <ExampleBlock withTrans />
      </div>
    );
    rating = (
      <RateRow
        className="grid-cols-4"
        btns={[
          { k: "1", l: "重来", q: "again", i: previews?.again },
          { k: "2", l: "困难", q: "hard", i: previews?.hard },
          { k: "3", l: "良好", q: "good", i: previews?.good },
          { k: "4", l: "简单", q: "easy", i: previews?.easy },
        ]}
        onRate={handleRate}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden md:h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3 px-3 py-2 border-b shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            resetSession();
            navigate("/");
          }}
        >
          ‹
        </Button>
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-sm text-muted-foreground tnum shrink-0">
          {qpos + 1} / {queue.length}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4 md:p-8">
        <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-sm md:max-w-2xl">
          {body}
        </div>
        {showFlip && (
          <Button className="mt-4 w-full max-w-lg md:max-w-2xl" onClick={() => flip()}>
            显示答案
          </Button>
        )}
      </div>

      {rating && (
        <div className="shrink-0 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {rating}
        </div>
      )}

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

function RateRow({
  btns,
  className,
  onRate,
  onAction,
}: {
  btns: { k: string; l: string; q?: Quality; action?: string; i?: string }[];
  className?: string;
  onRate?: (q: Quality) => void;
  onAction?: (a: string) => void;
}) {
  return (
    <div className={cn("mx-auto grid max-w-lg gap-2 md:max-w-2xl", className)}>
      {btns.map((b) => (
        <button
          key={b.k + b.l}
          type="button"
          className={cn(
            "rounded-lg border px-2 py-3 flex flex-col items-center gap-0.5 hover:bg-accent transition-colors",
            b.q === "again" && "hover:border-red-400",
            b.q === "hard" && "hover:border-amber-400",
            b.q === "good" && "hover:border-emerald-400",
            b.q === "easy" && "hover:border-sky-400"
          )}
          onClick={() => {
            if (b.action && onAction) onAction(b.action);
            else if (b.q && onRate) onRate(b.q);
          }}
        >
          <span className="text-xs text-muted-foreground">{b.k}</span>
          <span className="font-medium text-sm">{b.l}</span>
          {b.i != null && (
            <span className="text-xs text-muted-foreground">{b.i}</span>
          )}
        </button>
      ))}
    </div>
  );
}
