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

useTheme.getState().init();
useSettings.getState().load();
useCards.getState().rehydrate();
useMeta.getState().rehydrate();
useKgProgress.getState().load();
useTodayLog.getState().rehydrate();
useAuth.getState().refresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
