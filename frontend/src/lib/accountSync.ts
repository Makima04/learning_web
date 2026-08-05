import * as api from "@/lib/api";
import { flushPending } from "@/lib/syncQueue";
import { useCards } from "@/stores/cards";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { useTodayLog } from "@/stores/todayLog";

let syncInFlight: Promise<void> | null = null;

export function syncAccountData(): Promise<void> {
  if (!api.isLoggedIn()) return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    // 先刷出离线队列，再合并；有服务端权威的模块以服务端为准
    await flushPending();
    await Promise.all([
      useCards.getState().sync(),
      useMeta.getState().syncMeta(),
      useSettings.getState().syncFromServer(),
      useJournal.getState().syncFromServer(),
      useKgProgress.getState().syncFromServer(),
      useTodayLog.getState().syncFromServer(),
    ]);
    await flushPending();
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
