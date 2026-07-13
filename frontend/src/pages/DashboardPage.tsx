import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Clock3,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { DAY } from "@/lib/day";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useCards } from "@/stores/cards";
import { useStudy } from "@/stores/study";

function tipFor(snapshot: { reviewAvailable: number; newAvailable: number; doneToday: number }): string {
  if (snapshot.reviewAvailable > 0) return "先完成到期复习，再开始今天的新词。";
  if (snapshot.newAvailable > 0) return "复习已经清空，可以专心积累新词了。";
  return snapshot.doneToday > 0 ? "今天的任务已经完成，去读一篇真题巩固一下。" : "今天没有待办，去真题里继续积累语感。";
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

export function DashboardPage() {
  const navigate = useNavigate();
  const snapshot = useStudy((state) => state.snapshot);
  const startLearn = useStudy((state) => state.startLearn);
  const startReview = useStudy((state) => state.startReview);
  const cards = useCards((state) => state.cards);
  const user = useAuth((state) => state.user);
  const stats = snapshot();
  const totalToday = stats.todayPlan;
  const done = stats.doneToday;
  const progress = totalToday > 0 ? Math.min(1, done / totalToday) : done > 0 ? 1 : 0;
  const progressLabel = Math.round(progress * 100);
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());

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

  const reviewIsPriority = stats.reviewAvailable > 0;
  const reviewAction = {
    key: "review",
    icon: Clock3,
    title: "复习旧词",
    description: reviewIsPriority ? `今天需复习 ${stats.reviewAvailable} 个` : "今天的复习已经完成",
    primary: reviewIsPriority,
    disabled: !reviewIsPriority,
    iconClassName: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
    onClick: beginReview,
  };
  const learnAction = {
    key: "learn",
    icon: BookOpen,
    title: "学习新词",
    description: stats.newAvailable > 0 ? `还有 ${stats.newAvailable} 个待学习` : "今天的新词已经完成",
    primary: !reviewIsPriority,
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
