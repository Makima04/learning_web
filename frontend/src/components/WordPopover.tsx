import { useEffect, useState } from "react";
import { lookupWord } from "@/lib/lookup";
import { lookupWordRemote, type WordLookupResult } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { speakEnglish } from "@/lib/tts";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";

type Sense = [string, string];

const llmCache = new Map<string, { lemma: string; senses: Sense[]; phonetic?: string }>();

function cacheKey(surface: string) {
  return String(surface || "")
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

export function WordPopover({
  surface,
  x,
  y,
  onClose,
  context,
}: {
  surface: string;
  x: number;
  y: number;
  onClose: () => void;
  /** 可选例句上下文，仅服务端给义项排序；缓存仍按 surface 共享 */
  context?: string;
}) {
  const rate = useSettings((s) => s.rate);
  const entry = lookupWord(surface);
  const key = cacheKey(surface);

  const [llm, setLlm] = useState<{
    lemma: string;
    senses: Sense[];
    phonetic?: string;
  } | null>(() => llmCache.get(key) ?? null);
  const [loading, setLoading] = useState(!entry && !llmCache.has(key));
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    window.addEventListener("keydown", onKey);
    // delay click-outside so the same click that opened doesn't close
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      clearTimeout(t);
    };
  }, [onClose]);

  useEffect(() => {
    // 换词立刻清上一词 lemma/error，再查 cache
    setLlm(null);
    setError("");
    if (entry) {
      setLoading(false);
      return;
    }
    if (!key) {
      setLoading(false);
      setError("无效单词");
      return;
    }
    if (llmCache.has(key)) {
      setLlm(llmCache.get(key)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const r: WordLookupResult = await lookupWordRemote(surface, context);
        if (cancelled) return;
        if (r.status === "unconfigured") {
          setError("未配置 LLM（服务端）");
          setLoading(false);
          return;
        }
        if (r.status === "ok" && r.senses?.length) {
          const senses = r.senses.map((s) => [String(s[0] ?? "?"), String(s[1] ?? "")] as Sense);
          const data = {
            lemma: r.lemma || key,
            senses,
            phonetic: r.phonetic || undefined,
          };
          llmCache.set(key, data);
          setLlm(data);
          setLoading(false);
          return;
        }
        setError(r.detail || "查词失败");
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          setError("请登录后查询词库外单词（已缓存释义可匿名读）");
        } else {
          setError(e instanceof Error ? e.message : "查词失败");
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, key, surface, context]);

  const left = Math.min(Math.max(12, x - 140), window.innerWidth - 292);
  const top = Math.min(y, window.innerHeight - 220);

  if (entry) {
    return (
      <div
        className="fixed z-50 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-3"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="font-semibold text-lg">{entry[1]}</div>
            {surface.toLowerCase() !== entry[1].toLowerCase() && (
              <div className="text-xs text-muted-foreground">← {surface}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => speakEnglish(entry[1], rate)}
          >
            🔊
          </Button>
        </div>
        <div className="space-y-1 text-sm">
          {entry[2].map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{s[0]}</span>
              <span>{s[1]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-3"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-lg">
            {loading ? surface : llm?.lemma || surface}
          </div>
          {!loading && llm && llm.lemma.toLowerCase() !== surface.toLowerCase() && (
            <div className="text-xs text-muted-foreground">← {surface}</div>
          )}
          {llm?.phonetic ? (
            <div className="text-xs text-muted-foreground mt-0.5">{llm.phonetic}</div>
          ) : null}
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            词库外 · LLM
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => speakEnglish(llm?.lemma || surface, rate)}
        >
          🔊
        </Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">查词中…</div>
      ) : error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : llm ? (
        <div className="space-y-1 text-sm">
          {llm.senses.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{s[0]}</span>
              <span>{s[1]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">无释义</div>
      )}
    </div>
  );
}
