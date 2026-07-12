import { useCallback, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy } from "@/stores/study";
import { useSettings } from "@/stores/settings";
import { highlightTarget } from "@/lib/lookup";
import { esc, cn } from "@/lib/utils";
import { speakEnglish } from "@/lib/tts";
import { translate } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { WordPopover } from "@/components/WordPopover";

export function StudyPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const mode = useStudy((state) => state.mode);
  const queue = useStudy((state) => state.queue);
  const qpos = useStudy((state) => state.qpos);
  const uiPhase = useStudy((state) => state.uiPhase);
  const assessChoice = useStudy((state) => state.assessChoice);
  const sessionStats = useStudy((state) => state.sessionStats);
  const passageSkipped = useStudy((state) => state.passageSkipped);
  const currentItem = useStudy((state) => state.currentItem);
  const currentEntry = useStudy((state) => state.currentEntry);
  const getExample = useStudy((state) => state.getExample);
  const chooseAssessment = useStudy((state) => state.chooseAssessment);
  const assessFullNext = useStudy((state) => state.assessFullNext);
  const assessFullMistake = useStudy((state) => state.assessFullMistake);
  const answerRelearning = useStudy((state) => state.answerRelearning);
  const advanceToNextGroup = useStudy((state) => state.advanceToNextGroup);
  const resetSession = useStudy((state) => state.resetSession);

  const item = currentItem();
  const entry = currentEntry();
  const example = item ? getExample(item) : null;
  const [pop, setPop] = useState<{ word: string; x: number; y: number } | null>(null);
  const [exampleTranslation, setExampleTranslation] = useState("");
  const [isExampleTranslating, setIsExampleTranslating] = useState(false);
  const [exampleTranslationError, setExampleTranslationError] = useState("");

  useEffect(() => {
    setPop(null);
    setExampleTranslation("");
    setIsExampleTranslating(false);
    setExampleTranslationError("");
  }, [entry?.[0], qpos, uiPhase]);

  useEffect(() => {
    if (settings.autoSpeak && entry) speakEnglish(entry[1], settings.rate);
  }, [entry?.[0], qpos, uiPhase, settings.autoSpeak, settings.rate]);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
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
      }
    },
    [answerRelearning, assessChoice, assessFullMistake, assessFullNext, chooseAssessment, uiPhase]
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

  async function showExampleTranslation() {
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
  }

  function onCardClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".c-word, button")) return;
    void showExampleTranslation();
  }

  if (uiPhase === "idle") {
    return <EmptyState onBack={() => navigate("/")} />;
  }

  if (uiPhase === "done") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-semibold">本轮学习完成</h2>
        <p className="text-muted-foreground">
          通关 {sessionStats.studied} 词
          {sessionStats.newDone ? ` · 新词 ${sessionStats.newDone}` : ""}
          {sessionStats.reviewDone ? ` · 复习 ${sessionStats.reviewDone}` : ""}
          {passageSkipped ? ` · 已跳过 ${passageSkipped}` : ""}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => { resetSession(); navigate("/"); }}>回首页</Button>
          {mode === "passage" && <Button variant="outline" onClick={() => navigate("/papers-recite")}>继续真题记词</Button>}
        </div>
      </div>
    );
  }

  if (uiPhase === "group-done") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-semibold">本组已全部通关</h2>
        <p className="text-muted-foreground">初轮与所有重学轮次均已完成</p>
        <div className="flex gap-2">
          <Button onClick={advanceToNextGroup}>下一组</Button>
          <Button variant="outline" onClick={() => { resetSession(); navigate("/"); }}>回首页</Button>
        </div>
      </div>
    );
  }

  if (!item || !entry) return <EmptyState onBack={() => navigate("/")} />;

  const senses = entry[2] || [];
  const chinese = senses.map((sense) => sense[1]).join("；");
  const sensesHtml = senses
    .map((sense) => `<div class="flex gap-2 py-0.5"><span class="shrink-0 text-sm text-muted-foreground">${esc(sense[0])}</span><span>${esc(sense[1])}</span></div>`)
    .join("");
  const exampleHtml = example ? highlightTarget(example, entry[1], esc) : "";
  const progress = queue.length ? (qpos / queue.length) * 100 : 0;
  const groupName = item.group === "review" ? "复习组" : "新词组";

  const fullCard = (
    <div className="relative min-h-[360px] p-6 md:min-h-[460px] md:p-8" onClick={onCardClick}>
      <CardHeader label={groupName} word={entry[1]} onSpeak={() => speakEnglish(entry[1], settings.rate)} />
      <div className="w-full text-left" dangerouslySetInnerHTML={{ __html: sensesHtml }} />
      <ExampleBlock
        html={exampleHtml}
        onClick={onExampleWordClick}
        translation={exampleTranslation}
        translating={isExampleTranslating}
        translationError={exampleTranslationError}
      />
    </div>
  );

  let body: React.ReactNode;
  let controls: React.ReactNode;
  if (uiPhase === "assess-front") {
    body = (
      <div className="relative flex min-h-[360px] flex-col items-center justify-center p-6 md:min-h-[460px] md:p-8">
        <div className="mb-4 self-start text-xs text-muted-foreground">{groupName} · 初轮判断</div>
        <button type="button" className="absolute right-3 top-3 text-lg opacity-70 hover:opacity-100" onClick={() => speakEnglish(entry[1], settings.rate)}>🔊</button>
        <div className="text-3xl font-semibold tracking-wide md:text-4xl">{entry[1]}</div>
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
      exampleTranslationError
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4 md:p-8">
        <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-sm md:max-w-2xl">{body}</div>
      </div>
      <div className="shrink-0 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{controls}</div>
      {pop && <WordPopover surface={pop.word} x={pop.x} y={pop.y} onClose={() => setPop(null)} />}
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return <div className="p-8 text-center"><Button onClick={onBack}>回首页</Button></div>;
}

function CardHeader({ label, word, onSpeak }: { label: string; word: string; onSpeak: () => void }) {
  return <>
    <div className="mb-3 text-xs text-muted-foreground">{label}</div>
    <button type="button" className="absolute right-3 top-3 text-lg opacity-70 hover:opacity-100" onClick={onSpeak}>🔊</button>
    <div className="mb-3 text-3xl font-semibold">{word}</div>
  </>;
}

function ExampleBlock({
  html,
  onClick,
  translation,
  translating,
  translationError,
}: {
  html: string;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  translation: string;
  translating: boolean;
  translationError: string;
}) {
  if (!html) return null;
  return <div className="mt-5 text-left" onClick={onClick}><div className="mb-1 text-xs text-muted-foreground">真题例句</div><div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />{translating && <div className="mt-2 text-sm text-muted-foreground">例句翻译中…</div>}{translation && <div className="mt-2 border-l-2 border-primary/30 pl-2 text-sm text-muted-foreground">{translation}</div>}{translationError && <div className="mt-2 text-sm text-destructive">{translationError}，点击卡片空白处重试</div>}</div>;
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
  exampleTranslationError: string
) {
  const shared = "relative flex min-h-[360px] flex-col items-center justify-center p-6 md:min-h-[460px] md:p-8";
  if (phase === "relearn-example") return <div className={shared} onClick={onCardClick}><div className="mb-4 self-start text-xs text-muted-foreground">重学第 1 轮 · 看例句回忆中文释义</div><ExampleBlock html={exampleHtml} onClick={onExampleClick} translation={exampleTranslation} translating={isExampleTranslating} translationError={exampleTranslationError} /><div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div></div>;
  if (phase === "relearn-word") return <div className={shared}><div className="mb-4 self-start text-xs text-muted-foreground">重学第 2 轮 · 看英文回忆中文释义</div><button type="button" className="absolute right-3 top-3 text-lg opacity-70 hover:opacity-100" onClick={onSpeak}>🔊</button><div className="text-3xl font-semibold">{word}</div><div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div></div>;
  return <div className={shared}><div className="mb-4 self-start text-xs text-muted-foreground">重学第 3 轮 · 看中文回忆英文单词</div><div className="text-xl text-center">{chinese}</div><div className="mt-6 text-sm text-muted-foreground">请凭回忆选择</div></div>;
}

function ActionRow({ columns, actions }: { columns: string; actions: { key: string; label: string; onClick: () => void; tone?: "good" | "hard" | "again" }[] }) {
  return <div className={cn("mx-auto grid max-w-lg gap-2 md:max-w-2xl", columns)}>{actions.map((action) => <button key={action.key + action.label} type="button" onClick={action.onClick} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 transition-colors hover:bg-accent", action.tone === "good" && "hover:border-emerald-400", action.tone === "hard" && "hover:border-amber-400", action.tone === "again" && "hover:border-red-400")}><span className="text-xs text-muted-foreground">{action.key}</span><span className="text-sm font-medium">{action.label}</span></button>)}</div>;
}
