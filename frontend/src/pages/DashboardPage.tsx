import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy } from "@/stores/study";
import { useAuth } from "@/stores/auth";
import { useCards } from "@/stores/cards";
import { DAY } from "@/lib/day";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function tipFor(s: {
  due: number;
  newAvailable: number;
  doneToday: number;
  learned: number;
}): string {
  if (s.due > 0 && s.due >= s.newAvailable)
    return `有 ${s.due} 张待复习，建议先清掉再学新词`;
  if (s.newAvailable > 0) return `今日还可学 ${s.newAvailable} 个新词，加油`;
  if (s.due === 0 && s.newAvailable === 0)
    return s.doneToday > 0
      ? "今日目标已完成，休息一下或去读真题吧"
      : "今天没有待办，去真题里捡几个词也可以";
  return `已掌握 ${s.learned} 词，继续保持节奏`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const snapshot = useStudy((s) => s.snapshot);
  const startLearn = useStudy((s) => s.startLearn);
  const startReview = useStudy((s) => s.startReview);
  const cards = useCards((s) => s.cards);
  const user = useAuth((s) => s.user);
  const [aboutOpen, setAboutOpen] = useState(false);

  const s = snapshot();
  const todayGoal = s.due + s.newAvailable;
  const done = s.doneToday;
  const pct = todayGoal > 0 ? Math.min(1, done / todayGoal) : done > 0 ? 1 : 0;
  const pctLabel = Math.round(pct * 100);
  const C = 2 * Math.PI * 52;
  const tip = tipFor(s);

  const forecast = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const buckets = new Array(7).fill(0) as number[];
    for (const idx in cards) {
      const c = cards[+idx];
      if (!c || c.state !== "review") continue;
      const dd = Math.floor((c.due - startOfDay.getTime()) / DAY);
      if (dd >= 0 && dd < 7) buckets[dd]++;
    }
    return buckets;
  }, [cards]);
  const maxF = Math.max(1, ...forecast);
  const hasForecast = forecast.some((n) => n > 0);
  const labels = ["今", "明", "+2", "+3", "+4", "+5", "+6"];
  const tot = s.total || 1;

  function onStart() {
    startLearn();
    navigate("/study");
  }
  function onReview() {
    startReview();
    navigate("/study");
  }

  const stats: {
    label: string;
    value: number;
    icon: string;
    tone: "muted" | "new" | "due" | "ok";
  }[] = [
    { label: "今日完成", value: done, icon: "✓", tone: "muted" },
    { label: "新词待背", value: s.newAvailable, icon: "✨", tone: "new" },
    { label: "待复习", value: s.due, icon: "🔁", tone: "due" },
    { label: "已学", value: s.learned, icon: "📚", tone: "ok" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {stats.map((x) => (
          <Card
            key={x.label}
            className={cn(
              "rounded-xl border-transparent shadow-sm",
              x.tone === "due" &&
                x.value > 0 &&
                "bg-destructive/10 ring-1 ring-destructive/30",
              x.tone === "new" &&
                x.value > 0 &&
                "bg-amber-500/10 ring-1 ring-amber-500/30",
              x.tone === "muted" && "bg-muted/40",
              x.tone === "ok" && "bg-card"
            )}
          >
            <CardContent className="p-3.5 flex items-center gap-2.5">
              <div
                className={cn(
                  "text-xl shrink-0",
                  x.tone === "muted" && "opacity-50",
                  x.tone === "due" && x.value > 0 && "text-destructive",
                  x.tone === "new" && x.value > 0 && "text-amber-600 dark:text-amber-400"
                )}
              >
                {x.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground leading-tight">
                  {x.label}
                </div>
                <div
                  className={cn(
                    "font-bold tnum leading-tight tracking-tight",
                    x.tone === "muted" && "text-xl text-muted-foreground",
                    x.tone === "due" &&
                      x.value > 0 &&
                      "text-3xl text-destructive",
                    x.tone === "new" &&
                      x.value > 0 &&
                      "text-3xl text-amber-600 dark:text-amber-400",
                    (x.tone === "ok" ||
                      (x.tone === "due" && x.value === 0) ||
                      (x.tone === "new" && x.value === 0)) &&
                      "text-2xl"
                  )}
                >
                  {x.value}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_240px] gap-4 items-start">
        <div className="space-y-4">
          <Card className="rounded-xl bg-card shadow-md border-border/60">
            <CardContent className="p-5 md:p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs text-muted-foreground">欢迎回来</div>
                  <div className="text-xl font-semibold truncate">
                    {user?.username || "背词人"}
                  </div>
                  <div className="text-sm text-muted-foreground leading-snug">
                    {tip}
                  </div>
                  {done > 0 && (
                    <div className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                      <span aria-hidden>🔥</span>
                      今日已完成 {done} 词
                      {pctLabel >= 100 ? " · 目标达成！" : ` · ${pctLabel}%`}
                    </div>
                  )}
                </div>
                <div className="relative w-28 h-28 shrink-0">
                  <svg
                    className="w-full h-full -rotate-90"
                    viewBox="0 0 120 120"
                    aria-hidden
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="hsl(var(--muted))"
                      strokeWidth="10"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke={
                        pct >= 1
                          ? "hsl(142 70% 45%)"
                          : "hsl(var(--primary))"
                      }
                      strokeWidth="10"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - pct)}
                      strokeLinecap="round"
                      className="transition-[stroke-dashoffset] duration-500 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-2xl font-bold tnum leading-none">
                      {pctLabel}%
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 tnum">
                      {done}/{todayGoal || "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      今日目标
                    </div>
                  </div>
                </div>
              </div>

              {todayGoal > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>今日学习计划</span>
                    <span className="tnum">
                      {done} / {todayGoal}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        pct >= 1 ? "bg-emerald-500" : "bg-primary"
                      )}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <Button
                  className={cn(
                    "w-full h-14 text-base rounded-2xl font-semibold shadow-md shadow-primary/25",
                    "hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all",
                    s.newAvailable === 0 && "opacity-90"
                  )}
                  onClick={onStart}
                >
                  {s.newAvailable === 0
                    ? "今日新词已学完 🎉"
                    : `学习新词 · ${s.newAvailable} 个待学`}
                </Button>
                <Button
                  variant="secondary"
                  className={cn(
                    "w-full h-12 text-base rounded-xl",
                    s.due > 0 &&
                      "bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/20"
                  )}
                  onClick={onReview}
                  disabled={s.due === 0}
                >
                  {s.due === 0
                    ? "暂无待复习"
                    : `🔁 复习 · ${s.due} 张到期`}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => navigate("/papers")}
                >
                  📚 真题 · 读原文
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-base">
                未来 7 天复习量预测{" "}
                <span className="text-muted-foreground font-normal text-sm">
                  · 基于遗忘曲线
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {!hasForecast ? (
                <div className="h-32 flex flex-col items-center justify-center gap-2 text-center rounded-xl bg-muted/40 border border-dashed border-border">
                  <div className="text-3xl opacity-60" aria-hidden>
                    📈
                  </div>
                  <p className="text-sm text-muted-foreground max-w-[16rem]">
                    开始学习后这里会显示你的复习预测～
                  </p>
                </div>
              ) : (
                <div className="flex items-end gap-2 h-36">
                  {forecast.map((n, i) => {
                    const isToday = i === 0;
                    const heavy = n > 0 && n === maxF;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                      >
                        <div
                          className={cn(
                            "text-xs tnum",
                            isToday
                              ? "text-primary font-semibold"
                              : "text-muted-foreground"
                          )}
                        >
                          {n}
                        </div>
                        <div
                          className={cn(
                            "w-full rounded-t-md transition-all",
                            isToday && "bg-primary",
                            !isToday && heavy && "bg-primary/55",
                            !isToday && !heavy && "bg-primary/35"
                          )}
                          style={{
                            height: `${(n / maxF) * 78}%`,
                            minHeight: n ? 6 : 0,
                          }}
                        />
                        <div
                          className={cn(
                            "text-xs",
                            isToday
                              ? "text-primary font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {labels[i]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-base">词库掌握进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-5 pb-5">
              <div className="h-3 rounded-full overflow-hidden flex bg-muted">
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(s.learned / tot) * 100}%` }}
                />
                <div
                  className="bg-amber-400 transition-all duration-500"
                  style={{ width: `${(s.learn / tot) * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  已掌握{" "}
                  <b className="text-foreground tnum">{s.learned}</b>
                </span>
                <span>
                  学习中 <b className="text-foreground tnum">{s.learn}</b>
                </span>
                <span>
                  未学 <b className="text-foreground tnum">{s.unseen}</b>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 md:sticky md:top-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                快捷操作
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 space-y-0.5">
              {[
                { label: "真题", desc: "读原文练词", icon: "📚", to: "/papers" },
                {
                  label: "真题记词",
                  desc: "按篇背词",
                  icon: "📖",
                  to: "/papers-recite",
                },
                {
                  label: "翻译管理",
                  desc: "例句译文",
                  icon: "🌐",
                  to: "/transmgr",
                },
                { label: "设置", desc: "学习偏好", icon: "⚙", to: "/settings" },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => navigate(a.to)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                    "hover:bg-muted/80 active:scale-[0.99] transition-colors"
                  )}
                >
                  <span className="text-lg w-7 text-center opacity-80">
                    {a.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">
                      {a.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {a.desc}
                    </span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setAboutOpen((v) => !v)}
            >
              <span className="text-sm font-medium text-muted-foreground">
                关于
              </span>
              <span className="text-xs text-muted-foreground">
                {aboutOpen ? "收起" : "更多"}
              </span>
            </button>
            {aboutOpen && (
              <CardContent className="text-sm text-muted-foreground pt-0 px-4 pb-4">
                进度本地优先保存；登录后可跨设备同步。词库来源：2027
                考研英语红宝书（乱序版）。
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
