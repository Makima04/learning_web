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

  // 长难句解析（母语式 10 层走查）。流式：onChunk(delta) 多次、onDone(content) 一次。
  // 命中 Store.getParse 缓存 → 同步 onChunk + onDone，无网络。
  // 否则 POST /api/parse-sentence，读 SSE 流：
  //   data: {"delta":"..."}           → onChunk
  //   data: {"event":"done","content":"..."} → 落缓存 + onDone
  //   data: {"event":"unconfigured"}  → onErr("未配置 LLM(服务端)")
  //   data: {"event":"error","message":"..."} → onErr
  async function parseSentence(text, onChunk, onDone, onErr) {
    text = String(text == null ? "" : text).trim();
    if (!text) { if (onErr) onErr(new Error("空文本")); return; }
    const cached = Store.getParse(text);
    if (cached !== undefined) {
      if (onChunk) onChunk(cached);
      if (onDone) onDone(cached);
      return;
    }
    let resp;
    try {
      resp = await fetch("/api/parse-sentence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (e) {
      if (onErr) onErr(new Error("网络错误:" + (e && e.message || e)));
      return;
    }
    if (!resp.ok) {
      if (onErr) onErr(new Error("HTTP " + resp.status));
      return;
    }
    // 读 SSE 流：按 \n\n 分事件，data: 前缀
    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 事件以空行分隔
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const rawEvent = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          // 取 data: 行（可能多行，这里后端只发单行）
          let dataStr = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) {
              dataStr += line.slice(5).replace(/^\s/, "");
            }
          }
          if (!dataStr) continue;
          let obj;
          try { obj = JSON.parse(dataStr); } catch (e) { continue; }
          if (obj.delta && onChunk) onChunk(obj.delta);
          if (obj.event === "done") {
            const content = obj.content || "";
            if (content) Store.setParse(text, content);
            if (onDone) onDone(content);
            return;
          }
          if (obj.event === "unconfigured") {
            if (onErr) onErr(new Error("未配置 LLM(服务端)"));
            return;
          }
          if (obj.event === "error") {
            if (onErr) onErr(new Error(obj.message || "解析失败"));
            return;
          }
        }
      }
      // 流提前结束但没收到 done 事件
      if (onErr) onErr(new Error("流提前结束"));
    } catch (e) {
      if (onErr) onErr(new Error("流读取失败:" + (e && e.message || e)));
    }
  }

  // 段落级解析（Reading Part A 双栏 reader 右栏，6 段主干驱动型）。
  // 流式：onChunk(delta) 多次、onDone(content) 一次。命中 Store 缓存（ew.para.v1 命名空间）瞬返。
  // payload: {year, label, para_idx, text, full_body, items}
  async function analyzeParagraph(payload, onChunk, onDone, onErr) {
    const text = String((payload && payload.text) || "").trim();
    if (!text) { if (onErr) onErr(new Error("空文本")); return; }
    const cacheKey = Store.getParaAnalysisKey
      ? Store.getParaAnalysisKey(payload)
      : ("para:" + (payload.year || "?") + "|" + (payload.label || "") + "|" + payload.para_idx);
    const cached = Store.getParaAnalysis ? Store.getParaAnalysis(cacheKey) : undefined;
    if (cached !== undefined) {
      if (onChunk) onChunk(cached);
      if (onDone) onDone(cached);
      return;
    }
    let resp;
    try {
      resp = await fetch("/api/analyze-paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      if (onErr) onErr(new Error("网络错误:" + (e && e.message || e)));
      return;
    }
    if (!resp.ok) {
      if (onErr) onErr(new Error("HTTP " + resp.status));
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const rawEvent = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let dataStr = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) dataStr += line.slice(5).replace(/^\s/, "");
          }
          if (!dataStr) continue;
          let obj;
          try { obj = JSON.parse(dataStr); } catch (e) { continue; }
          if (obj.delta && onChunk) onChunk(obj.delta);
          if (obj.event === "done") {
            const content = obj.content || "";
            if (content && Store.setParaAnalysis) Store.setParaAnalysis(cacheKey, content);
            if (onDone) onDone(content);
            return;
          }
          if (obj.event === "unconfigured") {
            if (onErr) onErr(new Error("未配置 LLM(服务端)"));
            return;
          }
          if (obj.event === "error") {
            if (onErr) onErr(new Error(obj.message || "段落解析失败"));
            return;
          }
        }
      }
      if (onErr) onErr(new Error("流提前结束"));
    } catch (e) {
      if (onErr) onErr(new Error("流读取失败:" + (e && e.message || e)));
    }
  }

  global.LLM = { isConfigured, fetchModels, translate, parseSentence, analyzeParagraph };
})(window);
