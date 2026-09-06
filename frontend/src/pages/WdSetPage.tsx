// 王道 408 题集：图谱大类 → 选择 / 大题分开；点开题目才出小类。做题本顺序校对。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { findKp } from "@/data/kg";
import {
  WD_GROUPS,
  wdClassOf,
  wdCompare,
  wdCounts,
  wdGroup,
  wdGroupsByBook,
  wdItemsInOrder,
  wdKindLabel,
  wdSetPath,
  wdTopicsFor,
  type WdClass,
} from "@/data/kg/wdTaxonomy";
import { osMemSetPath } from "@/data/kg/osMemTopics";
import { kgKpPath } from "@/lib/kg/paths";
import { useHydratedItems } from "@/lib/kg/catalogLoad";
import {
  useWangdao408,
  type WangdaoItem,
  type WangdaoKind,
} from "@/lib/kg/wangdao408";
import { applyWangdaoPractice } from "@/lib/kg/wangdaoPractice";
import type { MarkLevel } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ItemNoteField } from "@/pages/itemNoteField";
import { WdTags } from "@/pages/wdTags";
import { WangdaoAnalysis, WangdaoStem } from "@/pages/wangdaoQuestion";
import { vizFor } from "@/viz/registry";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "pass", label: "对", cls: "bg-emerald-600 text-white" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "fail", label: "错", cls: "bg-destructive text-destructive-foreground" },
];

function isKind(raw: string | null): raw is WangdaoKind {
  return raw === "mcq" || raw === "big";
}

export function WdSetPage() {
  const { group: groupParam } = useParams();
  if (!groupParam) return <Hub />;
  if (groupParam !== "all" && !WD_GROUPS.some((g) => g.id === groupParam)) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <p className="text-sm text-muted-foreground">未知大类</p>
        <Button asChild variant="link" className="px-0">
          <Link to={wdSetPath()}>返回王道题集</Link>
        </Button>
      </div>
    );
  }
  return <SetView group={groupParam} />;
}

function Hub() {
  const { items, error } = useWangdao408();
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const load = useKgProgress((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);

  const marked = useMemo(() => {
    const s = new Set<string>();
    for (const x of itemMarks) s.add(x.itemId);
    return s;
  }, [itemMarks]);

  const catalog = items ?? [];
  const all = useMemo(() => [...catalog].sort(wdCompare), [catalog]);
  const allMcq = all.filter((q) => q.kind !== "big");
  const allBig = all.filter((q) => q.kind === "big");
  const books = wdGroupsByBook();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <Link to="/kg/cs408" className="text-xs text-muted-foreground hover:underline">
          ← 知识图谱
        </Link>
        <h1 className="mt-1 text-xl font-semibold">王道 408 题集</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按图谱大类分。选择题与大题分开刷；点开题目才出小类。含夹带真题（红标年份）。做题本页序校对。
        </p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        {!items && !error && <p className="mt-1 text-sm text-muted-foreground">加载王道目录…</p>}
      </div>

      <Card className="border-primary/30">
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">按王道做题本顺序</p>
            <p className="text-xs text-muted-foreground">
              选择 {allMcq.length} · 大题 {allBig.length}
              {all.length > 0 ? ` · 真题 ${all.filter((q) => q.year).length}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={wdSetPath({ group: "all", kind: "mcq", mode: "proof" })}>
                选择题校对
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to={wdSetPath({ group: "all", kind: "big", mode: "proof" })}>
                大题校对
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {books.map((b) => (
        <section key={b.bookId} className="space-y-2">
          <h2 className="text-sm font-semibold">{b.bookName}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {b.groups.map((g) => {
              const c = wdCounts(catalog, g.id);
              const done = wdItemsInOrder(catalog, { group: g.id }).filter((q) =>
                marked.has(q.id)
              ).length;
              return (
                <Card key={g.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{g.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{g.blurb}</p>
                    <p className="text-xs text-muted-foreground">
                      选择 {c.mcq} · 大题 {c.big}
                      {c.exam > 0 ? ` · 真题 ${c.exam}` : ""}
                      {catalog.length > 0 ? ` · 已标 ${done}` : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 pb-4">
                    <Button asChild size="sm" disabled={c.mcq === 0}>
                      <Link to={wdSetPath({ group: g.id, kind: "mcq", mode: "proof" })}>
                        选择校对
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="secondary" disabled={c.big === 0}>
                      <Link to={wdSetPath({ group: g.id, kind: "big", mode: "proof" })}>
                        大题校对
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={wdSetPath({ group: g.id, kind: "mcq" })}>题集</Link>
                    </Button>
                    {g.id === "os-mem" && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to={osMemSetPath()}>内存细分</Link>
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

function SetView({ group }: { group: string }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { items: slim, error } = useWangdao408();
  const needed = useMemo(() => {
    if (!slim) return null;
    if (group === "all") return slim;
    return slim.filter((q) => wdClassOf(q).group.id === group);
  }, [slim, group]);
  const items = useHydratedItems(needed);
  const load = useKgProgress((s) => s.load);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const proof = params.get("mode") === "proof";
  const rawKind = params.get("kind");
  const kind: WangdaoKind = isKind(rawKind) ? rawKind : "mcq";
  const topicParam = params.get("topic");
  const qKey = params.get("q");
  const examOnly = params.get("exam") === "1";
  const g = group === "all" ? undefined : wdGroup(group);
  const catalog = items ?? [];

  const topics = useMemo(
    () => (group === "all" ? [] : wdTopicsFor(catalog, group, kind)),
    [catalog, group, kind]
  );
  const topicFilter =
    topicParam && topics.some((t) => t.id === topicParam) ? topicParam : undefined;

  useEffect(() => {
    load();
  }, [load]);

  const refs = useMemo(
    () =>
      wdItemsInOrder(catalog, {
        group,
        kind,
        topic: topicFilter,
        examOnly,
      }),
    [catalog, group, kind, topicFilter, examOnly]
  );

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const visible = useMemo(() => {
    if (!onlyUnmarked) return refs;
    return refs.filter((q) => !markMap.has(q.id));
  }, [refs, onlyUnmarked, markMap]);

  const openKey = qKey && refs.some((r) => r.id === qKey) ? qKey : null;

  useEffect(() => {
    if (!openKey || !items) return;
    document.getElementById(`q-${openKey}`)?.scrollIntoView({ block: "nearest" });
  }, [openKey, items]);

  const setOpen = useCallback(
    (key: string | null) => {
      const next = new URLSearchParams(params);
      if (key) next.set("q", key);
      else next.delete("q");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  useEffect(() => {
    if (!proof || !items || qKey) return;
    const first = refs.find((r) => !markMap.has(r.id)) ?? refs[0];
    if (first) setOpen(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proof, items, kind, group]);

  const onMark = useCallback(
    (item: WangdaoItem, mark: MarkLevel) => {
      const classified = wdClassOf(item);
      applyWangdaoPractice(
        classified.topic.kpId && classified.topic.kpId !== item.kp_ids[0]
          ? { ...item, kp_ids: [classified.topic.kpId, ...item.kp_ids.filter((id) => id !== classified.topic.kpId)] }
          : item,
        mark
      );
      if (!proof) return;
      const idx = visible.findIndex((r) => r.id === item.id);
      const after = visible.slice(idx + 1).find((r) => !markMap.has(r.id));
      if (after) setOpen(after.id);
    },
    [proof, visible, markMap, setOpen]
  );

  const title =
    group === "all"
      ? `全部${wdKindLabel(kind)} · 做题本序`
      : `${g?.name ?? group} · ${wdKindLabel(kind)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => navigate(wdSetPath())}
        >
          ← 王道题集
        </button>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {proof ? "快速校对：点开出小类，勾对/错回写图谱与错题集。" : "点开题目看小类标签与题干。"}
          {" · "}
          {visible.length}/{refs.length} 题
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["mcq", "big"] as const).map((k) => (
          <Link
            key={k}
            to={wdSetPath({
              group,
              kind: k,
              mode: proof ? "proof" : undefined,
              examOnly: examOnly || undefined,
            })}
            className={cn(
              "rounded-md px-3 py-1 text-xs",
              kind === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {wdKindLabel(k)}
          </Link>
        ))}
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
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(params);
            if (examOnly) next.delete("exam");
            else next.set("exam", "1");
            setParams(next);
          }}
          className={cn(
            "rounded-md px-3 py-1 text-xs",
            examOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          只看真题
        </button>
      </div>

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            to={wdSetPath({ group, kind, mode: proof ? "proof" : undefined, examOnly: examOnly || undefined })}
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
              to={wdSetPath({
                group,
                kind,
                topic: t.id,
                mode: proof ? "proof" : undefined,
                examOnly: examOnly || undefined,
              })}
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

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!items && !error && <p className="text-sm text-muted-foreground">加载王道目录…</p>}

      <div className="space-y-2">
        {visible.map((item) => (
          <QRow
            key={item.id}
            item={item}
            classified={wdClassOf(item)}
            open={openKey === item.id}
            proof={proof}
            mark={markMap.get(item.id)}
            onToggle={() => setOpen(openKey === item.id ? null : item.id)}
            onMark={(m) => onMark(item, m)}
          />
        ))}
        {items && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">当前筛选下无题目。</p>
        )}
      </div>
    </div>
  );
}

function QRow({
  item,
  classified,
  open,
  proof,
  mark,
  onToggle,
  onMark,
}: {
  item: WangdaoItem;
  classified: WdClass;
  open: boolean;
  proof: boolean;
  mark?: MarkLevel;
  onToggle: () => void;
  onMark: (m: MarkLevel) => void;
}) {
  const preview = (item.stem || "").replace(/\s+/g, " ").slice(0, 72);
  const pk = classified.topic.kpId;
  const viz = pk && vizFor(pk);

  return (
    <Card id={`q-${item.id}`} className={cn(open && "ring-1 ring-primary/40")}>
      <button type="button" className="w-full px-4 py-3 text-left" onClick={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">
            {item.book.toUpperCase()} §{item.section} #{item.qno}
          </span>
          <WdTags item={item} showMinor={open} compact link={false} />
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
          <p className="text-xs text-muted-foreground">
            小类「{classified.topic.name}」· 大类 {classified.group.name}
            {item.pdf_page ? ` · 做题本 p.${item.pdf_page}` : ""}
            {viz ? (
              <>
                {" · "}
                <Link to={`/viz/${pk}`} className="text-primary hover:underline">
                  图解
                </Link>
              </>
            ) : null}
          </p>
          <WangdaoStem item={item} />
          <WangdaoAnalysis item={item} />
          <ItemNoteField itemId={item.id} />
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
            {pk && findKp(pk) && (
              <Button asChild size="sm" variant="ghost">
                <Link to={kgKpPath(pk, { subject: "cs408" })}>考点刷题</Link>
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
