import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { flushPending } from "@/lib/syncQueue";
import { checkUpdate, installUpdate, updateStatus, type UpdateStatus } from "./api";
import { checkFreshness } from "./freshness";

/** 将容器/构建语义化版本号格式化为展示形式，如 v0.1.5-rc1 -> v0.1.5(rc1)。 */
export function formatDisplayVersion(version: string | undefined): string {
  if (!version) return "v0.1.5(rc1)";
  return version.replace(/-(rc\d+)$/i, "($1)");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const INSTALL_PHASE_LABEL: Record<string, string> = {
  queued: "任务排队中…",
  download: "1/4 正在下载新版容器镜像…",
  backup: "2/4 正在备份数据库与配置…",
  verify: "3/4 正在隔离容器验证启动与数据…",
  switch: "4/4 正在切换容器版本（服务将短暂中断）…",
  rollback: "验证未通过，正在回滚至旧版本…",
};

export function AdminUpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [installedInSession, setInstalledInSession] = useState(false);
  const alive = useRef(false);
  const acting = useRef(false);
  const sawInstallRunning = useRef(false);

  const running = status?.job?.status === "running";
  const busy = launching || running;
  const needsAttention = status?.job?.status === "needs_attention";
  const clientVersion = typeof window !== "undefined" ? window.EW_VERSION : undefined;
  const serverVersion = status?.current_version;
  // 只有本次刚完成安装，或页面加载的前端版本落后于服务端当前版本时，才提示刷新。
  const versionOutdated = Boolean(
    clientVersion && serverVersion && clientVersion !== "dev" && clientVersion !== serverVersion
  );
  const needsRefresh = installedInSession || versionOutdated;
  const updateAvailable = Boolean(status?.available?.update_available);
  // 只缓存最近一次检查结果：旧快照不能当成「已是最新」。
  const fresh = checkFreshness(status?.available?.checked_at);
  const canAutoCheck =
    !!status &&
    status.enabled !== false &&
    status.job?.status !== "running" &&
    status.job?.status !== "needs_attention" &&
    !needsRefresh;

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
        if (next.job?.action === "install" && next.job.status === "running") {
          sawInstallRunning.current = true;
        }
        if (
          sawInstallRunning.current &&
          next.job?.action === "install" &&
          next.job.status === "succeeded"
        ) {
          setInstalledInSession(true);
        }
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

  // 缓存超过 30 分钟（或从未检查）时自动复查一次，避免旧结论被读成「已是最新」。
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!canAutoCheck || fresh.stale === false || autoChecked.current) return;
    autoChecked.current = true;
    void start("check");
    // start 依赖组件内状态，这里只在首次过期时触发一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoCheck, fresh.stale]);

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
        sawInstallRunning.current = true;
      }
      if (!alive.current) return;
      const digest = status?.available?.digest;
      const next =
        action === "check" ? await checkUpdate() : digest ? await installUpdate(digest) : null;
      if (alive.current && next) setStatus(next);
    } catch (failure: unknown) {
      // 请求超时也可能已受理，继续轮询服务端任务，不重复发起安装。
      if (alive.current) setError(errorMessage(failure));
    } finally {
      acting.current = false;
      if (alive.current) setLaunching(false);
    }
  }

  const showJobMessage = (() => {
    const job = status?.job;
    if (!job) return null;
    if (job.status === "running") {
      if (job.action === "install") {
        return INSTALL_PHASE_LABEL[job.phase] || job.message;
      }
      return "正在查询云端最新版本信息（不下载镜像）…";
    }
    // 历史安装成功记录（例如几小时前）且当前页面已是最新版时，不再误导性地显示「更新完成，可以刷新网页」。
    if (job.action === "install" && job.status === "succeeded" && !needsRefresh) {
      return null;
    }
    // 刚检查完时由下方统一状态文案呈现，避免重复一句话。
    if (job.action === "check" && job.status === "succeeded") {
      return null;
    }
    return job.message;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">系统更新</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          「检查更新」仅查询云端最新版本号，不下载镜像；发现新版本后点击「立即更新」，才会下载容器镜像、备份并验证数据，然后自动切换至新版。
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">当前版本</dt>
          <dd className="break-all font-mono font-semibold">
            {formatDisplayVersion(serverVersion || clientVersion || "v0.1.5-rc1")}
          </dd>
          {status?.enabled !== false && (
            <>
              <dt className="text-muted-foreground">上次检查</dt>
              <dd className="text-muted-foreground">
                {fresh.label}
                {fresh.stale && <span className="ml-1">· 已过期</span>}
              </dd>
            </>
          )}
          {status?.available && (
            <>
              <dt className="text-muted-foreground">云端最新</dt>
              <dd className="flex flex-wrap items-center gap-2 break-all font-mono">
                <span>{formatDisplayVersion(status.available.version)}</span>
                {updateAvailable ? (
                  <span className="rounded-full bg-app-orange/15 px-2 py-0.5 font-sans text-xs font-bold text-app-orange">
                    有新版本可更新
                  </span>
                ) : (
                  <span className="rounded-full bg-app-green/15 px-2 py-0.5 font-sans text-xs font-semibold text-app-green">
                    已是最新
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>
        {status?.enabled === false && (
          <p className="text-sm text-muted-foreground">{status.message}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!status?.enabled || busy || needsAttention}
            onClick={() => void start("check")}
          >
            {busy && status?.job?.action === "check" ? "正在检查…" : "检查更新"}
          </Button>
          {updateAvailable && !needsRefresh && (
            <Button
              disabled={!status?.enabled || busy || needsAttention}
              onClick={() => void start("install")}
            >
              {busy && status?.job?.action === "install"
                ? "正在下载并更新…"
                : "立即更新（下载镜像并自动更新）"}
            </Button>
          )}
          {needsRefresh && (
            <Button onClick={() => window.location.reload()}>刷新使用新版</Button>
          )}
        </div>
        <div aria-live="polite" className="space-y-2 text-sm">
          {showJobMessage && <p role="status">{showJobMessage}</p>}
          {needsRefresh && !busy && (
            <p className="font-medium text-ink-success">
              新版本已就绪，点击「刷新使用新版」即可切换界面。
            </p>
          )}
          {status?.available && !updateAvailable && !busy && !needsRefresh && (
            <p className="text-muted-foreground">
              {fresh.stale
                ? "上次检查结果已过期，请点「检查更新」重新确认。"
                : "当前已是最新发布版本，无需下载更新。"}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className={running ? "text-muted-foreground" : "text-destructive"}
            >
              {running ? "正在等待服务恢复连接，更新进度会自动刷新。" : error}
            </p>
          )}
          {busy && (
            <p className="text-muted-foreground">
              任务会在服务器继续执行，可以离开此页面后再查看。
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
