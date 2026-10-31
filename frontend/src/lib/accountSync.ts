import * as api from "@/lib/api";
import { getScopeEpoch, stillInScope } from "@/lib/storageScope";
import { flushPending } from "@/lib/syncQueue";
import { useCards } from "@/stores/cards";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { usePolitics } from "@/stores/politics";
import { useTodayLog } from "@/stores/todayLog";
import { useWordLists } from "@/stores/wordLists";

let syncInFlight: Promise<void> | null = null;
let syncInFlightEpoch = -1;

export function syncAccountData(): Promise<void> {
  if (!api.isLoggedIn()) return Promise.resolve();
  const epoch = getScopeEpoch();
  if (syncInFlight && syncInFlightEpoch === epoch) return syncInFlight;

  // 并发只在同一账号作用域内复用，切换账号立即启动自己的同步。
  syncInFlightEpoch = epoch;
  const flight = (async () => {
    // 先刷出离线队列，再合并；有服务端权威的模块以服务端为准
    const status = await flushPending();
    // 有未提交的学习事务时保留本地投影，等待重试成功后再采用服务端快照。
    if (status?.pending && status.lastError) return;
    if (!api.isLoggedIn() || !stillInScope(epoch)) return;
    await Promise.all([
      useCards.getState().sync(),
      useMeta.getState().syncMeta(),
      useSettings.getState().syncFromServer(),
      useJournal.getState().syncFromServer(),
      useKgProgress.getState().syncFromServer(),
      usePolitics.getState().syncFromServer(),
      useTodayLog.getState().syncFromServer({ skipFlush: true }),
      useWordLists.getState().syncFromServer(),
    ]);
    if (!api.isLoggedIn() || !stillInScope(epoch)) return;
    await flushPending();
  })().finally(() => {
    if (syncInFlight === flight) syncInFlight = null;
  });
  syncInFlight = flight;
  return flight;
}
