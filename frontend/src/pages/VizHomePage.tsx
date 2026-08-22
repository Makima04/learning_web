// 图解 408 首页：按科目 → 章节列出全部 92 个考点的演示入口
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { CS408_BOOKS } from "@/data/kg";
import { vizKpIds } from "@/viz/registry";
import { useKgProgress } from "@/stores/kgProgress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function VizHomePage() {
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  useEffect(() => {
    load();
  }, [load]);

  const ids = useMemo(() => new Set(vizKpIds()), []);
  const total = ids.size;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">图解 408</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            逐步动画演示 · 单步/播放/变速 · 看完顺手自评（会/模糊/不会），进度汇入知识图谱
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {total} 个演示 · 四科全部考点覆盖
        </span>
      </div>

      {CS408_BOOKS.map((book) => {
        const mods = book.modules
          .map((m) => ({ m, kps: m.kps.filter((k) => ids.has(k.id)) }))
          .filter((x) => x.kps.length > 0);
        return (
          <section key={book.id} className="space-y-3">
            <h2 className="text-lg font-medium">{book.name}</h2>
            {mods.map(({ m, kps }) => (
              <div key={m.id} className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {m.name} <span className="ml-1 text-xs">（{kps.length} 个演示）</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {kps.map((kp) => {
                    const st = states[kp.id];
                    return (
                      <Link
                        key={kp.id}
                        to={`/viz/${kp.id}`}
                        className="group rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold group-hover:text-primary">{kp.name}</h3>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            频{kp.freq}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{st?.covered ? "已学" : "未学"}</span>
                          <span className="text-primary opacity-0 transition group-hover:opacity-100">
                            播放演示 →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** 供 KgMapPage 三入口区复用的卡片样式（图解演示入口） */
export function VizEntryCard() {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">图解演示</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">逐步动画：数据结构 / 计组 / 操作系统 / 计算机网络全部 92 个考点</p>
        <VizEntryButton />
      </CardContent>
    </Card>
  );
}

export function VizEntryButton({ className }: { className?: string }) {
  return (
    <Link
      to="/viz"
      className={cn(
        "inline-flex h-8 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80",
        className
      )}
    >
      进入
    </Link>
  );
}
