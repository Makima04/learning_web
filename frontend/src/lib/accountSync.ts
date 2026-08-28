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

let syncInFlight: Promise<void> | null = null;

export function syncAccountData(): Promise<void> {
  if (!api.isLoggedIn()) return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  const epoch = getScopeEpoch();
  syncInFlight = (async () => {
    // 先刷出离线队列，再合并；有服务端权威的模块以服务端为准
    await flushPending();
    if (!api.isLoggedIn() || !stillInScope(epoch)) return;
    await Promise.all([
      useCards.getState().sync(),
      useMeta.getState().syncMeta(),
      useSettings.getState().syncFromServer(),
      useJournal.getState().syncFromServer(),
      useKgProgress.getState().syncFromServer(),
      usePolitics.getState().syncFromServer(),
      useTodayLog.getState().syncFromServer(),
    ]);
    if (!api.isLoggedIn() || !stillInScope(epoch)) return;
    await flushPending();
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
