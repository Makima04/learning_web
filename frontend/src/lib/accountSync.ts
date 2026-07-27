import * as api from "@/lib/api";
import { flushPending } from "@/lib/syncQueue";
import { useCards } from "@/stores/cards";
import { useJournal } from "@/stores/journal";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";

let syncInFlight: Promise<void> | null = null;

export function syncAccountData(): Promise<void> {
  if (!api.isLoggedIn()) return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    // 先刷出离线队列，再双向合并
    await flushPending();
    await Promise.all([
      useCards.getState().sync(),
      useMeta.getState().syncMeta(),
      useSettings.getState().syncFromServer(),
      useJournal.getState().syncFromServer(),
    ]);
    await flushPending();
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
