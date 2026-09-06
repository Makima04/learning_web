// 408 全科题集：知识图谱大类入口 → 按卷序刷 / 快速校对；点开题目才出小类标签。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { findKp } from "@/data/kg";
import {
  EXAM_GROUPS,
  examClassOf,
  examExamsInOrder,
  examGroup,
  examGroupsByBook,
  examKey,
  examSetPath,
  examTopic,
  examTopicsForGroup,
  examYears,
  type ExamTopic,
} from "@/data/kg/examTaxonomy";
import { osMemSetPath } from "@/data/kg/osMemTopics";
import {
  examItemId,
  loadCs408ExamPapers,
  primaryKpId,
  secondaryKpIds,
  type ExamItem,
  type ExamPaper,
} from "@/lib/kg/exams408";
import { kgKpPath } from "@/lib/kg/paths";
import type { Cs408ExamRef } from "@/data/kg/examClassify";
import type { MarkLevel } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ExamTags } from "@/pages/examTags";
import { ItemNoteField } from "@/pages/itemNoteField";
import { vizFor } from "@/viz/registry";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "对", cls: "bg-emerald-600 text-white" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "fail", label: "错", cls: "bg-destructive text-destructive-foreground" },
];

type GroupParam = string;

function isGroupParam(raw: string | undefined): raw is GroupParam {
  return raw === "all" || EXAM_GROUPS.some((g) => g.id === raw);
}

interface Row {
  ref: Cs408ExamRef;
  item: ExamItem | null;
}

export function ExamSetPage() {
  const { group: groupParam } = useParams();
  if (!groupParam) return <Hub />;
  if (!isGroupParam(groupParam)) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <p className="text-sm text-muted-foreground">未知大类</p>
        <Button asChild variant="link" className="px-0">
          <Link to={examSetPath()}>返回题集</Link>
        </Button>
      </div>
    );
  }
  return <SetView group={groupParam} />;
}

function Hub() {
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const load = useKgProgress((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);

  const marked = useMemo(() => {
    const s = new Set<string>();
    for (const x of itemMarks) {
      const m = /^cs408-(\d{4})-q(\d+)$/.exec(x.itemId);
      if (m) s.add(`${m[1]}-${m[2]}`);
    }
    return s;
  }, [itemMarks]);

  const all = examExamsInOrder("all");
  const allDone = all.filter((e) => marked.has(examKey(e.year, e.n))).length;
  const books = examGroupsByBook();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <Link to="/kg/exams" className="text-xs text-muted-foreground hover:underline">
          ← 408 真题
        </Link>
        <h1 className="mt-1 text-xl font-semibold">408 真题题集</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          知识图谱按大类（章）分。2012–2026 共 {all.length} 道。先选大类，或按卷序一把校对；点进题目才出小类标签。
        </p>
      </div>

      <Card className="border-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">按 408 做题本卷序</p>
            <p className="text-xs text-muted-foreground">
              年 → 题号，全部 {all.length} 道 · 已标 {allDone}/{all.length}
            </p>
          </div>
          <Button asChild size="sm">
            <Link to={examSetPath({ group: "all", mode: "proof" })}>快速校对</Link>
          </Button>
        </CardContent>
      </Card>

      {books.map((b) => (
        <section key={b.bookId} className="space-y-2">
          <h2 className="text-sm font-semibold">{b.bookName}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {b.groups.map((g) => {
              const exams = examExamsInOrder(g.id);
              const done = exams.filter((e) => marked.has(examKey(e.year, e.n))).length;
              return (
                <Card key={g.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{g.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{g.blurb}</p>
                    <p className="text-xs text-muted-foreground">
                      {exams.length} 道 · 已标 {done}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 pb-4">
                    <Button asChild size="sm">
                      <Link to={examSetPath({ group: g.id, mode: "proof" })}>快速校对</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={examSetPath({ group: g.id })}>进入题集</Link>
                    </Button>
                    {g.id === "os-mem" && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to={osMemSetPath()}>细分四大类</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function SetView({ group }: { group: GroupParam }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const load = useKgProgress((s) => s.load);
  const markItem = useKgProgress((s) => s.markItem);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const proof = params.get("mode") === "proof";
  const topicParam = params.get("topic");
  const qKey = params.get("q");
  const g = group === "all" ? undefined : examGroup(group);
  const topicFilter: string | undefined =
    topicParam && examTopic(topicParam) && (!g || examTopic(topicParam)?.groupId === g.id)
      ? topicParam
      : undefined;

  const refs = useMemo(
    () => examExamsInOrder(group, topicFilter),
    [group, topicFilter]
  );

  const [papers, setPapers] = useState<Map<number, ExamPaper> | null>(null);
  const [err, setErr] = useState("");
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setPapers(null);
    setErr("");
    loadCs408ExamPapers(examYears())
      .then((list) => {
        if (cancelled) return;
        setPapers(new Map(list.map((p) => [p.year, p])));
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  const rows: Row[] = useMemo(() => {
    return refs.map((ref) => {
      const item = papers?.get(ref.year)?.items.find((it) => it.n === ref.n) ?? null;
      return { ref, item };
    });
  }, [refs, papers]);

  const visible = useMemo(() => {
    if (!onlyUnmarked) return rows;
    return rows.filter((r) => !markMap.has(examItemId(r.ref.year, r.ref.n)));
  }, [rows, onlyUnmarked, markMap]);

  const openKey = qKey && refs.some((r) => examKey(r.year, r.n) === qKey) ? qKey : null;

  useEffect(() => {
    if (!openKey || !papers) return;
    document.getElementById(`q-${openKey}`)?.scrollIntoView({ block: "nearest" });
  }, [openKey, papers]);

  useEffect(() => {
    if (!proof || !papers || qKey) return;
    const first = rows.find((r) => !markMap.has(examItemId(r.ref.year, r.ref.n))) ?? rows[0];
    if (first) setOpen(examKey(first.ref.year, first.ref.n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proof, papers]);

  const setOpen = useCallback(
    (key: string | null) => {
      const next = new URLSearchParams(params);
      if (key) next.set("q", key);
      else next.delete("q");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const onMark = useCallback(
    (row: Row, mark: MarkLevel) => {
      const classified = examClassOf(row.ref.year, row.ref.n);
      const pk = (row.item && primaryKpId(row.item)) || classified?.topic.kpId;
      if (!pk) return;
      markItem({
        itemId: examItemId(row.ref.year, row.ref.n),
        mark,
        primaryKpId: pk,
        secondaryKpIds: row.item ? secondaryKpIds(row.item) : [],
      });
      if (!proof) return;
      const idx = visible.findIndex((r) => r.ref.year === row.ref.year && r.ref.n === row.ref.n);
      const after = visible.slice(idx + 1).find((r) => !markMap.has(examItemId(r.ref.year, r.ref.n)));
      if (after) setOpen(examKey(after.ref.year, after.ref.n));
    },
    [markItem, proof, visible, markMap, setOpen]
  );

  const title = group === "all" ? "全部 · 408 卷序" : (g?.name ?? group);
  const topics: ExamTopic[] = group === "all" ? [] : examTopicsForGroup(group);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => navigate(examSetPath())}
        >
          ← 408 题集
        </button>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {proof ? "快速校对：点开题目出小类，勾对/错即回写图谱。" : "点开题目看小类标签与题干。"}
          {" · "}
          {visible.length}/{rows.length} 题
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(params);
            if (proof) next.delete("mode");
            else next.set("mode", "proof");
            setParams(next);
          }}
          className={cn(
            "rounded-md px-3 py-1 text-xs",
            proof ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          快速校对
        </button>
        <button
          type="button"
          onClick={() => setOnlyUnmarked((v) => !v)}
          className={cn(
            "rounded-md px-3 py-1 text-xs",
            onlyUnmarked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          只看未标
        </button>
        {group === "os-mem" && (
          <Link to={osMemSetPath()} className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:underline">
            细分四大类
          </Link>
        )}
      </div>

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            to={examSetPath({ group, mode: proof ? "proof" : undefined })}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px]",
              !topicFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            全部小类
          </Link>
          {topics.map((t) => (
            <Link
              key={t.id}
              to={examSetPath({ group, topic: t.id, mode: proof ? "proof" : undefined })}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px]",
                topicFilter === t.id
                  ? "bg-violet-600 text-white"
                  : "bg-violet-500/10 text-violet-800 dark:text-violet-200"
              )}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
      {!papers && !err && <p className="text-sm text-muted-foreground">加载原卷…</p>}

      <div className="space-y-2">
        {visible.map((row) => {
          const key = examKey(row.ref.year, row.ref.n);
          const open = openKey === key;
          return (
            <QRow
              key={key}
              row={row}
              open={open}
              proof={proof}
              mark={markMap.get(examItemId(row.ref.year, row.ref.n))}
              onToggle={() => setOpen(open ? null : key)}
              onMark={(m) => onMark(row, m)}
            />
          );
        })}
        {papers && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">当前筛选下无题目。</p>
        )}
      </div>
    </div>
  );
}

function QRow({
  row,
  open,
  proof,
  mark,
  onToggle,
  onMark,
}: {
  row: Row;
  open: boolean;
  proof: boolean;
  mark?: MarkLevel;
  onToggle: () => void;
  onMark: (m: MarkLevel) => void;
}) {
  const { ref, item } = row;
  const classified = examClassOf(ref.year, ref.n);
  const topic = classified?.topic;
  const stem = item?.stem ?? topic?.name ?? "";
  const preview = stem.replace(/\s+/g, " ").slice(0, 72);
  const kindLabel = ref.kind === "big" ? "大题" : "选择";
  const pk = topic?.kpId;
  const viz = pk && vizFor(pk);

  return (
    <Card id={`q-${examKey(ref.year, ref.n)}`} className={cn(open && "ring-1 ring-primary/40")}>
      <button type="button" className="w-full px-4 py-3 text-left" onClick={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">
            {ref.year} {kindLabel}
            {ref.n}
          </span>
          <ExamTags year={ref.year} n={ref.n} showMinor={open} compact link={false} />
          {mark && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] text-white",
                mark === "pass" && "bg-emerald-600",
                mark === "fail" && "bg-destructive",
                mark === "fuzzy" && "bg-amber-500",
                mark === "skip" && "bg-muted-foreground"
              )}
            >
              {mark === "pass" ? "对" : mark === "fail" ? "错" : mark === "fuzzy" ? "模糊" : "跳过"}
            </span>
          )}
        </div>
        {!open && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview}</p>}
      </button>
      {open && (
        <CardContent className="space-y-3 border-t pt-3">
          {topic && (
            <p className="text-xs text-muted-foreground">
              小类「{topic.name}」
              {classified ? ` · 大类 ${classified.group.name}` : ""}
              {pk && viz ? (
                <>
                  {" · "}
                  <Link to={`/viz/${pk}`} className="text-primary hover:underline">
                    图解
                  </Link>
                </>
              ) : null}
            </p>
          )}
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
            {stem}
          </pre>
          {item?.options && (
            <ul className="space-y-1 text-sm">
              {Object.entries(item.options).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="w-5 shrink-0 font-medium text-muted-foreground">{k}.</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          )}
          {item?.answer && (
            <p className="text-sm">
              <span className="font-medium">答案：</span>
              {item.answer}
            </p>
          )}
          <ItemNoteField itemId={examItemId(ref.year, ref.n)} />
          <div className="flex flex-wrap gap-2">
            {MARKS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  m.cls,
                  mark === m.id && "ring-2 ring-offset-2 ring-primary"
                )}
                onClick={() => onMark(m.id)}
              >
                {proof ? m.label : m.id === "pass" ? "会了" : m.id === "fail" ? "不会" : "模糊"}
              </button>
            ))}
            <Button asChild size="sm" variant="ghost">
              <Link to={`/kg/exams/${ref.year}#q${ref.n}`}>原卷</Link>
            </Button>
            {pk && findKp(pk) && (
              <Button asChild size="sm" variant="ghost">
                <Link to={kgKpPath(pk, { subject: "cs408" })}>考点</Link>
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
