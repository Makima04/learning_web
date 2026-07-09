import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy } from "@/stores/study";
import { useSettings } from "@/stores/settings";
import { lookupWord, restoreInflection } from "@/lib/lookup";
import { esc } from "@/lib/utils";
import { translate } from "@/lib/llm";
import { speakEnglish } from "@/lib/tts";
import { Button } from "@/components/ui/button";
import { WordPopover } from "@/components/WordPopover";
import { cn } from "@/lib/utils";

/** 把 body 粗分句（.!? 后空格） */
function splitSentences(body: string): string[] {
  const parts = body.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (parts || [body]).map((s) => s.trim()).filter(Boolean);
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

export function ReaderPage() {
  const reader = useStudy((s) => s.passageReader);
  const navigate = useNavigate();
  const settings = useSettings();
  const [active, setActive] = useState(0);
  const [transMap, setTransMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [pop, setPop] = useState<{ word: string; x: number; y: number } | null>(
    null
  );

  const sentences = useMemo(
    () => (reader ? splitSentences(reader.body) : []),
    [reader]
  );
  const wordSet = useMemo(() => {
    const s = new Set<string>();
    (reader?.words || []).forEach((w) => s.add(w.toLowerCase()));
    return s;
  }, [reader]);

  useEffect(() => {
    if (!reader) navigate("/papers", { replace: true });
  }, [reader, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void showCurrentTrans();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sentences, transMap]);

  async function showCurrentTrans() {
    if (!sentences[active]) return;
    const en = sentences[active];
    if (!transMap[active]) {
      setLoading(true);
      try {
        const zh = await translate(en);
        setTransMap((m) => ({ ...m, [active]: zh }));
      } catch (e: any) {
        setTransMap((m) => ({ ...m, [active]: e?.message || "翻译失败" }));
      } finally {
        setLoading(false);
      }
      return;
    }
    // 已有译文 → 下一句
    if (active < sentences.length - 1) {
      setActive((a) => a + 1);
      // scroll into view
      requestAnimationFrame(() => {
        document
          .querySelector(`.r-sent[data-i="${active + 1}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
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

  if (!reader) return null;

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-3.5rem)]">
      <header className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          ‹
        </Button>
        <div className="font-medium truncate flex-1">{reader.title}</div>
        <div className="text-xs text-muted-foreground shrink-0">
          空格显示译文 / 下一句
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
        <div className="space-y-3 leading-8 text-base" onClick={onWordClick}>
          {sentences.map((s, i) => (
            <div key={i}>
              <span
                className={cn(
                  "r-sent rounded px-0.5 transition-colors",
                  i === active && "bg-primary/10 ring-1 ring-primary/30"
                )}
                data-i={i}
                data-en={s}
                dangerouslySetInnerHTML={{
                  __html: highlightBody(s, wordSet),
                }}
                onClick={() => setActive(i)}
              />
              {transMap[i] != null && (
                <div className="r-trans text-sm text-muted-foreground mt-1 pl-1 border-l-2 border-primary/30">
                  {transMap[i]}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => void showCurrentTrans()} disabled={loading}>
            {loading
              ? "翻译中…"
              : transMap[active]
                ? "下一句"
                : "显示本句译文"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/papers")}>
            返回真题
          </Button>
        </div>
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
