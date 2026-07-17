import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  BookMarked,
  CalendarRange,
  Check,
  ClipboardList,
  Download,
  HelpCircle,
  NotebookPen,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dayKey } from "@/lib/day";
import {
  sortDueEntries,
  weekKeyOf,
  weekRangeLabel,
  computeWeekStats,
  type JournalEntry,
  type JournalKind,
  type ReviewResult,
} from "@/lib/journal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useJournal } from "@/stores/journal";

const KIND_LABEL: Record<JournalKind, string> = {
  learn: "学习",
  mistake: "错题",
};

function categoryMap(
  categories: { id: string; name: string; color: string }[]
): Map<string, { name: string; color: string }> {
  return new Map(categories.map((c) => [c.id, { name: c.name, color: c.color }]));
}

function EntryMeta({
  entry,
  cat,
}: {
  entry: JournalEntry;
  cat?: { name: string; color: string };
}) {
  const today = dayKey();
  const overdue = entry.status === "active" && entry.nextReviewOn < today;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {cat && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-foreground"
          style={{ backgroundColor: `${cat.color}22` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
          {cat.name}
        </span>
      )}
      <span
        className={cn(
          "rounded-full px-2 py-0.5",
          entry.kind === "mistake"
            ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
            : "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300"
        )}
      >
        {KIND_LABEL[entry.kind]}
      </span>
      {entry.status === "archived" ? (
        <span className="rounded-full bg-muted px-2 py-0.5">已归档</span>
      ) : (
        <>
          <span>间隔 {entry.step} 天</span>
          <span className={overdue ? "font-medium text-rose-600 dark:text-rose-400" : undefined}>
            {overdue ? `逾期 · 应复 ${entry.nextReviewOn}` : `下次 ${entry.nextReviewOn}`}
          </span>
        </>
      )}
    </div>
  );
}

function ReviewActions({
  onReview,
}: {
  onReview: (result: ReviewResult) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="default" onClick={() => onReview("pass")}>
        <Check className="h-4 w-4" />
        记得
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onReview("hard")}>
        <HelpCircle className="h-4 w-4" />
        模糊
      </Button>
      <Button size="sm" variant="destructive" onClick={() => onReview("fail")}>
        <X className="h-4 w-4" />
        忘了
      </Button>
    </div>
  );
}

function EntryCard({
  entry,
  cat,
  showReview,
  onReview,
  onArchive,
  onDelete,
}: {
  entry: JournalEntry;
  cat?: { name: string; color: string };
  showReview?: boolean;
  onReview?: (result: ReviewResult) => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-base leading-snug">{entry.title}</CardTitle>
            <EntryMeta entry={entry} cat={cat} />
          </div>
          <div className="flex shrink-0 gap-1">
            {onArchive && entry.status === "active" && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="归档"
                className="h-8 w-8 text-muted-foreground"
                onClick={onArchive}
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="删除"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entry.body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {entry.body}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">暂无详细说明</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>创建 {entry.createdOn}</span>
          {entry.lastReviewedOn && <span>上次复盘 {entry.lastReviewedOn}</span>}
          {entry.lapses > 0 && <span>回退 {entry.lapses} 次</span>}
        </div>
        {showReview && onReview && <ReviewActions onReview={onReview} />}
      </CardContent>
    </Card>
  );
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

  const cats = useMemo(() => categoryMap(categories), [categories]);
  const due = useMemo(() => sortDueEntries(entries), [entries]);
  const weekKey = weekKeyOf();
  const weeklyStats = useMemo(
    () => computeWeekStats(entries, logs, weekKey),
    [entries, logs, weekKey]
  );
  const weeklySummary = useMemo(
    () => weeklies.find((w) => w.weekKey === weekKey) || null,
    [weeklies, weekKey]
  );

  const [tab, setTab] = useState("today");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<JournalKind>("learn");
  const [formMsg, setFormMsg] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [historyFilter, setHistoryFilter] = useState<string>("all");
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
    if (historyStatus === "active") list = list.filter((e) => e.status === "active");
    if (historyStatus === "archived") list = list.filter((e) => e.status === "archived");
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, historyFilter, historyStatus]);

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
    setFormMsg(`已创建，将于 ${created.nextReviewOn} 提醒复盘`);
    setTab("today");
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
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span>
              今日待复盘 <strong className="text-foreground">{due.length}</strong>
            </span>
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

        <TabsContent value="today" className="mt-4 space-y-3">
          {due.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Check className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="font-medium">今日没有到期复盘</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    去「记一笔」写下今天学的内容，明天会提醒你
                  </p>
                </div>
                <Button variant="outline" onClick={() => setTab("create")}>
                  <Plus className="h-4 w-4" />
                  记一笔
                </Button>
              </CardContent>
            </Card>
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
                    entry.status === "active" && entry.nextReviewOn <= dayKey()
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
