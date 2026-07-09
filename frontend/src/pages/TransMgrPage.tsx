import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { SentenceItem } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function TransMgrPage() {
  const loggedIn = useAuth((s) => s.loggedIn);
  const [stats, setStats] = useState<api.SentenceStats | null>(null);
  const [items, setItems] = useState<SentenceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const size = 30;

  const load = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const s = await api.stats();
      setStats(s);
      const r = await api.listSentences({
        status: status || undefined,
        q: q || undefined,
        page,
        size,
      });
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch (e: any) {
      setMsg(e?.message || "加载失败");
    }
  }, [loggedIn, status, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function translateOne(id: number, re = false) {
    setBusy(true);
    try {
      if (re) await api.retranslateById(id);
      else await api.translateById(id);
      await load();
    } catch (e: any) {
      setMsg(e?.message || "翻译失败");
    } finally {
      setBusy(false);
    }
  }

  async function batchUntranslated() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.listSentences({ status: "none", page: 1, size: 50 });
      const ids = (r.items || []).map((x) => x.id);
      if (!ids.length) {
        setMsg("没有未翻译句子");
        return;
      }
      const res = await api.batchTranslate(ids);
      setMsg(`批量完成：成功 ${res.translated}，失败 ${res.failed}`);
      await load();
    } catch (e: any) {
      setMsg(e?.message || "批量失败");
    } finally {
      setBusy(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        请先登录后再管理翻译。
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">翻译管理</h1>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { l: "总例句", v: stats.total },
            { l: "已译", v: stats.translated },
            { l: "未译", v: stats.untranslated },
          ].map((x) => (
            <Card key={x.l}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{x.l}</div>
                <div className="text-2xl font-semibold tnum">{x.v}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">全部</option>
            <option value="ok">已译</option>
            <option value="none">未译</option>
            <option value="error">失败</option>
          </select>
          <Input
            placeholder="搜索英文…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                void load();
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              void load();
            }}
          >
            搜索
          </Button>
          <Button disabled={busy} onClick={() => void batchUntranslated()}>
            批量译 50 条未译
          </Button>
        </CardContent>
      </Card>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="space-y-2">
        {items.map((it) => (
          <Card key={it.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">
                    #{it.id}
                    {it.year ? ` · ${it.year}` : ""}
                    {it.label ? ` · ${it.label}` : ""}
                    <span
                      className={cn(
                        "ml-2",
                        it.status === "ok" && "text-emerald-600",
                        it.status === "error" && "text-destructive",
                        !it.status && "text-amber-600"
                      )}
                    >
                      {it.status || "none"}
                    </span>
                  </div>
                  <div>{it.text}</div>
                  {it.zh && (
                    <div className="text-muted-foreground mt-1 border-l-2 pl-2">
                      {it.zh}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void translateOne(it.id, false)}
                  >
                    翻译
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void translateOne(it.id, true)}
                  >
                    重翻
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-center text-muted-foreground py-8">无数据</p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span className="text-sm text-muted-foreground tnum">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
