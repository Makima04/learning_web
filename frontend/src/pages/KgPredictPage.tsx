// 408 大题预测卷：算法定结构 → 模板/LLM 填内容 → 标记回写图谱
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { findKp } from "@/data/kg";
import { kgMapPath } from "@/lib/kg/paths";
import * as api from "@/lib/api";
import {
  buildCs408BigBlueprint,
  templateItemFromSlot,
} from "@/lib/kg/blueprint408";
import type { MarkLevel, PredictItem, PredictPaper } from "@/lib/kg/types";
import { useKgProgress } from "@/stores/kgProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MARKS: { id: MarkLevel; label: string; cls: string }[] = [
  { id: "fail", label: "不会", cls: "bg-destructive text-destructive-foreground" },
  { id: "fuzzy", label: "模糊", cls: "bg-amber-500 text-white" },
  { id: "pass", label: "会了", cls: "bg-emerald-600 text-white" },
  { id: "skip", label: "跳过", cls: "bg-muted text-muted-foreground" },
];

function newPaperId() {
  return `p408-${Date.now().toString(36)}`;
}

export function KgPredictPage() {
  const load = useKgProgress((s) => s.load);
  const states = useKgProgress((s) => s.states);
  const markItem = useKgProgress((s) => s.markItem);
  const savePaper = useKgProgress((s) => s.savePaper);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const papers = useKgProgress((s) => s.papers);

  const [paper, setPaper] = useState<PredictPaper | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandWeak, setExpandWeak] = useState<Record<string, boolean>>({});
  const [weakPick, setWeakPick] = useState<Record<string, string[]>>({});
  const [showAns, setShowAns] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, [load]);

  const markMap = useMemo(() => {
    const m = new Map<string, MarkLevel>();
    for (const x of itemMarks) m.set(x.itemId, x.mark);
    return m;
  }, [itemMarks]);

  function buildLocal(useLlm: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const recent = itemMarks
        .slice(-40)
        .flatMap((m) => {
          // 从 itemId 无法反查 kp；用最近 paper 的 primary
          return [];
        });
      const recentKps = papers
        .slice(0, 3)
        .flatMap((p) => p.items.map((i) => i.primaryKpId));

      const bp = buildCs408BigBlueprint({
        states,
        recentlyTestedKpIds: [...recent, ...recentKps],
      });
      const id = newPaperId();
      const items: PredictItem[] = bp.slots.map((s) => templateItemFromSlot(s, id));
      const p: PredictPaper = {
        id,
        blueprint: bp,
        items,
        createdAt: Date.now(),
      };
      setPaper(p);
      savePaper(p);
      setMsg(
        useLlm
          ? "蓝图已生成，正在请求 LLM 填题…"
          : "已生成模板预测卷（结构=真题大题配额）。可再点「LLM 填题」。"
      );
      if (useLlm) void fillLlm(p);
      else setBusy(false);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "生成失败");
      setBusy(false);
    }
  }

  async function fillLlm(base: PredictPaper) {
    if (!api.isLoggedIn()) {
      setMsg("LLM 填题需要登录，且服务端已配置模型");
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const slots = base.blueprint.slots.map((s) => {
        const found = findKp(s.primaryKpId);
        return {
          slot_id: s.slotId,
          book_id: s.bookId,
          primary_kp_id: s.primaryKpId,
          primary_kp_name: found?.kp.name ?? s.primaryKpId,
          secondary_kp_names: s.secondaryKpIds
            .map((id) => findKp(id)?.kp.name ?? id)
            .filter(Boolean),
          suggest_points: s.suggestPoints,
          difficulty: s.difficulty,
        };
      });
      const r = await api.kgPredictFill(slots);
      const bySlot = new Map(r.items.map((it) => [it.slot_id, it]));
      const items: PredictItem[] = base.items.map((it) => {
        const filled = bySlot.get(it.slotId);
        if (!filled?.stem) return it;
        return {
          ...it,
          source: "llm",
          stem: filled.stem,
          answer: filled.answer || it.answer,
          solution: filled.solution || it.solution,
        };
      });
      const next = { ...base, items };
      setPaper(next);
      savePaper(next);
      const errs = r.items.filter((x) => x.source === "error").length;
      setMsg(
        errs
          ? `LLM 完成：${r.items.length - errs} 成功，${errs} 失败（保留模板）`
          : `LLM 已填 ${r.items.length} 道大题${r.model ? `（${r.model}）` : ""}`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "LLM 填题失败，已保留模板题");
    } finally {
      setBusy(false);
    }
  }

  function onMark(item: PredictItem, mark: MarkLevel) {
    const weak = weakPick[item.itemId] ?? [];
    markItem({
      itemId: item.itemId,
      mark,
      primaryKpId: item.primaryKpId,
      secondaryKpIds: item.secondaryKpIds,
      weakKpIds: weak,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <Link to={kgMapPath("cs408")} className="text-xs text-muted-foreground hover:underline">
          ← 知识图谱
        </Link>
        <h1 className="mt-1 text-xl font-semibold">408 大题预测卷</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          固定结构：数据结构×2 · 组成×2 · 操作系统×2 · 计网×1；同卷主考点不重复；不要求交卷，标记即可回写图谱。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => buildLocal(false)}>
          生成蓝图卷（模板题）
        </Button>
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() => (paper ? void fillLlm(paper) : buildLocal(true))}
        >
          {paper ? "用 LLM 填当前卷" : "生成并用 LLM 填题"}
        </Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {paper && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            试卷 id：{paper.id} · {paper.items.length} 题 · 来源混合模板/LLM
          </p>
          {paper.items.map((item, idx) => {
            const found = findKp(item.primaryKpId);
            const marked = markMap.get(item.itemId);
            const kpsForWeak = [
              item.primaryKpId,
              ...item.secondaryKpIds,
            ].map((id) => findKp(id));
            return (
              <Card key={item.itemId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    第 {idx + 1} 题（{item.slotId}）· {item.suggestPoints} 分 ·{" "}
                    {found?.book.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {item.source}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    主考点：{found?.kp.name ?? item.primaryKpId}
                    {item.secondaryKpIds.length > 0 && (
                      <>
                        {" "}
                        · 次：
                        {item.secondaryKpIds
                          .map((id) => findKp(id)?.kp.name ?? id)
                          .join("、")}
                      </>
                    )}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                    {item.stem}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    {MARKS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium",
                          m.cls,
                          marked === m.id && "ring-2 ring-offset-2 ring-primary"
                        )}
                        onClick={() => onMark(item, m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExpandWeak((e) => ({
                          ...e,
                          [item.itemId]: !e[item.itemId],
                        }))
                      }
                    >
                      细标弱考点
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setShowAns((e) => ({
                          ...e,
                          [item.itemId]: !e[item.itemId],
                        }))
                      }
                    >
                      {showAns[item.itemId] ? "收起解析" : "看解析"}
                    </Button>
                  </div>
                  {expandWeak[item.itemId] && (
                    <div className="flex flex-wrap gap-2 rounded-md border p-2">
                      {kpsForWeak.map((k) => {
                        if (!k) return null;
                        const picked = (weakPick[item.itemId] ?? []).includes(k.kp.id);
                        return (
                          <button
                            key={k.kp.id}
                            type="button"
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs",
                              picked
                                ? "border-destructive bg-destructive/10 text-destructive"
                                : "text-muted-foreground"
                            )}
                            onClick={() => {
                              setWeakPick((prev) => {
                                const cur = new Set(prev[item.itemId] ?? []);
                                if (cur.has(k.kp.id)) cur.delete(k.kp.id);
                                else cur.add(k.kp.id);
                                return { ...prev, [item.itemId]: [...cur] };
                              });
                            }}
                          >
                            {k.kp.name}
                          </button>
                        );
                      })}
                      <p className="w-full text-[11px] text-muted-foreground">
                        勾选后点「不会/模糊」会强制写入对应考点弱项
                      </p>
                    </div>
                  )}
                  {showAns[item.itemId] && (
                    <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
                      <p>
                        <span className="font-medium">答案：</span>
                        {item.answer || "（无）"}
                      </p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        <span className="font-medium text-foreground">解析：</span>
                        {item.solution || "（无）"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
