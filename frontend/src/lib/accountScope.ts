// 登录 / 登出时切换 storage 作用域并 rehydrate 各 store。
import { migrateAllUnscopedIfNeeded, setScopeUserId } from "@/lib/storageScope";
import { recomputePendingFromStorage } from "@/lib/syncQueue";
import { useCards } from "@/stores/cards";
import { useJournal } from "@/stores/journal";
import { useKgProgress } from "@/stores/kgProgress";
import { usePolitics } from "@/stores/politics";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { useTodayLog } from "@/stores/todayLog";

/** 切换到指定用户（或 null=访客），并重载本地进度 */
export function applyUserScope(userId: number | null) {
  setScopeUserId(userId);
  if (userId != null) migrateAllUnscopedIfNeeded();
  useCards.getState().rehydrate();
  useMeta.getState().rehydrate();
  useSettings.getState().load();
  useJournal.getState().rehydrate();
  useKgProgress.getState().load();
  usePolitics.getState().load();
  useTodayLog.getState().rehydrate();
  useStudy.getState().resetSession();
  recomputePendingFromStorage();
}
