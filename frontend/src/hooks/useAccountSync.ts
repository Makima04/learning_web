import { useEffect, useRef } from "react";
import { syncAccountData } from "@/lib/accountSync";
import { useAuth } from "@/stores/auth";

const SYNC_COOLDOWN = 10_000;
const SYNC_INTERVAL = 5 * 60_000;

export function useAccountSync() {
  const loggedIn = useAuth((state) => state.loggedIn);
  const lastSyncAt = useRef(0);

  useEffect(() => {
    if (!loggedIn) {
      lastSyncAt.current = 0;
      return;
    }

    const sync = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastSyncAt.current < SYNC_COOLDOWN) return;
      lastSyncAt.current = now;
      void syncAccountData().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("account sync failed:", message);
      });
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const intervalId = window.setInterval(sync, SYNC_INTERVAL);

    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(intervalId);
    };
  }, [loggedIn]);
}
