// 模块学习：考点列表 + 已学/弱项标记
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getModule, findKp } from "@/data/kg";
import { moduleProgress } from "@/lib/kg/progress";
import type { BookId, MarkLevel } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "pass", label: "会", cls: "bg-emerald-600 text-white" },
  { id: "skip", label: "跳过", cls: "bg-muted text-muted-foreground" },
];

export function KgModulePage() {
  const { bookId = "", moduleId = "" } = useParams();
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  const setCovered = useKgProgress((s) => s.setCovered);
  const setModuleCovered = useKgProgress((s) => s.setModuleCovered);
  const markItem = useKgProgress((s) => s.markItem);

  useEffect(() => {
    load();
  }, [load]);

  const mod = getModule(bookId as BookId, moduleId);
  const prog = useMemo(
    () => moduleProgress(bookId as BookId, moduleId, states),
    [bookId, moduleId, states]
  );

  if (!mod) {
    return (
      <div className="p-6">
        <p>模块不存在</p>
        <Button asChild variant="link">
          <Link to="/kg">返回</Link>
        </Button>
      </div>
    );
  }

  const bookName = findKp(mod.kps[0]?.id)?.book.name ?? bookId;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/kg" className="text-xs text-muted-foreground hover:underline">
            ← 知识图谱
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {bookName} · {mod.name}
          </h1>
          {prog && (
            <p className="mt-1 text-sm text-muted-foreground">
              覆盖 {Math.round(prog.coverage * 100)}% · 掌握{" "}
              {Math.round(prog.mastery * 100)}% · {prog.dueCount} 待复习
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            标记已学后会进入「学习日志」复盘队列（明天起提醒）；在日志里复盘会提升掌握度
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModuleCovered(mod.kps.map((k) => k.id), true)}
          >
            全部标已学
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModuleCovered(mod.kps.map((k) => k.id), false)}
          >
            清除覆盖
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {mod.kps.map((kp) => {
          const st = states[kp.id];
          return (
            <Card key={kp.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-snug">
                    {kp.name}
                  </CardTitle>
                  <div className="flex shrink-0 gap-1 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">频{kp.freq}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      大题{Math.round(kp.bigWeight * 100)}%
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5",
                      st?.covered
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {st?.covered ? "已覆盖" : "未学"}
                  </span>
                  <span className="text-muted-foreground">
                    状态 {st?.status ?? "unknown"} · 掌握{" "}
                    {Math.round((st?.confidence ?? 0) * 100)}%
                  </span>
                  {kp.prereqs && kp.prereqs.length > 0 && (
                    <span className="text-muted-foreground">
                      先修：
                      {kp.prereqs
                        .map((id) => findKp(id)?.kp.name ?? id)
                        .join("、")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={st?.covered ? "outline" : "secondary"}
                    onClick={() => setCovered(kp.id, !st?.covered)}
                  >
                    {st?.covered ? "取消已学" : "标记已学"}
                  </Button>
                  {MARKS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium",
                        m.cls,
                        st?.lastMark === m.id && "ring-2 ring-offset-2 ring-primary"
                      )}
                      onClick={() =>
                        markItem({
                          itemId: `self:${kp.id}`,
                          mark: m.id,
                          primaryKpId: kp.id,
                          secondaryKpIds: [],
                        })
                      }
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
