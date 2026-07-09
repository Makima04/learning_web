import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPapers, SECTION_TYPE_LABEL } from "@/lib/words";
import { useCards } from "@/stores/cards";
import { useStudy } from "@/stores/study";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PapersPage() {
  const [variant, setVariant] = useState<"en1" | "en2">("en1");
  const [paperIdx, setPaperIdx] = useState<number | null>(null);
  const papers = getPapers();
  const cards = useCards((s) => s.cards);
  const setPassageReader = useStudy((s) => s.setPassageReader);
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

  if (paperIdx != null) {
    const p = papers[paperIdx];
    if (!p) return null;
    const vLabel = ((p as any).variant || "en1") === "en2" ? "英语二" : "英语一";
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setPaperIdx(null)}>
            ‹
          </Button>
          <h1 className="font-semibold">
            {p.year ? `${p.year} 年` : "真题"} · {vLabel} · 篇章
          </h1>
        </div>
        <div className="space-y-2">
          {p.sections.map((sec, si) =>
            sec.passages.map((psg, pi) => {
              const learned = psg.words.filter((w) => {
                const c = cards[w.idx];
                return !!(c && c.state === "review");
              }).length;
              return (
                <Card
                  key={`${si}-${pi}`}
                  className="cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => {
                    setPassageReader({
                      title: `${p.year ? p.year + " 年 " : ""}${psg.label || ""}`,
                      body: psg.body,
                      words: psg.words.map((w) => w.english),
                      year: p.year,
                      variant: (p as any).variant || "en1",
                      label: psg.label,
                      items: (psg as any).items || [],
                      answers: (psg as any).answers || {},
                      sectionType: sec.type,
                      wordsFull: psg.words,
                    });
                    navigate("/reader");
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="text-xs rounded bg-muted px-2 py-1 shrink-0">
                      {SECTION_TYPE_LABEL[sec.type] || sec.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{psg.label}</div>
                      <div className="text-sm text-muted-foreground">
                        命中 <b>{psg.words.length}</b> 词 · 已背 <b>{learned}</b> ·{" "}
                        {psg.itemCount || 0} 题 · {psg.body.length} 字
                      </div>
                    </div>
                    <span className="text-muted-foreground">›</span>
                  </CardContent>
                </Card>
              );
            })
          )}
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
        选择年份与篇章，阅读真题原文：按句翻译、命中词高亮。
      </p>
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-muted-foreground">暂无真题数据。</p>
        )}
        {filtered.map(({ p, i }) => {
          const totalWords = p.sections.reduce(
            (s, sec) => s + sec.passages.reduce((t, ps) => t + ps.words.length, 0),
            0
          );
          return (
            <Card
              key={i}
              className="cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => setPaperIdx(i)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div
                  className={cn(
                    "text-2xl font-bold tnum w-16 text-center text-primary"
                  )}
                >
                  {p.year || "?"}
                </div>
                <div className="flex-1">
                  <div className="font-medium">
                    {p.year
                      ? `${p.year} 年考研英语${variant === "en2" ? "二" : "一"}真题`
                      : p.source}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {p.sections.length} 个题型 · 共 {totalWords} 个红宝书词汇
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
