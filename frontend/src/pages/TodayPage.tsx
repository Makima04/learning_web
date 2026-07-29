import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TodayWordList } from "@/components/TodayWordList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dayKey } from "@/lib/day";
import { resolveTodayWords } from "@/lib/todayWords";
import { useAuth } from "@/stores/auth";
import { sortRecentFirst, useTodayLog } from "@/stores/todayLog";
import { useSettings } from "@/stores/settings";

type TabKey = "all" | "new" | "review";

export function TodayPage() {
  const navigate = useNavigate();
  const rate = useSettings((s) => s.rate);
  const loggedIn = useAuth((s) => s.loggedIn);
  const syncFromServer = useTodayLog((s) => s.syncFromServer);
  const log = useTodayLog((s) => s.log);
  const today = dayKey();

  // 登录后打开本页：拉服务端今日事件，以服务端为准覆盖本地
  useEffect(() => {
    if (!loggedIn) return;
    void syncFromServer();
  }, [loggedIn, syncFromServer]);

  // 只读 log；跨日不展示昨日残留（下次 record/rehydrate 会清）
  const items = log.dayKey === today ? log.items : [];
  const counts = useMemo(() => {
    let newCount = 0;
    let reviewCount = 0;
    for (const it of items) {
      if (it.type === "new") newCount++;
      else reviewCount++;
    }
    return { total: items.length, newCount, reviewCount };
  }, [items]);

  const [tab, setTab] = useState<TabKey>("all");
  const [mask, setMask] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());

  const filtered = useMemo(() => {
    const sorted = sortRecentFirst(items);
    if (tab === "new") return sorted.filter((it) => it.type === "new");
    if (tab === "review") return sorted.filter((it) => it.type === "review");
    return sorted;
  }, [items, tab]);

  const words = useMemo(() => resolveTodayWords(filtered), [filtered]);

  function onReveal(wordIdx: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(wordIdx);
      return next;
    });
  }

  function onMaskChange(checked: boolean) {
    setMask(checked);
    if (checked) setRevealed(new Set());
  }

  const dateLabel = today;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-5 flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => navigate("/")}
          aria-label="返回首页"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">今日已学</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateLabel}
            {" · "}
            新学 <span className="tnum font-medium text-foreground">{counts.newCount}</span>
            {" · "}
            复习 <span className="tnum font-medium text-foreground">{counts.reviewCount}</span>
            {" · "}
            共 <span className="tnum font-medium text-foreground">{counts.total}</span> 词
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="all">全部 {counts.total}</TabsTrigger>
            <TabsTrigger value="new">新学 {counts.newCount}</TabsTrigger>
            <TabsTrigger value="review">复习 {counts.reviewCount}</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>遮罩回忆</span>
          <Switch checked={mask} onCheckedChange={onMaskChange} />
        </label>
      </div>

      <Card className="border-border/90 shadow-sm">
        <CardContent className="p-0">
          <TodayWordList
            words={words}
            mask={mask}
            rate={rate}
            revealed={revealed}
            onReveal={onReveal}
          />
        </CardContent>
      </Card>

      {counts.total === 0 && (
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => navigate("/")}>回首页学习</Button>
        </div>
      )}
    </div>
  );
}
