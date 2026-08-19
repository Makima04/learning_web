import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BookMarked,
  CalendarRange,
  Check,
  ClipboardList,
  Download,
  NotebookPen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dayKey } from "@/lib/day";
import {
  isKgJournalEntry,
  planDueEntries,
  weekKeyOf,
  weekRangeLabel,
  computeWeekStats,
  type JournalKind,
} from "@/lib/journal";
import { DEFAULT_KG_CHAPTER_DAILY_REVIEW, planKgChapterDue } from "@/lib/kg/journalBridge";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { useJournal } from "@/stores/journal";
import { useSettings } from "@/stores/settings";
import { categoryMap, ChapterReviewCard, EntryCard, KIND_LABEL } from "@/pages/journalCards";

const JOURNAL_TABS = ["today", "create", "history", "week"] as const;
type JournalTab = (typeof JOURNAL_TABS)[number];

function normalizeJournalTab(raw: string | undefined): JournalTab {
  if (raw && (JOURNAL_TABS as readonly string[]).includes(raw)) {
    return raw as JournalTab;
  }
  return "today";
}

export function JournalPage() {
  const loggedIn = useAuth((s) => s.loggedIn);
  const categories = useJournal((s) => s.categories);
  const entries = useJournal((s) => s.entries);
  const logs = useJournal((s) => s.logs);
  const weeklies = useJournal((s) => s.weeklies);
  const addCategory = useJournal((s) => s.addCategory);
  const addEntry = useJournal((s) => s.addEntry);
  const reviewEntry = useJournal((s) => s.reviewEntry);
  const archiveEntry = useJournal((s) => s.archiveEntry);
  const deleteEntry = useJournal((s) => s.deleteEntry);
  const saveWeeklyNote = useJournal((s) => s.saveWeeklyNote);
  const exportSnapshot = useJournal((s) => s.exportSnapshot);

  const journalDailyReviewLimits = useSettings((s) => s.journalDailyReviewLimits);
  const journalKgChapterDailyLimit = useSettings((s) => s.journalKgChapterDailyLimit);
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const duePlan = useMemo(
    () => planDueEntries(entries, journalDailyReviewLimits),
    [entries, journalDailyReviewLimits]
  );
  const kgPlan = useMemo(
    () => planKgChapterDue(entries, journalKgChapterDailyLimit),
    [entries, journalKgChapterDailyLimit]
  );
  const due = duePlan.due;
  const deferredCount = duePlan.deferred.length;
  const kgDue = kgPlan.due;
  const kgDeferredCount = kgPlan.deferred.length;
  const kgChapterLimit = journalKgChapterDailyLimit ?? DEFAULT_KG_CHAPTER_DAILY_REVIEW;
  const hasTodayWork = due.length > 0 || kgDue.length > 0;
  const hasDeferred = deferredCount > 0 || kgDeferredCount > 0;
  const weekKey = weekKeyOf();
  const weeklyStats = useMemo(
    () => computeWeekStats(entries, logs, weekKey),
    [entries, logs, weekKey]
  );
  const weeklySummary = useMemo(
    () => weeklies.find((w) => w.weekKey === weekKey) || null,
    [weeklies, weekKey]
  );

  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const tab = normalizeJournalTab(tabParam);
  const setTab = (next: string) => {
    const t = normalizeJournalTab(next);
    navigate(t === "today" ? "/journal" : `/journal/${t}`);
  };
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<JournalKind>("learn");
  const [formMsg, setFormMsg] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [historySource, setHistorySource] = useState<"all" | "manual" | "kg">("all");
  const [historyStatus, setHistoryStatus] = useState<"active" | "all" | "archived">("active");
  const [weekNote, setWeekNote] = useState(weeklySummary?.note || "");

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  useEffect(() => {
    if (tab === "week") setWeekNote(weeklySummary?.note || "");
  }, [tab, weeklySummary?.note, weekKey]);

  const historyList = useMemo(() => {
    let list = [...entries];
    if (historyFilter !== "all") {
      list = list.filter((e) => e.categoryId === historyFilter);
    }
    if (historySource === "kg") list = list.filter(isKgJournalEntry);
    if (historySource === "manual") list = list.filter((e) => !isKgJournalEntry(e));
    if (historyStatus === "active") list = list.filter((e) => e.status === "active");
    if (historyStatus === "archived") list = list.filter((e) => e.status === "archived");
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, historyFilter, historySource, historyStatus]);

  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormMsg("");
    const created = addEntry({ categoryId, title, body, kind });
    if (!created) {
      setFormMsg("请填写标题，并选择有效分类");
      return;
    }
    setTitle("");
    setBody("");
    setKind("learn");
    setFormMsg(`已创建「${created.title}」，将于 ${created.nextReviewOn} 提醒复盘。可在「历史」中查看。`);
  }

  function handleAddCategory() {
    const cat = addCategory(newCatName);
    if (!cat) return;
    setNewCatName("");
    setCategoryId(cat.id);
  }

  function confirmDelete(id: string, titleText: string) {
    if (window.confirm(`确定删除「${titleText}」？此操作不可撤销。`)) {
      deleteEntry(id);
    }
  }

  function exportJournalOnly() {
    const journal = exportSnapshot();
    const blob = {
      journal,
      exportedAt: new Date().toISOString(),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" })
    );
    a.download = `journal_${dayKey()}_${Date.now()}.json`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">学习日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateLabel} · 记录每日所学，按 1 / 3 / 7 / 14 天复盘
            {loggedIn
              ? " · 已登录，数据同步到账号"
              : " · 未登录仅保存在本机，登录后写入服务端"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportJournalOnly}>
            <Download className="h-4 w-4" />
            导出
          </Button>
          <div className="flex flex-col items-end gap-0.5 rounded-lg border bg-card px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span>
                今日待复盘{" "}
                <strong className="text-foreground">
                  图谱 {kgDue.length} 章 · 手写 {due.length} 张
                </strong>
              </span>
            </div>
            {hasDeferred && (
              <span className="text-xs text-muted-foreground">
                另有
                {kgDeferredCount > 0 ? `图谱 ${kgDeferredCount} 章` : ""}
                {kgDeferredCount > 0 && deferredCount > 0 ? "、" : ""}
                {deferredCount > 0 ? `手写 ${deferredCount} 张` : ""}
                顺延
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="today" className="gap-1.5">
            <BookMarked className="h-3.5 w-3.5" />
            今日复盘
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1.5">
            <NotebookPen className="h-3.5 w-3.5" />
            记一笔
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            历史
          </TabsTrigger>
          <TabsTrigger value="week" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            周报
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-6">
          {!hasTodayWork ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Check className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="font-medium">
                    {hasDeferred ? "今日复盘额度已排满" : "今日没有到期复盘"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasDeferred
                      ? `另有${kgDeferredCount > 0 ? `图谱 ${kgDeferredCount} 章` : ""}${
                          kgDeferredCount > 0 && deferredCount > 0 ? "、" : ""
                        }${deferredCount > 0 ? `手写 ${deferredCount} 张` : ""}已顺延；可在设置里分别调整上限`
                      : "去「记一笔」写下今天学的内容，或在知识图谱标记已学，明天会提醒你"}
                  </p>
                </div>
                {hasDeferred ? (
                  <Button variant="outline" onClick={() => navigate("/settings")}>
                    调整每日上限
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setTab("create")}>
                    <Plus className="h-4 w-4" />
                    记一笔
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {(kgDue.length > 0 || kgDeferredCount > 0) && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <h2 className="text-sm font-medium">知识图谱</h2>
                    <p className="text-xs text-muted-foreground">
                      今日 {kgDue.length}/{kgChapterLimit} 章
                      {kgDeferredCount > 0 ? ` · 另有 ${kgDeferredCount} 章顺延` : ""}
                    </p>
                  </div>
                  {kgDue.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      章节额度已满，顺延的章次日继续排队。
                    </p>
                  ) : (
                    kgDue.map((chapter) => (
                      <ChapterReviewCard
                        key={chapter.moduleId}
                        chapter={chapter}
                        onOpen={() =>
                          navigate(`/journal/chapter/${encodeURIComponent(chapter.moduleId)}`)
                        }
                      />
                    ))
                  )}
                </section>
              )}

              {(due.length > 0 || deferredCount > 0) && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <h2 className="text-sm font-medium">我记的</h2>
                    {deferredCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        按分类上限截取；另有 {deferredCount} 张顺延
                      </p>
                    )}
                  </div>
                  {due.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      手写额度已满，超出的卡片次日继续排队。
                    </p>
                  ) : (
                    due.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        cat={cats.get(entry.categoryId)}
                        showReview
                        onReview={(result) => reviewEntry(entry.id, result)}
                        onArchive={() => archiveEntry(entry.id)}
                        onDelete={() => confirmDelete(entry.id, entry.title)}
                      />
                    ))
                  )}
                </section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="create" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">新建学习卡片</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreate}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">分类</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          categoryId === c.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Input
                      placeholder="新分类名称，如 专业课"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button type="button" variant="outline" onClick={handleAddCategory}>
                      添加分类
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">类型</label>
                  <div className="flex gap-2">
                    {(["learn", "mistake"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm",
                          kind === k
                            ? k === "mistake"
                              ? "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200"
                              : "border-primary bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        {KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="journal-title">
                    标题（考点 / 题型）
                  </label>
                  <Input
                    id="journal-title"
                    placeholder="例如：一元积分 · 中值定理"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="journal-body">
                    详细说明
                  </label>
                  <textarea
                    id="journal-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="要点、错因、正确路径、下次怎么防……"
                    rows={5}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>

                {formMsg && (
                  <p className="text-sm text-muted-foreground">{formMsg}</p>
                )}

                <Button type="submit" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  保存（明日提醒）
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={historySource}
              onChange={(e) =>
                setHistorySource(e.target.value as "all" | "manual" | "kg")
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">全部来源</option>
              <option value="manual">我记的</option>
              <option value="kg">知识图谱</option>
            </select>
            <select
              value={historyStatus}
              onChange={(e) =>
                setHistoryStatus(e.target.value as "active" | "all" | "archived")
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="active">进行中</option>
              <option value="archived">已归档</option>
              <option value="all">全部状态</option>
            </select>
          </div>

          {historyList.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                还没有卡片
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historyList.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  cat={cats.get(entry.categoryId)}
                  showReview={
                    entry.status === "active" &&
                    entry.nextReviewOn <= dayKey() &&
                    !isKgJournalEntry(entry)
                  }
                  onReview={(result) => reviewEntry(entry.id, result)}
                  onArchive={() => archiveEntry(entry.id)}
                  onDelete={() => confirmDelete(entry.id, entry.title)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="week" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                本周 · {weekRangeLabel(weekKey)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-semibold">{weeklyStats.created}</div>
                  <div className="text-xs text-muted-foreground">新建</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-semibold">{weeklyStats.reviewed}</div>
                  <div className="text-xs text-muted-foreground">复盘次数</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-semibold text-rose-600 dark:text-rose-400">
                    {weeklyStats.failed}
                  </div>
                  <div className="text-xs text-muted-foreground">回退/忘了</div>
                </div>
              </div>

              {categories.some((c) => weeklyStats.byCategory[c.id]) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">按分类新建</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const n = weeklyStats.byCategory[c.id] || 0;
                      if (!n) return null;
                      return (
                        <span
                          key={c.id}
                          className="rounded-full border px-2.5 py-1 text-xs"
                        >
                          {c.name} {n}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {weeklyStats.topFailTitles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">本周易忘</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {weeklyStats.topFailTitles.map((row) => (
                      <li key={row.title}>
                        {row.title}
                        <span className="ml-2 text-rose-600 dark:text-rose-400">
                          ×{row.fails}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="week-note">
                  本周反思（收获 / 漏洞 / 下周重点）
                </label>
                <textarea
                  id="week-note"
                  rows={4}
                  value={weekNote}
                  onChange={(e) => setWeekNote(e.target.value)}
                  placeholder="例如：积分计算变顺了；408 进程同步仍混；下周只抓调度算法。"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button
                  type="button"
                  onClick={() => {
                    saveWeeklyNote(weekNote, weekKey);
                  }}
                >
                  保存周报
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
