import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { flushPending } from "@/lib/syncQueue";
import { checkUpdate, installUpdate, updateStatus, type UpdateStatus } from "./api";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AdminUpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const alive = useRef(false);
  const acting = useRef(false);
  const running = status?.job?.status === "running";
  const busy = launching || running;
  const needsAttention = status?.job?.status === "needs_attention";
  const installed = status?.job?.action === "install" && status.job.status === "succeeded";

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    async function poll() {
      let fast = false;
      try {
        const next = await updateStatus();
        if (disposed) return;
        fast = next.job?.status === "running";
        if (!acting.current) {
          setStatus(next);
          setError("");
        }
      } catch (failure: unknown) {
        if (disposed) return;
        setError(errorMessage(failure));
        fast = true;
      }
      if (!disposed) timer = setTimeout(() => void poll(), fast ? 2000 : 10000);
    }
    void poll();
    return () => {
      disposed = true;
      alive.current = false;
      clearTimeout(timer);
    };
  }, []);

  async function start(action: "check" | "install") {
    if (acting.current || running) return;
    acting.current = true;
    setLaunching(true);
    setError("");
    try {
      if (action === "install") {
        const synced = await flushPending();
        if (synced.pending || synced.lastError) {
          throw new Error("请先在账号设置中同步完本机学习记录，再更新系统");
        }
      }
      if (!alive.current) return;
      const digest = status?.available?.digest;
      const next = action === "check" ? await checkUpdate() : digest ? await installUpdate(digest) : null;
      if (alive.current && next) setStatus(next);
    } catch (failure: unknown) {
      // 请求超时也可能已受理，继续轮询服务端任务，不重复发起安装。
      if (alive.current) setError(errorMessage(failure));
    } finally {
      acting.current = false;
      if (alive.current) setLaunching(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">系统更新</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          检查已发布的新版本。更新前会备份并验证数据，切换版本时服务会短暂中断。
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">当前版本</dt>
          <dd className="break-all font-mono">{status?.current_version || window.EW_VERSION || "dev"}</dd>
          {status?.available && <>
            <dt className="text-muted-foreground">可用版本</dt>
            <dd className="break-all font-mono">{status.available.version}</dd>
          </>}
        </dl>
        {status?.enabled === false && <p className="text-sm text-muted-foreground">{status.message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!status?.enabled || busy || needsAttention}
            onClick={() => void start("check")}>
            {busy && status?.job?.action === "check" ? "正在检查…" : "检查更新"}
          </Button>
          {status?.available?.update_available && (
            <Button disabled={!status.enabled || busy || needsAttention} onClick={() => void start("install")}>
              {busy && status.job?.action === "install" ? "正在更新…" : "立即更新"}
            </Button>
          )}
          {installed && <Button onClick={() => window.location.reload()}>刷新使用新版</Button>}
        </div>
        <div aria-live="polite" className="space-y-2 text-sm">
          {status?.job && <p role="status">{status.job.message}</p>}
          {status?.available && !status.available.update_available && !busy && !installed && (
            <p className="text-muted-foreground">当前已是最新发布版本。</p>
          )}
          {error && <p role="alert" className={running ? "text-muted-foreground" : "text-destructive"}>
            {running ? "正在等待服务恢复连接，更新进度会自动刷新。" : error}
          </p>}
          {busy && <p className="text-muted-foreground">任务会在服务器继续执行，可以离开此页面后再查看。</p>}
        </div>
      </CardContent>
    </Card>
  );
}
