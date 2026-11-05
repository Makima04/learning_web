// 登录过期全局弹窗：任何接口返回 401 都会引导到这里重新登录。
// 弹窗内直接登录，成功后恢复同步；待上传队列按 user.id 留在 localStorage，不会丢。
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import * as api from "@/lib/api";
import { applyUserScope } from "@/lib/accountScope";
import { syncAccountData } from "@/lib/accountSync";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Mode = "password" | "email";

export function AuthExpiredDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("password");
  const [username, setUsername] = useState(() => api.getUser()?.username || "");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(() => api.getUser()?.email || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"login" | "code" | "logout" | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  /** 本会话内选过「稍后再说」就不再自动弹，刷新后仍会提醒 */
  const dismissed = useRef(false);
  const accountName = api.getUser()?.username;

  useEffect(() => {
    const onAuthChange = () => {
      if (api.isAuthExpired()) {
        if (!dismissed.current) setOpen(true);
      } else {
        dismissed.current = false;
        setOpen(false);
        setError("");
      }
    };
    const onOpen = () => {
      dismissed.current = false;
      setOpen(true);
    };
    window.addEventListener(api.AUTH_EXPIRED_EVENT, onAuthChange);
    window.addEventListener(api.OPEN_AUTH_DIALOG_EVENT, onOpen);
    onAuthChange();
    return () => {
      window.removeEventListener(api.AUTH_EXPIRED_EVENT, onAuthChange);
      window.removeEventListener(api.OPEN_AUTH_DIALOG_EVENT, onOpen);
    };
  }, []);

  /** 登录成功：清过期标记 → 切回账号作用域 → 立刻恢复同步 */
  async function finishLogin(doAuth: () => Promise<unknown>) {
    setError("");
    setBusy("login");
    try {
      await doAuth();
      const u = api.getUser();
      api.clearAuthExpired();
      applyUserScope(u?.id ?? null);
      useAuth.getState().refresh();
      dismissed.current = false;
      setPassword("");
      setCode("");
      setOpen(false);
      void syncAccountData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === "password") void finishLogin(() => api.login(username.trim(), password));
    else void finishLogin(() => api.loginWithEmail(email.trim(), code.trim()));
  }

  async function sendCode() {
    setError("");
    setHint("");
    setBusy("code");
    try {
      const r = await api.sendEmailCode(email.trim(), "login");
      if (r.dev_code) {
        setHint(`开发模式验证码：${r.dev_code}`);
        setCode(r.dev_code);
      } else if (r.sent === false) {
        setHint("若邮箱已注册将收到验证码（防枚举）");
      } else {
        setHint("验证码已发送，10 分钟内有效");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function later() {
    dismissed.current = true;
    setOpen(false);
  }

  async function continueAsGuest() {
    setBusy("logout");
    await api.logout().catch(() => undefined);
    applyUserScope(null);
    useAuth.getState().refresh();
    dismissed.current = false;
    setBusy(null);
    setOpen(false);
  }

  const canSubmit =
    mode === "password"
      ? !!username.trim() && !!password
      : !!email.trim() && code.trim().length === 6;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setOpen(true); }}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5 text-primary" />
            登录已过期
          </DialogTitle>
          <DialogDescription>
            {accountName ? `${accountName} 的登录状态已失效` : "账号登录状态已失效"}
            ，进度暂时无法上传。本地记录不会丢失，重新登录后会自动继续同步。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-full border p-1 w-fit">
          <button
            type="button"
            className={cn(
              "rounded-full px-4 py-1 text-sm font-bold transition-colors",
              mode === "password" ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            onClick={() => { setMode("password"); setError(""); }}
          >
            用户名密码
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-4 py-1 text-sm font-bold transition-colors",
              mode === "email" ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            onClick={() => { setMode("email"); setError(""); }}
          >
            邮箱验证码
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "password" ? (
            <>
              <Input
                placeholder="用户名或邮箱"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
              <Input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </>
          ) : (
            <>
              <Input
                type="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <div className="flex gap-2">
                <Input
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="flex-1"
                  inputMode="numeric"
                  maxLength={6}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!busy || !email.trim()}
                  onClick={() => void sendCode()}
                >
                  {busy === "code" ? "发送中…" : "获取验证码"}
                </Button>
              </div>
            </>
          )}

          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={!!busy || !canSubmit}>
            {busy === "login" ? "登录中…" : "重新登录并继续同步"}
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={later}>
            稍后再说
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!!busy}
            onClick={() => void continueAsGuest()}
          >
            退出账号，以访客继续
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          未上传的进度仍保留在本机，下次登录同一账号会继续上传。
        </p>
      </DialogContent>
    </Dialog>
  );
}
