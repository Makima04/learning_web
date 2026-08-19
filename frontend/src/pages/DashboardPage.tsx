import { useEffect, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Clock3,
  ListChecks,
  NotebookPen,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TodayWordList } from "@/components/TodayWordList";
import { Card, CardContent } from "@/components/ui/card";
import { DAY, dayKey } from "@/lib/day";
import { planDueEntries } from "@/lib/journal";
import { planKgChapterDue } from "@/lib/kg/journalBridge";
import { resolveTodayWords } from "@/lib/todayWords";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useCards } from "@/stores/cards";
import { useJournal } from "@/stores/journal";
import { useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { useTodayLog } from "@/stores/todayLog";

function tipFor(snapshot: {
  reviewAvailable: number;
  newAvailable: number;
  doneToday: number;
  canReview: boolean;
  canLearn: boolean;
  newGoal: number;
  reviewGoal: number;
}): string {
  if (snapshot.reviewAvailable > 0) {
    return snapshot.newAvailable > 0
      ? "先完成到期复习，再开始今天的新词。"
      : "今日新词计划已完成；优先清掉到期复习吧。";
  }
  if (snapshot.newAvailable > 0) return "复习已经清空，可以专心积累新词了。";
  if (snapshot.canReview) return "今日复习计划已完成，仍有到期词可继续刷。";
  if (snapshot.canLearn) {
    return snapshot.newGoal > 0
      ? `今日新词计划（${snapshot.newGoal} 个）已完成，还可以继续多学。`
      : "还可以继续学新词。";
  }
  return snapshot.doneToday > 0
    ? "今天的任务已经完成，去读一篇真题巩固一下。"
    : "今天没有待办，去真题里继续积累语感。";
}

function StudyAction({
  icon: Icon,
  title,
  description,
  primary,
  disabled,
  iconClassName,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  primary: boolean;
  disabled?: boolean;
  iconClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex min-h-32 flex-col justify-between rounded-lg p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        primary
          ? "bg-primary text-primary-foreground transition-opacity hover:opacity-95"
          : "border bg-card transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span className={cn("grid h-9 w-9 place-items-center rounded-lg", primary ? "bg-white/15" : iconClassName)}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-lg font-semibold">{title}</span>
        <span className={cn("mt-1 block text-sm", primary ? "text-white/80" : "text-muted-foreground")}>{description}</span>
      </span>
    </button>
  );
}

const TODAY_PREVIEW = 6;

export function DashboardPage() {
  const navigate = useNavigate();
  const snapshot = useStudy((state) => state.snapshot);
  const startLearn = useStudy((state) => state.startLearn);
  const startReview = useStudy((state) => state.startReview);
  const cards = useCards((state) => state.cards);
  const journalEntries = useJournal((state) => state.entries);
  const user = useAuth((state) => state.user);
  const loggedIn = useAuth((state) => state.loggedIn);
  const rate = useSettings((s) => s.rate);
  const journalDailyReviewLimits = useSettings((s) => s.journalDailyReviewLimits);
  const journalKgChapterDailyLimit = useSettings((s) => s.journalKgChapterDailyLimit);
  const todayItems = useTodayLog((s) => s.log.items);
  const todayDayKey = useTodayLog((s) => s.log.dayKey);
  const syncTodayLog = useTodayLog((s) => s.syncFromServer);
  const stats = snapshot();

  // 首页预览：登录后拉服务端今日词表（与 accountSync 互补，打开即新）
  useEffect(() => {
    if (!loggedIn) return;
    void syncTodayLog();
  }, [loggedIn, syncTodayLog]);
  const journalPlan = useMemo(
    () => planDueEntries(journalEntries, journalDailyReviewLimits),
    [journalEntries, journalDailyReviewLimits]
  );
  const kgPlan = useMemo(
    () => planKgChapterDue(journalEntries, journalKgChapterDailyLimit),
    [journalEntries, journalKgChapterDailyLimit]
  );
  const journalDueCount = journalPlan.due.length;
  const journalDeferredCount = journalPlan.deferred.length;
  const kgDueCount = kgPlan.due.length;
  const kgDeferredCount = kgPlan.deferred.length;
  // 用计划内完成量 / 固定今日目标，避免「剩余额度」当分母
  const totalToday = stats.todayPlan;
  const done = stats.planDone;
  const progress = totalToday > 0 ? Math.min(1, done / totalToday) : stats.doneToday > 0 ? 1 : 0;
  const progressLabel = Math.round(progress * 100);
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());

  const todayPreview = useMemo(() => {
    // 跨日时 store 可能仍挂着昨日 items，展示前以 dayKey 过滤
    const today = dayKey();
    const items = todayDayKey === today ? todayItems : [];
    let newCount = 0;
    let reviewCount = 0;
    for (const it of items) {
      if (it.type === "new") newCount++;
      else reviewCount++;
    }
    const sorted = items.slice().sort((a, b) => b.at - a.at || a.wordIdx - b.wordIdx);
    const preview = resolveTodayWords(sorted.slice(0, TODAY_PREVIEW));
    return {
      total: items.length,
      newCount,
      reviewCount,
      preview,
      hasMore: items.length > TODAY_PREVIEW,
    };
  }, [todayItems, todayDayKey]);

  const forecast = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = new Array<number>(7).fill(0);
    for (const key in cards) {
      const card = cards[Number(key)];
      if (!card || card.state !== "review") continue;
      const day = Math.floor((card.due - today.getTime()) / DAY);
      if (day >= 0 && day < buckets.length) buckets[day] += 1;
    }
    return buckets;
  }, [cards]);

  const maxForecast = Math.max(1, ...forecast);
  const labels = ["今天", "明天", "周+2", "周+3", "周+4", "周+5", "周+6"];
  const knownPercent = stats.total ? (stats.mastered / stats.total) * 100 : 0;
  const reviewingPercent = stats.total
    ? ((stats.reviewing - stats.mastered) / stats.total) * 100
    : 0;
  const learningPercent = stats.total ? (stats.learn / stats.total) * 100 : 0;

  function beginLearn() {
    startLearn();
    navigate("/study");
  }

  function beginReview() {
    startReview();
    navigate("/study");
  }

  // 有到期复习优先；计划外也可继续刷
  const reviewIsPriority = stats.canReview && (stats.reviewAvailable > 0 || !stats.canLearn);
  const reviewAction = {
    key: "review",
    icon: Clock3,
    title: "复习旧词",
    description: !stats.canReview
      ? "今天没有到期复习"
      : stats.reviewAvailable > 0
        ? `今日 ${stats.reviewToday}/${stats.reviewGoal} · 还剩 ${stats.reviewAvailable}`
        : `今日 ${stats.reviewToday}/${stats.reviewGoal} 已完成 · 还有 ${stats.due} 个可继续`,
    primary: reviewIsPriority,
    disabled: !stats.canReview,
    iconClassName: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
    onClick: beginReview,
  };
  const learnAction = {
    key: "learn",
    icon: BookOpen,
    title: "学习新词",
    description: !stats.canLearn
      ? "词库新词已学完"
      : stats.newAvailable > 0
        ? `今日 ${stats.newToday}/${stats.newGoal} · 还剩 ${stats.newAvailable}`
        : stats.newGoal > 0
          ? `今日 ${stats.newToday}/${stats.newGoal} 已完成 · 可继续多学`
          : "可继续学习新词",
    primary: !reviewIsPriority,
    disabled: !stats.canLearn,
    iconClassName: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    onClick: beginLearn,
  };
  const studyActions = reviewIsPriority ? [reviewAction, learnAction] : [learnAction, reviewAction];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <section className="mb-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{dateLabel}</p>
          <h1 className="text-2xl font-semibold">{user?.username ? `${user.username}，继续前进` : "今天，继续前进"}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{tipFor(stats)}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.8fr)]">
        <Card className="overflow-hidden border-border/90 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b p-5 md:p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">今日学习计划</p>
                  <p className="mt-2 text-4xl font-semibold tnum">{progressLabel}<span className="ml-1 text-xl text-muted-foreground">%</span></p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tnum">{done} / {totalToday || 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">已完成 / 今日计划</p>
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2 md:p-6">
              {studyActions.map(({ key, ...action }) => <StudyAction key={key} {...action} />)}
              <div className="md:col-span-2">
                <StudyAction
                  icon={NotebookPen}
                  title="学习日志"
                  description={
                    journalDueCount > 0 || kgDueCount > 0
                      ? `今日 图谱 ${kgDueCount} 章 · 手写 ${journalDueCount} 张${
                          journalDeferredCount + kgDeferredCount > 0
                            ? `（另有${kgDeferredCount > 0 ? `图谱 ${kgDeferredCount} 章` : ""}${
                                kgDeferredCount > 0 && journalDeferredCount > 0 ? "、" : ""
                              }${journalDeferredCount > 0 ? `手写 ${journalDeferredCount} 张` : ""}顺延）`
                            : ""
                        }`
                      : journalDeferredCount + kgDeferredCount > 0
                        ? `今日额度已满，另有${kgDeferredCount > 0 ? `图谱 ${kgDeferredCount} 章` : ""}${
                            kgDeferredCount > 0 && journalDeferredCount > 0 ? "、" : ""
                          }${journalDeferredCount > 0 ? `手写 ${journalDeferredCount} 张` : ""}顺延`
                        : "记录今日所学，明日自动提醒复盘"
                  }
                  primary={false}
                  iconClassName="bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300"
                  onClick={() => navigate("/journal")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-none">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">词库掌握</p>
                <p className="mt-1 text-sm text-muted-foreground">6550 词长期积累</p>
              </div>
              <span className="text-2xl font-semibold tnum">{Math.round(knownPercent)}%</span>
            </div>
            <div className="mt-7 flex h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-emerald-500" style={{ width: `${knownPercent}%` }} />
              <div className="h-full bg-sky-500" style={{ width: `${reviewingPercent}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${learningPercent}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <span><b className="block text-base tnum">{stats.mastered}</b><span className="text-xs text-muted-foreground">已掌握</span></span>
              <span><b className="block text-base tnum">{stats.reviewing - stats.mastered}</b><span className="text-xs text-muted-foreground">长期复习</span></span>
              <span><b className="block text-base tnum">{stats.learn}</b><span className="text-xs text-muted-foreground">学习中</span></span>
              <span><b className="block text-base tnum">{stats.unseen}</b><span className="text-xs text-muted-foreground">未开始</span></span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="border-border/90 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-start justify-between gap-4 border-b p-5 md:p-6">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-primary" />
                  今日已学
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {todayPreview.total > 0
                    ? `新学 ${todayPreview.newCount} · 复习 ${todayPreview.reviewCount} · 共 ${todayPreview.total} 词`
                    : "学完后在这里快速扫一眼"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/today")}
                className="shrink-0 text-sm text-primary hover:underline"
              >
                {todayPreview.total > 0 ? "查看全部" : "打开"}
              </button>
            </div>
            {todayPreview.total > 0 ? (
              <>
                <TodayWordList words={todayPreview.preview} rate={rate} compact />
                {todayPreview.hasMore ? (
                  <button
                    type="button"
                    onClick={() => navigate("/today")}
                    className="flex w-full items-center justify-center gap-1 border-t py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-primary"
                  >
                    查看全部 {todayPreview.total} 词
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground md:px-6">
                今天还没有学过词，完成学习后会自动出现在这里
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.8fr)]">
        <Card className="border-border/90 shadow-none">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" />未来 7 天复习量</p>
                <p className="mt-1 text-sm text-muted-foreground">基于目前记忆间隔的预测</p>
              </div>
            </div>
            <div className="mt-7 flex h-40 items-end gap-3">
              {forecast.map((count, index) => (
                <div key={labels[index]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className={cn("text-xs tnum", index === 0 ? "font-semibold text-primary" : "text-muted-foreground")}>{count || ""}</span>
                  <div className="flex h-24 w-full items-end rounded-sm bg-muted/70">
                    <div className={cn("w-full rounded-sm", index === 0 ? "bg-primary" : "bg-foreground/25")} style={{ height: count ? `${Math.max(10, (count / maxForecast) * 100)}%` : "0%" }} />
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">{labels[index]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-none">
          <CardContent className="p-5 md:p-6">
            <p className="text-sm font-semibold">学习资源</p>
            <div className="mt-3 divide-y">
              <button type="button" onClick={() => navigate("/papers")} className="flex w-full items-center justify-between py-3 text-left text-sm hover:text-primary"><span>真题阅读</span><ArrowUpRight className="h-4 w-4" /></button>
              <button type="button" onClick={() => navigate("/papers-recite")} className="flex w-full items-center justify-between py-3 text-left text-sm hover:text-primary"><span>按篇记词</span><ArrowUpRight className="h-4 w-4" /></button>
              <button type="button" onClick={() => navigate("/settings")} className="flex w-full items-center justify-between py-3 text-left text-sm hover:text-primary"><span>调整学习计划</span><ArrowUpRight className="h-4 w-4" /></button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
