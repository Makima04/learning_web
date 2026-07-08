// store.js — localStorage persistence + settings + daily-counter reset logic
(function (global) {
  "use strict";
  const KEY_CARDS = "ew.cards.v1";   // { <wordIndex>: cardState }
  const KEY_META = "ew.meta.v1";     // { dayKey, newToday, reviewToday, learnToday, doneToday, created }
  const KEY_SET = "ew.set.v1";       // settings
  const KEY_TRANS = "ew.trans.v1";   // translation cache: { <hash>: <zh|Error> }
  const KEY_DATAVER = "ew.dataver.v1"; // 上次保存进度时的词库版本戳
  const DAY = 86400000;
  let _syncing = false;            // 同步进行中的并发锁，避免 saveCard/bumpMeta 与 sync 互相覆盖
  let _dataVersionChanged = false; // 词库版本相对上次进度是否变化

  const DEFAULT_SETTINGS = {
    dailyNew: 20,          // new words per day
    direction: "en2cn",    // en2cn | cn2en | random
    autoSpeak: true,       // speak english when a card is shown
    speakOnWordClick: true,// 点词查义 popover 弹出时是否自动朗读单词
    rate: 1.0,             // TTS rate
    orderSeed: 0x9e3779b9, // for stable per-word pseudo-random order
    groupSize: 20,         // 分组背诵：每组词数（10/20/40）
    // 注意:llm 不再属于用户设置——LLM 设定仅管理员经 /api/llm/* 在服务端配置,
    // 普通用户既不可见也不可改,故不进本地 settings 持久化(避免 key 落 localStorage)。
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
    const saved = loadJSON(KEY_SET, {});
    // 防御:任何历史遗留的 llm 字段都不进入运行时设置(LLM 归管理员/服务端)
    const clean = Object.assign({}, saved);
    delete clean.llm;
    return Object.assign({}, DEFAULT_SETTINGS, clean);
  }
  function saveSettings(s) {
    // 落本地先去掉 llm(即便调用方误带),再后台镜像到服务端(不 await,失败静默)
    const clean = Object.assign({}, s);
    delete clean.llm;
    saveJSON(KEY_SET, clean);
    try {
      if (!_syncing && typeof Api !== "undefined" && Api.isLoggedIn()) {
        Api.putSettings(clean).catch((e) => console.warn("mirror putSettings failed:", e && e.message));
      }
    } catch (e) { /* Api 未加载时忽略 */ }
  }

  // ---- translation store ----
  // 译文来自两层：运行时 localStorage（KEY_TRANS，按需写入/命中）与服务端 DB（经 /api/translate 灌库）。
  // global.TRANS 为可选静态译文文件（window.TRANS）：若未来提供则优先合并，当前未定义、恒为空。
  function getAllTrans() {
    const baked = (global.TRANS && typeof global.TRANS === "object") ? global.TRANS : {};
    return Object.assign({}, baked, loadJSON(KEY_TRANS, {}));
  }
  function getTrans(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return undefined;
    // global.TRANS 当前未使用（恒为空），保留读取无害
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
      if (!_syncing && typeof Api !== "undefined" && Api.isLoggedIn()) {
        Api.putCard(idx, card).catch((e) => console.warn("mirror putCard failed:", e && e.message));
      }
    } catch (e) { /* Api 未加载时忽略 */ }
  }
  function clearAll() {
    localStorage.removeItem(KEY_CARDS);
    localStorage.removeItem(KEY_META);
  }

  // ---- 词库版本守卫：词库重排后把「静默错位」变成「可见提示」 ----
  function currentDataVersion() {
    return (global.WORDS_META && global.WORDS_META.version) || null;
  }
  function syncDataVersion() {
    const cur = currentDataVersion();
    if (!cur) return false;
    const prev = loadJSON(KEY_DATAVER, null);
    _dataVersionChanged = !!(prev && prev !== cur);
    saveJSON(KEY_DATAVER, cur);
    return _dataVersionChanged;
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
    meta.data_version = currentDataVersion();
    saveJSON(KEY_META, meta);
    // 登录后整包推到服务端(量小,每次写都推,简化)
    try {
      if (!_syncing && typeof Api !== "undefined" && Api.isLoggedIn()) {
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
    if (_syncing) return { cards: Object.keys(getAllCards()).length, meta: null };
    _syncing = true;
    try {
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

    // 账号级设置:登录后拉服务端覆盖本地(服务端权威,但仅覆盖已持久化的字段)
    try {
      const rs = await Api.getSettings();
      if (rs && rs.settings && Object.keys(rs.settings).length) {
        const merged = Object.assign({}, getSettings(), rs.settings);
        delete merged.llm;
        saveJSON(KEY_SET, merged);
      }
    } catch (e) { console.warn("getSettings sync failed:", e && e.message); }

    return { cards: Object.keys(getAllCards()).length, meta: metaSummary };
    } finally {
      _syncing = false;
    }
  }

  function exportData() {
    return {
      cards: getAllCards(),
      meta: loadJSON(KEY_META, null),
      settings: getSettings(),
      trans: getAllTrans(),
      exportedAt: Date.now(),
      version: 1,
      dataVersion: currentDataVersion(),
    };
  }
  function importData(blob) {
    if (!blob || typeof blob !== "object") return false;
    if (blob.cards && typeof blob.cards !== "object") return false;
    if (blob.trans && typeof blob.trans !== "object") return false;
    if (blob.meta && typeof blob.meta !== "object") return false;
    if (blob.cards) saveJSON(KEY_CARDS, blob.cards);
    if (blob.settings) {
      const s = Object.assign({}, DEFAULT_SETTINGS, blob.settings);
      delete s.llm; // LLM 不随导入数据迁移,归管理员/服务端
      saveJSON(KEY_SET, s);
    }
    if (blob.meta) saveJSON(KEY_META, blob.meta);
    if (blob.trans) saveJSON(KEY_TRANS, blob.trans);
    return true;
  }

  global.Store = {
    DAY, dayKey, getSettings, saveSettings,
    getAllCards, getCard, saveCard, clearAll,
    getMeta, bumpMeta, exportData, importData,
    getAllTrans, getTrans, setTrans,
    getParaAnalysisKey, getParaAnalysis, setParaAnalysis,
    sync,
    currentDataVersion, syncDataVersion,
    dataVersionChanged: () => _dataVersionChanged,
  };
})(window);
