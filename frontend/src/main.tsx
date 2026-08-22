import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useTheme } from "@/stores/theme";
import { useSettings } from "@/stores/settings";
import { useCards } from "@/stores/cards";
import { useKgProgress } from "@/stores/kgProgress";
import { useMeta } from "@/stores/meta";
import { useTodayLog } from "@/stores/todayLog";
import { useAuth } from "@/stores/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";

useTheme.getState().init();
useSettings.getState().load();
useCards.getState().rehydrate();
useMeta.getState().rehydrate();
useKgProgress.getState().load();
useTodayLog.getState().rehydrate();
useAuth.getState().refresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// PWA：仅生产构建注册 service worker（dev 下 Vite 资源不缓存）
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e: unknown) => {
      console.warn("sw register failed:", e);
    });
  });
}
