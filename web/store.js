// store.js — localStorage persistence + settings + daily-counter reset logic
(function (global) {
  "use strict";
  const KEY_CARDS = "ew.cards.v1";   // { <wordIndex>: cardState }
  const KEY_META = "ew.meta.v1";     // { dayKey, newToday, reviewToday, learnToday, doneToday, created }
  const KEY_SET = "ew.set.v1";       // settings
  const KEY_TRANS = "ew.trans.v1";   // translation cache: { <hash>: <zh|Error> }
  const DAY = 86400000;

  const DEFAULT_SETTINGS = {
    dailyNew: 20,          // new words per day
    direction: "en2cn",    // en2cn | cn2en | random
    autoSpeak: true,       // speak english when a card is shown
    speakOnWordClick: true,// 点词查义 popover 弹出时是否自动朗读单词
    rate: 1.0,             // TTS rate
    orderSeed: 0x9e3779b9, // for stable per-word pseudo-random order
    llm: {
      url: "",             // OpenAI-compatible base URL, e.g. https://api.openai.com/v1
      key: "",             // API key
      model: "",           // selected model id
    },
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // YYYY-MM-DD in local time — the "day" boundary for counters.
  function dayKey(ts) {
    ts = ts || Date.now();
    const d = new Date(ts);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getSettings() {
    // deep-merge so the nested `llm` object always has all keys
    const saved = loadJSON(KEY_SET, {});
    const merged = Object.assign({}, DEFAULT_SETTINGS, saved);
    merged.llm = Object.assign({}, DEFAULT_SETTINGS.llm, saved.llm || {});
    return merged;
  }
  function saveSettings(s) { saveJSON(KEY_SET, s); }

  // ---- translation store ----
  // Translations live in two places: a generated static file (window.TRANS,
  // baked by scripts/gen_trans.py — the durable, repo-committed store) and a
  // runtime localStorage map (for ad-hoc/test translations). getTrans prefers
  // the baked file, then falls back to localStorage.
  function getAllTrans() {
    const baked = (global.TRANS && typeof global.TRANS === "object") ? global.TRANS : {};
    return Object.assign({}, baked, loadJSON(KEY_TRANS, {}));
  }
  function getTrans(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return undefined;
    if (global.TRANS && global.TRANS[text]) return global.TRANS[text];
    const all = loadJSON(KEY_TRANS, {});
    return all[text] || undefined;
  }
  function setTrans(text, zh) {
    text = String(text == null ? "" : text).trim();
    const all = loadJSON(KEY_TRANS, {});
    all[text] = zh || "";
    saveJSON(KEY_TRANS, all);
  }

  // ---- 长难句解析缓存 ----
  // 镜像 getTrans/setTrans：by text 缓存解析全文。key 独立 ew.parse.v1，
  // 不与译文混。命中即瞬返（无网络），与 server.parses 表双层缓存。
  const KEY_PARSE = "ew.parse.v1";
  function getParse(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return undefined;
    const all = loadJSON(KEY_PARSE, {});
    return all[text] || undefined;
  }
  function setParse(text, content) {
    text = String(text == null ? "" : text).trim();
    const all = loadJSON(KEY_PARSE, {});
    all[text] = content || "";
    saveJSON(KEY_PARSE, all);
  }

  // 段落解析缓存（Reading Part A 双栏 reader 右栏）。独立命名空间 ew.para.v1，
  // 按 {year|label|para_idx} 复合键定位，与 server.paragraph_analyses 表双层缓存。
  const KEY_PARA = "ew.para.v1";
  function getParaAnalysisKey(payload) {
    const y = (payload && payload.year != null) ? payload.year : "?";
    const l = (payload && payload.label) || "";
    const i = (payload && payload.para_idx != null) ? payload.para_idx : 0;
    return "para:" + y + "|" + l + "|" + i;
  }
  function getParaAnalysis(cacheKey) {
    const all = loadJSON(KEY_PARA, {});
    return all[cacheKey] || undefined;
  }
  function setParaAnalysis(cacheKey, content) {
    const all = loadJSON(KEY_PARA, {});
    all[cacheKey] = content || "";
    saveJSON(KEY_PARA, all);
  }

  // ---- cards ----
  function getAllCards() { return loadJSON(KEY_CARDS, {}); }
  function getCard(idx) {
    const all = getAllCards();
    return all[idx] || null;
  }
  function saveCard(idx, card) {
    const all = getAllCards();
    all[idx] = card;
    saveJSON(KEY_CARDS, all);
    // 登录后在后台镜像写到服务端(不 await,失败静默,不影响 UI)
    try {
      if (typeof Api !== "undefined" && Api.isLoggedIn()) {
        Api.putCard(idx, card).catch((e) => console.warn("mirror putCard failed:", e && e.message));
      }
    } catch (e) { /* Api 未加载时忽略 */ }
  }
  function clearAll() {
    localStorage.removeItem(KEY_CARDS);
    localStorage.removeItem(KEY_META);
  }

  // ---- daily counters ----
  function getMeta() {
    const today = dayKey();
    let meta = loadJSON(KEY_META, null);
    if (!meta || meta.dayKey !== today) {
      // new day → reset the per-day counters
      meta = {
        dayKey: today,
        newToday: 0,
        reviewToday: 0,
        learnToday: 0,
        doneToday: 0,
        created: meta ? meta.created : Date.now(),
      };
      saveJSON(KEY_META, meta);
    }
    return meta;
  }
  function bumpMeta(field, by) {
    const meta = getMeta();
    meta[field] = (meta[field] || 0) + (by || 1);
    saveJSON(KEY_META, meta);
    // 登录后整包推到服务端(量小,每次写都推,简化)
    try {
      if (typeof Api !== "undefined" && Api.isLoggedIn()) {
        Api.putMeta(meta).catch((e) => console.warn("mirror putMeta failed:", e && e.message));
      }
    } catch (e) { /* Api 未加载时忽略 */ }
    return meta[field];
  }

  // ---- 登录后同步:把服务端进度合并到本地 ----
  // 策略:cards——remote 有的覆盖本地(remote 权威),本地有 remote 无的保留(本地新于上次同步);
  //       meta——同 dayKey 才覆盖,不同 dayKey 保留本地当前日。
  // 返回 {cards, meta} 摘要给 UI。
  async function sync() {
    const remote = await Api.getCards();
    const remoteCards = (remote && remote.cards) || {};
    const localCards = getAllCards();
    const remoteKeys = Object.keys(remoteCards);

    if (remoteKeys.length === 0 && Object.keys(localCards).length > 0) {
      // 首登:服务端空,推本地上去
      try { await Api.bulkCards(localCards); } catch (e) { console.warn("bulkCards push failed:", e && e.message); }
    } else if (remoteKeys.length > 0) {
      // 合并:remote 覆盖本地,本地独有保留
      const merged = Object.assign({}, localCards, remoteCards);
      saveJSON(KEY_CARDS, merged);
    }

    let metaSummary = null;
    try {
      // 传本地 dayKey 给服务端：让 meta_get 按客户端当天查，避免跨时区不对称
      const rm = await Api.getMeta(dayKey());
      if (rm && rm.meta) {
        const rmMeta = rm.meta;
        const localMeta = loadJSON(KEY_META, null);
        if (rmMeta.dayKey === (localMeta && localMeta.dayKey)) {
          // 同一天:用 remote 覆盖本地(服务端权威)
          const mergedMeta = Object.assign({}, localMeta, rmMeta);
          saveJSON(KEY_META, mergedMeta);
          metaSummary = mergedMeta;
        }
        // 不同 dayKey:保留本地当前日(本地已按 getMeta 重置)
      }
    } catch (e) { console.warn("getMeta sync failed:", e && e.message); }

    return { cards: Object.keys(getAllCards()).length, meta: metaSummary };
  }

  function exportData() {
    return {
      cards: getAllCards(),
      meta: loadJSON(KEY_META, null),
      settings: getSettings(),
      trans: getAllTrans(),
      exportedAt: Date.now(),
      version: 1,
    };
  }
  function importData(blob) {
    if (!blob || typeof blob !== "object") return false;
    if (blob.cards) saveJSON(KEY_CARDS, blob.cards);
    if (blob.settings) saveJSON(KEY_SET, Object.assign({}, DEFAULT_SETTINGS, blob.settings));
    if (blob.meta) saveJSON(KEY_META, blob.meta);
    if (blob.trans) saveJSON(KEY_TRANS, blob.trans);
    return true;
  }

  global.Store = {
    DAY, dayKey, getSettings, saveSettings,
    getAllCards, getCard, saveCard, clearAll,
    getMeta, bumpMeta, exportData, importData,
    getAllTrans, getTrans, setTrans,
    getParse, setParse,
    getParaAnalysisKey, getParaAnalysis, setParaAnalysis,
    sync,
  };
})(window);
