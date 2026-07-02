// llm.js — translation client (走后端 /api/translate,不再直连网关)
// 在 app.js 之前加载。暴露 window.LLM = { isConfigured, fetchModels, translate }。
// 译文缓存仍走 Store.getTrans/setTrans(会话内瞬返);真实译文由后端产生并全局共享存 SQLite。
(function (global) {
  "use strict";

  // isConfigured 保持同步签名(兼容 app.js wireTransButtons 的同步判断)。
  // 后端语义:LLM key 收归服务端,on-card 翻译(/api/translate)无需 token、后端总会响应。
  // 这里总是返 true 允许尝试 —— 后端未配置时会返 status='unconfigured',UI 据此提示。
  // 旧 cfg()/joinUrl/fetchJSON 直连网关逻辑已删除(key 不再放前端)。
  function isConfigured() {
    return true;
  }

  // 拉取模型列表 —— 改走 Api(需登录)。C agent 的管理页会改用此入口。
  async function fetchModels() {
    return Api.llmModels();
  }

  // 翻译一句英文为中文。命中 Store 缓存则瞬返;否则调后端 /api/translate(by text,无需 token)。
  // 后端返 {zh, status}:
  //   - status='ok' && zh:成功,写缓存并返回 zh
  //   - status='unconfigured':后端未配置 LLM,抛错提示
  //   - status='error':zh 存的是错误文本,抛错让 UI 显示"重试"
  async function translate(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return "";
    const cached = Store.getTrans(text);
    if (cached !== undefined) return cached;

    const r = await Api.translateByText(text);
    if (r && r.status === "ok" && r.zh) {
      Store.setTrans(text, r.zh);
      return r.zh;
    }
    if (r && r.status === "unconfigured") {
      throw new Error("未配置 LLM(服务端)");
    }
    // status === 'error' 或其它:zh 存错误文本,抛错让 UI 显示重试
    throw new Error((r && r.zh) || "翻译失败");
  }

  global.LLM = { isConfigured, fetchModels, translate };
})(window);
