// 演示叶子页：/viz/:kpId —— 播放动画 + 自评标记（与模块页同一套数据，回写图谱掌握度）
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { findKp } from "@/data/kg";
import { vizFor } from "@/viz/registry";
import type { MarkLevel } from "@/lib/kg/types";
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

export function VizKpPage() {
  const { kpId = "" } = useParams();
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  const setCovered = useKgProgress((s) => s.setCovered);
  const markItem = useKgProgress((s) => s.markItem);

  useEffect(() => {
    load();
  }, [load]);

  const found = findKp(kpId);
  const entry = vizFor(kpId);

  if (!found) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">未知考点</p>
        <Button asChild variant="link" className="px-0">
          <Link to="/viz">返回图解</Link>
        </Button>
      </div>
    );
  }
  const { kp, module: mod, book } = found;
  const st = states[kp.id];
  const Viz = entry?.Component;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link to="/viz" className="hover:underline">
              图解
            </Link>
            <span>/</span>
            <Link to={`/kg/module/${book.id}/${mod.id}`} className="hover:underline">
              {book.name} · {mod.name}
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold">{kp.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">频{kp.freq}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">大题{Math.round(kp.bigWeight * 100)}%</span>
            <span>掌握 {Math.round((st?.confidence ?? 0) * 100)}%</span>
          </div>
        </div>
        <Button
          size="sm"
          variant={st?.covered ? "outline" : "secondary"}
          onClick={() => setCovered(kp.id, !st?.covered)}
        >
          {st?.covered ? "取消已学" : "标记已学"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">动画演示</CardTitle>
        </CardHeader>
        <CardContent>
          {Viz ? (
            <Viz />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">该考点暂无演示，陆续补充中</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">看完自评</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            自评会回写知识图谱掌握度并进入复习调度（与模块页标记同一份数据，跨设备同步）。
          </p>
          <div className="flex flex-wrap gap-2">
            {MARKS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
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
    </div>
  );
}
