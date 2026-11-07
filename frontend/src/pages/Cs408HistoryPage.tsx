// 408 真题练习记录：会话列表 + 可回看的历史复盘
// 数据来自 KgDoc.examSessions / attempts（随 /api/kg 整包同步），不新增字段。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, History } from "lucide-react";
import {
  formatDateTime,
  formatDuration,
  historySessions,
  sessionRecordsTruncated,
  sessionReport,
  type ExamSession,
} from "@/lib/kg/examAttempts";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SessionReportView } from "@/pages/sessionReportView";
import { cn } from "@/lib/utils";

const TAP = "min-h-[44px] md:min-h-9";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

interface Row {
  session: ExamSession;
  answered: number;
  autoTotal: number;
  correct: number;
  pct: number | null;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function Cs408HistoryPage() {
  const load = useKgProgress((s) => s.load);
  const rawSessions = useKgProgress((s) => s.examSessions);
  const attempts = useKgProgress((s) => s.attempts);
  const [selected, setSelected] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const t = window.setTimeout(
      () => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      40
    );
    return () => window.clearTimeout(t);
  }, [selected]);

  const rows: Row[] = useMemo(
    () =>
      historySessions(rawSessions, attempts).map((session) => {
        const r = sessionReport(session, attempts);
        return {
          session,
          answered: r.answered,
          autoTotal: r.autoTotal,
          correct: r.correct,
          pct: r.autoTotal ? Math.round((r.correct / r.autoTotal) * 100) : null,
        };
      }),
    [rawSessions, attempts]
  );

  const summary = useMemo(() => {
    let mockCount = 0;
    let autoTotal = 0;
    let correct = 0;
    let durationMs = 0;
    for (const row of rows) {
      if (row.session.mode === "mock") mockCount++;
      if (row.session.finishedAt) {
        durationMs += row.session.durationMs ?? 0;
        autoTotal += row.autoTotal;
        correct += row.correct;
      }
    }
    return {
      mockCount,
      avgPct: autoTotal ? `${Math.round((correct / autoTotal) * 100)}%` : "—",
      durationMs,
    };
  }, [rows]);

  const current = rows.find((r) => r.session.id === selected);
  const currentReport = current ? sessionReport(current.session, attempts) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <Link to="/kg/exams" className={cn("rounded text-xs text-muted-foreground hover:underline", FOCUS)}>
          ← 408 真题
        </Link>
        <h1 className="mt-1 text-2xl font-bold">练习记录</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每次练习的年份、用时与客观题正确率；点开任意一次可回看当时的复盘报告。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="练习次数" value={String(rows.length)} hint="含未交卷的练习" />
        <Stat label="整卷模考" value={String(summary.mockCount)} hint="含未交卷的模考" />
        <Stat label="平均客观正确率" value={summary.avgPct} hint="仅统计已交卷会话" />
      </div>

      {rows.length === 0 ? (
        <div role="status" className="rounded-2xl border-2 border-border/70 bg-card p-8 text-center">
          <History className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">还没有练习记录</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            提交过一次作答或交过一次卷，就会在这里留下记录；点开就能回看正确率、分科表现和需要复习的题。
            误点进入又立刻退出的空白会话不会显示。
          </p>
          <Button asChild size="sm" className={cn("mt-3", TAP, FOCUS)}>
            <Link to="/kg/exams">去练一套卷</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">最近练习</h2>
            <p className="text-xs text-muted-foreground">
              已交卷累计用时 {formatDuration(summary.durationMs)} · 最多保留 40 次会话
            </p>
          </div>
          <div className="space-y-2">
            {rows.map((row) => {
              const s = row.session;
              const open = selected === s.id;
              return (
                <Card key={s.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {s.year} 年
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {s.mode === "mock" ? "整卷模考" : "逐题练习"}
                        </span>
                        {!s.finishedAt && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-800 dark:text-amber-200">
                            未交卷
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDateTime(s.startedAt)}
                        {s.finishedAt ? ` · 用时 ${formatDuration(s.durationMs ?? 0)}` : " · 用时未记录"}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        已答 <b className="tabular-nums text-foreground">{row.answered}</b>/{s.itemIds.length}
                        <span className="mx-1">·</span>客观正确率{" "}
                        <b className="tabular-nums text-foreground">{row.pct === null ? "—" : `${row.pct}%`}</b>
                        {row.autoTotal > 0 && ` (${row.correct}/${row.autoTotal})`}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                      <Button
                        size="sm"
                        variant={open ? "secondary" : "default"}
                        aria-expanded={open}
                        aria-controls="history-report"
                        className={cn(TAP, FOCUS)}
                        onClick={() => setSelected(open ? null : s.id)}
                      >
                        {open ? "收起复盘" : "查看复盘"}
                        <ChevronRight className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                      </Button>
                      <Button asChild size="sm" variant="ghost" className={cn(TAP, FOCUS)}>
                        <Link to={`/kg/exams/practice/${s.year}?mode=${s.mode}`}>再练这套卷</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {current && currentReport && (
        <div ref={reportRef} id="history-report" className="scroll-mt-20 border-t-2 border-border/70 pt-5">
          <SessionReportView
            year={current.session.year}
            mode={current.session.mode}
            report={currentReport}
            backTo="/kg/exams/history"
            backLabel="收起复盘"
            onBack={() => setSelected(null)}
            incomplete={!current.session.finishedAt}
            truncated={sessionRecordsTruncated(current.session, attempts)}
          />
        </div>
      )}
    </div>
  );
}
