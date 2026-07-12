// api.ts — backend client，镜像 web/api.js + 新增 study-events/stats 端点。
// 同源 /api，无 CORS；自动带 Bearer token；JSON in/out；错误抛 Error(status,data)。

const BASE = ""; // 同源
const KEY_TOKEN = "ew.token.v1";
const KEY_USER = "ew.user.v1";

export interface User {
  id: number;
  username: string;
  is_admin?: boolean;
}

export interface SentenceItem {
  id: number;
  text: string;
  zh: string | null;
  status: string | null;
  year: number | null;
  label: string | null;
}

export interface SentenceStats {
  total: number;
  translated: number;
  untranslated: number;
}

export interface LlmConfig {
  configured: boolean;
  model: string;
  concurrency: number;
}

export interface CardDTO {
  learned?: boolean | null;
  state: string | null;
  due: number | null;
  ivl: number | null;
  ease: number | null;
  reps: number | null;
  lapses: number | null;
  /** 旧字段 step 已废弃，新流程用 quiz（1/2/3=待做第 N 次练习）。 */
  step?: number | null;
  quiz?: number | null;
  /** Unix epoch milliseconds. Used to resolve cross-device card writes. */
  updated_at?: number | null;
}

export interface MetaDTO {
  day_key?: string;
  new_today?: number;
  review_today?: number;
  learn_today?: number;
  done_today?: number;
}

export interface StudyEventBody {
  word_idx: number;
  event_type: "new" | "review" | "learn";
  quality: "again" | "hard" | "good" | "easy";
  day_key: string;
}

export interface TodayItem {
  word_idx: number;
  english: string;
  event_type: string;
  quality: string | null;
  studied_at: string;
}
export interface TodayResp {
  items: TodayItem[];
  summary: { new: number; review: number; learn: number; done: number };
}
export interface DailyAgg {
  day_key: string;
  new: number;
  review: number;
  learn: number;
  done: number;
  distinct_words: number;
}
export interface Overview {
  total_studied: number;
  total_reviews: number;
  current_streak: number;
  longest_streak: number;
  retention_rate: number;
  days_active: number;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(msg: string, status: number, data: unknown) {
    super(msg);
    this.status = status;
    this.data = data;
  }
}

// ---- token ----
export function getToken(): string {
  return localStorage.getItem(KEY_TOKEN) || "";
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(KEY_TOKEN, t);
  else localStorage.removeItem(KEY_TOKEN);
}
export function getUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(KEY_USER) || "null");
  } catch {
    return null;
  }
}
export function setUser(u: User | null) {
  if (u) localStorage.setItem(KEY_USER, JSON.stringify(u));
  else localStorage.removeItem(KEY_USER);
}
export function isLoggedIn(): boolean {
  return !!getToken();
}
export function isAdmin(): boolean {
  const u = getUser();
  return !!(u && u.is_admin);
}

// ---- 统一请求 ----
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  const t = getToken();
  if (t) headers["Authorization"] = "Bearer " + t;
  if (opts.body && !headers["Content-Type"])
    headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body,
    });
  } catch (e: any) {
    throw new ApiError("网络错误:" + (e?.message || e), 0, null);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data &&
        ((data.detail && (data.detail.msg || data.detail)) ||
          data.message ||
          data.error)) ||
      text ||
      "HTTP " + res.status;
    throw new ApiError(String(msg).slice(0, 300), res.status, data);
  }
  return data as T;
}

// ---- auth ----
export async function register(username: string, password: string) {
  const d = await req<{ token: string; user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(d.token);
  setUser(d.user);
  return d;
}
export async function login(username: string, password: string) {
  const d = await req<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(d.token);
  setUser(d.user);
  return d;
}
export async function logout() {
  try {
    await req("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  setToken(null);
  setUser(null);
}
export async function me() {
  return req<{ user: User }>("/api/auth/me");
}

// ---- sentences / translations (read) ----
export async function stats(): Promise<SentenceStats> {
  return req("/api/sentences/stats");
}
export async function listSentences(params: {
  status?: string;
  q?: string;
  page?: number;
  size?: number;
}): Promise<{
  items: SentenceItem[];
  total: number;
  translated: number;
  untranslated: number;
}> {
  const q = new URLSearchParams();
  if (params)
    for (const k of ["status", "q", "page", "size"] as const)
      if (params[k] != null && params[k] !== "") q.set(k, String(params[k]));
  return req("/api/sentences?" + q.toString());
}

// ---- translate ----
// on-card 按文本翻译，无需 token，后端返 {zh, status}
export async function translateByText(
  text: string
): Promise<{ zh: string; status: string }> {
  return req("/api/translate", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
// 管理端点（需登录）
export async function translateById(id: number) {
  return req<{ zh: string; status: string }>(`/api/translate/${id}`, {
    method: "POST",
  });
}
export async function retranslateById(id: number) {
  return req<{ zh: string; status: string }>(
    `/api/translate/${id}/retranslate`,
    { method: "POST" }
  );
}
export async function batchTranslate(ids: number[]) {
  return req<{ translated: number; failed: number; results: any[] }>(
    "/api/translate/batch",
    { method: "POST", body: JSON.stringify({ ids }) }
  );
}

// ---- llm config（服务端持有 key）----
export async function llmConfig(): Promise<LlmConfig> {
  return req("/api/llm/config");
}
export async function llmModels(): Promise<string[]> {
  return req("/api/llm/models");
}
export async function setLlmModel(model: string) {
  return req("/api/llm/config", {
    method: "POST",
    body: JSON.stringify({ model }),
  });
}
export async function setLlmConcurrency(n: number) {
  return req("/api/llm/config", {
    method: "POST",
    body: JSON.stringify({ concurrency: n }),
  });
}

// ---- progress sync（需登录）----
export async function getCards(): Promise<{ cards: Record<string, CardDTO> }> {
  return req("/api/cards");
}
export async function putCard(idx: number, card: CardDTO) {
  return req(`/api/cards/${idx}`, {
    method: "PUT",
    body: JSON.stringify({ card }),
  });
}
export async function bulkCards(cards: Record<string, CardDTO>) {
  return req("/api/cards/bulk", {
    method: "POST",
    body: JSON.stringify({ cards }),
  });
}
export async function getMeta(day?: string): Promise<{ meta: MetaDTO }> {
  // day：本地时区 YYYY-MM-DD，让服务端按客户端当天查，避免跨时区不对称
  const q = day ? `?day=${encodeURIComponent(day)}` : "";
  return req(`/api/meta${q}`);
}
export async function putMeta(meta: MetaDTO) {
  return req("/api/meta", { method: "PUT", body: JSON.stringify({ meta }) });
}

// ---- settings（需登录，账号级持久化；不含 llm——LLM 仅管理员经 /api/llm/* 配置）----
export async function getSettings(): Promise<{ settings: Record<string, any> }> {
  return req("/api/settings");
}
export async function putSettings(settings: Record<string, any>) {
  // 调用方已自行剥离 llm；服务端也会防御性剥离，双保险。
  const clean = { ...settings };
  delete clean.llm;
  return req("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ settings: clean }),
  });
}

// ---- study events / stats（新）----
export async function postStudyEvent(body: StudyEventBody) {
  return req<{ ok: boolean }>("/api/study-events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
export async function getToday(day: string): Promise<TodayResp> {
  return req(`/api/stats/today?day=${encodeURIComponent(day)}`);
}
export async function getDaily(from: string, to: string): Promise<DailyAgg[]> {
  const q = new URLSearchParams({ from, to });
  return req(`/api/stats/daily?${q.toString()}`);
}
export async function getOverview(): Promise<Overview> {
  return req("/api/stats/overview");
}
