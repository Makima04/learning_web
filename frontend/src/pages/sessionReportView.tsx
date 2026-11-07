// 408 真题复盘报告：交卷当场与练习记录里的历史复盘共用同一套口径与排版
import { Link } from "react-router-dom";
import { ATTEMPTS_LIMIT, bookLabel, formatDuration, type SessionReport } from "@/lib/kg/examAttempts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TAP = "min-h-[44px] md:min-h-9";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function SessionReportView({
  year,
  mode,
  report,
  backTo,
  backLabel,
  onBack,
  incomplete = false,
  truncated = false,
}: {
  year: number;
  mode: "practice" | "mock";
  report: SessionReport;
  backTo: string;
  backLabel: string;
  /** 历史复盘里用「收起」而非路由跳转 */
  onBack?: () => void;
  /** 没交卷的会话：报告只统计已提交的作答 */
  incomplete?: boolean;
  /** 早期作答记录被 ATTEMPTS_LIMIT 裁剪 */
  truncated?: boolean;
}) {
  const pct = report.autoTotal ? Math.round((report.correct / report.autoTotal) * 100) : 0;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          {year} 年 · {mode === "mock" ? "整卷模考" : "逐题练习"}
        </p>
        <h2 className="mt-1 text-2xl font-bold">复盘报告</h2>
      </div>

      {(incomplete || truncated) && (
        <div role="status" className="space-y-1 rounded-xl border-2 border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
          {incomplete && <p>这次练习没有交卷，下方数据只统计当时已提交的作答。</p>}
          {truncated && <p>早期作答记录已被 {ATTEMPTS_LIMIT} 条上限裁剪，这份复盘只统计仍保留的记录，数字可能偏低。</p>}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted-foreground">客观题正确率</p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-primary">{pct}%</p>
            <p className="text-[11px] text-muted-foreground">{report.correct}/{report.autoTotal} 题</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">用时</p>
            <p className="mt-0.5 text-lg font-semibold">{formatDuration(report.durationMs)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">已作答</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{report.answered}/{report.total}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">需复习 / 大题自评</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {report.wrongIds.length} / {report.manual}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-semibold">分科正确率</p>
          {Object.entries(report.byBook).length === 0 && (
            <p className="text-xs text-muted-foreground">本轮没有可自动判分的作答。</p>
          )}
          {Object.entries(report.byBook).map(([book, stat]) => {
            const v = stat.total ? Math.round((stat.correct / stat.total) * 100) : 0;
            return (
              <div key={book} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{bookLabel(book)}</span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={v}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${bookLabel(book)}正确率`}
                >
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${v}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {stat.correct}/{stat.total}
                </span>
              </div>
            );
          })}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            客观正确率只统计能自动判分的选择题（{report.correct}/{report.autoTotal}）；
            {report.manual > 0 && `${report.manual} 道大题按自评记录、`}
            {report.unjudgeable > 0 && `${report.unjudgeable} 道答案格式特殊的题仅记录作答、`}
            大题与未判分题不计入分母
            {report.answered < report.total && `；本轮提前交卷，${report.total - report.answered} 题未作答`}。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="text-sm font-semibold">需要复习的题</p>
          {report.wrongIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">这一轮没有答错的题，保持住。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {report.wrongIds.map((id) => {
                const m = /^cs408-(\d{4})-q(\d+)$/.exec(id);
                return (
                  <Link
                    key={id}
                    to={`/kg/exams/${m?.[1] ?? year}#q${m?.[2] ?? ""}`}
                    className={cn("rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted", FOCUS)}
                  >
                    {m ? `第 ${m[2]} 题` : id} →
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild className={cn(TAP, FOCUS)}>
          <Link to="/kg/exams/mistakes">去错题本复习</Link>
        </Button>
        <Button asChild variant="outline" className={cn(TAP, FOCUS)}>
          <Link to={`/kg/exams/practice/${year}?mode=practice`}>再练一遍</Link>
        </Button>
        {onBack ? (
          <Button variant="ghost" className={cn(TAP, FOCUS)} onClick={onBack}>
            {backLabel}
          </Button>
        ) : (
          <Button asChild variant="ghost" className={cn(TAP, FOCUS)}>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
