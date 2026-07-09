import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStudy } from "@/stores/study";
import { useAuth } from "@/stores/auth";
import { useCards } from "@/stores/cards";
import { DAY } from "@/lib/day";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardPage() {
  const navigate = useNavigate();
  const snapshot = useStudy((s) => s.snapshot);
  const startLearn = useStudy((s) => s.startLearn);
  const startReview = useStudy((s) => s.startReview);
  const cards = useCards((s) => s.cards);
  const user = useAuth((s) => s.user);

  const s = snapshot();
  const todayGoal = s.due + s.newAvailable;
  const done = s.doneToday;
  const pct = todayGoal > 0 ? Math.min(1, done / todayGoal) : 0;
  const C = 2 * Math.PI * 52;

  const forecast = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const buckets = new Array(7).fill(0);
    for (const idx in cards) {
      const c = cards[+idx];
      if (!c || c.state !== "review") continue;
      const dd = Math.floor((c.due - startOfDay.getTime()) / DAY);
      if (dd >= 0 && dd < 7) buckets[dd]++;
    }
    return buckets;
  }, [cards]);
  const maxF = Math.max(1, ...forecast);
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "今日完成", value: done, icon: "✓" },
          { label: "新词待背", value: s.newAvailable, icon: "✨" },
          { label: "待复习", value: s.due, icon: "🔁" },
          { label: "已学", value: s.learned, icon: "📚" },
        ].map((x) => (
          <Card key={x.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="text-2xl">{x.icon}</div>
              <div>
                <div className="text-xs text-muted-foreground">{x.label}</div>
                <div className="text-2xl font-semibold tnum">{x.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">欢迎回来</div>
                  <div className="text-xl font-semibold">
                    {user?.username || "背词人"}
                  </div>
                </div>
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
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
                      stroke="hsl(var(--primary))"
                      strokeWidth="10"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - pct)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-2xl font-bold tnum">{done}</div>
                    <div className="text-xs text-muted-foreground">
                      / {todayGoal} 今日
                    </div>
                  </div>
                </div>
              </div>
              <Button className="w-full h-12 text-base" onClick={onStart}>
                {s.newAvailable === 0
                  ? "今日新词已学完 🎉"
                  : `学习新词 · ${s.newAvailable} 个待学`}
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 text-base"
                onClick={onReview}
                disabled={s.due === 0}
              >
                {s.due === 0 ? "暂无待复习" : `🔁 复习 · ${s.due} 张到期`}
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 text-base"
                onClick={() => navigate("/papers")}
              >
                📚 真题 · 读原文
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                未来 7 天复习量预测{" "}
                <span className="text-muted-foreground font-normal text-sm">
                  · 基于遗忘曲线
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {forecast.map((n, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="text-xs text-muted-foreground tnum">{n}</div>
                    <div
                      className={`w-full rounded-t ${i === 0 ? "bg-primary" : "bg-primary/40"}`}
                      style={{ height: `${(n / maxF) * 80}%`, minHeight: n ? 4 : 0 }}
                    />
                    <div className="text-xs text-muted-foreground">{labels[i]}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">词库掌握进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="h-3 rounded-full overflow-hidden flex bg-muted">
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(s.learned / tot) * 100}%` }}
                />
                <div
                  className="bg-amber-400"
                  style={{ width: `${(s.learn / tot) * 100}%` }}
                />
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>
                  已掌握 <b className="text-foreground tnum">{s.learned}</b>
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

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">快捷操作</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: "真题", icon: "📚", to: "/papers" },
                { label: "翻译管理", icon: "🌐", to: "/transmgr" },
                { label: "设置", icon: "⚙", to: "/settings" },
                { label: "真题记词", icon: "📖", to: "/papers-recite" },
              ].map((a) => (
                <Button
                  key={a.label}
                  variant="outline"
                  className="h-20 flex-col gap-1"
                  onClick={() => navigate(a.to)}
                >
                  <span className="text-xl">{a.icon}</span>
                  {a.label}
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">关于</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              进度本地优先保存；登录后可跨设备同步。词库来源：2027 考研英语红宝书（乱序版）。
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
