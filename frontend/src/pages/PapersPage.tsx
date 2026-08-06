import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SECTION_TYPE_LABEL } from "@/lib/words";
import {
  buildPassageReader,
  passageReaderPath,
} from "@/lib/passageReader";
import {
  getPaperByVariantYear,
  listYearsForVariant,
  normalizeVariant,
  papersListPath,
  papersYearPath,
} from "@/lib/papersNav";
import { useCards } from "@/stores/cards";
import { useStudy } from "@/stores/study";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PapersPage() {
  const { variant: variantParam, year: yearParam } = useParams<{
    variant?: string;
    year?: string;
  }>();
  const navigate = useNavigate();
  const cards = useCards((s) => s.cards);
  const setPassageReader = useStudy((s) => s.setPassageReader);

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
      navigate(papersListPath("en1"), { replace: true });
      return;
    }
    if (hasYear && !yearHit) {
      navigate(papersListPath(variant), { replace: true });
    }
  }, [variantParam, variantOk, hasYear, yearHit, variant, navigate]);

  if (!variantParam || !variantOk) {
    return (
      <div className="p-6 text-sm text-muted-foreground">正在打开真题列表…</div>
    );
  }

  if (hasYear) {
    if (!yearHit) {
      return (
        <div className="p-6 text-sm text-muted-foreground">未找到该年真题…</div>
      );
    }
    const { paper: p } = yearHit;
    const vLabel = variant === "en2" ? "英语二" : "英语一";
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(papersListPath(variant))}
          >
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
                    const reader = buildPassageReader(p, sec, psg);
                    setPassageReader(reader);
                    navigate(
                      passageReaderPath({
                        variant: reader.variant || "en1",
                        year: reader.year ?? 0,
                        label: reader.label || psg.label || "passage",
                      })
                    );
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
            onClick={() => navigate(papersListPath(v))}
          >
            {v === "en1" ? "英语一" : "英语二"}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        选择年份与篇章：左侧原文与选择题，右侧译文与答案解析。
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
              onClick={() => navigate(papersYearPath(variant, year))}
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
