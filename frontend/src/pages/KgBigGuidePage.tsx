// 408 大题分类与答题模板：按解题范式归档 2009–2026 全部 126 道综合应用题。
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { kgKpPath } from "@/lib/kg/paths";
import { CS408_DATA_VER } from "@/lib/kg/exams408";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface GuideQuestion {
  year: number;
  n: number;
  book: string;
  bookName: string;
  topic: string;
  note: string;
  kps: string[];
  hasAnswer: boolean;
  hasExplanation: boolean;
  stemBrief: string;
}

interface GuideType {
  id: string;
  family: string;
  familyName: string;
  name: string;
  subtitle: string;
  paradigm: string;
  template: string[];
  ideas: string[];
  pitfalls: string[];
  kpIds: string[];
  kpNames: { id: string; name: string }[];
  count: number;
  years: number[];
  questions: GuideQuestion[];
}

interface BigGuide {
  version: string;
  scope: string;
  note: string;
  total: number;
  type_count: number;
  years: number[];
  families: { id: string; name: string }[];
  types: GuideType[];
  stats: {
    by_family: Record<string, number>;
    by_year: Record<string, number>;
    with_answer: number;
    with_explanation: number;
  };
}

const FAMILY_CLS: Record<string, string> = {
  ds: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  co: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  os: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cn: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const FAMILY_ORDER = ["ds", "co", "os", "cn"] as const;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function KgBigGuidePage() {
  const [guide, setGuide] = useState<BigGuide | null>(null);
  const [error, setError] = useState("");
  const [family, setFamily] = useState<string>("all");
  const [activeId, setActiveId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  const linkedType = searchParams.get("type");

  useEffect(() => {
    let cancelled = false;
    fetch(`/cs408/big-guide.json?v=${CS408_DATA_VER}`, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`加载失败 (${r.status})`);
        return r.json() as Promise<BigGuide>;
      })
      .then((d) => {
        if (cancelled) return;
        setGuide(d);
        setActiveId((prev) => prev || d.types[0]?.id || "");
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 总览页的范式卡片带 ?type=<id> 直达，切换链接时也要跟着换选中项
  useEffect(() => {
    if (!guide || !linkedType) return;
    if (guide.types.some((t) => t.id === linkedType)) {
      setFamily("all");
      setQuery("");
      setActiveId(linkedType);
    }
  }, [guide, linkedType]);

  const types = guide?.types ?? [];
  const q = query.trim().toLowerCase();

  const matchQuestion = (item: GuideQuestion, typeName: string) => {
    if (!q) return true;
    return (
      `${item.year}`.includes(q) ||
      `q${item.n}`.includes(q) ||
      `${item.year}-${item.n}`.includes(q) ||
      item.topic.toLowerCase().includes(q) ||
      item.note.toLowerCase().includes(q) ||
      typeName.toLowerCase().includes(q)
    );
  };

  const visibleTypes = useMemo(
    () =>
      types
        .filter((t) => family === "all" || t.family === family)
        .map((t) => ({ t, qs: t.questions.filter((x) => matchQuestion(x, t.name)) }))
        .filter(({ t, qs }) => (q ? qs.length > 0 || t.name.toLowerCase().includes(q) : true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types, family, q]
  );

  const active = visibleTypes.find((v) => v.t.id === activeId) ?? visibleTypes[0];
  const activeQs = active?.qs ?? [];

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-destructive">
        大题模板数据加载失败：{error}
      </div>
    );
  }
  if (!guide) {
    return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <Link to="/kg/exams" className="text-xs text-muted-foreground hover:underline">
          ← 408 真题演练
        </Link>
        <h1 className="mt-1 text-xl font-semibold">大题分类 · 答题模板</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {guide.scope} · 归为 {guide.type_count} 类解题范式，每类给模板、思路、易错点与知识点关联
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-xs">
          <span>
            <b className="text-base">{guide.total}</b> 道大题
          </span>
          <span>
            <b className="text-base">{guide.years.length}</b> 套卷（{guide.years[0]}–{guide.years.at(-1)}）
          </span>
          {FAMILY_ORDER.map((f) => (
            <span key={f}>
              {guide.families.find((x) => x.id === f)?.name ?? f}{" "}
              <b>{guide.stats.by_family[f] ?? 0}</b>
            </span>
          ))}
          <span className="text-muted-foreground">
            含逐题解析 {guide.stats.with_explanation}/{guide.total}
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={family === "all" ? "default" : "outline"}
            onClick={() => setFamily("all")}
          >
            全部
          </Button>
          {guide.families.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={family === f.id ? "default" : "outline"}
              onClick={() => setFamily(f.id)}
            >
              {f.name}
            </Button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索主题 / 年份 / 题号，如 2025、PV、拥塞"
          className="ml-auto h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 sm:w-72"
        />
      </div>

      {visibleTypes.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的题型或真题</p>
      )}

      {visibleTypes.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          {/* 左：范式列表 */}
          <div className="space-y-2">
            {visibleTypes.map(({ t, qs }) => {
              const selected = active?.t.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    selected
                      ? "border-primary bg-accent/50 shadow-edge"
                      : "bg-card hover:border-primary/40 hover:bg-accent/20"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug">{t.name}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {q ? `${qs.length}/${t.count}` : t.count}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {t.subtitle}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px]",
                        FAMILY_CLS[t.family]
                      )}
                    >
                      {t.familyName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.years[0]}–{t.years.at(-1)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右：范式详情 */}
          {active && (
            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-[11px]",
                        FAMILY_CLS[active.t.family]
                      )}
                    >
                      {active.t.familyName}
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {active.t.paradigm}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {active.t.count} 题 · {active.t.years.length} 个年份
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-lg">{active.t.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{active.t.subtitle}</p>
                </CardHeader>
                <CardContent className="space-y-5 pt-0">
                  <Section title="答题模板" hint="卷面按这个顺序写，步骤分不丢">
                    <ol className="space-y-2">
                      {active.t.template.map((s, i) => (
                        <li
                          key={i}
                          className="rounded-md border-l-2 border-primary/50 bg-muted/40 px-3 py-2 text-[13px] leading-relaxed"
                        >
                          {s}
                        </li>
                      ))}
                    </ol>
                  </Section>

                  <Section title="思路与常用技巧">
                    <ul className="space-y-1.5 text-[13px] leading-relaxed">
                      {active.t.ideas.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 shrink-0 text-primary">·</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  <Section title="易错点">
                    <ul className="space-y-1.5 text-[13px] leading-relaxed">
                      {active.t.pitfalls.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 shrink-0 text-warning">!</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  <Section title="知识点关联" hint="点开可回知识图谱">
                    <div className="flex flex-wrap gap-1.5">
                      {active.t.kpNames.map((k) => (
                        <Link
                          key={k.id}
                          to={kgKpPath(k.id, { subject: "cs408", src: "big-guide" })}
                          className="rounded-md border bg-card px-2 py-1 text-[11px] hover:border-primary/50 hover:bg-accent/40"
                        >
                          {k.name}
                          <span className="ml-1 text-muted-foreground">{k.id}</span>
                        </Link>
                      ))}
                    </div>
                  </Section>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    历年真题
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {q ? `匹配 ${activeQs.length} 题` : `共 ${active.t.count} 题`}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {activeQs.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      本类型下没有匹配的真题
                    </p>
                  )}
                  {activeQs.map((item) => (
                    <div
                      key={`${item.year}-${item.n}`}
                      className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-[13px] hover:bg-accent/20"
                    >
                      <div className="flex shrink-0 flex-col items-start gap-1">
                        <Link
                          to={`/kg/exams/${item.year}#q${item.n}`}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {item.year}·{item.n}
                        </Link>
                        {item.year === 2026 && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                            回忆版·待正式卷校对
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="leading-relaxed">{item.topic}</p>
                        {item.note && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{item.note}</p>
                        )}
                        {item.kps.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {item.kps.slice(0, 3).map((k) => (
                              <span
                                key={k}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              >
                                {k}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                      <Link
                        to={`/kg/exams/${item.year}#q${item.n}`}
                        className="shrink-0 text-[11px] text-muted-foreground hover:text-primary hover:underline"
                      >
                        看原题{item.hasExplanation ? " / 解析" : ""} →
                      </Link>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">{guide.note}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        其中 2026 卷为考后回忆整理版（教育部未公开正式卷），选择题答案键已与来源页逐题核对，
        但题干/选项措辞可能有出入，且该卷不参与考频校准；复习时以思路与模板为主，
        <Link to="/kg/exams/overview" className="text-primary hover:underline">
          查看题库总览与版本说明
        </Link>
        。
      </p>
    </div>
  );
}
