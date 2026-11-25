// 集中注册 journal ↔ kgProgress 的跨 Store 联动监听（应用启动时调用一次）。
// 两个 store 均只单向依赖 storeEvents，不互相 import，消除 Vite chunk 循环告警。
import { onStoreEvent } from "@/stores/storeEvents";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";

let initialized = false;

export function initStoreBridge(): void {
  if (initialized) return;
  initialized = true;

  onStoreEvent("journal:reviewed", ({ kpId, mark, dueMs, ivl }) => {
    useKgProgress.getState().applyExternalMark(kpId, mark, { dueMs, ivl });
  });

  onStoreEvent("kg:kpCovered", ({ kpId, title, body, categoryId }) => {
    useJournal.getState().addEntryFromKg({ kpId, title, body, categoryId });
  });

  onStoreEvent("kg:kpUncovered", ({ kpId }) => {
    useJournal.getState().archiveEntriesByKpId(kpId);
  });

  onStoreEvent("kg:wrongUncollected", ({ sourceItemId }) => {
    useJournal.getState().uncollectWrongItem(sourceItemId);
  });
}
