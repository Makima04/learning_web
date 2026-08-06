import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy, type QueueItem } from "@/stores/study";
import { useSettings } from "@/stores/settings";
import { highlightTarget } from "@/lib/lookup";
import { blankTargetHtml } from "@/lib/quiz";
import { getWordMap } from "@/lib/words";
import { papersRecitePathFromPaperIdx } from "@/lib/papersNav";
import { esc, cn } from "@/lib/utils";
import { speakEnglish } from "@/lib/tts";
import { translate } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { WordPopover } from "@/components/WordPopover";

/** 仅英文测试卡：等待后显示真题例句作回忆提示 */
const EXAMPLE_HINT_DELAY_MS = 3000;

export function StudyPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const mode = useStudy((state) => state.mode);
  const queue = useStudy((state) => state.queue);
  const qpos = useStudy((state) => state.qpos);
  const groupStart = useStudy((state) => state.groupStart);
  const groupInitialEnd = useStudy((state) => state.groupInitialEnd);
  const uiPhase = useStudy((state) => state.uiPhase);
  const assessChoice = useStudy((state) => state.assessChoice);
  const relearnAnswerKnown = useStudy((state) => state.relearnAnswerKnown);
  const cloze = useStudy((state) => state.cloze);
  const sessionStats = useStudy((state) => state.sessionStats);
  const passageSkipped = useStudy((state) => state.passageSkipped);
  const currentItem = useStudy((state) => state.currentItem);
  const currentEntry = useStudy((state) => state.currentEntry);
  const getExample = useStudy((state) => state.getExample);
  const chooseAssessment = useStudy((state) => state.chooseAssessment);
  const assessFullNext = useStudy((state) => state.assessFullNext);
  const assessFullMistake = useStudy((state) => state.assessFullMistake);
  const answerRelearning = useStudy((state) => state.answerRelearning);
  const answerCloze = useStudy((state) => state.answerCloze);
  const confirmRelearning = useStudy((state) => state.confirmRelearning);
  const advanceToNextGroup = useStudy((state) => state.advanceToNextGroup);
  const resetSession = useStudy((state) => state.resetSession);
  const startLearn = useStudy((state) => state.startLearn);
  const startReview = useStudy((state) => state.startReview);
  const snapshot = useStudy((state) => state.snapshot);
  const reciteOrigin = useStudy((state) => state.reciteOrigin);

  const item = currentItem();
  const entry = currentEntry();
  const example = item ? getExample(item) : null;
  const [pop, setPop] = useState<{ word: string; x: number; y: number } | null>(null);
  const [exampleTranslation, setExampleTranslation] = useState("");
  const [isExampleTranslating, setIsExampleTranslating] = useState(false);
  const [exampleTranslationError, setExampleTranslationError] = useState("");
  const [showExampleHint, setShowExampleHint] = useState(false);
  /** 完整卡上隐藏英文，只留中文以便回忆 */
  const [hideEnglish, setHideEnglish] = useState(false);

  const isEnglishOnlyPhase = uiPhase === "assess-front" || uiPhase === "relearn-word";
  const canHideEnglish = uiPhase === "assess-full" || uiPhase === "relearn-reveal";

  useEffect(() => {
    setPop(null);
    setExampleTranslation("");
    setIsExampleTranslating(false);
    setExampleTranslationError("");
    setShowExampleHint(false);
    setHideEnglish(false);
  }, [entry?.[0], qpos, uiPhase]);

  // 仅英文卡片：数秒后显示例句提示（无例句则不触发）
  useEffect(() => {
    if (!isEnglishOnlyPhase || !example) {
      setShowExampleHint(false);
      return;
    }
    setShowExampleHint(false);
    const timer = window.setTimeout(() => setShowExampleHint(true), EXAMPLE_HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isEnglishOnlyPhase, example, entry?.[0], qpos, uiPhase]);

  // 第 3 轮 cn→en、第 4 轮完型不自动读词，避免剧透
  useEffect(() => {
    if (!settings.autoSpeak || !entry) return;
    if (uiPhase === "relearn-meaning" || uiPhase === "relearn-cloze") return;
    speakEnglish(entry[1], settings.rate);
  }, [entry?.[0], qpos, uiPhase, settings.autoSpeak, settings.rate]);

  const showExampleTranslation = useCallback(async () => {
    if (!example || isExampleTranslating || exampleTranslation) return;
    setIsExampleTranslating(true);
    setExampleTranslationError("");
    try {
      setExampleTranslation(await translate(example));
    } catch (error) {
      setExampleTranslationError(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setIsExampleTranslating(false);
    }
  }, [example, exampleTranslation, isExampleTranslating]);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      // H：完整展示卡藏/显英文
      if ((event.key === "h" || event.key === "H") && canHideEnglish) {
        event.preventDefault();
        setHideEnglish((v) => !v);
        return;
      }
      if (event.key === " " || event.code === "Space") {
        const canShowTrans =
          uiPhase === "assess-full" ||
          uiPhase === "relearn-reveal" ||
          uiPhase === "relearn-example" ||
          (showExampleHint && isEnglishOnlyPhase);
        if (canShowTrans && !hideEnglish) {
          event.preventDefault();
          void showExampleTranslation();
        }
        return;
      }
      if (uiPhase === "assess-front") {
        if (event.key === "1") chooseAssessment("known");
        if (event.key === "2") chooseAssessment("uncertain");
        if (event.key === "3") chooseAssessment("unknown");
      } else if (uiPhase === "assess-full") {
        if (event.key === "1") assessFullNext();
        if (event.key === "2" && assessChoice !== "unknown") assessFullMistake();
      } else if (
        uiPhase === "relearn-example" ||
        uiPhase === "relearn-word" ||
        uiPhase === "relearn-meaning"
      ) {
        if (event.key === "1") answerRelearning(true);
        if (event.key === "2") answerRelearning(false);
      } else if (uiPhase === "relearn-cloze" && cloze) {
        const keys = ["1", "2", "3", "4"] as const;
        const i = keys.indexOf(event.key as (typeof keys)[number]);
        if (i >= 0 && cloze.options[i]) answerCloze(cloze.options[i]!);
      } else if (uiPhase === "relearn-reveal") {
        if (event.key === "1" && relearnAnswerKnown !== null) {
          confirmRelearning(relearnAnswerKnown);
        }
        if (event.key === "2" && relearnAnswerKnown) confirmRelearning(false);
      }
    },
    [
      answerCloze,
      answerRelearning,
      assessChoice,
      assessFullMistake,
      assessFullNext,
      canHideEnglish,
      chooseAssessment,
      cloze,
      confirmRelearning,
      hideEnglish,
      isEnglishOnlyPhase,
      relearnAnswerKnown,
      showExampleHint,
      showExampleTranslation,
      uiPhase,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  function onExampleWordClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const word = target.closest(".c-word") as HTMLElement | null;
    if (!word) return;
    event.stopPropagation();
    const rect = word.getBoundingClientRect();
    const surface = word.dataset.w || word.textContent || "";
    setPop({ word: surface, x: rect.left + rect.width / 2, y: rect.bottom + 6 });
    if (settings.speakOnWordClick) speakEnglish(surface, settings.rate);
  }

  function onCardClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".c-word, button")) return;
    void showExampleTranslation();
  }

  if (uiPhase === "idle") {
    return <EmptyState onBack={() => navigate("/")} />;
  }

  // 组结束 / 本轮结束：同一结算页（词表回顾 + 操作）
  if (uiPhase === "done" || uiPhase === "group-done") {
    const isSessionEnd = uiPhase === "done" || qpos >= queue.length;
    return (
      <SettleView
        mode={mode}
        queue={queue}
        groupStart={groupStart}
        groupInitialEnd={groupInitialEnd}
        isSessionEnd={isSessionEnd}
        sessionStats={sessionStats}
        passageSkipped={passageSkipped}
        onNextGroup={advanceToNextGroup}
        onContinueLearn={() => {
          if (!startLearn()) navigate("/");
        }}
        onContinueReview={() => {
          if (!startReview()) navigate("/");
        }}
        onHome={() => {
          resetSession();
          navigate("/");
        }}
        onToday={() => {
          resetSession();
          navigate("/today");
        }}
        onPassageContinue={() => {
          resetSession();
          navigate(papersRecitePathFromPaperIdx(reciteOrigin?.paperIdx));
        }}
        canLearn={snapshot().canLearn}
        canReview={snapshot().canReview}
      />
    );
  }

  if (!item || !entry) return <EmptyState onBack={() => navigate("/")} />;

  const senses = entry[2] || [];
  const chinese = senses.map((sense) => sense[1]).join("；");
  const sensesHtml = senses
    .map((sense) => `<div class="flex gap-2 py-0.5"><span class="shrink-0 text-sm text-muted-foreground">${esc(sense[0])}</span><span>${esc(sense[1])}</span></div>`)
    .join("");
  const exampleHtml = example ? highlightTarget(example, entry[1], esc) : "";
  const exampleBlankHtml = example ? blankTargetHtml(example, entry[1], esc) : "";
  const progress = queue.length ? (qpos / queue.length) * 100 : 0;
  const groupName = item.group === "review" ? "复习组" : "新词组";

  const fullCard = (
    <div className="relative min-h-[360px] p-6 md:min-h-[460px] md:p-8" onClick={hideEnglish ? undefined : onCardClick}>
      <CardHeader
        label={
          uiPhase === "relearn-reveal"
            ? `${groupName} · 答案确认${relearnAnswerKnown === false ? " · 未通过" : relearnAnswerKnown ? " · 通过" : ""}`
            : groupName
        }
        word={hideEnglish ? "······" : entry[1]}
        onSpeak={hideEnglish ? undefined : () => speakEnglish(entry[1], settings.rate)}
        hideSpeak={hideEnglish}
      />
      {canHideEnglish ? (
        <button
          type="button"
          className="absolute right-12 top-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setHideEnglish((v) => !v);
          }}
          title="快捷键 H"
        >
          {hideEnglish ? "显示英文 H" : "藏英文 H"}
        </button>
      ) : null}
      <div className="w-full text-left" dangerouslySetInnerHTML={{ __html: sensesHtml }} />
      {!hideEnglish ? (
        <ExampleBlock
          html={exampleHtml}
          onClick={onExampleWordClick}
          translation={exampleTranslation}
          translating={isExampleTranslating}
          translationError={exampleTranslationError}
        />
      ) : exampleBlankHtml ? (
        <ExampleBlock
          html={exampleBlankHtml}
          label="例句（目标词已遮）"
          onClick={() => undefined}
          translation=""
          translating={false}
          translationError=""
        />
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  let controls: React.ReactNode;
  if (uiPhase === "assess-front") {
    body = (
      <div
        className="relative flex min-h-[360px] flex-col items-center justify-center p-6 md:min-h-[460px] md:p-8"
        onClick={showExampleHint ? onCardClick : undefined}
      >
        <div className="mb-4 self-start text-xs text-muted-foreground">{groupName} · 初轮判断</div>
        <button type="button" className="absolute right-3 top-3 text-lg opacity-70 hover:opacity-100" onClick={() => speakEnglish(entry[1], settings.rate)}>🔊</button>
        <div className="text-3xl font-semibold tracking-wide md:text-4xl">{entry[1]}</div>
        {showExampleHint && exampleHtml ? (
          <ExampleBlock
            html={exampleHtml}
            label="提示 · 真题例句"
            onClick={onExampleWordClick}
            translation={exampleTranslation}
            translating={isExampleTranslating}
            translationError={exampleTranslationError}
          />
        ) : null}
        <div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div>
      </div>
    );
    controls = (
      <ActionRow columns="grid-cols-3" actions={[
        { key: "1", label: "认识", onClick: () => chooseAssessment("known"), tone: "good" },
        { key: "2", label: "模糊", onClick: () => chooseAssessment("uncertain"), tone: "hard" },
        { key: "3", label: "不认识", onClick: () => chooseAssessment("unknown"), tone: "again" },
      ]} />
    );
  } else if (uiPhase === "assess-full") {
    body = fullCard;
    controls = assessChoice === "unknown" ? (
      <ActionRow columns="grid-cols-1" actions={[{ key: "1", label: "下一词", onClick: assessFullNext }]} />
    ) : (
      <ActionRow columns="grid-cols-2" actions={[
        { key: "1", label: "下一词", onClick: assessFullNext },
        { key: "2", label: "记错了", onClick: assessFullMistake, tone: "again" },
      ]} />
    );
  } else if (uiPhase === "relearn-reveal") {
    body = fullCard;
    // 完型客观对错：对则可「记错了」纠偏；错则只能下一词重来
    controls = relearnAnswerKnown ? (
      <ActionRow columns="grid-cols-2" actions={[
        { key: "1", label: "下一词", onClick: () => confirmRelearning(true) },
        { key: "2", label: "记错了", onClick: () => confirmRelearning(false), tone: "again" },
      ]} />
    ) : (
      <ActionRow columns="grid-cols-1" actions={[
        { key: "1", label: "下一词", onClick: () => confirmRelearning(false) },
      ]} />
    );
  } else if (uiPhase === "relearn-cloze" && cloze) {
    const stemHtml = cloze.sentence
      ? blankTargetHtml(cloze.sentence, cloze.correct, esc)
      : "";
    body = (
      <div className="relative flex min-h-[360px] flex-col items-center justify-center p-6 md:min-h-[460px] md:p-8">
        <div className="mb-4 self-start text-xs text-muted-foreground">重学第 4 轮 · 完型填空（必过）</div>
        {stemHtml ? (
          <div
            className="w-full text-left text-base leading-relaxed md:text-lg"
            dangerouslySetInnerHTML={{ __html: stemHtml }}
          />
        ) : (
          <div className="w-full text-center">
            <div className="mb-2 text-xs text-muted-foreground">无例句 · 据释义选词</div>
            <div className="text-xl">{chinese || "（无释义）"}</div>
            <div className="mt-4 text-2xl font-semibold tracking-wider text-primary">______</div>
          </div>
        )}
        <div className="mt-6 text-sm text-muted-foreground">选择填入空缺的英文单词</div>
      </div>
    );
    controls = (
      <ActionRow
        columns="grid-cols-2"
        actions={cloze.options.map((opt, i) => ({
          key: String(i + 1),
          label: opt,
          onClick: () => answerCloze(opt),
        }))}
      />
    );
  } else {
    const relearn = relearnBody(
      uiPhase,
      entry[1],
      chinese,
      exampleHtml,
      onExampleWordClick,
      onCardClick,
      () => speakEnglish(entry[1], settings.rate),
      exampleTranslation,
      isExampleTranslating,
      exampleTranslationError,
      showExampleHint
    );
    body = relearn;
    controls = (
      <ActionRow columns="grid-cols-2" actions={[
        { key: "1", label: "认识", onClick: () => answerRelearning(true), tone: "good" },
        { key: "2", label: "不认识", onClick: () => answerRelearning(false), tone: "again" },
      ]} />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden md:h-[calc(100vh-4rem)]">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => { resetSession(); navigate("/"); }}>‹</Button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="shrink-0 text-sm text-muted-foreground">{qpos + 1} / {queue.length}</div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-hidden p-4 md:justify-center md:p-8">
        <div className="min-h-0 max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border bg-card shadow-sm md:max-w-2xl">{body}</div>
      </div>
      <div className="shrink-0 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{controls}</div>
      {pop && <WordPopover surface={pop.word} x={pop.x} y={pop.y} onClose={() => setPop(null)} />}
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return <div className="p-8 text-center"><Button onClick={onBack}>回首页</Button></div>;
}

/**
 * 统一结算页：组间 / 本轮结束共用。
 * - 中间组：词表 + 下一组
 * - 本轮结束：词表 + 再学/再复习 + 今日已学 + 回首页
 * 默认遮罩英文，点一下出中文。
 */
function SettleView({
  mode,
  queue,
  groupStart,
  groupInitialEnd,
  isSessionEnd,
  sessionStats,
  passageSkipped,
  onNextGroup,
  onContinueLearn,
  onContinueReview,
  onHome,
  onToday,
  onPassageContinue,
  canLearn,
  canReview,
}: {
  mode: string;
  queue: QueueItem[];
  groupStart: number;
  groupInitialEnd: number;
  isSessionEnd: boolean;
  sessionStats: { studied: number; newDone: number; reviewDone: number };
  passageSkipped: number;
  onNextGroup: () => void;
  onContinueLearn: () => void;
  onContinueReview: () => void;
  onHome: () => void;
  onToday: () => void;
  onPassageContinue: () => void;
  canLearn: boolean;
  canReview: boolean;
}) {
  const rate = useSettings((s) => s.rate);
  const [mask, setMask] = useState(true);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());

  // 换组 / 新一轮时重置遮罩
  useEffect(() => {
    setMask(true);
    setRevealed(new Set());
  }, [groupStart, groupInitialEnd, isSessionEnd]);

  const words = useMemo(() => {
    const map = getWordMap();
    const slice = queue.slice(groupStart, groupInitialEnd);
    const seen = new Set<number>();
    const out: { idx: number; en: string; cn: string }[] = [];
    for (const it of slice) {
      if (seen.has(it.idx)) continue;
      seen.add(it.idx);
      const entry = it.entry || map.get(it.idx);
      const en = entry?.[1] || `#${it.idx}`;
      const senses = entry?.[2] || [];
      const cn = senses.map((s) => (s[0] ? `${s[0]} ${s[1]}` : s[1])).join("；");
      out.push({ idx: it.idx, en, cn });
    }
    return out;
  }, [queue, groupStart, groupInitialEnd]);

  function reveal(idx: number) {
    setRevealed((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }

  function toggleMask(next: boolean) {
    setMask(next);
    if (next) setRevealed(new Set());
  }

  const canContinueLearn = isSessionEnd && mode === "learn" && canLearn;
  const canContinueReview = isSessionEnd && mode === "review" && canReview;
  const hasPrimaryContinue = canContinueLearn || canContinueReview;
  // 真题模块「可查词表」：未答题直接浏览本篇全部词
  const isPassageBrowse =
    isSessionEnd &&
    mode === "passage" &&
    sessionStats.studied === 0 &&
    words.length > 0 &&
    groupStart === 0 &&
    groupInitialEnd >= queue.length &&
    queue.length > 0;

  const title = isPassageBrowse
    ? "本篇词表"
    : isSessionEnd
      ? "本轮学习完成"
      : "本组已通关";
  const subtitle = isPassageBrowse ? (
    <>
      共 <span className="tnum font-medium text-foreground">{words.length}</span> 词 ·
      点英文可显示释义
    </>
  ) : isSessionEnd ? (
    <>
      通关 <span className="tnum font-medium text-foreground">{sessionStats.studied}</span> 词
      {sessionStats.newDone ? (
        <>
          {" · 新词 "}
          <span className="tnum font-medium text-foreground">{sessionStats.newDone}</span>
        </>
      ) : null}
      {sessionStats.reviewDone ? (
        <>
          {" · 复习 "}
          <span className="tnum font-medium text-foreground">{sessionStats.reviewDone}</span>
        </>
      ) : null}
      {passageSkipped ? (
        <>
          {" · 跳过 "}
          <span className="tnum font-medium text-foreground">{passageSkipped}</span>
        </>
      ) : null}
      {words.length > 0 ? (
        <>
          {" · 本组 "}
          <span className="tnum font-medium text-foreground">{words.length}</span> 词
        </>
      ) : null}
    </>
  ) : (
    <>
      共 <span className="tnum font-medium text-foreground">{words.length}</span> 词 · 点英文可显示释义
    </>
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-lg flex-col gap-3 p-4 md:h-[calc(100vh-4rem)] md:max-w-2xl md:gap-4 md:p-6">
      <div className="flex shrink-0 flex-col items-center gap-1 pt-1 text-center">
        <div className="text-3xl md:text-4xl" aria-hidden>
          {isPassageBrowse ? "📖" : isSessionEnd ? "🎉" : "✅"}
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {words.length > 0 ? (
          <button
            type="button"
            onClick={() => toggleMask(!mask)}
            className="mt-1 text-xs text-primary hover:underline"
          >
            {mask ? "显示全部释义" : "重新遮罩回忆"}
          </button>
        ) : null}
      </div>

      {words.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border bg-card shadow-sm">
          <ul className="divide-y">
            {words.map((w, i) => {
              const showCn = !mask || revealed.has(w.idx);
              return (
                <li
                  key={w.idx}
                  className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30 md:px-4"
                >
                  <span className="tnum w-6 shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (mask && !showCn) reveal(w.idx);
                    }}
                  >
                    <span className="font-medium tracking-wide">{w.en}</span>
                    {w.cn ? (
                      showCn ? (
                        <div className="mt-0.5 text-sm leading-snug text-muted-foreground">{w.cn}</div>
                      ) : (
                        <div className="mt-0.5 text-sm text-muted-foreground/50">点击显示释义</div>
                      )
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 pt-0.5 text-sm opacity-50 hover:opacity-100"
                    aria-label={`朗读 ${w.en}`}
                    onClick={() => speakEnglish(w.en, rate)}
                  >
                    🔊
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          {isSessionEnd ? "没有待回顾的词" : "本组无词"}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap justify-center gap-2 pb-[env(safe-area-inset-bottom)]">
        {!isSessionEnd ? (
          <>
            <Button onClick={onNextGroup}>下一组</Button>
            <Button variant="outline" onClick={onHome}>
              回首页
            </Button>
          </>
        ) : (
          <>
            {canContinueLearn && <Button onClick={onContinueLearn}>再学一组</Button>}
            {canContinueReview && <Button onClick={onContinueReview}>再复习一组</Button>}
            {mode === "passage" && (
              <Button variant={hasPrimaryContinue ? "outline" : "default"} onClick={onPassageContinue}>
                继续真题记词
              </Button>
            )}
            <Button variant={hasPrimaryContinue || mode === "passage" ? "outline" : "default"} onClick={onHome}>
              回首页
            </Button>
            <Button variant="outline" onClick={onToday}>
              回忆今日已学
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CardHeader({
  label,
  word,
  onSpeak,
  hideSpeak,
}: {
  label: string;
  word: string;
  onSpeak?: () => void;
  hideSpeak?: boolean;
}) {
  return (
    <>
      <div className="mb-3 text-xs text-muted-foreground">{label}</div>
      {!hideSpeak && onSpeak ? (
        <button type="button" className="absolute right-3 top-3 text-lg opacity-70 hover:opacity-100" onClick={onSpeak}>
          🔊
        </button>
      ) : null}
      <div className={cn("mb-3 text-3xl font-semibold", word === "······" && "tracking-widest text-muted-foreground")}>
        {word}
      </div>
    </>
  );
}

function ExampleBlock({
  html,
  onClick,
  translation,
  translating,
  translationError,
  label = "真题例句",
}: {
  html: string;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  translation: string;
  translating: boolean;
  translationError: string;
  label?: string;
}) {
  if (!html) return null;
  return (
    <div className="mt-5 w-full text-left" onClick={onClick}>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      {translating && <div className="mt-2 text-sm text-muted-foreground">例句翻译中…</div>}
      {translation && (
        <div className="mt-2 border-l-2 border-primary/30 pl-2 text-sm text-muted-foreground">{translation}</div>
      )}
      {translationError && (
        <div className="mt-2 text-sm text-destructive">{translationError}，点击卡片空白处或按空格重试</div>
      )}
    </div>
  );
}

function relearnBody(
  phase: string,
  word: string,
  chinese: string,
  exampleHtml: string,
  onExampleClick: (event: MouseEvent<HTMLDivElement>) => void,
  onCardClick: (event: MouseEvent<HTMLDivElement>) => void,
  onSpeak: () => void,
  exampleTranslation: string,
  isExampleTranslating: boolean,
  exampleTranslationError: string,
  showExampleHint: boolean
) {
  const shared = "relative flex min-h-[360px] flex-col items-center justify-center p-6 md:min-h-[460px] md:p-8";
  if (phase === "relearn-example") {
    return (
      <div className={shared} onClick={onCardClick}>
        <div className="mb-4 self-start text-xs text-muted-foreground">重学第 1 轮 · 看例句回忆中文释义</div>
        <ExampleBlock
          html={exampleHtml}
          onClick={onExampleClick}
          translation={exampleTranslation}
          translating={isExampleTranslating}
          translationError={exampleTranslationError}
        />
        <div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div>
      </div>
    );
  }
  if (phase === "relearn-word") {
    return (
      <div className={shared} onClick={showExampleHint ? onCardClick : undefined}>
        <div className="mb-4 self-start text-xs text-muted-foreground">重学第 2 轮 · 看英文回忆中文释义</div>
        <button type="button" className="absolute right-3 top-3 text-lg opacity-70 hover:opacity-100" onClick={onSpeak}>
          🔊
        </button>
        <div className="text-3xl font-semibold">{word}</div>
        {showExampleHint && exampleHtml ? (
          <ExampleBlock
            html={exampleHtml}
            label="提示 · 真题例句"
            onClick={onExampleClick}
            translation={exampleTranslation}
            translating={isExampleTranslating}
            translationError={exampleTranslationError}
          />
        ) : null}
        <div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div>
      </div>
    );
  }
  if (phase === "relearn-meaning") {
    return (
      <div className={shared}>
        <div className="mb-4 self-start text-xs text-muted-foreground">重学第 3 轮 · 看中文回忆英文单词</div>
        <div className="text-xl text-center">{chinese}</div>
        <div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div>
      </div>
    );
  }
  // relearn-cloze 由外层专门渲染；兜底
  return (
    <div className={shared}>
      <div className="mb-4 self-start text-xs text-muted-foreground">重学中…</div>
    </div>
  );
}

function ActionRow({ columns, actions }: { columns: string; actions: { key: string; label: string; onClick: () => void; tone?: "good" | "hard" | "again" }[] }) {
  return <div className={cn("mx-auto grid max-w-lg gap-2 md:max-w-2xl", columns)}>{actions.map((action) => <button key={action.key + action.label} type="button" onClick={action.onClick} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 transition-colors hover:bg-accent", action.tone === "good" && "hover:border-emerald-400", action.tone === "hard" && "hover:border-amber-400", action.tone === "again" && "hover:border-red-400")}><span className="text-xs text-muted-foreground">{action.key}</span><span className="text-sm font-medium">{action.label}</span></button>)}</div>;
}
