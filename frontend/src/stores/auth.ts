// auth store —— token/user，持久化 ew.token.v1 / ew.user.v1。
// 实际 token 存在 localStorage（api.ts 管理），这里只放 user 派生状态供 UI 用。
import { create } from "zustand";
import * as api from "@/lib/api";

interface AuthState {
  user: api.User | null;
  loggedIn: boolean;
  setUser: (u: api.User | null) => void;
  refresh: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: api.getUser(),
  loggedIn: api.isLoggedIn(),
  setUser: (u) => set({ user: u, loggedIn: !!u }),
  refresh: () => set({ user: api.getUser(), loggedIn: api.isLoggedIn() }),
}));
