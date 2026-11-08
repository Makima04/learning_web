import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { practiceBandLabel, practiceKindLabel, practiceSourceLabel } from "@/lib/kg/mathPractice";
import { markMapOf, type WangdaoItem } from "@/lib/kg/wangdao408";
import { setWangdaoReviewStatus } from "@/lib/kg/wangdaoPractice";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";

/** 包括已退出队列的题，避免永久学会后找不到重新加入复习的入口。 */
export function PracticeStateManager({ items }: { items: WangdaoItem[] }) {
  const entries = useJournal((s) => s.entries);
  const marks = useKgProgress((s) => s.itemMarks);
  const [limit, setLimit] = useState(20);
  const rows = useMemo(() => {
    const markMap = markMapOf(marks);
    const entryMap = new Map(entries.filter((e) => e.sourceItemId).map((e) => [e.sourceItemId, e]));
    return items.flatMap((item) => {
      const entry = entryMap.get(item.id);
      const mark = markMap.get(item.id);
      if (!entry && (!mark || mark === "skip")) return [];
      return [{ item, entry, reviewing: entry?.status === "active" }];
    });
  }, [items, entries, marks]);
  const reviewing = rows.filter((row) => row.reviewing).length;

  return (
    <details className="rounded-lg border-2 border-border/70 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        题目状态 · 永久学会 {rows.length - reviewing} · 复习计划 {reviewing}
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        永久学会后不再安排复习；重新加入计划后，从明天开始按 1 / 3 / 7 / 14 天复习。备注和复习记录保留。
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">做过题后，可在这里切换题目状态。</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.slice(0, limit).map(({ item, entry, reviewing }) => (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-semibold">
                      {practiceSourceLabel(item)} · {practiceBandLabel(item)} · {practiceKindLabel(item.kind)} · §{item.section} #{item.qno}
                    </p>
                    {item.stem && <p className="mt-1 line-clamp-2 text-muted-foreground">{item.stem}</p>}
                    <p className="mt-1 text-muted-foreground">
                      {reviewing ? `复习计划 · 下次 ${entry?.nextReviewOn}` : "永久学会"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setWangdaoReviewStatus(item, reviewing ? "archived" : "active")}
                  >
                    {reviewing ? "设为永久学会" : "加入复习计划"}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && (
        <Button className="mt-3" size="sm" variant="ghost" onClick={() => setLimit((n) => n + 20)}>
          显示更多（剩余 {rows.length - limit} 题）
        </Button>
      )}
    </details>
  );
}
