// api.js — backend client: auth + translations + progress sync (same-origin /api)
// 在 store.js 之前加载,暴露 window.Api。所有 /api/* 调用集中在此;
// LLM key 收归服务端,译文全局共享存 SQLite,登录后进度同步。
(function (global) {
  "use strict";
  const BASE = ""; // 同源,无需 CORS
  const KEY_TOKEN = "ew.token.v1";
  const KEY_USER = "ew.user.v1";

  function getToken() { return localStorage.getItem(KEY_TOKEN) || ""; }
  function setToken(t) { if (t) localStorage.setItem(KEY_TOKEN, t); else localStorage.removeItem(KEY_TOKEN); }
  function getUser() { try { return JSON.parse(localStorage.getItem(KEY_USER) || "null"); } catch (e) { return null; } }
  function setUser(u) { if (u) localStorage.setItem(KEY_USER, JSON.stringify(u)); else localStorage.removeItem(KEY_USER); }
  function isLoggedIn() { return !!getToken(); }
  function isAdmin() { const u = getUser(); return !!(u && u.is_admin); }

  // 统一请求:自动带 token(若有)、JSON in/out、错误抛 Error(status/data 附带)
  async function req(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    const t = getToken();
    if (t) headers["Authorization"] = "Bearer " + t;
    if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(BASE + path, { method: opts.method || "GET", headers, body: opts.body });
    } catch (e) { throw new Error("网络错误:" + e.message); }
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && (data.detail && (data.detail.msg || data.detail) || data.message || data.error)) || text || ("HTTP " + res.status);
      const err = new Error(String(msg).slice(0, 300)); err.status = res.status; err.data = data; throw err;
    }
    return data;
  }

  // ---- auth ----
  async function register(username, password) { const d = await req("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }); setToken(d.token); setUser(d.user); return d; }
  async function login(username, password) { const d = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }); setToken(d.token); setUser(d.user); return d; }
  async function logout() { try { await req("/api/auth/logout", { method: "POST" }); } catch (e) { } setToken(""); setUser(""); }
  async function me() {
    const d = await req("/api/auth/me");
    // me 返回最新 is_admin，合并回 localStorage（login/register 写入的 user 可能过期）
    if (d && d.user) setUser(Object.assign({}, getUser(), d.user));
    return d;
  }

  // ---- sentences / translations (read) ----
  async function stats() { return req("/api/sentences/stats"); }
  async function listSentences(params) { // {status,q,page,size}
    const q = new URLSearchParams();
    if (params) { for (const k of ["status", "q", "page", "size"]) if (params[k] != null && params[k] !== "") q.set(k, params[k]); }
    return req("/api/sentences?" + q.toString());
  }

  // ---- translate ----
  // on-card:按文本翻译,无需 token(后端 status: 'ok'|'error'|'unconfigured')
  async function translateByText(text) { return req("/api/translate", { method: "POST", body: JSON.stringify({ text }) }); }
  // 段落级解析(Reading Part A 双栏 reader 右栏):无 token,流式 SSE,全局共享缓存
  async function analyzeParagraphByText(payload) {
    return req("/api/analyze-paragraph", { method: "POST", body: JSON.stringify(payload) });
  }
  // 管理:按 id(需登录)
  async function translateById(id) { return req("/api/translate/" + id, { method: "POST" }); }
  async function retranslateById(id) { return req("/api/translate/" + id + "/retranslate", { method: "POST" }); }
  async function batchTranslate(ids) { return req("/api/translate/batch", { method: "POST", body: JSON.stringify({ ids }) }); }

  // ---- llm config(服务端持有 key)----
  async function llmConfig() { return req("/api/llm/config"); }
  async function llmModels() { return req("/api/llm/models"); }
  async function setLlmModel(model) { return req("/api/llm/config", { method: "POST", body: JSON.stringify({ model }) }); }
  async function setLlmConcurrency(n) { return req("/api/llm/config", { method: "POST", body: JSON.stringify({ concurrency: n }) }); }

  // ---- progress sync(需登录)----
  async function getCards() { return req("/api/cards"); }
  async function putCard(idx, card) { return req("/api/cards/" + idx, { method: "PUT", body: JSON.stringify({ card }) }); }
  async function bulkCards(cards) { return req("/api/cards/bulk", { method: "POST", body: JSON.stringify({ cards }) }); }
  async function getMeta(day) {
    // day：本地时区 YYYY-MM-DD，让服务端按客户端当天查，避免跨时区不对称
    const q = day ? ("?day=" + encodeURIComponent(day)) : "";
    return req("/api/meta" + q);
  }
  async function putMeta(meta) { return req("/api/meta", { method: "PUT", body: JSON.stringify({ meta }) }); }

  global.Api = {
    BASE, getToken, setToken, getUser, setUser, isLoggedIn, isAdmin,
    req, register, login, logout, me,
    stats, listSentences,
    translateByText, translateById, retranslateById, batchTranslate,
    analyzeParagraphByText,
    llmConfig, llmModels, setLlmModel, setLlmConcurrency,
    getCards, putCard, bulkCards, getMeta, putMeta,
  };
})(window);
