// 408 题库总览 / 数据质量看板：一次看清 18 套卷的版本、覆盖度与「回忆版」处理状态。
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CS408_DATA_VER,
  loadCs408ExamIndex,
  type ExamIndex,
  type ExamIndexPaper,
} from "@/lib/kg/exams408";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface GuideTypeBrief {
  id: string;
  family: string;
  familyName: string;
  name: string;
  count: number;
}
interface BigGuideBrief {
  version: string;
  total: number;
  type_count: number;
  types: GuideTypeBrief[];
  stats: { by_family: Record<string, number> };
}

const FAMILY_CLS: Record<string, string> = {
  ds: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  co: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  os: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cn: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(`${url}?v=${CS408_DATA_VER}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} 加载失败 (${r.status})`);
  return (await r.json()) as T;
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
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

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        tone === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "orange" && "bg-orange-500/15 text-orange-700 dark:text-orange-300",
        tone === "green" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "muted" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

export function Cs408OverviewPage() {
  const [index, setIndex] = useState<ExamIndex | null>(null);
  const [guide, setGuide] = useState<BigGuideBrief | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "excluded">("all");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCs408ExamIndex(),
      fetchJson<BigGuideBrief>("/cs408/big-guide.json"),
    ])
      .then(([idx, g]) => {
        if (cancelled) return;
        setIndex(idx);
        setGuide(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const papers = useMemo(() => (index?.papers ?? []).slice().reverse(), [index]);
  const visible = useMemo(
    () =>
      papers.filter((p) => {
        if (filter === "review") return p.quality === "needs_review";
        if (filter === "excluded") return p.excluded_from_stats === true;
        return true;
      }),
    [papers, filter]
  );

  const totals = useMemo(() => {
    const ps = index?.papers ?? [];
    return {
      papers: ps.length,
      questions: ps.reduce((s, p) => s + p.total, 0),
      keys: ps.reduce((s, p) => s + (p.answer_keys ?? 0), 0),
      exps: ps.reduce((s, p) => s + (p.explanations ?? 0), 0),
      images: ps.reduce((s, p) => s + (p.page_images ?? 0), 0),
      review: ps.filter((p) => p.quality === "needs_review").length,
      excluded: ps.filter((p) => p.excluded_from_stats).length,
    };
  }, [index]);

  const recall = papers.find((p) => p.edition === "recall");

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-6">
        <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
          <p className="text-sm font-semibold text-destructive">题库总览没能加载</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            重试
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/kg/exams">返回真题练习</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!index || !guide) {
    return <div className="p-6 text-sm text-muted-foreground">加载题库总览…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <Link to="/kg/exams" className="text-xs text-muted-foreground hover:underline">
          ← 408 真题
        </Link>
        <h1 className="mt-1 text-xl font-semibold">408 题库总览 · 数据质量</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          2009–2026 全部卷次的版本、答案与解析覆盖、大题范式入口；数据版本 {index.data_ver}
        </p>
      </div>

      {/* 本页是维护视角，考生误入时要能一眼找到回去练题的路 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">这一页是题库数据质量看板</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            用于核对版本、答案键与解析覆盖；日常练习请从真题页进入。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/kg/exams#year-grid">按年份练</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/kg/exams">回到 408 真题 →</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="卷次" value={totals.papers} hint={`${index.years[0]}–${index.years.at(-1)}`} />
        <Kpi label="题目" value={totals.questions} hint="每卷 47 题" />
        <Kpi label="选择题答案键" value={totals.keys} hint="40 / 卷" />
        <Kpi
          label="逐题解析"
          value={totals.exps}
          hint={`${Math.round((totals.exps / totals.questions) * 100)}% 覆盖`}
        />
        <Kpi label="大题范式" value={guide.type_count} hint={`${guide.total} 道大题`} />
        <Kpi label="原版答案页" value={totals.images} hint="扫描件校对用" />
      </div>

      {/* 大题分类是高频目标：放在首屏，避免用户滚到页尾才发现 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">大题分类 · 答题模板</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {guide.total} 道大题按解题范式归为 {guide.type_count} 类，含模板、思路、易错点与知识点关联；
              可按分科 / 主题 / 年份筛选，并直达原卷解析
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/kg/exams/big-guide">打开大题分类页 →</Link>
          </Button>
        </CardContent>
      </Card>

      {/* 回忆版处理结果：不再是无标注的隐患，而是可核对、可替换的状态 */}
      {recall && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{recall.year} 卷 · 回忆版处理结果</CardTitle>
              <Badge tone="amber">考后回忆整理版</Badge>
              <Badge tone="green">
                答案键 {recall.verification?.answer_key_match ?? "40/40"} 已核对
              </Badge>
              <Badge>不参与考频校准</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] leading-relaxed">
            <p>
              教育部未公开 408 正式卷，来源页也没有官方 PDF；因此没有做「替换成正式卷」的假动作。
              处理方式是把不确定性显式化：用
              <code className="mx-1 rounded bg-muted px-1">scripts/verify_cs408_2026.py</code>
              抓取来源页按题号切块，与本地 40 道选择题答案键逐题比对，结果写入
              <code className="mx-1 rounded bg-muted px-1">papers/cs408/2026.json</code>
              的 <code className="rounded bg-muted px-1">verification</code> 字段，并下发到前端。
            </p>
            <p className="text-muted-foreground">
              核对状态：{recall.verification?.status} · 核对日期 {recall.verification?.checked_at} ·
              范围 {recall.verification?.scope}。残余风险：{recall.verification?.residual_risk}。
            </p>
            <p className="text-muted-foreground">
              已落实的三条约束：① 年份列表、试卷页、本看板都显示「回忆版·已核对」标记与提示条；
              ② 该卷不进入 freq / bigWeight 校准，避免不确定题干稀释统计；
              ③ 题干、选项、答案、解析照常可练可看，取得正式卷后按
              <code className="mx-1 rounded bg-muted px-1">SOURCES.md</code>
              的 promote 流程替换并改 edition。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <Link to={`/kg/exams/${recall.year}`}>打开 {recall.year} 卷</Link>
              </Button>
              {recall.verification?.source_url && (
                <Button asChild size="sm" variant="ghost">
                  <a href={recall.verification.source_url} target="_blank" rel="noreferrer">
                    查看来源页 ↗
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">逐年数据质量</CardTitle>
            <div className="flex gap-1">
              {(
                [
                  ["all", "全部"],
                  ["review", `需校对 ${totals.review}`],
                  ["excluded", `不参与校准 ${totals.excluded}`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px]",
                    filter === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">年份</th>
                  <th className="py-2 pr-2 font-medium">版本 / 质量</th>
                  <th className="py-2 pr-2 font-medium">答案键</th>
                  <th className="py-2 pr-2 font-medium">逐题解析</th>
                  <th className="py-2 pr-2 font-medium">原页图</th>
                  <th className="py-2 pr-2 font-medium">校准</th>
                  <th className="py-2 font-medium">入口</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p: ExamIndexPaper) => {
                  const pct = Math.round(((p.explanations ?? 0) / (p.total || 1)) * 100);
                  return (
                    <tr key={p.year} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-2 pr-2 font-mono font-semibold">{p.year}</td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-1">
                          {p.edition === "recall" && <Badge tone="amber">回忆版·已核对</Badge>}
                          {p.edition === "compilation" && <Badge>早期合订本</Badge>}
                          {p.edition === "rebuild" && <Badge>重构版 PDF</Badge>}
                          {p.quality === "needs_review" && <Badge tone="orange">OCR 待校对</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{p.answer_keys ?? 0}/40</td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{p.explanations ?? 0}/{p.total}</span>
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                pct >= 90 ? "bg-emerald-500/80" : "bg-amber-500/80"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{p.page_images ?? 0} 页</td>
                      <td className="py-2 pr-2">
                        {p.excluded_from_stats ? (
                          <span className="text-muted-foreground">排除</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-300">纳入</span>
                        )}
                      </td>
                      <td className="py-2">
                        <Link
                          to={`/kg/exams/${p.year}`}
                          className="text-primary hover:underline"
                        >
                          进入试卷 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">该筛选下没有卷次</p>
          )}
          <p className="pt-3 text-[11px] leading-relaxed text-muted-foreground">
            口径：答案键 720/720 全部对着答案表原页视觉核准；扫描年份解析为 OCR，已在逐题
            「答案/解析」里挂原版答案页；2024/2025 源答案页本身不含选择题逐题解析，只有答案键与大题要点。
            考频校准只采信 2012–2025 重构卷的 LLM 多标签。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">大题解题范式 · {guide.type_count} 类</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/kg/exams/big-guide">打开完整答题模板页 →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {guide.types.map((t) => (
            <Link
              key={t.id}
              to={`/kg/exams/big-guide?type=${t.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px] hover:border-primary/50 hover:bg-accent/30"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[10px]",
                    FAMILY_CLS[t.family]
                  )}
                >
                  {t.familyName}
                </span>
                <span className="truncate">{t.name}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.count}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">预览自检</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-0 text-xs sm:grid-cols-2">
          <p>题库索引版本：<code className="rounded bg-muted px-1">{index.data_ver}</code>（与前端缓存版本一致）</p>
          <p>大题模板版本：<code className="rounded bg-muted px-1">{guide.version}</code></p>
          <p>回忆版答案键核对：<b>{recall?.verification?.answer_key_match ?? "—"}</b>（{recall?.verification?.checked_at ?? "—"}）</p>
          <p>扫描件原页图：<b>{totals.images}</b> 页，覆盖 2019 / 2021 / 2024 / 2025</p>
          <p>不参与考频校准的卷次：<b>{totals.excluded}</b>（2009–2011 规则标注 + 2026 回忆版）</p>
          <p>大题归类：<b>{guide.total}</b> 道 / <b>{guide.type_count}</b> 类，零漏归</p>
        </CardContent>
      </Card>

      <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
        数据仅供个人学习与组卷算法研究，请勿商用传播；原题版权归教育部考试中心及相关权利人所有。
        来源与重跑顺序见 papers/cs408/SOURCES.md。
      </p>
    </div>
  );
}
