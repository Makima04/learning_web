// theme store —— 'dark'|'light'|'system'，持久化 ew.theme，同步 documentElement class。
import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";
const KEY = "ew.theme";

function readStored(): ThemeMode {
  const v = localStorage.getItem(KEY);
  if (v === "dark" || v === "light" || v === "system") return v;
  // 未设置时默认浅色（白天），不跟系统深色
  return "light";
}

function isDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function applyTheme(mode: ThemeMode) {
  const dark = isDark(mode);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  // theme-color 供移动端浏览器顶栏配色
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  // 与 index.css 动森白天奶油 / 夜晚海军蓝背景对齐
  meta.setAttribute("content", dark ? "#2b3252" : "#f7f3df");
}

interface ThemeStore {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
  init: () => void;
}

export const useTheme = create<ThemeStore>((set, get) => ({
  mode: readStored(),
  setMode: (m) => {
    localStorage.setItem(KEY, m);
    applyTheme(m);
    set({ mode: m });
  },
  cycle: () => {
    const order: ThemeMode[] = ["dark", "light", "system"];
    const next = order[(order.indexOf(get().mode) + 1) % order.length];
    get().setMode(next);
  },
  init: () => applyTheme(readStored()),
}));
