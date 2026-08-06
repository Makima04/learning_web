import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SECTION_TYPE_LABEL } from "@/lib/words";
import {
  getPaperByVariantYear,
  listYearsForVariant,
  normalizeVariant,
  papersReciteListPath,
  papersReciteYearPath,
} from "@/lib/papersNav";
import { useCards } from "@/stores/cards";
import { summarizePassageWords, useStudy } from "@/stores/study";
import type { PassageWord } from "@/types/words";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PapersRecitePage() {
  const { variant: variantParam, year: yearParam } = useParams<{
    variant?: string;
    year?: string;
  }>();
  const navigate = useNavigate();
  const cards = useCards((s) => s.cards);
  const openPassageSection = useStudy((s) => s.openPassageSection);

  const variant = normalizeVariant(variantParam);
  const yearNum = yearParam != null ? parseInt(yearParam, 10) : NaN;
  const hasYear = Number.isFinite(yearNum);
  const variantOk = variantParam === "en1" || variantParam === "en2";

  const yearList = useMemo(() => listYearsForVariant(variant), [variant]);
  const yearHit = useMemo(
    () => (hasYear ? getPaperByVariantYear(variant, yearNum) : null),
    [hasYear, variant, yearNum]
  );

  useEffect(() => {
    if (!variantParam || !variantOk) {
      navigate(papersReciteListPath("en1"), { replace: true });
      return;
    }
    if (hasYear && !yearHit) {
      navigate(papersReciteListPath(variant), { replace: true });
    }
  }, [variantParam, variantOk, hasYear, yearHit, variant, navigate]);

  function openSection(pIdx: number, type: string, words: PassageWord[]) {
    // 未学 → 学；全学完且有到期 → 只复习本篇；都无 → 词表
    openPassageSection(words, { paperIdx: pIdx, type });
    navigate("/study");
  }

  if (!variantParam || !variantOk) {
    return (
      <div className="p-6 text-sm text-muted-foreground">正在打开记词列表…</div>
    );
  }

  if (hasYear) {
    if (!yearHit) {
      return (
        <div className="p-6 text-sm text-muted-foreground">未找到该年真题…</div>
      );
    }
    const { paper: p, index: paperIdx } = yearHit;
    const vLabel = variant === "en2" ? "英语二" : "英语一";
    const typeCount = new Map<string, number>();
    p.sections.forEach((sec) => {
      typeCount.set(sec.type, (typeCount.get(sec.type) || 0) + sec.passages.length);
    });

    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(papersReciteListPath(variant))}
          >
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
              const summary = summarizePassageWords(words, cards);
              const titleText = multi ? `${typeLabel} · ${psg.label}` : typeLabel;
              const statusHint =
                summary.kind === "learn"
                  ? `待学 ${summary.unlearned}`
                  : summary.kind === "review"
                    ? `待复习 ${summary.due}`
                    : "可查词表";
              return (
                <Card
                  key={`${sec.type}-${pi}`}
                  className="cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => openSection(paperIdx, sec.type, words)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="text-xs rounded bg-muted px-2 py-1 shrink-0">
                      {typeLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{titleText}</div>
                      <div className="text-sm text-muted-foreground">
                        命中 <b>{summary.total}</b> 词 · 已背 <b>{summary.learned}</b>
                        {" · "}
                        <span
                          className={
                            summary.kind === "list"
                              ? "text-muted-foreground"
                              : "text-primary"
                          }
                        >
                          {statusHint}
                        </span>
                        {" · "}
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
            onClick={() => navigate(papersReciteListPath(v))}
          >
            {v === "en1" ? "英语一" : "英语二"}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        选择年份 → 题型：先学未学词；学完后点进可只复习本篇到期词；都完成后可查看词表。
      </p>
      <div className="space-y-2">
        {yearList.length === 0 && (
          <p className="text-muted-foreground">暂无真题数据。</p>
        )}
        {yearList.map(({ year, paper: p }) => {
          const totalWords = p.sections.reduce(
            (s, sec) => s + sec.passages.reduce((t, ps) => t + ps.words.length, 0),
            0
          );
          return (
            <Card
              key={`${variant}-${year}`}
              className="cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => navigate(papersReciteYearPath(variant, year))}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div
                  className={cn(
                    "text-2xl font-bold tnum w-16 text-center text-primary"
                  )}
                >
                  {year || "?"}
                </div>
                <div className="flex-1">
                  <div className="font-medium">
                    {year
                      ? `${year} 年考研英语${variant === "en2" ? "二" : "一"}真题`
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
