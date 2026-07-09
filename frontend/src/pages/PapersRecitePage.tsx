import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPapers, SECTION_TYPE_LABEL } from "@/lib/words";
import { useCards } from "@/stores/cards";
import { useStudy } from "@/stores/study";
import type { PassageWord } from "@/types/words";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function PapersRecitePage() {
  const [variant, setVariant] = useState<"en1" | "en2">("en1");
  const [paperIdx, setPaperIdx] = useState<number | null>(null);
  const papers = getPapers();
  const cards = useCards((s) => s.cards);
  const startPassage = useStudy((s) => s.startPassage);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const list = papers
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => ((p as any).variant || "en1") === variant);
    const seen = new Map<string, number>();
    list.forEach(({ p, i }) => {
      const key = String(p.year || "s" + i);
      if (!seen.has(key)) seen.set(key, i);
    });
    return Array.from(seen.entries())
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
      .map(([, i]) => ({ p: papers[i], i }));
  }, [papers, variant]);

  function startSection(pIdx: number, type: string, words: PassageWord[]) {
    startPassage(words, { paperIdx: pIdx, type });
    navigate("/study");
  }

  if (paperIdx != null) {
    const p = papers[paperIdx];
    if (!p) return null;
    const vLabel = ((p as any).variant || "en1") === "en2" ? "英语二" : "英语一";
    const typeCount = new Map<string, number>();
    p.sections.forEach((sec) => {
      typeCount.set(sec.type, (typeCount.get(sec.type) || 0) + sec.passages.length);
    });

    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setPaperIdx(null)}>
            ‹
          </Button>
          <h1 className="font-semibold">
            {p.year ? `${p.year} 年` : "真题"} · {vLabel} · 题型
          </h1>
        </div>
        <div className="space-y-2">
          {p.sections.flatMap((sec) => {
            const typeLabel = SECTION_TYPE_LABEL[sec.type] || sec.type;
            const multi = (typeCount.get(sec.type) || 0) > 1;
            return sec.passages.map((psg, pi) => {
              const wordMap = new Map<number, PassageWord>();
              (psg.words || []).forEach((w) => {
                if (!wordMap.has(w.idx)) {
                  wordMap.set(w.idx, {
                    ...w,
                    sentences: (w.sentences || []).slice(0, 5),
                  });
                }
              });
              const words = Array.from(wordMap.values());
              const learned = words.filter((w) => {
                const c = cards[w.idx];
                return !!(c && c.state === "review");
              }).length;
              const titleText = multi ? `${typeLabel} · ${psg.label}` : typeLabel;
              return (
                <Card
                  key={`${sec.type}-${pi}`}
                  className="cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => startSection(paperIdx, sec.type, words)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="text-xs rounded bg-muted px-2 py-1 shrink-0">
                      {typeLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{titleText}</div>
                      <div className="text-sm text-muted-foreground">
                        命中 <b>{words.length}</b> 词 · 已背 <b>{learned}</b> ·{" "}
                        {psg.itemCount || 0} 题 · {psg.body.length} 字
                      </div>
                    </div>
                    <span className="text-muted-foreground">›</span>
                  </CardContent>
                </Card>
              );
            });
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex gap-2">
        {(["en1", "en2"] as const).map((v) => (
          <Button
            key={v}
            variant={variant === v ? "default" : "outline"}
            size="sm"
            onClick={() => setVariant(v)}
          >
            {v === "en1" ? "英语一" : "英语二"}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        选择年份 → 题型 → 背该题型真题里命中的红宝书词汇（与日常背词共用记忆曲线）。
      </p>
      <div className="space-y-2">
        {filtered.map(({ p, i }) => {
          const uniq = new Set<number>();
          p.sections.forEach((sec) =>
            sec.passages.forEach((psg) => psg.words.forEach((w) => uniq.add(w.idx)))
          );
          return (
            <Card
              key={i}
              className="cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => setPaperIdx(i)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="text-2xl font-bold tnum w-16 text-center text-primary">
                  {p.year || "?"}
                </div>
                <div className="flex-1">
                  <div className="font-medium">
                    {p.year
                      ? `${p.year} 年考研英语${variant === "en2" ? "二" : "一"}真题`
                      : p.source}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {p.sections.length} 个题型 · 共 {uniq.size} 个红宝书词汇
                  </div>
                </div>
                <span className="text-muted-foreground">›</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
