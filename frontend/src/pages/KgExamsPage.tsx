// 408 真题演练：年份列表 → 刷题标记（会/模糊/不会）回写图谱
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { findKp } from "@/data/kg";
import { kgMapPath, kgModulePath } from "@/lib/kg/paths";
import {
  examItemId,
  loadCs408ExamIndex,
  loadCs408ExamPaper,
  primaryKpId,
  secondaryKpIds,
  type ExamIndex,
  type ExamItem,
  type ExamKind,
  type ExamPaper,
} from "@/lib/kg/exams408";
import type { MarkLevel } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { examSetPath } from "@/data/kg/examTaxonomy";
import { wdSetPath } from "@/data/kg/wdTaxonomy";
import { osMemSetPath } from "@/data/kg/osMemTopics";
import { ExamTags } from "@/pages/examTags";
import { ItemNoteField } from "@/pages/itemNoteField";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "pass", label: "会了", cls: "bg-emerald-600 text-white" },
  { id: "skip", label: "跳过", cls: "bg-muted text-muted-foreground" },
];

const BOOK_LABEL: Record<string, string> = {
  ds: "数据结构",
  co: "组成原理",
  os: "操作系统",
  cn: "计算机网络",
};

type KindFilter = "all" | ExamKind;
type BookFilter = "all" | string;

function YearList({ index }: { index: ExamIndex }) {
  const itemMarks = useKgProgress((s) => s.itemMarks);

  const markedByYear = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of itemMarks) {
      const match = /^cs408-(\d{4})-q\d+$/.exec(x.itemId);
      if (!match) continue;
      const y = Number(match[1]);
      m.set(y, (m.get(y) ?? 0) + 1);
    }
    return m;
  }, [itemMarks]);

  return (
    <div className="space-y-4">
      <div>
        <Link to={kgMapPath("cs408")} className="text-xs text-muted-foreground hover:underline">
          ← 知识图谱
        </Link>
        <h1 className="mt-1 text-xl font-semibold">408 真题演练</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {index.paper_count} 套卷（{index.years[0]}–{index.years[index.years.length - 1]}
          ）· 考点经 LLM 多标签标注 · 按题标记会回写图谱弱项
        </p>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">快捷</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pb-4">
          <Button asChild size="sm">
            <Link to="/kg/predict">408 大题预测/诊断卷</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={kgMapPath("cs408")}>按模块学习</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={wdSetPath()}>王道按大类</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={wdSetPath({ group: "all", kind: "mcq", mode: "proof" })}>
              王道选择校对
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to={wdSetPath({ group: "all", kind: "big", mode: "proof" })}>
              王道大题校对
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={examSetPath()}>历年卷分类</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={osMemSetPath()}>OS 内存细分</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...index.papers].reverse().map((p) => {
          const done = markedByYear.get(p.year) ?? 0;
          const pct = p.total ? Math.round((done / p.total) * 100) : 0;
          return (
            <Link
              key={p.year}
              to={`/kg/exams/${p.year}`}
              className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold">{p.year}</span>
                <span className="text-xs text-muted-foreground">
                  {p.mcq} 选 + {p.big} 大
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                已标 {done}/{p.total}
                {done > 0 ? `（${pct}%）` : ""}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80 transition-all"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PaperView({ year }: { year: number }) {
  const navigate = useNavigate();
  const load = useKgProgress((s) => s.load);
  const markItem = useKgProgress((s) => s.markItem);
  const itemMarks = useKgProgress((s) => s.itemMarks);

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [book, setBook] = useState<BookFilter>("all");
  const [showAns, setShowAns] = useState<Record<string, boolean>>({});
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [openNs, setOpenNs] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setPaper(null);
    setErr("");
    setOpenNs(new Set());
    setExpandAll(false);
    loadCs408ExamPaper(year)
      .then((p) => {
        if (!cancelled) setPaper(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    if (!paper) return;
    const id = window.location.hash.replace(/^#/, "");
    const m = /^q(\d+)$/.exec(id);
    if (m) {
      const n = Number(m[1]);
      setOpenNs((prev) => {
        if (prev.has(n)) return prev;
        const next = new Set(prev);
        next.add(n);
        return next;
      });
    }
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [paper]);

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  const filtered = useMemo(() => {
    if (!paper) return [] as ExamItem[];
    return paper.items.filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      if (book !== "all" && it.book !== book) return false;
      if (onlyUnmarked) {
        const id = examItemId(year, it.n);
        if (markMap.has(id)) return false;
      }
      return true;
    });
  }, [paper, kind, book, onlyUnmarked, year, markMap]);

  const stats = useMemo(() => {
    if (!paper) return { marked: 0, total: 0 };
    let marked = 0;
    for (const it of paper.items) {
      if (markMap.has(examItemId(year, it.n))) marked++;
    }
    return { marked, total: paper.items.length };
  }, [paper, markMap, year]);

  const onMark = useCallback(
    (it: ExamItem, mark: MarkLevel) => {
      const pk = primaryKpId(it);
      if (!pk) return;
      markItem({
        itemId: examItemId(year, it.n),
        mark,
        primaryKpId: pk,
        secondaryKpIds: secondaryKpIds(it),
      });
    },
    [markItem, year]
  );

  if (err) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/kg/exams")}>
          ← 年份列表
        </Button>
        <p className="text-sm text-destructive">{err}</p>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/kg/exams")}>
          ← 年份列表
        </Button>
        <p className="text-sm text-muted-foreground">加载 {year} 卷…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => navigate("/kg/exams")}
        >
          ← 年份列表
        </button>
        <h1 className="mt-1 text-xl font-semibold">{year} 年 408</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {paper.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          已标 {stats.marked}/{stats.total} · 当前筛选 {filtered.length} 题 ·
          不要求交卷，标记即回写考点
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "全部"],
            ["mcq", "选择"],
            ["big", "大题"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-md px-3 py-1 text-xs",
              kind === k
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {(
          [
            ["all", "全科"],
            ["ds", "数据结构"],
            ["co", "组成"],
            ["os", "OS"],
            ["cn", "网络"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setBook(k)}
            className={cn(
              "rounded-md px-3 py-1 text-xs",
              book === k
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => setOnlyUnmarked((v) => !v)}
          className={cn(
            "rounded-md px-3 py-1 text-xs",
            onlyUnmarked
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          只看未标
        </button>
        <button
          type="button"
          onClick={() => setExpandAll((v) => !v)}
          className={cn(
            "rounded-md px-3 py-1 text-xs",
            expandAll
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {expandAll ? "全部收起" : "全部展开"}
        </button>
      </div>

      <div className="space-y-3">
        {filtered.map((it) => {
          const id = examItemId(year, it.n);
          const marked = markMap.get(id);
          const pk = primaryKpId(it);
          const found = pk ? findKp(pk) : null;
          const secs = secondaryKpIds(it);
          const open = expandAll || openNs.has(it.n);
          const preview = it.stem.replace(/\s+/g, " ").slice(0, 72);
          return (
            <Card key={id} id={`q${it.n}`}>
              <CardHeader className="pb-2">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setOpenNs((prev) => {
                      const next = new Set(prev);
                      if (next.has(it.n)) next.delete(it.n);
                      else next.add(it.n);
                      return next;
                    })
                  }
                >
                  <CardTitle className="text-sm">
                    第 {it.n} 题
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {it.kind === "big" ? "大题" : "选择"} ·{" "}
                      {it.book_name || BOOK_LABEL[it.book] || it.book}
                      {it.points != null ? ` · ${it.points} 分` : ""}
                    </span>
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ExamTags year={year} n={it.n} showMinor={open} link={false} />
                  </div>
                  {!open && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview}</p>
                  )}
                </button>
                {open && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Link
                      to={examSetPath({
                        group: "all",
                        mode: "proof",
                        q: `${year}-${it.n}`,
                      })}
                      className="text-[11px] text-primary hover:underline"
                    >
                      在题集中校对
                    </Link>
                  </div>
                )}
                {open && (
                <p className="text-xs text-muted-foreground">
                  考点：
                  {it.kps.length === 0 && "（未标注）"}
                  {it.kps.map((k, i) => {
                    const foundKp = findKp(k.id);
                    const name = foundKp?.kp.name ?? k.id;
                    return (
                      <span key={`${k.id}-${i}`}>
                        {i > 0 && "、"}
                        <Link
                          to={
                            foundKp
                              ? kgModulePath(
                                  foundKp.book.id,
                                  foundKp.module.id,
                                  foundKp.book.subject
                                )
                              : kgMapPath("cs408")
                          }
                          className="hover:underline"
                        >
                          {name}
                          {k.role === "primary" ? "" : "·次"}
                        </Link>
                      </span>
                    );
                  })}
                </p>
                )}
              </CardHeader>
              {open && (
              <CardContent className="space-y-3">
                <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                  {it.stem}
                </pre>
                {it.options && (
                  <ul className="space-y-1 text-sm">
                    {Object.entries(it.options).map(([k, v]) => (
                      <li key={k} className="flex gap-2">
                        <span className="w-5 shrink-0 font-medium text-muted-foreground">
                          {k}.
                        </span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  {MARKS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!pk}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40",
                        m.cls,
                        marked === m.id && "ring-2 ring-offset-2 ring-primary"
                      )}
                      onClick={() => onMark(it, m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                  {(it.answer || found) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setShowAns((e) => ({ ...e, [id]: !e[id] }))
                      }
                    >
                      {showAns[id] ? "收起" : "考点/答案"}
                    </Button>
                  )}
                </div>
                <ItemNoteField itemId={id} />
                {showAns[id] && (
                  <div className="space-y-1 rounded-md border border-dashed p-3 text-sm">
                    {it.answer && (
                      <p>
                        <span className="font-medium">答案：</span>
                        {it.answer}
                      </p>
                    )}
                    {!it.answer && (
                      <p className="text-muted-foreground">
                        本题暂无标答字段（社区重构卷以题干练习为主）。
                      </p>
                    )}
                    {found && (
                      <p className="text-muted-foreground">
                        主考点「{found.kp.name}」考频 {found.kp.freq}/5 · 大题权{" "}
                        {found.kp.bigWeight}
                        {secs.length > 0 &&
                          ` · 次考点 ${secs
                            .map((sid) => findKp(sid)?.kp.name ?? sid)
                            .join("、")}`}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">当前筛选下无题目。</p>
        )}
      </div>
    </div>
  );
}

export function KgExamsPage() {
  const { year: yearParam } = useParams();
  const load = useKgProgress((s) => s.load);
  const [index, setIndex] = useState<ExamIndex | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    loadCs408ExamIndex()
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "索引加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const year = yearParam ? Number(yearParam) : NaN;
  const hasYear = Number.isFinite(year) && year >= 2000;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      {err && !hasYear && (
        <p className="text-sm text-destructive">{err}</p>
      )}
      {hasYear ? (
        <PaperView year={year} />
      ) : index ? (
        <YearList index={index} />
      ) : (
        !err && <p className="text-sm text-muted-foreground">加载真题索引…</p>
      )}
    </div>
  );
}
