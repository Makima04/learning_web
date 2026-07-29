import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useSettings, type Direction } from "@/stores/settings";
import { useCards } from "@/stores/cards";
import { useJournal } from "@/stores/journal";
import { useMeta } from "@/stores/meta";
import { useTheme } from "@/stores/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { parseImportData } from "@/lib/importData";
import { Link } from "react-router-dom";
import { applyUserScope } from "@/lib/accountScope";
import { syncAccountData } from "@/lib/accountSync";
import {
  flushPending,
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/syncQueue";

const TABS = [
  { id: "study", label: "学习" },
  { id: "speak", label: "发音" },
  { id: "llm", label: "翻译" },
  { id: "account", label: "账号" },
  { id: "data", label: "数据" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("study");
  const settings = useSettings();
  const setSettings = useSettings((s) => s.set);
  const auth = useAuth();
  const theme = useTheme();
  /** password | email */
  const [authMode, setAuthMode] = useState<"password" | "email">("email");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailPurpose, setEmailPurpose] = useState<"login" | "register">("login");
  const [codeSending, setCodeSending] = useState(false);
  const [codeHint, setCodeHint] = useState("");
  const [msg, setMsg] = useState("");
  const [llm, setLlm] = useState<api.LlmConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [llmUrl, setLlmUrl] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmConcurrency, setLlmConcurrency] = useState(4);
  const [llmSaving, setLlmSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);

  useEffect(() => {
    if (tab === "llm" && auth.loggedIn) {
      void api
        .llmConfig()
        .then((c) => {
          setLlm(c);
          setLlmUrl(c.url || "");
          setLlmConcurrency(c.concurrency || 4);
          setLlmKey("");
        })
        .catch(() => setLlm(null));
      void api
        .llmModels()
        .then(setModels)
        .catch(() => setModels([]));
    }
  }, [tab, auth.loggedIn]);

  async function doLogin(reg: boolean) {
    setMsg("");
    try {
      if (reg) await api.register(user, pass);
      else await api.login(user, pass);
      const u = api.getUser();
      applyUserScope(u?.id ?? null);
      auth.refresh();
      await syncAccountData();
      setMsg("登录成功，进度已同步");
    } catch (e: any) {
      setMsg(e?.message || "失败");
    }
  }

  async function sendCode() {
    setCodeSending(true);
    setCodeHint("");
    setMsg("");
    try {
      const r = await api.sendEmailCode(email, emailPurpose);
      if (r.dev_code) {
        setCodeHint(`开发模式验证码：${r.dev_code}`);
        setCode(r.dev_code);
      } else if (r.sent === false) {
        setCodeHint("若邮箱已注册将收到验证码（防枚举）");
      } else {
        setCodeHint("验证码已发送，10 分钟内有效");
      }
    } catch (e: any) {
      setMsg(e?.message || "发送失败");
    } finally {
      setCodeSending(false);
    }
  }

  async function doEmailAuth() {
    setMsg("");
    try {
      if (emailPurpose === "register") {
        await api.registerWithEmail({ email, code, password: pass || undefined });
      } else {
        await api.loginWithEmail(email, code);
      }
      const u = api.getUser();
      applyUserScope(u?.id ?? null);
      auth.refresh();
      await syncAccountData();
      setMsg("登录成功，进度已同步");
    } catch (e: any) {
      setMsg(e?.message || "失败");
    }
  }

  async function doLogout() {
    try {
      await flushPending();
    } catch {
      /* ignore */
    }
    await api.logout();
    applyUserScope(null);
    auth.refresh();
    setMsg("已登出");
  }

  async function forceSync() {
    setMsg("同步中…");
    try {
      await syncAccountData();
      setMsg("同步完成");
    } catch (e: any) {
      setMsg(e?.message || "同步失败");
    }
  }

  function exportData() {
    const journal = useJournal.getState().exportSnapshot();
    const blob = {
      cards: useCards.getState().cards,
      meta: useMeta.getState().meta,
      settings: {
        dailyNew: settings.dailyNew,
        dailyReview: settings.dailyReview,
        direction: settings.direction,
        autoSpeak: settings.autoSpeak,
        speakOnWordClick: settings.speakOnWordClick,
        rate: settings.rate,
        orderSeed: settings.orderSeed,
        groupSize: settings.groupSize,
      },
      journal,
      exportedAt: new Date().toISOString(),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" })
    );
    a.download = `english_web_${Date.now()}.json`;
    a.click();
  }

  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const data = parseImportData(text);
        if (data.cards) useCards.getState().replaceAll(data.cards);
        if (data.meta) useMeta.getState().replace(data.meta);
        if (data.settings) setSettings(data.settings);
        if (data.journal) {
          useJournal.getState().replaceAll({
            ...data.journal,
            updatedAt: Date.now(),
          });
        }
        setMsg("导入成功");
      } catch (e: any) {
        setMsg("导入失败: " + (e?.message || e));
      }
    };
    input.click();
  }

  async function resetAll() {
    const loggedIn = api.isLoggedIn();
    const tip = loggedIn
      ? "确认清空本账号的学习进度与日志？将同时删除服务端卡片（不可恢复）。今日统计在多设备上可能仍取较大值。"
      : "确认清空本地进度与学习日志？不可恢复。";
    if (!confirm(tip)) return;
    await useCards.getState().clearAll();
    useMeta.getState().reset();
    useJournal.getState().clearAll();
    setMsg(loggedIn ? "已重置本账号进度与学习日志" : "已重置本地进度与学习日志");
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">设置</h1>
      <div className="flex flex-col md:flex-row gap-4">
        <nav className="flex md:flex-col gap-1 overflow-x-auto shrink-0 md:w-36">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={cn(
                "text-left rounded-md px-3 py-2 text-sm whitespace-nowrap",
                tab === t.id
                  ? "bg-accent font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-4">
          {tab === "study" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">学习</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="每日新词数">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={settings.dailyNew}
                    onChange={(e) =>
                      setSettings({ dailyNew: Math.max(1, +e.target.value || 1) })
                    }
                    className="w-28"
                  />
                </Field>
                <Field label="每日复习上限">
                  <Input
                    type="number"
                    min={10}
                    max={500}
                    value={settings.dailyReview}
                    onChange={(e) =>
                      setSettings({
                        dailyReview: Math.max(10, +e.target.value || 100),
                      })
                    }
                    className="w-28"
                  />
                </Field>
                <Field label="每组词数">
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={settings.groupSize}
                    onChange={(e) =>
                      setSettings({
                        groupSize: Math.max(5, +e.target.value || 20),
                      })
                    }
                    className="w-28"
                  />
                </Field>
                <Field label="记忆方向">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={settings.direction}
                    onChange={(e) =>
                      setSettings({ direction: e.target.value as Direction })
                    }
                  >
                    <option value="en2cn">英 → 中</option>
                    <option value="cn2en">中 → 英</option>
                    <option value="random">随机</option>
                  </select>
                </Field>
                <Field label="主题">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={theme.mode}
                    onChange={(e) =>
                      theme.setMode(e.target.value as "dark" | "light" | "system")
                    }
                  >
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </Field>
              </CardContent>
            </Card>
          )}

          {tab === "speak" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">发音</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="自动发音">
                  <Switch
                    checked={settings.autoSpeak}
                    onCheckedChange={(v) => setSettings({ autoSpeak: v })}
                  />
                </Field>
                <Field label="点词朗读">
                  <Switch
                    checked={settings.speakOnWordClick}
                    onCheckedChange={(v) => setSettings({ speakOnWordClick: v })}
                  />
                </Field>
                <Field label={`语速 ${settings.rate.toFixed(1)}`}>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.1}
                    value={settings.rate}
                    onChange={(e) => setSettings({ rate: +e.target.value })}
                    className="w-40"
                  />
                </Field>
              </CardContent>
            </Card>
          )}

          {tab === "llm" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">翻译服务</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!auth.loggedIn ? (
                  <p className="text-muted-foreground">登录后可查看/配置 LLM（管理员）。</p>
                ) : llm ? (
                  <>
                    <p>
                      状态：
                      {llm.configured ? (
                        <span className="text-emerald-600">已配置</span>
                      ) : (
                        <span className="text-amber-600">未配置（需填写网关 URL 与 Key）</span>
                      )}
                    </p>
                    <p>
                      模型：<code>{llm.model || "—"}</code>
                    </p>
                    <p>并发：{llm.concurrency}</p>
                    {auth.user?.is_admin ? (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-xs text-muted-foreground">
                          管理员可改 OpenAI 兼容网关。Key 不回显明文；留空保存表示不修改 Key。写入数据库后即时生效，无需重启。
                        </p>
                        <Field label="网关 URL">
                          <Input
                            value={llmUrl}
                            onChange={(e) => setLlmUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            autoComplete="off"
                          />
                        </Field>
                        <Field label="API Key">
                          <Input
                            type="password"
                            value={llmKey}
                            onChange={(e) => setLlmKey(e.target.value)}
                            placeholder={
                              llm.has_key
                                ? `已配置：${llm.key_masked || "••••"}（留空不改）`
                                : "sk-…"
                            }
                            autoComplete="new-password"
                          />
                        </Field>
                        <Field label="并发（批量翻译）">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={llmConcurrency}
                            onChange={(e) => setLlmConcurrency(Number(e.target.value) || 1)}
                            className="max-w-[8rem]"
                          />
                        </Field>
                        {models.length > 0 && (
                          <Field label="切换模型">
                            <select
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm max-w-xs"
                              value={llm.model}
                              onChange={async (e) => {
                                await api.setLlmModel(e.target.value);
                                setLlm(await api.llmConfig());
                              }}
                            >
                              {models.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={llmSaving}
                            onClick={async () => {
                              setLlmSaving(true);
                              setMsg("");
                              try {
                                const body: {
                                  url: string;
                                  concurrency: number;
                                  key?: string;
                                } = {
                                  url: llmUrl.trim(),
                                  concurrency: llmConcurrency,
                                };
                                if (llmKey.trim()) body.key = llmKey.trim();
                                const r = await api.setLlmConfig(body);
                                setLlm({
                                  configured: r.configured,
                                  model: r.model,
                                  concurrency: r.concurrency,
                                  url: r.url,
                                  key_masked: r.key_masked,
                                  has_key: r.has_key,
                                });
                                setLlmUrl(r.url || "");
                                setLlmConcurrency(r.concurrency || 4);
                                setLlmKey("");
                                setMsg("LLM 配置已保存");
                                try {
                                  setModels(await api.llmModels());
                                } catch {
                                  setModels([]);
                                }
                              } catch (e: any) {
                                setMsg(e?.message || "保存失败");
                              } finally {
                                setLlmSaving(false);
                              }
                            }}
                          >
                            {llmSaving ? "保存中…" : "保存网关配置"}
                          </Button>
                          <Button variant="outline" asChild>
                            <Link to="/transmgr">打开翻译管理</Link>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="outline" asChild>
                        <Link to="/transmgr">打开翻译管理</Link>
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">无法读取配置（需管理员权限）</p>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "account" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">账号</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {auth.loggedIn ? (
                  <>
                    <p>
                      已登录：<b>{auth.user?.username}</b>
                      {auth.user?.is_admin ? "（管理员）" : ""}
                    </p>
                    {auth.user?.email && (
                      <p className="text-sm text-muted-foreground">{auth.user.email}</p>
                    )}
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                      <p>
                        进度同步：
                        {syncStatus.pending ? (
                          <span className="text-amber-600">有待上传</span>
                        ) : syncStatus.lastError ? (
                          <span className="text-destructive">失败</span>
                        ) : (
                          <span className="text-emerald-600">正常</span>
                        )}
                      </p>
                      {syncStatus.lastOkAt && (
                        <p>
                          上次成功：{new Date(syncStatus.lastOkAt).toLocaleString()}
                        </p>
                      )}
                      {syncStatus.lastError && (
                        <p className="text-destructive">{syncStatus.lastError}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void forceSync()}>
                        立即同步
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void flushPending().then(() => setMsg("已刷出待传队列"))}
                      >
                        重试上传
                      </Button>
                      <Button variant="outline" onClick={() => void doLogout()}>
                        登出
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-1 rounded-md border p-1 w-fit">
                      <button
                        type="button"
                        className={cn(
                          "rounded px-3 py-1 text-sm",
                          authMode === "email" ? "bg-accent font-medium" : "text-muted-foreground"
                        )}
                        onClick={() => setAuthMode("email")}
                      >
                        邮箱验证码
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded px-3 py-1 text-sm",
                          authMode === "password" ? "bg-accent font-medium" : "text-muted-foreground"
                        )}
                        onClick={() => setAuthMode("password")}
                      >
                        用户名密码
                      </button>
                    </div>

                    {authMode === "email" ? (
                      <div className="space-y-2">
                        <div className="flex gap-1 rounded-md border p-1 w-fit">
                          <button
                            type="button"
                            className={cn(
                              "rounded px-2 py-0.5 text-xs",
                              emailPurpose === "login"
                                ? "bg-accent font-medium"
                                : "text-muted-foreground"
                            )}
                            onClick={() => setEmailPurpose("login")}
                          >
                            登录
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "rounded px-2 py-0.5 text-xs",
                              emailPurpose === "register"
                                ? "bg-accent font-medium"
                                : "text-muted-foreground"
                            )}
                            onClick={() => setEmailPurpose("register")}
                          >
                            注册
                          </button>
                        </div>
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
                            variant="outline"
                            disabled={codeSending || !email.trim()}
                            onClick={() => void sendCode()}
                          >
                            {codeSending ? "发送中…" : "获取验证码"}
                          </Button>
                        </div>
                        {emailPurpose === "register" && (
                          <Input
                            type="password"
                            placeholder="可选密码（≥8，便于密码登录）"
                            value={pass}
                            onChange={(e) => setPass(e.target.value)}
                          />
                        )}
                        {codeHint && (
                          <p className="text-xs text-muted-foreground">{codeHint}</p>
                        )}
                        <Button onClick={() => void doEmailAuth()}>
                          {emailPurpose === "register" ? "验证并注册" : "验证并登录"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          生产环境配置 <code>EW_RESEND_API_KEY</code> 发信；本地未配置时为开发模式（验证码会显示在本页）。
                        </p>
                      </div>
                    ) : (
                      <>
                        <Input
                          placeholder="用户名或邮箱"
                          value={user}
                          onChange={(e) => setUser(e.target.value)}
                        />
                        <Input
                          type="password"
                          placeholder="密码"
                          value={pass}
                          onChange={(e) => setPass(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button onClick={() => void doLogin(false)}>登录</Button>
                          <Button variant="outline" onClick={() => void doLogin(true)}>
                            注册
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
                {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
              </CardContent>
            </Card>
          )}

          {tab === "data" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">数据</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  导出包含词库进度、设置与学习日志。登录后进度（卡片 / 今日计数 / 设置 / 日志）会同步到账号；断网写入会入队，恢复后自动上传。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportData}>
                    导出进度
                  </Button>
                  <Button variant="outline" onClick={importData}>
                    导入进度
                  </Button>
                  <Button variant="destructive" onClick={() => void resetAll()}>
                    重置进度
                  </Button>
                </div>
                {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <p className="pt-6 text-center text-xs text-muted-foreground">
        红宝书 · 乱序 · 6550 词 · 版本：
        {typeof window !== "undefined" && window.EW_VERSION ? window.EW_VERSION : "dev"}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}
