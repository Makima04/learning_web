// 学习节奏卡片 —— 近半年热力图 + 连续/最长学习天数。
// 访客用本地逐日计数；登录后与服务端 /api/stats/daily、/api/stats/overview 合并（服务端 streak 权威）。
import { useEffect, useMemo, useRef, useState } from "react";
import ActivityCalendar from "react-activity-calendar";
import { Flame, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import {
  buildHeatmapDays,
  computeStreaks,
  loadDayCounts,
  mergeDayCounts,
  rangeEndingToday,
  type DayCounts,
} from "@/lib/dayCounts";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import { useTodayLog } from "@/stores/todayLog";
import { cn } from "@/lib/utils";

/** 近半年 */
const WINDOW_DAYS = 183;
const MAX_LEVEL = 4;
const BLOCK_MARGIN = 3;

// 与全站绿主色对齐的 5 档色阶（level0 为无活动底色）
const LIGHT_COLORS = ["#e9efe9", "#c7e5d4", "#8ecfac", "#4fae7f", "#2e8f64"];
const DARK_COLORS = ["#242b27", "#1c4531", "#216244", "#2a8a5c", "#3fae7a"];

function useIsDark(): boolean {
  const mode = useTheme((s) => s.mode);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
  return mode === "dark" || (mode === "system" && systemDark);
}

export function StreakHeatmap() {
  const loggedIn = useAuth((s) => s.loggedIn);
  const dark = useIsDark();
  const todayItems = useTodayLog((s) => s.log.items);
  const todayDk = useTodayLog((s) => s.log.dayKey);

  const [serverCounts, setServerCounts] = useState<DayCounts | null>(null);
  const [serverStreaks, setServerStreaks] = useState<{ current: number; longest: number } | null>(null);

  const today = dayKey();
  const range = useMemo(() => rangeEndingToday(today, WINDOW_DAYS), [today]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [blockSize, setBlockSize] = useState(11);

  // 格子大小随容器宽度自适应（组件 SVG 是固定像素宽，不适配会在桌面端只占 1/3）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const first = new Date(`${range.from}T00:00:00`);
    const leading = (first.getDay() + 6) % 7; // weekStart=1，周一为行首
    const weeks = Math.ceil((leading + WINDOW_DAYS) / 7);
    const apply = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const size = Math.floor((w - 8) / weeks) - BLOCK_MARGIN;
      setBlockSize(Math.max(8, Math.min(16, size)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [range.from]);

  // 登录：拉服务端逐日聚合 + streak（overview 覆盖全历史，权威）
  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    api
      .getDaily(range.from, range.to)
      .then((rows) => {
        if (!alive) return;
        const counts: DayCounts = {};
        for (const r of rows) counts[r.day_key] = r.distinct_words;
        setServerCounts(counts);
      })
      .catch(() => {
        if (alive) setServerCounts(null);
      });
    api
      .getOverview(-new Date().getTimezoneOffset())
      .then((o) => {
        if (alive) setServerStreaks({ current: o.current_streak, longest: o.longest_streak });
      })
      .catch(() => {
        /* streak 回退本地计算 */
      });
    return () => {
      alive = false;
    };
  }, [loggedIn, range.from, range.to]);

  // 今日以本地词表为准补齐（服务端聚合有延迟，取大防回退）
  const counts = useMemo(() => {
    const local = loadDayCounts();
    const base = serverCounts ? mergeDayCounts(local, serverCounts) : local;
    if (todayDk !== today) return base;
    return { ...base, [today]: Math.max(base[today] || 0, todayItems.length) };
  }, [serverCounts, todayItems.length, todayDk, today]);

  const streaks = serverStreaks ?? computeStreaks(counts, today);

  const data = useMemo(() => {
    const days = buildHeatmapDays(counts, range.from, range.to);
    const max = days.reduce((m, d) => Math.max(m, d.count), 0);
    return days.map((d) => ({
      ...d,
      level:
        d.count === 0 || max === 0
          ? 0
          : Math.max(1, Math.min(MAX_LEVEL, Math.ceil((d.count / max) * MAX_LEVEL))),
    }));
  }, [counts, range.from, range.to]);

  const windowTotal = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);

  return (
    <Card className="border-border/90 shadow-none">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Flame className={cn("h-4 w-4", streaks.current > 0 ? "text-orange-500" : "text-muted-foreground")} />
              学习节奏
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {windowTotal === 0 ? "开始学习后，这里会逐日点亮你的节奏" : "近半年每日学习词数"}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-orange-500" />
              <b className="tnum text-base">{streaks.current}</b>
              <span className="text-muted-foreground">天连续</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500" />
              <b className="tnum text-base">{streaks.longest}</b>
              <span className="text-muted-foreground">天最长</span>
            </span>
          </div>
        </div>
        <div ref={wrapRef} className="mt-4 overflow-x-auto">
          <ActivityCalendar
            data={data}
            colorScheme={dark ? "dark" : "light"}
            theme={{ light: LIGHT_COLORS, dark: DARK_COLORS }}
            blockSize={blockSize}
            blockMargin={BLOCK_MARGIN}
            fontSize={12}
            weekStart={1}
            labels={{
              totalCount: "近半年共学 {{count}} 词",
              legend: { less: "少", more: "多" },
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
