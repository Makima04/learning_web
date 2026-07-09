import { useEffect } from "react";
import { lookupWord } from "@/lib/lookup";
import { speakEnglish } from "@/lib/tts";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";

export function WordPopover({
  surface,
  x,
  y,
  onClose,
}: {
  surface: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const rate = useSettings((s) => s.rate);
  const entry = lookupWord(surface);

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

  if (!entry) return null;

  const left = Math.min(Math.max(12, x - 140), window.innerWidth - 292);

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-3"
      style={{ left, top: Math.min(y, window.innerHeight - 200) }}
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
