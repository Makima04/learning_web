// app.js — vocabulary app: dashboard + study session + spaced repetition
(function () {
  "use strict";
  const WORDS = window.WORDS || [];
  const DAY = 86400000;
  const $ = (id) => document.getElementById(id);
  const WORD_BY_INDEX = {};
  WORDS.forEach((w) => { WORD_BY_INDEX[w[0]] = w; });
  // 英文小写 -> entry，用于例句/原文中点词查义（含粗略屈折还原）
  const WORD_BY_EN = {};
  WORDS.forEach((w) => { WORD_BY_EN[w[1].toLowerCase()] = w; });
  function lookupWord(surface) {
    const low = String(surface == null ? "" : surface).toLowerCase();
    if (WORD_BY_EN[low]) return WORD_BY_EN[low];
    const tries = [
      // 复数 / 动词变形
      low.replace(/s$/, ""), low.replace(/es$/, ""),
      low.replace(/ing$/, ""), low.replace(/ed$/, ""),
      low.replace(/ing$/, "e"), low.replace(/ed$/, "e"),
      low.replace(/ies$/, "y"), low.replace(/ied$/, "y"),
      // -ly 副词 → 形容词原形（quickly→quick, bravely→brave, happily→happy）
      low.replace(/ly$/, ""),
      low.replace(/ely$/, "e"),   // bravely→brave（先于下一行）
      low.replace(/ily$/, "y"),   // happily→happy
      // -ness / -ment / -tion / -sion / -ity 等抽象名词 → 形容词原形
      low.replace(/ness$/, ""),
      low.replace(/ment$/, ""),
      low.replace(/tion$/, "te"),  // creation→create
      low.replace(/sion$/, "d"),   // decision→decide
      low.replace(/ity$/, ""),
      // -ful / -less → 名词原形（careful→care, careless→care）
      low.replace(/ful$/, ""),
      low.replace(/less$/, ""),
    ];
    for (const t of tries) if (WORD_BY_EN[t]) return WORD_BY_EN[t];
    return null;
  }

  // ---- tiny seeded RNG (mulberry32) so "random direction" is stable per word ----
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let settings = Store.getSettings();
  let queue = [];        // today's work: [{idx, card, isNew}]
  let qpos = 0;          // pointer into queue
  let currentEntry = null;
  let currentFrontIsCn = false; // tracks which side the English is on for the visible card
  let sessionStats = { again: 0, studied: 0, newDone: 0, reviewDone: 0 };

  // ---- 真题模式状态 ----
  let passageWords = []; // [{idx,...}] 当前篇章待背词
  let passageReader = null; // {title, body, words:[english...]}
  let passageSkipped = 0; // 该篇已背过、跳过的词数
  // 真题记词来源：从「真题记词」进入 passage 背词时记录 {paperIdx, type}，
  // 完成屏的「读原文」按钮据此进篇章选择层、返回按钮回题型层。null 表示非真题记词来源。
  let reciteOrigin = null;
  // studyMode: "daily" | "passage" | "learn" | "review" —— 决定 nextCard 走哪条队列
  // daily: 复习+新词混排（标准 SRS）；passage: 真题篇章词；
  // learn: 仅新词（btn-start「学习新词」）；review: 仅复习+learn 在练卡（btn-review「复习」）
  let studyMode = "daily";

  // ---- 真题英一/英二切换 ----
  // variant: "en1" 英语一 / "en2" 英语二。真题列表 / 真题记词 年份层共用。
  // 默认 en1（兼容旧数据：未标 variant 的 paper 视为 en1）。
  let papersVariant = "en1";

  // ============ TTS ============
  // 不同浏览器对 en-US 的默认 voice 不同：Safari 用 Mac 自带 Samantha（清晰女声），
  // Edge/Chrome 可能落到 Alex（沙哑男声）或 Microsoft 在线声。这里按优先级显式挑一个好的。
  let _ttsVoice = null;
  function pickBestVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    // 优先级：高分质女声优先（Samantha 即 Safari 默认声，跨浏览器最稳）
    const prefer = [
      "Samantha",           // Mac 系统自带，清晰女声（Safari 默认）
      "Google US English",  // Chrome 在线女声
      "Microsoft Aria",     // Edge 在线女声
      "Microsoft Jenny",    // Edge 在线女声
      "Serena", "Zoe", "Susan", "Victoria", // 其他 Mac 女声
    ];
    for (const name of prefer) {
      const v = voices.find((v) => v.name && v.name.includes(name) && v.lang && v.lang.startsWith("en"));
      if (v) return v;
    }
    // 兜底：第一个 en 声
    const en = voices.filter((v) => v.lang && v.lang.startsWith("en"));
    return en[0] || null;
  }
  function speak(text, opts) {
    if (!("speechSynthesis" in window)) return;
    opts = opts || {};
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = settings.rate || 1.0; u.pitch = 1;
      const v = _ttsVoice || pickBestVoice();
      if (v) u.voice = v;
      if (opts.onend) u.onend = opts.onend;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  // Chromium 的 getVoices() 是异步加载的，首次调用常返回空，需监听 voiceschanged 重新挑。
  if ("speechSynthesis" in window) {
    _ttsVoice = pickBestVoice();
    speechSynthesis.onvoiceschanged = () => { _ttsVoice = pickBestVoice(); };
  }
  function speakEntry(entry, opts) {
    if (!entry) return;
    opts = opts || {};
    const en = entry[1];
    const example = opts.example || null;
    speak(en, {
      onend() {
        if (!example) return;
        // 单词读完 → 停 400ms → 读例句
        setTimeout(() => speak(example), 400);
      },
    });
  }

  // ============ queue building ============
  // Build today's queue: due reviews first, learn 卡（quiz>0 待练习）次之，最后新词（受 dailyNew 限）。
  // opts.mode 控制装哪些段：
  //   "learn"   —— 只装新词（btn-start「学习新词」）
  //   "review"  —— 只装到期 review + learn 在练卡，不引入新词（btn-review「复习」）
  //   默认      —— 复习 + 新词混排（标准 SRS，daily）
  function buildQueue(opts) {
    const mode = (opts && opts.mode) || "daily";
    const reviewOnly = mode === "review";
    const newOnly = mode === "learn";
    const now = Date.now();
    const all = Store.getAllCards();
    const due = [];
    // learn 卡不论 quiz 是否 >0 都视为待办（quiz=0 但仍在 learn 的也需练习，与 snapshot() 的 due 计数一致）
    for (const idx in all) {
      const c = all[idx];
      if (!c) continue;
      if (c.state === "review" && c.due <= now) due.push(parseInt(idx, 10));
      else if (c.state === "learn") due.push(parseInt(idx, 10));
    }
    due.sort((a, b) => (all[a].due || 0) - (all[b].due || 0));

    queue = [];
    if (!newOnly) {
      due.forEach((idx) => queue.push({ idx, card: Store.getCard(idx), isNew: false }));
    }

    // 新词：无卡片的词，按 WORDS 顺序，受 dailyNew - newToday 限。
    // 注意 learn 卡已在 all 里，不会被 !all[w[0]] 抽成新词，避免重复。
    if (!reviewOnly) {
      const meta = Store.getMeta();
      const newRemaining = Math.max(0, settings.dailyNew - (meta.newToday || 0));
      const newWords = [];
      for (const w of WORDS) {
        if (newWords.length >= newRemaining) break;
        if (!all[w[0]]) newWords.push(w[0]);
      }
      newWords.forEach((idx) => queue.push({ idx, card: SRS.newCard(), isNew: true }));
    }

    qpos = 0;
  }

  // how many due/new remain right now (for dashboard)
  function snapshot() {
    const now = Date.now();
    const all = Store.getAllCards();
    let due = 0, learn = 0, learned = 0, total = WORDS.length;
    for (const idx in all) {
      const c = all[idx];
      if (!c) continue;
      if (c.state === "review") { learned++; if (c.due <= now) due++; }
      else if (c.state === "learn") { learn++; due++; }
    }
    const meta = Store.getMeta();
    const newToday = meta.newToday || 0;
    const newAvailable = Math.max(0, settings.dailyNew - newToday);
    // new words not yet started:
    const unseen = total - learned - learn;
    return { due, learn, learned, total, newAvailable, unseen, newToday, reviewToday: meta.reviewToday || 0, doneToday: meta.doneToday || 0 };
  }

  // ============ dashboard render ============
  function renderDashboard() {
    const s = snapshot();
    const todayGoal = s.due + s.newAvailable;
    const done = s.doneToday;
    const pct = todayGoal > 0 ? Math.min(1, done / todayGoal) : 0;

    $("ring-done").textContent = done;
    $("ring-total").textContent = "/ " + todayGoal + " 今日";
    const C = 2 * Math.PI * 52; // circumference
    $("ring-fg").style.strokeDasharray = C;
    $("ring-fg").style.strokeDashoffset = C * (1 - pct);

    // 顶部 4 个 stat 卡
    if ($("stat-done")) $("stat-done").textContent = done;
    $("stat-new").textContent = s.newAvailable;
    $("stat-review").textContent = s.due;
    $("stat-learned").textContent = s.learned;

    // hero 用户名
    if ($("hero-user")) {
      let u = "背词人";
      try { if (window.Api && Api.isLoggedIn()) u = (Api.getUser() || {}).username || u; } catch (e) {}
      $("hero-user").textContent = u;
    }

    // 词库掌握进度条（3 段：已掌握 / 学习中 / 未学）
    const tot = s.total || 1;
    const setSeg = (sel, val, el) => {
      const node = document.querySelector(sel);
      if (node) node.style.width = (val / tot * 100) + "%";
      if (el) $(el).textContent = val;
    };
    setSeg(".thick-segment.mastered", s.learned, "m-mastered");
    setSeg(".thick-segment.learning", s.learn, "m-learning");
    setSeg(".thick-segment.none", s.unseen, "m-none");

    renderForecast();
    // start button label：「学习新词」
    const startBtn = $("btn-start");
    if (s.newAvailable === 0) startBtn.textContent = "今日新词已学完 🎉";
    else startBtn.innerHTML = `学习新词 <small>${s.newAvailable} 个待学</small>`;

    // review button label：按到期数显示或空状态
    const reviewBtn = $("btn-review");
    if (reviewBtn) {
      if (s.due === 0) reviewBtn.textContent = "暂无待复习";
      else reviewBtn.innerHTML = `🔁 复习 <small>${s.due} 张到期</small>`;
    }
  }

  // 7-day forecast: count cards whose due falls on each of the next 7 days
  function renderForecast() {
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const all = Store.getAllCards();
    const buckets = new Array(7).fill(0);
    for (const idx in all) {
      const c = all[idx];
      if (!c || c.state !== "review") continue;
      const dd = Math.floor((c.due - startOfDay.getTime()) / DAY);
      if (dd >= 0 && dd < 7) buckets[dd]++;
    }
    const max = Math.max(1, ...buckets);
    const wrap = $("forecast");
    const labels = ["今", "明", "+2", "+3", "+4", "+5", "+6"];
    wrap.innerHTML = "";
    buckets.forEach((n, i) => {
      const col = document.createElement("div");
      col.className = "fcol";
      const bar = document.createElement("div");
      bar.className = "fbar" + (i === 0 ? " today" : "");
      bar.style.height = (n / max * 100) + "%";
      const cnt = document.createElement("div");
      cnt.className = "fcount"; cnt.textContent = n;
      const day = document.createElement("div");
      day.className = "fday"; day.textContent = labels[i];
      col.appendChild(cnt); col.appendChild(bar); col.appendChild(day);
      wrap.appendChild(col);
    });
  }

  // ============ study flow ============
  function startSession() {
    studyMode = "learn";
    buildQueue({ mode: "learn" });
    if (queue.length === 0) { showDone(true); return; }
    sessionStats = { again: 0, studied: 0, newDone: 0, reviewDone: 0 };
    show("study");
    nextCard();
  }

  // 「复习」：仅装到期 review + learn 在练卡，不引入新词。
  // 复用 study 屏与 rate 流程；rate 里 isNew 全为 false，故一律计 reviewToday、不消耗 dailyNew 预算。
  function startReviewSession() {
    studyMode = "review";
    buildQueue({ mode: "review" });
    if (queue.length === 0) { showDone(true); return; }
    sessionStats = { again: 0, studied: 0, newDone: 0, reviewDone: 0 };
    show("study");
    nextCard();
  }

  // ---- 真题模式：篇章列表 → 该篇词汇队列 ----
  function renderPapersList() {
    const wrap = $("papers-list");
    wrap.innerHTML = "";
    const papers = (window.PAPERS || []).filter((p) => (p.variant || "en1") === papersVariant);
    if (papers.length === 0) {
      wrap.innerHTML = '<div class="hint">暂无真题数据。请运行 scripts/parse_paper.py + match_vocab.py 生成。</div>';
      return;
    }
    // 去重 by year（同一份可能出现多次）
    const seen = {};
    papers.forEach((p, i) => {
      const key = p.year || ("来源" + i);
      if (seen[key] === undefined) seen[key] = i;
    });
    Object.keys(seen).sort((a, b) => parseInt(String(b).replace(/\D/g, "") || 0, 10) - parseInt(String(a).replace(/\D/g, "") || 0, 10)).forEach((key) => {
      const p = papers[seen[key]];
      const totalWords = p.sections.reduce((s, sec) => s + sec.passages.reduce((t, ps) => t + ps.words.length, 0), 0);
      const card = document.createElement("div");
      card.className = "paper-card";
      card.innerHTML = `<div class="pc-year">${p.year || "?"}</div>
        <div class="pc-body">
          <div class="pc-title">${p.year ? p.year + " 年考研英语" + (papersVariant === "en2" ? "二" : "一") + "真题" : p.source}</div>
          <div class="pc-sub">${p.sections.length} 个题型 · 共 ${totalWords} 个红宝书词汇</div>
        </div><div class="pc-arrow">›</div>`;
      card.addEventListener("click", () => openPaper(seen[key]));
      wrap.appendChild(card);
    });
  }

  function openPaper(idx) {
    const p = (window.PAPERS || [])[idx];
    if (!p) return;
    currentPaperIdx = idx;
    const variantLabel = (p.variant || "en1") === "en2" ? "英语二" : "英语一";
    $("paper-title").textContent = (p.year ? p.year + " 年" : "真题") + " · " + variantLabel + " · 篇章";
    const wrap = $("passages-list");
    wrap.innerHTML = "";
    p.sections.forEach((sec, si) => {
      sec.passages.forEach((psg, pi) => {
        // 该篇命中词里已进入复习队列(review)的 = 已背熟（在日常背词里毕业）
        const learned = psg.words.filter((w) => {
          const c = Store.getCard(w.idx);
          return !!(c && c.state === "review");
        }).length;
        const card = document.createElement("div");
        card.className = "psg-card";
        const subHTML = `命中 <b>${psg.words.length}</b> 词 · 已背 <b>${learned}</b> · ${psg.itemCount || 0} 题 · ${psg.body.length} 字`;
        card.innerHTML = `<span class="ps-type">${TYPE_LABEL[sec.type] || sec.type}</span>
          <div class="ps-body">
            <div class="ps-title">${psg.label}</div>
            <div class="ps-sub">${subHTML}</div>
          </div>
          <div class="pc-arrow">›</div>`;
        card.addEventListener("click", () => {
          setPassageReader(idx, si, pi);
          openReader();
        });
        wrap.appendChild(card);
      });
    });
    show("paper");
  }

  let currentPaperIdx = -1;

  // 题型中文名（openPaper 与真题记词共用）
  const TYPE_LABEL = {
    use_of_english: "完形", reading_a: "阅读A", reading_b: "新题型", translation: "翻译", writing: "写作",
  };

  // ============ 真题记词：年份 → 题型 → 背词 ============
  // 与日常背词共用 cards 表（主键 user_id,word_idx）与 SRS 状态机；studyMode="passage"
  // 复用 renderCard/nextCard/getExampleFor 既有的 passage 分支。
  // 重复词（同一 idx 在多篇章出现）去重，保留首例句。

  // 层 1：年份列表（复用 renderPapersList 的去重排序逻辑）
  function renderRecitePapers() {
    const wrap = $("recite-papers-list");
    wrap.innerHTML = "";
    const papers = (window.PAPERS || []).filter((p) => (p.variant || "en1") === papersVariant);
    if (papers.length === 0) {
      wrap.innerHTML = '<div class="hint">暂无真题数据。请运行 scripts/parse_paper.py + match_vocab.py 生成。</div>';
      return;
    }
    const seen = {};
    papers.forEach((p, i) => {
      const key = p.year || ("来源" + i);
      if (seen[key] === undefined) seen[key] = i;
    });
    Object.keys(seen).sort((a, b) => parseInt(String(b).replace(/\D/g, "") || 0, 10) - parseInt(String(a).replace(/\D/g, "") || 0, 10)).forEach((key) => {
      const p = papers[seen[key]];
      // 该年份所有 passage 的命中词按 idx 去重后的总数
      const uniq = new Set();
      p.sections.forEach((sec) => sec.passages.forEach((psg) => psg.words.forEach((w) => uniq.add(w.idx))));
      const card = document.createElement("div");
      card.className = "paper-card";
      card.innerHTML = `<div class="pc-year">${p.year || "?"}</div>
        <div class="pc-body">
          <div class="pc-title">${p.year ? p.year + " 年考研英语" + (papersVariant === "en2" ? "二" : "一") + "真题" : p.source}</div>
          <div class="pc-sub">${p.sections.length} 个题型 · 共 ${uniq.size} 个红宝书词汇</div>
        </div><div class="pc-arrow">›</div>`;
      card.addEventListener("click", () => renderReciteSections(seen[key]));
      wrap.appendChild(card);
    });
    // 切到年份层
    showReciteLayer("years");
  }

  // 层 2：题型/篇章列表。每个 passage 一张卡（阅读A 铺平成 Text 1/2/3/4，写作铺平成 Part A/B）。
  // 同 type 仅当多篇时，标题才带 label 后缀（「阅读A · Text 1」）；单篇题型只显示类型名。
  // 同篇内按 idx 去重保留首 5 例句；跨篇不去重（共用记忆曲线，背完一篇的词在下一篇会自动跳过）。
  function renderReciteSections(paperIdx) {
    const p = (window.PAPERS || [])[paperIdx];
    if (!p) return;
    currentPaperIdx = paperIdx;
    const variantLabel = (p.variant || "en1") === "en2" ? "英语二" : "英语一";
    $("recite-sec-title").textContent = (p.year ? p.year + " 年" : "真题") + " · " + variantLabel + " · 题型";
    const wrap = $("recite-sections-list");
    wrap.innerHTML = "";
    // 先统计每个 type 的篇数，决定标题是否带 label 后缀
    const typeCount = new Map();
    p.sections.forEach((sec) => {
      if (!sec || !sec.passages) return;
      typeCount.set(sec.type, (typeCount.get(sec.type) || 0) + sec.passages.length);
    });
    let any = false;
    p.sections.forEach((sec) => {
      if (!sec || !sec.passages) return;
      const typeLabel = TYPE_LABEL[sec.type] || sec.type;
      const multi = (typeCount.get(sec.type) || 0) > 1;
      sec.passages.forEach((psg) => {
        any = true;
        // 同篇内按 idx 去重，保留首 5 例句
        const wordMap = new Map();
        (psg.words || []).forEach((w) => {
          if (!wordMap.has(w.idx)) {
            wordMap.set(w.idx, {
              idx: w.idx, english: w.english, senses: w.senses,
              sentences: (w.sentences || []).slice(0, 5),
            });
          }
        });
        const words = Array.from(wordMap.values());
        const learned = words.filter((w) => {
          const c = Store.getCard(w.idx);
          return !!(c && c.state === "review");
        }).length;
        const totalItems = psg.itemCount || 0;
        const titleText = multi ? `${typeLabel} · ${psg.label}` : typeLabel;
        const card = document.createElement("div");
        card.className = "recite-section-card";
        const subHTML = `命中 <b>${words.length}</b> 词 · 已背 <b>${learned}</b> · ${totalItems} 题 · ${psg.body.length} 字`;
        card.innerHTML = `
          <div class="recite-sec-head">
            <span class="ps-type">${typeLabel}</span>
            <div class="recite-sec-body">
              <div class="recite-sec-title">${titleText}</div>
              <div class="recite-sec-sub">${subHTML}</div>
            </div>
            <div class="pc-arrow">›</div>
          </div>`;
        card.addEventListener("click", () => startReciteStudy(paperIdx, sec.type, words));
        wrap.appendChild(card);
      });
    });
    if (!any) {
      wrap.innerHTML = '<div class="hint">该年份无可用题型。</div>';
    }
    showReciteLayer("sections");
  }

  // 切换真题记词屏的两层
  function showReciteLayer(layer) {
    $("recite-layer-years").hidden = layer !== "years";
    $("recite-layer-sections").hidden = layer !== "sections";
    // 切层时同步显示/隐藏英一/英二切换条：只在年份层显示
    const bar = $("recite-variant-bar");
    if (bar) bar.style.display = layer === "years" ? "" : "none";
  }

  // 英一/英二切换：点切换条按钮 → 切 papersVariant、重渲染当前屏的年份列表
  function setPapersVariant(v) {
    if (v !== "en1" && v !== "en2") return;
    papersVariant = v;
    // 同步两处切换条的 active 态（用户可能在任一屏切换）
    document.querySelectorAll(".variant-bar .variant-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.variant === v);
    });
    // 重渲染当前可见屏的年份列表
    if (!($("screen-papers").classList.contains("active"))) {
      // 真题列表屏不可见时，若在真题记词屏则刷新记词年份层
      if ($("screen-papers-recite").classList.contains("active")) {
        showReciteLayer("years");
        renderRecitePapers();
      }
      return;
    }
    renderPapersList();
  }

  // 核心：装填真题记词队列，进 passage 背词。
  // words: 去重后的 [{idx,english,senses,sentences}]（来自 renderReciteSections）
  function startReciteStudy(paperIdx, type, words) {
    if (!words || words.length === 0) {
      // 无命中词：直接给个空完成屏
      studyMode = "passage";
      reciteOrigin = { paperIdx, type };
      passageSkipped = 0;
      queue = []; qpos = 0;
      sessionStats = { again: 0, studied: 0, newDone: 0, reviewDone: 0 };
      showDone(true);
      return;
    }
    // 装填队列：已毕业（state=review）的跳过并计 passageSkipped
    passageSkipped = 0;
    queue = [];
    words.forEach((w) => {
      const existing = Store.getCard(w.idx);
      if (existing && existing.state === "review") {
        passageSkipped++;
        return;
      }
      const card = existing || SRS.newCard();
      // entry：passage 模式专用词条。形如 window.WORDS 条目 [idx, english, senses]，
      // 再挂 .sentences 供 getExampleFor 优先取（passage 分支用 entry[1]/entry[2] 数组下标）。
      const entry = [w.idx, w.english, w.senses];
      entry.sentences = w.sentences || [];
      queue.push({ idx: w.idx, card, isNew: !existing, entry });
    });
    reciteOrigin = { paperIdx, type };
    // passageReader 仅作兜底（reader 不再从真题记词进入，但 passage 模式渲染仍可能引用）
    passageReader = null;
    studyMode = "passage";
    qpos = 0;
    sessionStats = { again: 0, studied: 0, newDone: 0, reviewDone: 0 };
    if (queue.length === 0) {
      // 全部已背熟：直接完成屏
      showDone(true);
      return;
    }
    show("passage");
    nextCard();
  }

// 把 passageReader 装填好（标题/正文/词/items/年份），openReader 用。
  function setPassageReader(paperIdx, secIdx, psgIdx) {
    const p = (window.PAPERS || [])[paperIdx];
    const psg = p.sections[secIdx].passages[psgIdx];
    passageReader = {
      title: (p.year ? p.year + " 年 " : "") + (psg.label || ""),
      body: psg.body,
      words: psg.words.map((w) => w.english),
      year: p.year,
      label: psg.label,
      items: psg.items || [],
      wordsFull: psg.words,
    };
  }

  function nextCard() {
    clearHintTimer();
    // 切词时清空解析侧栏/抽屉，避免上一词的解析残留
    hideParseSide();
    closeParseDrawer();
    if (qpos >= queue.length) { showDone(false); return; }
    const item = queue[qpos];
    // daily 模式用 WORD_BY_INDEX；passage 模式用 item.entry
    currentEntry = studyMode === "passage" ? item.entry : WORD_BY_INDEX[item.idx];
    renderCard(item, false);
  }

  // ---- 例句反向索引：word_idx -> [sentence,...]，从 window.PAPERS 建 ----
  let EXAMPLES_BY_IDX = null;
  function buildExampleIndex() {
    EXAMPLES_BY_IDX = {};
    const papers = window.PAPERS || [];
    for (const p of papers) {
      for (const s of p.sections || []) {
        for (const psg of s.passages || []) {
          for (const w of psg.words || []) {
            if (!w.sentences || w.sentences.length === 0) continue;
            const arr = EXAMPLES_BY_IDX[w.idx] || (EXAMPLES_BY_IDX[w.idx] = []);
            for (const sent of w.sentences) {
              if (sent && sent.trim()) arr.push(sent);
            }
          }
        }
      }
    }
  }
  function getExample(idx) {
    if (!EXAMPLES_BY_IDX) buildExampleIndex();
    const arr = EXAMPLES_BY_IDX[idx];
    return arr && arr.length ? arr[0] : null;
  }
  // 取当前卡例句：passage 优先 entry.sentences[0]，无则 fallback getExample(idx)
  function getExampleFor(item) {
    const entry = currentEntry || WORD_BY_INDEX[item.idx];
    if (studyMode === "passage" && entry && entry.sentences && entry.sentences[0]) return entry.sentences[0];
    return getExample(item.idx);
  }

  // ---- UI 子状态（会话内，不持久化）----
  // uiPhase: assess-front | assess-full | quiz1 | quiz2-front | quiz2-back | quiz3-front | quiz3-back | review-front | review-back
  let uiPhase = "front";
  let assessChoice = null;      // assess 阶段最后选的 q（good/hard/again）
  let quizChoices = [];         // quiz=1 的 4 个选项 [{cn, correct}]
  let quizLocked = false;       // quiz=1 答题后短暂锁，防止重复点

  // ---- 3 秒未操作自动浮现例句（无翻译）作回忆提示 ----
  // 仅 assess-front / review-front 启用：用户若 3s 内未点按钮/翻面/按键，
  // 在卡片正面底部追加真题例句（不含翻译按钮），按钮依旧可点。
  let hintTimer = null;
  function clearHintTimer() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  }
  function armHintTimer(item) {
    clearHintTimer();
    const front = cardArea().querySelector(".flip-front");
    if (!front) return;
    if (front.querySelector(".c-example")) return; // 已有例句则不提示
    hintTimer = setTimeout(() => {
      hintTimer = null;
      // 仍在正面评估/复习阶段、且屏未切走，才提示
      if (uiPhase !== "assess-front" && uiPhase !== "review-front") return;
      const inStudy = $("screen-study").classList.contains("active") ||
                      $("screen-passage").classList.contains("active");
      if (!inStudy) return;
      const ex = getExampleFor(item);
      if (!ex) return;
      const entry = currentEntry || WORD_BY_INDEX[item.idx];
      const block = document.createElement("div");
      block.className = "c-example hint";
      block.innerHTML = `<div class="c-example-label">真题例句 · 回忆提示</div>
        <div class="c-example-text">${highlightTarget(ex, entry[1])}</div>`;
      front.appendChild(block);
      wireWordClicks(block);
      rafFit();
    }, 3000);
  }

  function cardArea() {
    const targetScreen = studyMode === "passage" ? "passage" : "study";
    return document.querySelector(`#screen-${targetScreen} #card-area`) || $("card-area");
  }

  // ============ 卡片高度自适应 ============
  // 3D 翻转两面都 absolute，inner 仅靠 min-height:340px，内容超高就在 face 内滚，
  // 导致单词贴顶、译文贴底。这里在每次 render/flip 后量当前可见面内容高，
  // 设到 .flip-inner.style.height，让卡片整体撑开。
  let _resizeTimer = null;
  function fitCardHeight() {
    const area = cardArea();
    if (!area) return;
    const inner = area.querySelector(".flip-inner");
    if (!inner) return; // 非 card 屏幕（done/dashboard 等）直接早返回，避免抛错
    // 判断当前可见面：flipped → back，否则 front
    const isFlipped = inner.classList.contains("flipped");
    const face = isFlipped
      ? inner.querySelector(".flip-back")
      : (inner.querySelector(".flip-front") || inner.querySelector(".flip-face"));
    if (!face) return;
    // absolute 元素 scrollHeight 通常等于内容高（含 padding）。
    // 临时取消 overflow:auto 测量更稳妥：先记原值，量完恢复。
    const prevOverflow = face.style.overflowY;
    face.style.overflowY = "visible";
    // scrollHeight 在 overflow:visible 时也返回内容总高（含 padding）
    const measured = face.scrollHeight;
    face.style.overflowY = prevOverflow;
    // 最小舒适高度：桌面 380，移动 ≤560px 用 320
    const minComfort = window.innerWidth < 560 ? 320 : 380;
    const target = Math.max(minComfort, measured);
    inner.style.height = target + "px";
  }
  function rafFit() { requestAnimationFrame(fitCardHeight); }
  // resize debounce 150ms 重新 fit
  window.addEventListener("resize", () => {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(fitCardHeight, 150);
  });
  // 当前屏的 rating / btn-flip 容器（study 与 passage 各有一套，避免 id 冲突）
  function ratingEl() {
    const targetScreen = studyMode === "passage" ? "passage" : "study";
    return document.querySelector(`#screen-${targetScreen} .rating`) || $("rating-study") || $("rating");
  }
  function flipBtn() {
    const targetScreen = studyMode === "passage" ? "passage" : "study";
    return document.querySelector(`#screen-${targetScreen} .primary.big`) || $("btn-flip-study");
  }

  // 在例句里把目标单词（及屈折 -s/-es/-ing/-ed）加粗+变色；同时让所有词可点查
  function highlightTarget(text, english) {
    if (!text || !english) return esc(text || "");
    const low = String(english).toLowerCase();
    return String(text).replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
      const ml = m.toLowerCase();
      // 目标词及其变形都算命中（consciously→conscious 也高亮）
      const isTarget = ml === low ||
        ml.replace(/s$/, "") === low || ml.replace(/es$/, "") === low ||
        ml.replace(/ing$/, "") === low || ml.replace(/ed$/, "") === low ||
        ml.replace(/ly$/, "") === low || ml.replace(/ely$/, "e") === low ||
        ml.replace(/ily$/, "y") === low ||
        ml.replace(/ness$/, "") === low || ml.replace(/ment$/, "") === low ||
        ml.replace(/tion$/, "te") === low || ml.replace(/sion$/, "d") === low ||
        ml.replace(/ity$/, "") === low ||
        ml.replace(/ful$/, "") === low || ml.replace(/less$/, "") === low;
      const e = esc(m);
      if (isTarget) return `<strong class="c-target c-word" data-w="${m}">${e}</strong>`;
      // 其它词：词库收录则可点查，否则保持纯文本
      return lookupWord(ml) ? `<span class="c-word" data-w="${m}">${e}</span>` : e;
    });
  }

  // 4选1 干扰项：从 WORDS 随机抽 n 个 idx≠当前的释义 cn
  function pickDistractors(correctIdx, n) {
    const pool = WORDS.filter((w) => w[0] !== correctIdx);
    const picked = [];
    const used = new Set();
    while (picked.length < n && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      const w = pool.splice(i, 1)[0];
      const cn = w[2] && w[2][0] ? w[2][0][1] : null;
      if (!cn || used.has(cn)) continue;
      used.add(cn);
      picked.push(cn);
    }
    return picked;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 动态填充底部按钮区（替换原固定 4 按钮）
  function setRatingButtons(btns, extraClass) {
    const r = ratingEl();
    r.className = "rating" + (extraClass ? " " + extraClass : "");
    r.hidden = btns.length === 0;
    r.innerHTML = btns.map((b) => {
      const iSpan = b.i ? `<span class="rate-i" id="i-${esc(b.q)}">—</span>` : "";
      return `<button data-q="${esc(b.q || "")}" data-action="${esc(b.action || "")}" class="rate rate-${esc(b.q || "")}">
        <span class="rate-k">${esc(b.k)}</span><span class="rate-l">${esc(b.l)}</span>${iSpan}
      </button>`;
    }).join("");
    r.querySelectorAll(".rate").forEach((b) => {
      b.addEventListener("click", () => {
        const action = b.dataset.action;
        const q = b.dataset.q;
        if (action === "next") assessFullNext();
        else if (action === "mistake") assessFullMistake();
        else if (q) handleRate(q);
      });
    });
  }

  function sensesHTMLOf(entry) {
    const senses = entry[2];
    return senses.map((s) =>
      `<div class="c-sense-row"><span class="pos">${esc(s[0])}</span><span class="cn">${esc(s[1])}</span></div>`
    ).join("");
  }
  function exampleBlockHTML(entry, example, withTrans) {
    if (!example) return "";
    const buttons = withTrans
      ? `<div class="c-trans"><button class="c-trans-btn" data-en="${esc(example)}">查看例句翻译</button><button class="c-parse-btn" data-en="${esc(example)}">解析长难句</button></div>`
      : "";
    return `<div class="c-example"><div class="c-example-label">真题例句</div>
      <div class="c-example-text">${highlightTarget(example, entry[1])}</div>${buttons}</div>`;
  }

  // ============ 渲染分发 ============
  function renderCard(item, flipped) {
    currentEntry = studyMode === "passage" ? item.entry : WORD_BY_INDEX[item.idx];
    const c = item.card;
    if (c.state === "new") {
      renderAssess(item);
    } else if (c.state === "learn") {
      renderLearn(item, flipped);
    } else { // review
      renderReview(item, flipped);
    }
    // study 与 passage 各有一套 progress-fill/text，都更新
    const pct = (qpos / queue.length * 100) + "%";
    const lbl = (qpos + 1) + " / " + queue.length;
    document.querySelectorAll("#progress-fill").forEach((el) => (el.style.width = pct));
    document.querySelectorAll("#progress-text").forEach((el) => (el.textContent = lbl));
    // passage 模式：显示「读原文 →」入口，让用户随时跳出背词、进 reader 双栏
    if (studyMode === "passage") $("btn-read").hidden = false;
  }

  // ---- 阶段0 assess（新词 state=new）----
  // 正面直接显示单词 + 3 按钮（认识/模糊/忘记），点按钮即提交评分、进全卡。
  // 不再走「点卡/空格翻面再评分」的中间步。详见 docs/UI设计.md。
  function renderAssess(item) {
    const entry = currentEntry;
    assessChoice = null;
    uiPhase = "assess-front";
    const frontHTML = `<div class="c-en">${esc(entry[1])}</div>`;
    const area = cardArea();
    area.innerHTML = `<div class="flip-card"><div class="flip-inner"><div class="flip-face flip-front assess-front">
      <div class="c-type">新词 · 评估</div>
      <button class="c-speak" title="发音">🔊</button>
      ${frontHTML}
    </div></div></div>`;
    setRatingButtons([
      { k: "1", l: "认识", q: "good" },
      { k: "2", l: "模糊", q: "hard" },
      { k: "3", l: "忘记", q: "again" },
    ], "rating-3");
    flipBtn().hidden = true;
    area.querySelectorAll(".c-speak").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry); })
    );
    if (settings.autoSpeak) speakEntry(entry);
    rafFit();
    armHintTimer(item);
  }

  // assess 按钮提交：answer→saveCard→bumpMeta→切全卡视图（不 nextCard）
  function assessSubmit(q) {
    clearHintTimer();
    const item = queue[qpos];
    const wasNew = item.isNew;
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    Store.saveCard(item.idx, res.card);
    sessionStats.studied++;
    if (wasNew) {
      Store.bumpMeta("newToday", 1);
      Store.bumpMeta("doneToday", 1);
      sessionStats.newDone++;
    }
    assessChoice = q;
    renderAssessFull(item, q);
  }

  function renderAssessFull(item, q) {
    const entry = currentEntry;
    const example = getExampleFor(item);
    const sensesHTML = sensesHTMLOf(entry);
    const exampleHTML = exampleBlockHTML(entry, example, true);
    const noteMap = {
      good: "已标记「认识」→ 进入复习队列",
      hard: "已标记「模糊」→ 进入 3 次练习",
      again: "已标记「忘记」→ 进入 3 次练习",
    };
    const area = cardArea();
    area.innerHTML = `<div class="flip-card"><div class="flip-inner flipped"><div class="flip-face flip-back">
      <div class="c-type">${esc(noteMap[q] || "")}</div>
      <button class="c-speak" title="发音">🔊</button>
      <div class="assess-full">
        <div class="c-en">${esc(entry[1])}</div>
        <div class="c-senses">${sensesHTML}</div>
        ${exampleHTML}
      </div>
    </div></div></div>`;
    uiPhase = "assess-full";
    // good/hard → 下一词 + 记错了（2 按钮）；again（忘记）→ 仅下一词（1 按钮）
    if (q === "again") {
      setRatingButtons([
        { k: "1", l: "下一词", action: "next" },
      ], "rating-1");
    } else {
      setRatingButtons([
        { k: "1", l: "下一词", action: "next" },
        { k: "2", l: "记错了", action: "mistake" },
      ], "rating-2");
    }
    flipBtn().hidden = true;
    wireTransButtons();
    wireParseButtons();
    area.querySelectorAll(".c-speak").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
    );
    if (settings.autoSpeak) speakEntry(entry, { example });
    rafFit();
  }

  // 全卡「下一词」：若进 learn 则 push 队尾继续练习，然后 qpos++ nextCard
  function assessFullNext() {
    const item = queue[qpos];
    if (item.card.state === "learn") {
      item.isNew = false;
      queue.push({ idx: item.idx, card: item.card, isNew: false, entry: item.entry });
    }
    qpos++;
    nextCard();
  }
  // 全卡「记错了」：若刚才 assess 不是不认识，覆盖成 again（进 learn quiz=1），push 队尾
  function assessFullMistake() {
    const item = queue[qpos];
    if (assessChoice !== "again") {
      const res = SRS.answer(item.card, "again", Date.now());
      item.card = res.card;
      Store.saveCard(item.idx, res.card);
    }
    if (item.card.state === "learn") {
      item.isNew = false;
      queue.push({ idx: item.idx, card: item.card, isNew: false, entry: item.entry });
    }
    qpos++;
    nextCard();
  }

  // ---- 阶段1/2/3 练习（state=learn）----
  function renderLearn(item, flipped) {
    const quiz = item.card.quiz || 0;
    if (quiz === 1) renderLearnQuiz1(item);
    else if (quiz === 2) renderLearnQuiz2(item, flipped);
    else if (quiz === 3) renderLearnQuiz3(item, flipped);
    else {
      // 异常兜底：quiz=0 但还在 learn，按 quiz1 处理
      renderLearnQuiz1(item);
    }
  }

  // quiz=1：4选1
  function renderLearnQuiz1(item) {
    const entry = currentEntry;
    const example = getExampleFor(item);
    const correctCn = entry[2] && entry[2][0] ? entry[2][0][1] : "";
    const distractors = pickDistractors(item.idx, 3);
    const choices = shuffle([
      { cn: correctCn, correct: true },
      ...distractors.map((cn) => ({ cn, correct: false })),
    ]);
    quizChoices = choices;
    quizLocked = false;
    const frontHTML = example
      ? `<div class="c-example assess-front"><div class="c-example-label">练习 1 · 选出加粗词的含义</div>
          <div class="c-example-text">${highlightTarget(example, entry[1])}</div></div>`
      : `<div class="c-en">${esc(entry[1])}</div>`;
    const area = cardArea();
    area.innerHTML = `<div class="flip-card"><div class="flip-inner"><div class="flip-face flip-front">
      <div class="c-type">练习 1 · 选释义</div>
      <button class="c-speak" title="发音">🔊</button>
      ${frontHTML}
      <div class="quiz-choice" id="quiz-choice">
        ${choices.map((c, i) => `<button data-i="${i}"><span class="qc-k">${i + 1}</span>${esc(c.cn)}</button>`).join("")}
      </div>
    </div></div></div>`;
    uiPhase = "quiz1";
    setRatingButtons([]);
    flipBtn().hidden = true;
    area.querySelectorAll("#quiz-choice button").forEach((b) => {
      b.addEventListener("click", () => {
        if (quizLocked) return;
        quiz1Answer(parseInt(b.dataset.i, 10));
      });
    });
    area.querySelectorAll(".c-speak").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
    );
    if (settings.autoSpeak) speakEntry(entry, { example });
    rafFit();
  }

  function quiz1Answer(i) {
    const item = queue[qpos];
    const choice = quizChoices[i];
    const correct = !!(choice && choice.correct);
    quizLocked = true;
    // 标记 UI
    const buttons = cardArea().querySelectorAll("#quiz-choice button");
    buttons.forEach((b, bi) => {
      if (quizChoices[bi] && quizChoices[bi].correct) b.classList.add("reveal");
      if (bi === i) b.classList.add(correct ? "correct" : "wrong");
      b.disabled = true;
    });
    const q = correct ? "good" : "again";
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    Store.saveCard(item.idx, res.card);
    Store.bumpMeta("doneToday", 1);
    sessionStats.studied++;
    // push 队尾继续（quiz1 选对进 quiz2，选错重置 quiz1，都还在 learn）
    if (item.card.state === "learn") {
      queue.push({ idx: item.idx, card: item.card, isNew: false, entry: item.entry });
    }
    setTimeout(() => { qpos++; nextCard(); }, 600);
  }

  // quiz=2：单词→中文翻面
  function renderLearnQuiz2(item, flipped) {
    const entry = currentEntry;
    const example = getExampleFor(item);
    const sensesHTML = sensesHTMLOf(entry);
    const area = cardArea();
    if (!flipped) {
      area.innerHTML = `<div class="flip-card"><div class="flip-inner"><div class="flip-face flip-front">
        <div class="c-type">练习 2 · 回想释义</div>
        <button class="c-speak" title="发音">🔊</button>
        <div class="c-en">${esc(entry[1])}</div>
        <div class="c-tap">点击卡片或按空格显示释义</div>
      </div></div></div>`;
      uiPhase = "quiz2-front";
      setRatingButtons([]);
      flipBtn().hidden = false;
      wireFlip(area);
      area.querySelectorAll(".c-speak").forEach((b) =>
        b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
      );
      if (settings.autoSpeak) speakEntry(entry, { example });
    } else {
      area.innerHTML = `<div class="flip-card"><div class="flip-inner flipped"><div class="flip-face flip-back">
        <div class="c-type">练习 2</div>
        <button class="c-speak" title="发音">🔊</button>
        <div class="c-en">${esc(entry[1])}</div>
        <div class="c-senses">${sensesHTML}</div>
      </div></div></div>`;
      uiPhase = "quiz2-back";
      setRatingButtons([
        { k: "1", l: "认识", q: "good" },
        { k: "2", l: "记错了", q: "again" },
      ], "rating-2");
      flipBtn().hidden = true;
      area.querySelectorAll(".c-speak").forEach((b) =>
        b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
      );
    }
    rafFit();
  }

  // quiz=3：中文→单词翻面
  function renderLearnQuiz3(item, flipped) {
    const entry = currentEntry;
    const example = getExampleFor(item);
    const senses = entry[2];
    const cn = senses.map((s) => s[1]).join("；");
    const sensesHTML = sensesHTMLOf(entry);
    const area = cardArea();
    if (!flipped) {
      area.innerHTML = `<div class="flip-card"><div class="flip-inner"><div class="flip-face flip-front">
        <div class="c-type">练习 3 · 回想单词</div>
        <div class="c-cn" style="font-size:22px">${esc(cn)}</div>
        <div class="c-tap">点击卡片或按空格显示单词</div>
      </div></div></div>`;
      uiPhase = "quiz3-front";
      setRatingButtons([]);
      flipBtn().hidden = false;
      wireFlip(area);
    } else {
      area.innerHTML = `<div class="flip-card"><div class="flip-inner flipped"><div class="flip-face flip-back">
        <div class="c-type">练习 3</div>
        <button class="c-speak" title="发音">🔊</button>
        <div class="c-en">${esc(entry[1])}</div>
        <div class="c-senses">${sensesHTML}</div>
      </div></div></div>`;
      uiPhase = "quiz3-back";
      setRatingButtons([
        { k: "1", l: "认识", q: "good" },
        { k: "2", l: "记错了", q: "again" },
      ], "rating-2");
      flipBtn().hidden = true;
      if (settings.autoSpeak) speakEntry(entry, { example });
      area.querySelectorAll(".c-speak").forEach((b) =>
        b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
      );
    }
    rafFit();
  }

  // 练习 quiz=2/3 的 rate
  function learnRate(q) {
    clearHintTimer();
    const item = queue[qpos];
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    Store.saveCard(item.idx, res.card);
    Store.bumpMeta("doneToday", 1);
    sessionStats.studied++;
    if (q === "again") {
      // 记错了：重置 quiz1，push 队尾
      queue.push({ idx: item.idx, card: res.card, isNew: false, entry: item.entry });
    } else {
      // good：若毕业（state=review）不 push，否则 push 继续下一次练习
      if (res.card.state === "learn") {
        queue.push({ idx: item.idx, card: res.card, isNew: false, entry: item.entry });
      }
    }
    qpos++;
    nextCard();
  }

  // ---- 复习卡（state=review）保持现有翻面 + 4 按钮 ----
  function renderReview(item, flipped) {
    const entry = currentEntry;
    const dir = settings.direction;
    const useCnFirst = dir === "cn2en" || (dir === "random" && mulberry32(settings.orderSeed ^ item.idx)() < 0.5);
    currentFrontIsCn = useCnFirst;
    const senses = entry[2];
    // 复习卡也显示真题例句（daily 用 getExample，passage 优先 entry.sentences[0]）
    const example = studyMode === "passage"
      ? (entry.sentences && entry.sentences[0] ? entry.sentences[0] : getExample(item.idx))
      : getExample(item.idx);
    const frontHTML = useCnFirst ? cardFrontCn(entry, senses) : cardFrontEn(entry);
    const sensesHTML = sensesHTMLOf(entry);
    const exampleHTML = example ? exampleBlockHTML(entry, example, true) : "";
    const area = cardArea();
    area.innerHTML = `<div class="flip-card">
      <div class="flip-inner${flipped ? " flipped" : ""}">
        <div class="flip-face flip-front">
          <div class="c-type">复习</div>
          ${useCnFirst ? "" : `<button class="c-speak" title="发音">🔊</button>`}
          ${frontHTML}
          <div class="c-tap">${flipped ? "" : "点击卡片或按空格显示答案"}</div>
        </div>
        <div class="flip-face flip-back">
          <div class="c-type">复习</div>
          <button class="c-speak" title="发音">🔊</button>
          <div class="c-en">${esc(entry[1])}</div>
          <div class="c-senses">${sensesHTML}</div>
          ${exampleHTML}
        </div>
      </div>
    </div>`;
    uiPhase = flipped ? "review-back" : "review-front";
    if (flipped) {
      setRatingButtons([
        { k: "1", l: "重来", q: "again", i: true },
        { k: "2", l: "困难", q: "hard", i: true },
        { k: "3", l: "良好", q: "good", i: true },
        { k: "4", l: "简单", q: "easy", i: true },
      ]);
      updateRatingPreviews(item.card);
      flipBtn().hidden = true;
      if (settings.autoSpeak) speakEntry(entry, { example });
    } else {
      setRatingButtons([]);
      flipBtn().hidden = false;
      if (settings.autoSpeak && !useCnFirst) speakEntry(entry, { example });
    }
    wireFlip(area);
    area.querySelectorAll(".c-speak").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
    );
    wireTransButtons();
    wireParseButtons();
    rafFit();
    if (!flipped) armHintTimer(item); else clearHintTimer();
  }

  // ---- 统一 rate 分发 ----
  function handleRate(q) {
    const item = queue[qpos];
    if (!item) return;
    const c = item.card;
    if (c.state === "new") {
      // assess-front 的 3 按钮
      assessSubmit(q);
    } else if (c.state === "learn") {
      learnRate(q);
    } else { // review
      rate(q);
    }
  }

  function cardFrontEn(entry) {
    return `<div class="c-en">${esc(entry[1])}</div>
            <div class="c-prompt">回想中文释义</div>`;
  }
  function cardFrontCn(entry, senses) {
    const cn = senses.map((s) => s[1]).join("；");
    return `<div class="c-prompt" style="margin-bottom:10px">回想对应英文</div>
            <div class="c-cn" style="font-size:22px">${esc(cn)}</div>`;
  }

  function onFlipClick() {
    const inner = document.querySelector(".flip-inner");
    if (!inner) return;
    if (!inner.classList.contains("flipped")) {
      // 正面 → 翻面
      flipCurrent();
      return;
    }
    // 已翻面：
    if (isMobile()) {
      // 移动：点卡片空白 = 译文 + 解析抽屉（不再翻回正面；翻回正面走顶栏返回键）
      if (triggerTransButton()) { triggerParseDrawer(); return; }
      // 无译文按钮（如 assess 阶段）→ 直接开抽屉
      triggerParseDrawer();
      return;
    }
    // PC：保持原行为——已翻面再点不翻回（翻回走顶栏返回 / 评分）
  }
  function flipCurrent() {
    const item = queue[qpos];
    if (!item) return;
    const c = item.card;
    if (c.state === "new") {
      // assess 阶段不再有翻面中间步：assess-front 直接 3 按钮提交，assess-full 由按钮/键盘推进。
      return;
    }
    if (c.state === "learn") {
      const quiz = c.quiz || 0;
      if (quiz === 2 && uiPhase === "quiz2-front") renderLearnQuiz2(item, true);
      else if (quiz === 3 && uiPhase === "quiz3-front") renderLearnQuiz3(item, true);
      // quiz=1 不翻面
      return;
    }
    // review：翻面即切到 back 视图
    if (uiPhase === "review-front") { clearHintTimer(); renderReview(item, true); }
  }

  function updateRatingPreviews(card) {
    ["again", "hard", "good", "easy"].forEach((q) => {
      const el = $("i-" + q);
      if (el) el.textContent = SRS.preview(card, q);
    });
  }

  // review 的 4 按钮评分（保持原逻辑：again 落回 learn 会重走练习）
  function rate(q) {
    clearHintTimer();
    const item = queue[qpos];
    if (!item) return;
    const wasNew = item.isNew;
    const res = SRS.answer(item.card, q, Date.now());
    item.card = res.card;
    Store.saveCard(item.idx, res.card);

    sessionStats.studied++;
    if (wasNew) { Store.bumpMeta("newToday", 1); sessionStats.newDone++; }
    else { Store.bumpMeta("reviewToday", 1); sessionStats.reviewDone++; }
    Store.bumpMeta("doneToday", 1);
    if (q === "again") sessionStats.again++;

    // again 回落 learn（quiz=1）→ 重走 3 次练习，push 队尾
    if (q === "again") {
      item.isNew = false;
      queue.push({ idx: item.idx, card: res.card, isNew: false, entry: item.entry });
    }
    qpos++;
    nextCard();
  }

  function wireFlip(area) {
    const inner = area.querySelector(".flip-inner");
    if (inner) inner.addEventListener("click", onFlipClick);
  }

  // 找当前卡上「未展开」的译文按钮（display 不是 none、且还没有 .c-trans-text 兄弟）。
  // 供键盘空格触发：翻面后空格展开译文，展开后再空格才走原流程（下一词等）。
  function triggerTransButton() {
    const area = cardArea();
    if (!area) return false;
    const btn = area.querySelector(".c-trans-btn");
    if (!btn) return false;
    if (btn.classList.contains("loading")) return false;
    if (btn.style.display === "none") return false; // 已展开过
    const wrap = btn.parentElement;
    if (wrap && wrap.querySelector(".c-trans-text")) return false; // 已有译文
    btn.click();
    return true;
  }

  // 触发解析进侧栏/抽屉：取当前卡例句，调 startParse 装载到对应容器。
  // PC：右侧栏；移动：底部抽屉。空例句则不开。
  function triggerParseSide() {
    const en = getCurrentExample();
    if (!en) return false;
    if (isMobile()) {
      showParseDrawer(en);
    } else {
      showParseSide();
      startParse(parseSideBodyEl(), en, "解析中…");
    }
    return true;
  }
  function triggerParseDrawer() {
    const en = getCurrentExample();
    if (!en) { showParseDrawer(); return false; }
    showParseDrawer(en);
    return true;
  }
  // 当前卡的例句（study daily 用 getExample，passage 优先 entry.sentences[0]）
  function getCurrentExample() {
    const item = queue[qpos];
    if (!item) return "";
    const entry = studyMode === "passage" ? item.entry : WORD_BY_INDEX[item.idx];
    if (!entry) return "";
    if (studyMode === "passage" && entry.sentences && entry.sentences[0]) return entry.sentences[0];
    const ex = getExample(item.idx);
    return ex || "";
  }

  // ---- 例句中文翻译：点击展开，默认隐藏，避免依赖译文背词 ----
  function wireTransButtons() {
    document.querySelectorAll(".c-trans-btn").forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (btn.classList.contains("loading")) return;
        const en = btn.getAttribute("data-en");
        if (en == null) return;
        const wrap = btn.parentElement;
        // remove any previously shown text
        const old = wrap.querySelector(".c-trans-text");
        if (old) old.remove();

        // instant show if cached
        const cached = Store.getTrans(en);
        if (cached !== undefined) {
          showTransText(wrap, cached, true);
          btn.style.display = "none";
          rafFit();
          return;
        }
        btn.classList.add("loading");
        btn.textContent = "翻译中…";
        try {
          const zh = await LLM.translate(en);
          showTransText(wrap, zh, true);
          btn.style.display = "none";
          rafFit();
        } catch (err) {
          showTransText(wrap, "翻译失败：" + (err && err.message || err), false, true);
          btn.classList.remove("loading");
          btn.textContent = "重试翻译";
          rafFit();
        }
      });
    });
  }
  function showTransText(wrap, text, ok, isErr) {
    const div = document.createElement("div");
    div.className = "c-trans-text" + (isErr ? " err" : "");
    div.textContent = text;
    if (ok && !isErr) {
      const note = document.createElement("div");
      note.className = "c-trans-note";
      note.textContent = "· 译文仅作辅助，请勿依赖";
      div.appendChild(note);
    }
    wrap.appendChild(div);
  }

  // ============ 长难句解析（reader + 背词卡例句，流式 SSE） ============
  // 母语式 10 层走查：难点预判 → 动词计数 → spine → kernel → 修饰剥离 → 逐层加回 →
  // 合成训练（第 7 层，closed「对照原文」让用户先自己组装）→ 标点路标 → 复述 → 译文+词表。
  // 渲染：流式阶段直接 textContent 累加；done 后用 renderParseLayers 重渲染为 <details> 折叠结构。
  // 缓存：Store.getParse 本地命中瞬返；否则走后端 /api/parse-sentence（其自身有 parses 表缓存）。

  // 极简 markdown→<details> 渲染器（不引入依赖，符合 web/ vanilla 约定）。
  // 输入是 PARSE_SYS_PROMPT 产出的 10 层文本。按 \n(?=\d+\. \*\*) 切层。
  function renderParseLayers(markdownText, originalSentence) {
    if (!markdownText) return "";
    // 切层：每段以 "N. **Title" 开头
    const layers = markdownText.split(/\n(?=\d+\.\s+\*\*)/);
    let html = "";
    for (const layer of layers) {
      const m = layer.match(/^(\d+)\.\s+\*\*(.+?)\*\*\n?([\s\S]*)$/);
      if (!m) {
        // 不匹配的尾段/前言，原样转义
        html += `<div class="r-parse-frag">${esc(layer.trim())}</div>`;
        continue;
      }
      const num = m[1], title = m[2], body = m[3] || "";
      // 第 7 层：默认 open，末尾注入 closed「对照原文」（用户先自己组装再展开对照）
      const isSynthesis = num === "7";
      const bodyHTML = renderParseBody(body, isSynthesis ? originalSentence : null);
      html += `<details open>
        <summary>${esc(num)}. ${esc(title)}</summary>
        <div class="r-parse-body">${bodyHTML}</div>
      </details>`;
    }
    return html;
  }

  // 层体内极简 markdown：**bold**、`code`、*em*、- 列表项、空行分段。其余 esc。
  // 若 orig 非空（第 7 层），末尾追加 closed <details> 对照原文。
  function renderParseBody(text, orig) {
    let s = text;
    // 先按行处理列表项
    const lines = s.split(/\n/);
    let out = "";
    let inList = false;
    let para = [];
    function flushPara() {
      if (para.length) {
        out += `<p>${parseInline(para.join(" "))}</p>`;
        para = [];
      }
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flushPara(); if (inList) { out += "</ul>"; inList = false; } continue; }
      if (/^[-•]\s+/.test(trimmed)) {
        flushPara();
        if (!inList) { out += "<ul>"; inList = true; }
        out += `<li>${parseInline(trimmed.replace(/^[-•]\s+/, ""))}</li>`;
      } else {
        if (inList) { out += "</ul>"; inList = false; }
        para.push(trimmed);
      }
    }
    flushPara();
    if (inList) out += "</ul>";
    if (orig) {
      out += `<details class="r-parse-orig-wrap"><summary>▶ 对照原文（先自己组装再展开）</summary><div class="r-parse-orig">${esc(orig)}</div></details>`;
    }
    return out;
  }

  // 行内 markdown：**bold** → <strong>，`code` → <code>，*em* → <em>。先 esc 再插标签。
  function parseInline(s) {
    // 用占位符避免 esc 把 < > 弄乱标签
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return s;
  }

  // 流式解析：targetEl 是解析内容要填入的容器（PC 侧栏 body / 移动抽屉 body / reader 句下 box）。
  // 容器内统一套 .r-parse class 复用样式（侧栏/抽屉 CSS 已把 .r-parse 的背景/边框清零）。
  function startParse(targetEl, en, loadingText) {
    if (!targetEl) return;
    targetEl.innerHTML = `<div class="r-parse"><div class="r-parse-streaming">${esc(loadingText || "解析中…")}</div></div>`;
    const streamEl = targetEl.querySelector(".r-parse-streaming");
    let raw = "";
    LLM.parseSentence(
      en,
      (delta) => { raw += delta; streamEl.textContent = raw; rafFit(); },
      (content) => {
        targetEl.innerHTML = `<div class="r-parse">${renderParseLayers(content, en)}</div>`;
        rafFit();
      },
      (err) => {
        targetEl.innerHTML = `<div class="r-parse"><div class="r-parse-streaming err">解析失败：${esc(err && err.message || err)}</div></div>`;
        rafFit();
      }
    );
  }

  // PC 侧栏显示/隐藏。study 与 passage 共用一套：用 cardArea() 同样的屏选择逻辑。
  function parseSideEl() {
    const targetScreen = studyMode === "passage" ? "passage" : "study";
    return document.querySelector(`#screen-${targetScreen} .parse-side`) || $("parse-side");
  }
  function parseSideBodyEl() {
    const side = parseSideEl();
    return side ? side.querySelector(".parse-side-body") : null;
  }
  function showParseSideEmpty() {
    const body = parseSideBodyEl();
    if (body) body.innerHTML = `<div class="parse-side-empty">翻面后按空格，或点例句的「解析长难句」</div>`;
  }
  function showParseSide() {
    const side = parseSideEl();
    if (!side) return;
    side.hidden = false;
    if (!side.querySelector(".r-parse")) showParseSideEmpty();
  }
  function hideParseSide() {
    const side = parseSideEl();
    if (side) side.hidden = true;
  }

  // 移动抽屉
  function showParseDrawer(en) {
    const overlay = $("parse-drawer-overlay");
    const drawer = $("parse-drawer");
    if (!overlay || !drawer) return;
    overlay.hidden = false;
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("open"));
    if (en) {
      startParse($("parse-drawer-body"), en, "解析中…");
    } else {
      const body = $("parse-drawer-body");
      if (body && !body.querySelector(".r-parse")) {
        body.innerHTML = `<div class="parse-side-empty">点例句的「解析长难句」开始</div>`;
      }
    }
  }
  function closeParseDrawer() {
    const overlay = $("parse-drawer-overlay");
    const drawer = $("parse-drawer");
    if (!drawer) return;
    drawer.classList.remove("open");
    setTimeout(() => {
      if (drawer) drawer.hidden = true;
      if (overlay) overlay.hidden = true;
    }, 250);
  }
  function isMobile() { return window.matchMedia("(max-width:880px)").matches; }

  // 事件委托：.c-parse-btn（背词卡）与 .r-parse-btn（reader）共用
  function wireParseButtons() {
    document.querySelectorAll(".c-parse-btn, .r-parse-btn").forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const en = btn.getAttribute("data-en");
        if (!en) return;
        // reader 的 .r-parse-btn：仍走句下内联（不改）
        if (btn.classList.contains("r-parse-btn")) {
          const wrap = btn.parentElement;
          btn.style.display = "none";
          startParseStream(wrap, en, "解析中…");
          return;
        }
        // 背词卡 .c-parse-btn：PC 进侧栏，移动开抽屉
        if (isMobile()) {
          showParseDrawer(en);
        } else {
          showParseSide();
          startParse(parseSideBodyEl(), en, "解析中…");
        }
      });
    });
  }

  // 兼容旧调用名（reader 句下内联仍用 startParseStream，语义 = 往 host 兄弟节点塞 .r-parse）
  function startParseStream(host, en, loadingText) {
    let box = host.parentElement.querySelector(".r-parse, .c-parse");
    if (!box || !host.parentElement.contains(box)) {
      box = document.createElement("div");
      box.className = "r-parse";
      host.insertAdjacentElement("afterend", box);
    }
    startParse(box, en, loadingText);
  }

  // ============ 例句/原文 点词查义 popover ============
  // 任何 .c-word（含 .c-target 目标词、reader 的 .r-hl）点击都弹小卡片显示释义。
  let wordPopover = null;
  function ensurePopover() {
    if (wordPopover) return wordPopover;
    wordPopover = document.createElement("div");
    wordPopover.className = "word-popover";
    wordPopover.hidden = true;
    document.body.appendChild(wordPopover);
    return wordPopover;
  }
  function hideWordPopover() {
    if (wordPopover && !wordPopover.hidden) {
      wordPopover.hidden = true;
      wordPopover.innerHTML = "";
    }
  }
  function showWordPopover(surface, anchor) {
    const pop = ensurePopover();
    const entry = lookupWord(surface);
    if (!entry) return; // 词库未收录，不弹
    const senses = entry[2] || [];
    const sensesHTML = senses.length
      ? senses.map((s) =>
          `<div class="wp-sense"><span class="pos">${esc(s[0])}</span><span class="cn">${esc(s[1])}</span></div>`
        ).join("")
      : `<div class="wp-sense"><span class="cn">（词库未收录释义）</span></div>`;
    pop.innerHTML =
      `<div class="wp-head">
         <span class="wp-en">${esc(entry[1])}</span>
         <button class="wp-speak" title="发音">🔊</button>
       </div>
       <div class="wp-senses">${sensesHTML}</div>`;
    pop.hidden = false;
    // 自动朗读（受「点词朗读」开关控制）；🔊 按钮始终可手动点读
    if (settings.speakOnWordClick) speak(entry[1]);
    // 发音按钮
    const sb = pop.querySelector(".wp-speak");
    if (sb) sb.addEventListener("click", (e) => { e.stopPropagation(); speak(entry[1]); });
    // 定位到锚点下方
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      const margin = 8;
      let left = r.left + r.width / 2 - pr.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - pr.width - margin));
      let top = r.bottom + margin;
      // 若下方溢出则翻到上方
      if (top + pr.height > window.innerHeight - margin) {
        top = Math.max(margin, r.top - pr.height - margin);
      }
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }
  }
  function wireWordClicks(root) {
    // 用事件委托：只在 document 绑一次，避免每次 render 重设。
    // 这里仅用作「确保已绑」的触发点，无操作。
    ensureWordClickDelegation();
  }
  let _wordClickDelegated = false;
  function ensureWordClickDelegation() {
    if (_wordClickDelegated) return;
    _wordClickDelegated = true;
    document.addEventListener("click", (e) => {
      // 点 popover 内部（如发音按钮）不收起
      if (wordPopover && !wordPopover.hidden &&
          e.target.closest && e.target.closest(".word-popover")) return;
      const w = e.target.closest && e.target.closest(".c-word");
      if (w) {
        const word = w.getAttribute("data-w");
        if (word) {
          e.stopPropagation();
          showWordPopover(word, w);
        }
        return;
      }
      // 点其它地方收起
      hideWordPopover();
    });
    // 滚动/切卡时收起
    document.addEventListener("scroll", hideWordPopover, true);
    // Esc 收起 popover + 解析抽屉
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { hideWordPopover(); closeParseDrawer(); }
    });
    // 解析侧栏/抽屉关闭按钮
    const sideClose = $("parse-side-close");
    if (sideClose) sideClose.addEventListener("click", hideParseSide);
    const drawerClose = $("parse-drawer-close");
    if (drawerClose) drawerClose.addEventListener("click", closeParseDrawer);
    const drawerOverlay = $("parse-drawer-overlay");
    if (drawerOverlay) drawerOverlay.addEventListener("click", closeParseDrawer);
    // 段落分析卡折叠/展开：点 head 切换 collapsed
    const ra = $("reader-analysis");
    if (ra) ra.addEventListener("click", (e) => {
      const head = e.target.closest(".pa-card-head");
      if (!head) return;
      const card = head.closest(".pa-card");
      if (card) card.classList.toggle("collapsed");
    });
  }

  function showDone(alreadyDone) {
    show("done");
    $("done-title").textContent = studyMode === "review"
      ? (alreadyDone ? "暂无待复习 🎉" : "复习完成！")
      : studyMode === "learn"
        ? (alreadyDone ? "今日新词已学完 🎉" : "新词学习完成！")
        : (alreadyDone ? "今日已完成 🎉" : "今日学习完成！");
    const s = snapshot();
    const stats = $("done-stats");
    stats.innerHTML = `
      <div class="stat"><div class="stat-num">${sessionStats.studied}</div><div class="stat-label">本次学习</div></div>
      <div class="stat"><div class="stat-num">${sessionStats.newDone}</div><div class="stat-label">新词</div></div>
      <div class="stat"><div class="stat-num">${sessionStats.reviewDone}</div><div class="stat-label">复习</div></div>
      <div class="stat"><div class="stat-num">${sessionStats.again}</div><div class="stat-label">需重来</div></div>`;
    // passage 模式完成后提示有多少词是已背过自动跳过的，并给「返回题型」入口
    const existingSkip = document.getElementById("done-skip-note");
    if (existingSkip) existingSkip.remove();
    const existingBack = document.getElementById("btn-back-sections");
    if (existingBack) existingBack.remove();
    if (studyMode === "passage") {
      if (passageSkipped > 0) {
        const note = document.createElement("div");
        note.id = "done-skip-note";
        note.className = "hint";
        note.style.textAlign = "center";
        note.textContent = `本题型有 ${passageSkipped} 个词已背熟，自动跳过 · 共用记忆曲线`;
        document.querySelector("#screen-done .done-wrap").appendChild(note);
      }
      // 「返回题型」：回真题记词的题型层（读原文入口在「真题」tab，不在真题记词里）
      if (reciteOrigin) {
        const backBtn = document.createElement("button");
        backBtn.id = "btn-back-sections";
        backBtn.className = "primary big";
        backBtn.innerHTML = "返回题型";
        backBtn.addEventListener("click", () => {
          show("papers-recite");
          renderReciteSections(reciteOrigin.paperIdx);
        });
        document.querySelector("#screen-done .done-wrap").appendChild(backBtn);
      }
    }
  }

  // ---- 真题原文阅读器 ----
  // 双栏：左 #reader-body 原文（词表命中词 .r-hl 绿 + 题干关键词 .r-hl-q 蓝），
  //       右 #reader-analysis 段落分析卡（流式生成，落 paragraph_analyses 表 + Store 双层缓存）。
  // 空格键逐句翻译（.r-sent）保留；段落分析后台串行生成，不打断阅读。
  let readerActiveSent = null; // 当前激活句 .r-sent 元素
  let readerParas = [];        // 段落原文数组（split 后）
  let readerAnalysisState = []; // 每段 {el, done, failed} 供按需触发
  let readerAnalysisStarted = false;

  function openReader() {
    if (!passageReader) { show("dashboard"); return; }
    $("reader-title").textContent = passageReader.title || "真题原文";
    const body = $("reader-body");
    const analysis = $("reader-analysis");
    // 词表命中词集合（绿）
    const wordSet = new Set((passageReader.words || []).map((w) => w.toLowerCase()));
    // 题干关键词集合（蓝）：从 items 提取且必须出现在原文里
    const qKeywordSet = extractQuestionKeywords(passageReader.items || [], passageReader.body || "");
    const paras = (passageReader.body || "").split(/\n+/).filter((p) => p.trim());
    readerParas = paras;
    readerAnalysisState = paras.map(() => ({ el: null, done: false, failed: false }));
    readerAnalysisStarted = false;
    // 左栏：按段渲染，句级 .r-sent 保留供空格定位
    body.innerHTML = paras.map((p) => `<p>${highlightSentences(p, wordSet, qKeywordSet)}</p>`).join("");
    // 底部追加阅读题（题干 + ABCD 选项）。用 insertAdjacentHTML 而非 innerHTML+=，
    // 避免重建段落节点、使下方 readerActiveSent 引用失效。
    const items = passageReader.items || [];
    if (items.length) {
      const optsHTML = (it) => Object.keys(it.options || {}).sort()
        .map((k) => `<li><b>${esc(k)}.</b> ${esc(it.options[k] || "")}</li>`).join("");
      const qHTML = `<div class="r-items">
        <h3 class="r-items-title">阅读题</h3>
        ${items.map((it) => `
          <div class="r-item">
            <div class="r-item-stem"><b>${esc(it.n ?? "")}.</b> ${esc(it.stem || "")}</div>
            <ul class="r-item-opts">${optsHTML(it)}</ul>
          </div>`).join("")}
      </div>`;
      body.insertAdjacentHTML("beforeend", qHTML);
    }
    readerActiveSent = body.querySelector(".r-sent");
    if (readerActiveSent) readerActiveSent.classList.add("active");
    // 右栏：先建 N 个空 card 占位，再后台串行填充
    if (analysis) {
      analysis.hidden = false;
      analysis.innerHTML = paras.map((p, i) => (
        `<div class="pa-card collapsed" data-pa-idx="${i}">
           <div class="pa-card-head" data-pa-toggle="1">
             <span class="pa-card-title">第 ${i + 1} 段</span>
             <span class="pa-head-right">
               <span class="pa-card-status">待生成</span>
               <span class="pa-toggle">▾</span>
             </span>
           </div>
           <div class="pa-streaming">分析中</div>
         </div>`
      )).join("");
      // 把每个 card 的 body 容器存到 state，供流式填入
      Array.prototype.forEach.call(analysis.querySelectorAll(".pa-card"), (card) => {
        const i = parseInt(card.getAttribute("data-pa-idx"), 10);
        readerAnalysisState[i].el = card;
      });
    }
    show("reader");
    wireWordClicks(body);
    // 后台串行生成段落分析（首段立刻开始，其余排队；失败即停）
    startReaderAnalysisChain();
  }

  // 从题干（stem + options）抽关键词：分词→去停用词→与原文 token 集合取交。
  // 粗略屈折还原（复现 highlightWords 里 lookupWord 的 -s/-ed/-ing 思路）。
  const Q_STOPWORDS = new Set([
    "the","a","an","of","to","in","on","at","by","for","with","from","as","is","are","was","were","be","been","being",
    "it","its","this","that","these","those","they","them","their","we","you","he","she","his","her","our","your",
    "and","or","but","not","no","nor","so","if","then","than","because","when","while","where","what","which","who","whom","whose","why","how",
    "do","does","did","done","have","has","had","will","would","can","could","may","might","must","shall","should","may",
    "paragraph","paragraphs","author","passage","text","line","lines","following","suggested","implies","indicates","according","mentioned","true","false","except","best","title","mainly","main","idea","topic","tone","purpose","infer","inferred","means","meaning","refer","refers","case","cases","example","instance","instances","above","below","first","second","third","last","final","one","two","three","four","five","most","more","less","least","such","both","each","all","any","some","other","another","same","different","new","old","part","parts","question","questions","answer","answers",
    "would","about","into","over","under","out","up","down","than","then","there","here","also","only","very","just","such","too","quite","rather","almost","nearly","often","always","never","sometimes","usually","generally","typically","probably","perhaps","maybe","might","may","could","should","would","must","shall","will","do","does","did","done","doing","have","has","had","having","be","been","being","is","are","was","were","am","s","t","d","ll","ve","re","m",
  ]);

  function extractQuestionKeywords(items, passageBody) {
    const set = new Set();
    if (!items || !items.length) return set;
    // 拼接所有 stem + options
    let text = "";
    for (const it of items) {
      text += " " + (it.stem || "");
      const opts = it.options || {};
      for (const k of Object.keys(opts)) text += " " + (opts[k] || "");
    }
    // 原文 token 集合（小写）
    const bodyTokens = new Set();
    (passageBody.toLowerCase().match(/[a-z][a-z\-']*/g) || []).forEach((t) => bodyTokens.add(t));
    // 题干 token 与原文取交，去停用词
    const tokens = text.toLowerCase().match(/[a-z][a-z\-']*/g) || [];
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (Q_STOPWORDS.has(t)) continue;
      // 原文（含屈折还原）出现才算
      if (bodyTokens.has(t)) { set.add(t); continue; }
      const restored = restoreInflection(t);
      if (restored && bodyTokens.has(restored)) set.add(restored);
      // 也存原形，便于原文 -s/-ed/-ing 命中
      if (restored) set.add(restored);
    }
    return set;
  }

  // 粗略屈折还原：复现 lookupWord 的 -s/-ed/-ing 思路，但只返回字符串原形
  function restoreInflection(low) {
    if (!low) return null;
    // -ing
    if (low.length > 5 && low.endsWith("ing")) {
      const stem = low.slice(0, -3);
      if (stem.length >= 3) return stem;
    }
    // -ed
    if (low.length > 4 && low.endsWith("ed")) {
      let stem = low.slice(0, -2);
      if (stem.length >= 3) return stem;
      stem = low.slice(0, -3); // -ied → -y
      if (stem.length >= 3) return stem;
    }
    // -s / -es
    if (low.length > 3 && low.endsWith("es")) {
      const stem = low.slice(0, -2);
      if (stem.length >= 3) return stem;
    }
    if (low.length > 2 && low.endsWith("s") && !low.endsWith("ss")) {
      const stem = low.slice(0, -1);
      if (stem.length >= 3) return stem;
    }
    return null;
  }
  // alias 给 highlightWords 用（避免与上面 restoreInflection 命名冲突）
  const restoreInflectionStr = restoreInflection;

  // 后台串行生成所有段落分析。1 worker，避免 LLM 网关压力。
  // 失败即停（沿用 fail-fast 教训），该 card 显示错误 + 重试，后续 card 保持「待生成」。
  async function startReaderAnalysisChain() {
    if (readerAnalysisStarted) return;
    readerAnalysisStarted = true;
    for (let i = 0; i < readerParas.length; i++) {
      const st = readerAnalysisState[i];
      if (!st || st.done) continue;
      await generateParagraphAnalysis(i);
      // 失败即停；用户可点重试继续
      if (st.failed) break;
    }
  }

  // 触发某段分析（若未生成）。advanceReaderSent 跨入新段时调。
  async function ensureParagraphAnalysis(idx) {
    if (idx < 0 || idx >= readerAnalysisState.length) return;
    const st = readerAnalysisState[idx];
    if (!st || st.done || st.failed) return;
    await generateParagraphAnalysis(idx);
  }

  async function generateParagraphAnalysis(idx) {
    const st = readerAnalysisState[idx];
    if (!st || !st.el) return;
    const card = st.el;
    // 重置 card 内容（重试时也会进来）。保留 collapsed 态：仅当用户未手动展开过才默认收起。
    const wasCollapsed = card.classList.contains("collapsed");
    card.innerHTML = `<div class="pa-card-head" data-pa-toggle="1"><span class="pa-card-title">第 ${idx + 1} 段</span><span class="pa-head-right"><span class="pa-card-status">生成中</span><span class="pa-toggle">▾</span></span></div><div class="pa-streaming">分析中</div>`;
    if (wasCollapsed) card.classList.add("collapsed"); else card.classList.remove("collapsed");
    const bodyEl = card.querySelector(".pa-streaming");
    let acc = "";
    const fullBody = passageReader.body || "";
    const payload = {
      year: passageReader.year, label: passageReader.label,
      para_idx: idx, text: readerParas[idx], full_body: fullBody,
      items: passageReader.items || [],
    };
    // 同步标记 active 段（视觉对应当前阅读段）
    Array.prototype.forEach.call($("reader-analysis").querySelectorAll(".pa-card"), (c) => c.classList.remove("active"));
    card.classList.add("active");
    // 仅在展开态滚动，避免收起的卡被自动撑开视野
    if (!card.classList.contains("collapsed")) card.scrollIntoView({ behavior: "smooth", block: "start" });
    await new Promise((resolve) => {
      LLM.analyzeParagraph(payload,
        (delta) => {
          acc += delta;
          bodyEl.className = "pa-body";
          bodyEl.textContent = acc;
        },
        (content) => {
          st.done = true;
          const statusEl2 = card.querySelector(".pa-card-status");
          if (statusEl2) statusEl2.textContent = "已生成";
          renderParaAnalysisMarkdown(card, content || acc);
          resolve();
        },
        (err) => {
          st.failed = true;
          const wasCollapsed = card.classList.contains("collapsed");
          card.innerHTML = `<div class="pa-card-head" data-pa-toggle="1"><span class="pa-card-title">第 ${idx + 1} 段</span><span class="pa-head-right"><span class="pa-card-status">失败</span><span class="pa-toggle">▾</span></span></div><div class="pa-card-err">${esc(err && err.message || String(err))}</div><div class="pa-retry"><button class="row-btn" data-pa-retry="${idx}">重试</button></div>`;
          if (wasCollapsed) card.classList.add("collapsed"); else card.classList.remove("collapsed");
          const retryBtn = card.querySelector("[data-pa-retry]");
          if (retryBtn) {
            retryBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              st.failed = false; st.done = false;
              generateParagraphAnalysis(idx);
            });
          }
          resolve();
        }
      );
    });
  }

  // 段落分析 markdown 渲染：把 6 段 ▍标记 转 h4 + 内容块
  function renderParaAnalysisMarkdown(card, md) {
    if (!md) return;
    // 按 ▍ 切段（首段可能无前缀）
    const lines = md.split(/\n/);
    let html = "";
    let curHead = null;
    let curBuf = [];
    const flush = () => {
      if (curHead !== null) {
        html += `<h4>${esc(curHead)}</h4><pre>${esc(curBuf.join("\n").trim())}</pre>`;
      } else if (curBuf.length) {
        html += `<pre>${esc(curBuf.join("\n").trim())}</pre>`;
      }
      curBuf = [];
    };
    for (const ln of lines) {
      const m = ln.match(/^▍(.+)$/);
      if (m) {
        flush();
        curHead = m[1].trim();
      } else {
        curBuf.push(ln);
      }
    }
    flush();
    // 替换 card 内容（保留 head）
    const headEl = card.querySelector(".pa-card-head");
    card.innerHTML = "";
    if (headEl) card.appendChild(headEl);
    const wrap = document.createElement("div");
    wrap.className = "pa-body";
    wrap.innerHTML = html;
    card.appendChild(wrap);
  }

  // 段落 → 按句切（保留标点与空格），每句包 <span class="r-sent">，句内词高亮。
  // 切分用 [^.!?]+ 合并，避免 lookbehind 在老 Safari 的兼容问题。
  function highlightSentences(text, wordSet, qKeywordSet) {
    const parts = text.split(/([.!?]+(?:["'”’)\]]+|\s+|$))/);
    let out = "";
    let buf = "";
    for (let i = 0; i < parts.length; i++) {
      buf += parts[i];
      // 奇数位是「标点+收尾」，此时 buf 是一个完整句
      if (i % 2 === 1 && buf.trim()) {
        out += `<span class="r-sent" data-en="${escAttr(buf)}">${highlightWords(buf, wordSet, qKeywordSet)}</span>`;
        buf = "";
      }
    }
    if (buf.trim()) {
      out += `<span class="r-sent" data-en="${escAttr(buf)}">${highlightWords(buf, wordSet, qKeywordSet)}</span>`;
    }
    return out || `<span class="r-sent" data-en="${escAttr(text)}">${highlightWords(text, wordSet, qKeywordSet)}</span>`;
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function showReaderTrans(sent) {
    if (!sent) return;
    const en = sent.getAttribute("data-en") || "";
    if (!en) return;
    // 已展开过 → 跳到下一句
    let trans = sent.nextElementSibling;
    if (trans && trans.classList.contains("r-trans")) {
      advanceReaderSent(sent);
      return;
    }
    trans = document.createElement("div");
    trans.className = "r-trans";
    trans.textContent = "翻译中…";
    sent.insertAdjacentElement("afterend", trans);
    // 解析按钮：接在译文后面，与 .r-trans 同容器逻辑
    const parseBtn = document.createElement("div");
    parseBtn.className = "r-trans-actions";
    parseBtn.innerHTML = `<button class="r-parse-btn" data-en="${escAttr(en)}">解析长难句 →</button>`;
    trans.insertAdjacentElement("afterend", parseBtn);
    wireParseButtons();
    rafFit();
    try {
      const zh = await LLM.translate(en);
      trans.textContent = zh;
    } catch (err) {
      trans.textContent = "翻译失败：" + (err && err.message || err);
      trans.classList.add("err");
    }
    advanceReaderSent(sent);
    rafFit();
  }

  function advanceReaderSent(cur) {
    cur.classList.remove("active");
    let next = cur.nextElementSibling;
    // 跨过 .r-trans 找下一个 .r-sent
    while (next && !next.classList.contains("r-sent")) next = next.nextElementSibling;
    if (next) {
      readerActiveSent = next;
      next.classList.add("active");
      next.scrollIntoView({ behavior: "smooth", block: "center" });
      // 跨入新段 → 触发该段分析（若尚未生成）
      const paraIdx = findParagraphIndex(next);
      if (paraIdx >= 0) ensureParagraphAnalysis(paraIdx);
    } else {
      // 段内无下一句 → 找下一段第一个 .r-sent
      const all = document.querySelectorAll("#reader-body .r-sent");
      const list = Array.prototype.slice.call(all);
      const idx = list.indexOf(cur);
      if (idx >= 0 && idx + 1 < list.length) {
        readerActiveSent = list[idx + 1];
        readerActiveSent.classList.add("active");
        readerActiveSent.scrollIntoView({ behavior: "smooth", block: "center" });
        const paraIdx = findParagraphIndex(readerActiveSent);
        if (paraIdx >= 0) ensureParagraphAnalysis(paraIdx);
      } else {
        readerActiveSent = null; // 末句
      }
    }
  }

  // 找 .r-sent 所属段落在 readerParas 里的 idx（按 DOM 里 <p> 顺序）
  function findParagraphIndex(sentEl) {
    if (!sentEl) return -1;
    let p = sentEl.parentElement;
    while (p && p.tagName !== "P") p = p.parentElement;
    if (!p) return -1;
    const allP = Array.prototype.slice.call($("reader-body").querySelectorAll("p"));
    return allP.indexOf(p);
  }

  function highlightWords(text, wordSet, qKeywordSet) {
    // 按词边界切，命中 wordSet 的加 .r-hl（绿）；命中 qKeywordSet 的加 .r-hl-q（蓝）。
    // 题干关键词色优先（同时命中两类时，蓝覆盖绿——「重点中的重点」）。
    // 高亮命中判定复用 lookupWord 的变形还原（-ly/-ness/-tion 等），
    // 这样 consciously→conscious 也能在原文里高亮。
    const qset = qKeywordSet instanceof Set ? qKeywordSet : null;
    return text.replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
      const low = m.toLowerCase();
      const e = esc(m);
      const lookup = lookupWord(low);
      const restored = lookup ? lookup[1].toLowerCase() : restoreInflectionStr(low);
      const inVocab = wordSet.has(low) || (lookup && wordSet.has(restored));
      const inQ = qset && (qset.has(low) || (restored && qset.has(restored)));
      if (inQ) return `<span class="r-hl-q c-word" data-w="${m}">${e}</span>`;
      if (inVocab) return `<span class="r-hl c-word" data-w="${m}">${e}</span>`;
      if (lookup) return `<span class="c-word" data-w="${m}">${e}</span>`;
      return e;
    });
  }

  // ============ screens ============
  function show(name) {
    clearHintTimer();
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("screen-" + name).classList.add("active");
    // 同步顶栏/底栏 tab 高亮
    document.querySelectorAll(".header-nav button[data-tab], .tab-bar button[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    // 子屏（非主 tab）隐藏全局 header/tab-bar
    const isMain = ["dashboard", "papers", "papers-recite", "transmgr", "parsemgr", "settings"].includes(name);
    document.body.classList.toggle("sub-screen", !isMain);
    if (name === "dashboard") renderDashboard();
    // 进入真题记词屏时默认回年份层（除非已经在子层）
    if (name === "papers-recite") {
      const inSubLayer = !($("recite-layer-years").hidden);
      if (inSubLayer) showReciteLayer("years");
    }
  }

  // ============ settings UI ============
  function selectSettingsSection(s) {
    document.querySelectorAll("#settings-nav button").forEach((b) =>
      b.classList.toggle("active", b.dataset.s === s));
    document.querySelectorAll(".settings-section").forEach((sec) =>
      (sec.hidden = sec.dataset.s !== s));
  }
  function openSettings() {
    $("set-daily").value = settings.dailyNew;
    $("val-daily").textContent = settings.dailyNew;
    $("set-rate").value = settings.rate;
    $("val-rate").textContent = settings.rate.toFixed(1);
    $("set-autospeak").checked = !!settings.autoSpeak;
    $("set-speak-word").checked = !!settings.speakOnWordClick;
    document.querySelectorAll("#set-direction button").forEach((b) =>
      b.classList.toggle("active", b.dataset.v === settings.direction)
    );
    // LLM: 服务端代理，从 Api 拉配置/模型列表
    refreshAccountUI();
    refreshLlmUI();
    selectSettingsSection("study");
    show("settings");
  }

  // ---- 账号 panel UI ----
  function refreshAccountUI() {
    const state = $("acc-state");
    const btnLogout = $("btn-acc-logout");
    const btnAccount = $("btn-account");
    if (window.Api && Api.isLoggedIn()) {
      const u = Api.getUser() || {};
      const name = u.username || "已登录";
      state.textContent = name;
      btnLogout.hidden = false;
      $("acc-user").value = "";
      $("acc-pass").value = "";
      // 顶栏按钮显示用户名首字
      if (btnAccount) btnAccount.textContent = (name + "").charAt(0) || "👤";
    } else {
      state.textContent = "未登录";
      btnLogout.hidden = true;
      if (btnAccount) btnAccount.textContent = "👤";
    }
  }

  // ---- LLM panel UI（服务端代理模式）----
  async function refreshLlmUI() {
    const el = $("llm-status");
    const sel = $("set-llm-model");
    el.classList.remove("ok", "err", "busy");
    if (!window.Api) { el.textContent = "未连接"; return; }
    if (!Api.isLoggedIn()) { el.textContent = "未登录（请先在上方登录）"; el.classList.add("err"); return; }
    el.textContent = "读取配置中…"; el.classList.add("busy");
    try {
      const cfg = await Api.llmConfig();
      const configured = cfg && cfg.configured;
      const model = cfg && cfg.model;
      const conc = cfg && cfg.concurrency;
      el.classList.remove("busy");
      if (configured) {
        el.textContent = "已配置" + (model ? " · " + model : "");
        el.classList.add("ok");
      } else {
        el.textContent = "未配置（请在服务端配置 LLM Key）";
        el.classList.add("err");
      }
      // 填充模型 select
      await fillLlmModelOptions(model);
      // 填充并发滑块
      const c = Math.max(1, Math.min(100, parseInt(conc, 10) || 4));
      const concEl = $("set-llm-concurrency");
      const concVal = $("val-llm-concurrency");
      if (concEl) { concEl.value = c; }
      if (concVal) { concVal.textContent = c; }
    } catch (err) {
      el.classList.remove("busy");
      el.textContent = "读取失败：" + (err && err.message || err);
      el.classList.add("err");
    }
  }

  async function fillLlmModelOptions(selected) {
    const sel = $("set-llm-model");
    let list = [];
    try { list = await Api.llmModels() || []; } catch (e) { list = []; }
    sel.innerHTML = list.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("");
    if (selected && list.indexOf(selected) >= 0) sel.value = selected;
    else if (!selected && list.length) sel.value = "";
  }

  // LLM 状态条简单更新（供刷新/测试/切模型用）
  function updateLlmStatusSimple(msg, cls) {
    const el = $("llm-status");
    el.classList.remove("ok", "err", "busy");
    el.textContent = msg;
    if (cls) el.classList.add(cls);
  }

  function applySettings() {
    Store.saveSettings(settings);
  }

  // ============ helpers ============
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ============ translation management ============
  // 句子列表/批量翻译/单句翻译/重翻
  let tmState = { status: "untranslated", q: "", page: 1, size: 50 };
  let tmTotal = 0;
  let tmStats = { translated: 0, total: 0 };
  let tmQTimer = null;

  async function openTransMgr() {
    tmState = { status: "untranslated", q: "", page: 1, size: 50 };
    show("transmgr");
    await loadTmPage();
  }

  async function loadTmPage() {
    const listEl = $("tm-list");
    const pageEl = $("tm-page");
    const statsEl = $("tm-stats");
    listEl.innerHTML = '<div class="hint">加载中…</div>';
    try {
      const res = await Api.listSentences(tmState);
      const items = (res && res.items) || [];
      tmTotal = (res && res.total) || items.length;
      // 统计（若后端在 listSentences 返回里带了 stats 则用之，否则单独拉）
      await refreshTmStats();
      renderTmList(items);
      const pages = Math.max(1, Math.ceil(tmTotal / tmState.size));
      if (tmState.page > pages) tmState.page = pages;
      pageEl.textContent = tmState.page + " / " + pages;
    } catch (err) {
      listEl.innerHTML = '<div class="hint">加载失败：' + esc((err && err.message) || err) + "</div>";
    }
  }

  async function refreshTmStats() {
    try {
      const s = await Api.stats();
      tmStats = { translated: s.translated || 0, total: s.total || 0 };
      $("tm-stats").textContent = "已翻译 " + tmStats.translated + " / 共 " + tmStats.total;
    } catch (e) {
      $("tm-stats").textContent = "—";
    }
  }

  function renderTmList(items) {
    const wrap = $("tm-list");
    wrap.innerHTML = "";
    if (!items.length) {
      wrap.innerHTML = '<div class="hint">无匹配句子。</div>';
      return;
    }
    items.forEach((it) => {
      const hasZh = !!it.zh;
      const div = document.createElement("div");
      div.className = "tm-item";
      const badge = hasZh
        ? '<span class="tm-badge ok">已译</span>'
        : '<span class="tm-badge">未译</span>';
      const btnLabel = hasZh ? "重翻" : "翻译";
      div.innerHTML =
        '<div class="tm-main">' +
          '<div class="tm-text">' + esc(it.text || "") + '</div>' +
          (hasZh ? '<div class="tm-zh">' + esc(it.zh || "") + '</div>' : '') +
        '</div>' +
        '<div class="tm-actions">' +
          badge +
          '<button class="row-btn" data-id="' + esc(it.id) + '" data-retry="' + (hasZh ? "1" : "0") + '">' + btnLabel + '</button>' +
        '</div>';
      wrap.appendChild(div);
    });
    // 绑定单条翻译按钮
    wrap.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const retry = btn.getAttribute("data-retry") === "1";
        const old = btn.textContent;
        btn.textContent = "翻译中…";
        btn.disabled = true;
        try {
          if (retry) await Api.retranslateById(id);
          else await Api.translateById(id);
          await loadTmPage();
        } catch (err) {
          btn.textContent = old;
          btn.disabled = false;
          alert("翻译失败：" + ((err && err.message) || err));
        }
      });
    });
  }

  // ============ 解析管理页（仿 transmgr） ============
  let pmState = { status: "unparsed", q: "", page: 1, size: 50 };
  let pmTotal = 0;
  let pmQTimer = null;

  async function openParseMgr() {
    pmState = { status: "unparsed", q: "", page: 1, size: 50 };
    show("parsemgr");
    await loadPmPage();
  }

  async function loadPmPage() {
    const listEl = $("pm-list");
    const pageEl = $("pm-page");
    const statsEl = $("pm-stats");
    if (!listEl) return;
    listEl.innerHTML = '<div class="hint">加载中…</div>';
    try {
      const res = await Api.listSentences(pmState);
      const items = (res && res.items) || [];
      pmTotal = (res && res.total) || items.length;
      // stats：listSentences 返回 parsed/unparsed
      const parsed = (res && res.parsed) || 0;
      const total = (res && res.total) || 0;
      statsEl.textContent = "已解析 " + parsed + " / 共 " + total;
      renderPmList(items);
      const pages = Math.max(1, Math.ceil(pmTotal / pmState.size));
      if (pmState.page > pages) pmState.page = pages;
      pageEl.textContent = pmState.page + " / " + pages;
    } catch (err) {
      listEl.innerHTML = '<div class="hint">加载失败：' + esc((err && err.message) || err) + "</div>";
    }
  }

  function renderPmList(items) {
    const wrap = $("pm-list");
    wrap.innerHTML = "";
    if (!items.length) {
      wrap.innerHTML = '<div class="hint">无匹配句子。</div>';
      return;
    }
    items.forEach((it) => {
      const parse = it.parse || null;
      const hasParse = !!(parse && parse.content && parse.status === "ok");
      const div = document.createElement("div");
      div.className = "tm-item";
      const badge = hasParse
        ? '<span class="tm-badge ok">已解析</span>'
        : '<span class="tm-badge">未解析</span>';
      const btnLabel = hasParse ? "重解析" : "解析";
      const preview = hasParse
        ? '<div class="tm-zh">' + esc((parse.content || "").slice(0, 120)) + '…</div>'
        : '';
      div.innerHTML =
        '<div class="tm-main">' +
          '<div class="tm-text">' + esc(it.text || "") + '</div>' +
          preview +
        '</div>' +
        '<div class="tm-actions">' +
          badge +
          '<button class="row-btn" data-id="' + esc(it.id) + '">' + btnLabel + '</button>' +
        '</div>';
      wrap.appendChild(div);
    });
    // 绑定单条解析按钮
    wrap.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const old = btn.textContent;
        btn.textContent = "解析中…";
        btn.disabled = true;
        try {
          const r = await Api.parseById(id);
          if (r && r.status === "unconfigured") {
            alert("LLM 未配置（请在服务端配置 Key）");
          } else if (r && r.status !== "ok") {
            alert("解析失败：" + (r.error || r.status));
          }
          await loadPmPage();
        } catch (err) {
          btn.textContent = old;
          btn.disabled = false;
          alert("解析失败：" + ((err && err.message) || err));
        }
      });
    });
  }

  // ============ events ============
  function bind() {
    $("btn-start").addEventListener("click", startSession);
    $("btn-review").addEventListener("click", startReviewSession);
    // btn-settings / btn-papers-back / btn-set-back / btn-transmgr-back 已移除（顶栏 tab 替代）
    $("btn-back").addEventListener("click", () => show("dashboard"));
    $("btn-home").addEventListener("click", () => {
      // 完成屏返回：真题记词来源回题型层，否则回 dashboard；同时重置 studyMode
      if (studyMode === "passage" && reciteOrigin) {
        show("papers-recite");
        renderReciteSections(reciteOrigin.paperIdx);
      } else {
        show("dashboard");
      }
      studyMode = "daily";
      reciteOrigin = null;
    });
    // study 与 passage 各有一个 flip 按钮，都绑 flipCurrent
    ["btn-flip-study", "btn-flip-passage"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("click", flipCurrent);
    });

    // 真题模式导航
    $("btn-papers").addEventListener("click", () => { renderPapersList(); show("papers"); });
    $("btn-paper-back").addEventListener("click", () => show("papers"));
    $("btn-passage-back").addEventListener("click", () => {
      // 返回：真题记词来源 → 回题型层；否则回篇章列表
      if (reciteOrigin) {
        show("papers-recite");
        renderReciteSections(reciteOrigin.paperIdx);
      } else if (currentPaperIdx >= 0) openPaper(currentPaperIdx);
      else show("papers");
    });
    $("btn-read").addEventListener("click", openReader);
    $("btn-reader-back").addEventListener("click", () => {
      // 退出 reader：回该年份篇章列表；无则回真题年份列表
      if (currentPaperIdx >= 0) show("paper");
      else show("papers");
    });
    $("btn-reader-done").addEventListener("click", () => {
      if (currentPaperIdx >= 0) show("paper");
      else show("papers");
    });

    // 真题记词屏：层级返回（题型层 → 年份层）
    $("btn-recite-sec-back").addEventListener("click", () => renderRecitePapers());

    // 英一/英二切换条（真题列表屏 + 真题记词屏各一套）
    document.querySelectorAll(".variant-bar .variant-btn").forEach((b) => {
      b.addEventListener("click", () => setPapersVariant(b.dataset.variant));
    });

    // rating buttons：初始化时绑一次，按钮文本/数量由 setRatingButtons 动态替换；
    // 这里只绑键盘同款的分发逻辑。点击走 data-q / data-action。
    document.querySelectorAll(".rate").forEach((b) =>
      b.addEventListener("click", () => {
        const action = b.dataset.action;
        const q = b.dataset.q;
        if (action === "next") assessFullNext();
        else if (action === "mistake") assessFullMistake();
        else if (q) handleRate(q);
      })
    );

    // settings controls
    $("set-daily").addEventListener("input", (e) => {
      settings.dailyNew = parseInt(e.target.value, 10);
      $("val-daily").textContent = settings.dailyNew;
      applySettings();
    });
    $("set-rate").addEventListener("input", (e) => {
      settings.rate = parseFloat(e.target.value);
      $("val-rate").textContent = settings.rate.toFixed(1);
      applySettings();
    });
    $("set-autospeak").addEventListener("change", (e) => {
      settings.autoSpeak = e.target.checked; applySettings();
    });
    $("set-speak-word").addEventListener("change", (e) => {
      settings.speakOnWordClick = e.target.checked; applySettings();
    });
    document.querySelectorAll("#settings-nav button").forEach((b) =>
      b.addEventListener("click", () => selectSettingsSection(b.dataset.s))
    );
    document.querySelectorAll("#set-direction button").forEach((b) =>
      b.addEventListener("click", () => {
        settings.direction = b.dataset.v;
        document.querySelectorAll("#set-direction button").forEach((x) => x.classList.toggle("active", x === b));
        applySettings();
      })
    );

    // LLM settings（服务端代理：刷新模型 / 测试翻译 / 选模型 / 并发数 / 翻译管理）
    $("set-llm-model").addEventListener("change", async (e) => {
      const model = e.target.value;
      try { await Api.setLlmModel(model); updateLlmStatusSimple("已切换模型 · " + model, "ok"); }
      catch (err) { updateLlmStatusSimple("切换失败：" + (err && err.message || err), "err"); }
    });
    // 并发数滑块：拖动时实时显示数值，松手（change）才提交，避免拖动风暴
    (function () {
      const conc = $("set-llm-concurrency");
      const val = $("val-llm-concurrency");
      if (!conc || !val) return;
      conc.addEventListener("input", () => { val.textContent = conc.value; });
      conc.addEventListener("change", async () => {
        const n = parseInt(conc.value, 10);
        try {
          await Api.setLlmConcurrency(n);
          updateLlmStatusSimple("已设置并发 · " + n + " 路", "ok");
        } catch (err) {
          updateLlmStatusSimple("设置失败：" + (err && err.message || err), "err");
          refreshLlmUI(); // 失败回滚到服务端实际值
        }
      });
    })();
    $("btn-llm-fetch").addEventListener("click", async () => {
      updateLlmStatusSimple("刷新模型列表中…", "busy");
      try {
        const list = await Api.llmModels() || [];
        const sel = $("set-llm-model");
        const prev = sel.value;
        sel.innerHTML = list.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("");
        if (prev && list.indexOf(prev) >= 0) sel.value = prev;
        updateLlmStatusSimple("拉取到 " + list.length + " 个模型", "ok");
      } catch (err) {
        updateLlmStatusSimple("拉取失败：" + (err && err.message || err), "err");
      }
    });
    $("btn-llm-test").addEventListener("click", async () => {
      updateLlmStatusSimple("测试翻译中…", "busy");
      const sample = "The homeless make up a growing percentage of America's population.";
      try {
        const zh = await LLM.translate(sample);
        updateLlmStatusSimple("✓ 译文：" + zh, "ok");
      } catch (err) {
        updateLlmStatusSimple("测试失败：" + (err && err.message || err), "err");
      }
    });
    $("btn-transmgr").addEventListener("click", openTransMgr);
    // btn-transmgr-back 已移除（顶栏 tab 替代）
    document.querySelectorAll("#tm-filter button").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#tm-filter button").forEach((x) => x.classList.toggle("active", x === b));
        tmState.status = b.dataset.v;
        tmState.page = 1;
        loadTmPage();
      })
    );
    $("tm-q").addEventListener("input", (e) => {
      clearTimeout(tmQTimer);
      tmQTimer = setTimeout(() => {
        tmState.q = e.target.value.trim();
        tmState.page = 1;
        loadTmPage();
      }, 300);
    });
    $("tm-prev").addEventListener("click", () => {
      if (tmState.page > 1) { tmState.page--; loadTmPage(); }
    });
    $("tm-next").addEventListener("click", () => {
      const pages = Math.max(1, Math.ceil(tmTotal / tmState.size));
      if (tmState.page < pages) { tmState.page++; loadTmPage(); }
    });
    $("tm-translate-page").addEventListener("click", async () => {
      // 翻译本页所有未译句子
      const items = document.querySelectorAll("#tm-list .tm-item button[data-id]");
      const ids = [];
      const retryIds = [];
      items.forEach((b) => {
        const id = b.getAttribute("data-id");
        if (b.getAttribute("data-retry") === "1") retryIds.push(id);
        else ids.push(id);
      });
      const todo = ids.concat(retryIds);
      if (!todo.length) { alert("本页无待翻译项"); return; }
      if (!confirm("将翻译本页 " + todo.length + " 条，确认？")) return;
      try {
        await Api.batchTranslate(todo);
        await loadTmPage();
      } catch (err) {
        alert("批量翻译失败：" + ((err && err.message) || err));
      }
    });

    // ============ 解析管理页 events ============
    document.querySelectorAll("#pm-filter button").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#pm-filter button").forEach((x) => x.classList.toggle("active", x === b));
        pmState.status = b.dataset.v;
        pmState.page = 1;
        loadPmPage();
      })
    );
    $("pm-q").addEventListener("input", (e) => {
      clearTimeout(pmQTimer);
      pmQTimer = setTimeout(() => {
        pmState.q = e.target.value.trim();
        pmState.page = 1;
        loadPmPage();
      }, 300);
    });
    $("pm-prev").addEventListener("click", () => {
      if (pmState.page > 1) { pmState.page--; loadPmPage(); }
    });
    $("pm-next").addEventListener("click", () => {
      const pages = Math.max(1, Math.ceil(pmTotal / pmState.size));
      if (pmState.page < pages) { pmState.page++; loadPmPage(); }
    });
    $("pm-parse-page").addEventListener("click", async () => {
      const items = document.querySelectorAll("#pm-list .tm-item button[data-id]");
      const ids = [];
      items.forEach((b) => ids.push(b.getAttribute("data-id")));
      if (!ids.length) { alert("本页无待解析项"); return; }
      if (!confirm("将解析本页 " + ids.length + " 条，耗时较长，确认？")) return;
      const btn = $("pm-parse-page");
      const old = btn.textContent;
      btn.textContent = "解析中…（" + ids.length + " 条）";
      btn.disabled = true;
      try {
        const r = await Api.parseBatch(ids);
        await loadPmPage();
        alert("解析完成：" + (r.parsed || 0) + " 成功 / " + (r.failed || 0) + " 失败");
      } catch (err) {
        alert("批量解析失败：" + ((err && err.message) || err));
      } finally {
        btn.textContent = old;
        btn.disabled = false;
      }
    });
    $("pm-parse-all").addEventListener("click", async () => {
      // 取当前过滤条件下（含 status / q）的全部 id，分页拉完再批量提交。
      // 后端遇错即中止，前端把已完成的落库、剩余标 skipped，提示用户解决网关后重试。
      const btn = $("pm-parse-all");
      if (!confirm("将解析当前筛选下的全部未解析项，遇错即中止。耗时很长，确认？")) return;
      const old = btn.textContent;
      btn.textContent = "拉取列表…";
      btn.disabled = true;
      try {
        const ids = [];
        let page = 1;
        // 强制按 unparsed 取，避免重复解析已解析项；忽略 q（全量）
        const saved = { ...pmState };
        pmState.status = "unparsed"; pmState.q = ""; pmState.page = 1;
        while (true) {
          const res = await Api.listSentences({ ...pmState, page, size: 200 });
          const items = (res && res.items) || [];
          items.forEach((it) => ids.push(String(it.id)));
          btn.textContent = "拉取列表…（已收 " + ids.length + " 条）";
          const total = (res && res.total) || ids.length;
          if (ids.length >= total || items.length === 0) break;
          page++;
        }
        Object.assign(pmState, saved);
        if (!ids.length) { alert("当前筛选下无待解析项"); return; }
        if (!confirm("将解析 " + ids.length + " 条，遇错即中止。确认？")) return;
        btn.textContent = "解析中…（" + ids.length + " 条）";
        const r = await Api.parseBatch(ids);
        await loadPmPage();
        const skipped = (r.results || []).filter((x) => x.status === "skipped").length;
        const firstErr = (r.results || []).find((x) => x.status === "error");
        let msg = "解析完成：" + (r.parsed || 0) + " 成功 / " + (r.failed || 0) + " 失败";
        if (skipped) msg += " / " + skipped + " 跳过";
        if (firstErr) msg += "\n首个错误：" + (firstErr.error || "");
        alert(msg);
      } catch (err) {
        alert("批量解析失败：" + ((err && err.message) || err));
      } finally {
        btn.textContent = old;
        btn.disabled = false;
      }
    });

    // 账号 panel
    $("btn-account").addEventListener("click", openSettings);
    $("btn-acc-login").addEventListener("click", async () => {
      const u = $("acc-user").value.trim();
      const p = $("acc-pass").value;
      if (!u || !p) { alert("请输入用户名和密码"); return; }
      try {
        await Api.login(u, p);
        refreshAccountUI();
        try { await Store.sync(); } catch (e) {}
        renderDashboard();
      } catch (err) {
        alert("登录失败：" + ((err && err.message) || err));
      }
    });
    $("btn-acc-register").addEventListener("click", async () => {
      const u = $("acc-user").value.trim();
      const p = $("acc-pass").value;
      if (!u || !p) { alert("请输入用户名和密码"); return; }
      try {
        await Api.register(u, p);
        // 注册成功后自动登录
        try { await Api.login(u, p); } catch (e) {}
        refreshAccountUI();
        try { await Store.sync(); } catch (e) {}
        renderDashboard();
      } catch (err) {
        alert("注册失败：" + ((err && err.message) || err));
      }
    });
    $("btn-acc-logout").addEventListener("click", () => {
      if (!confirm("确认登出？")) return;
      Api.logout();
      refreshAccountUI();
      renderDashboard();
    });

    // export / import / reset
    $("btn-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(Store.exportData(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "english_web_progress_" + Store.dayKey() + ".json";
      a.click();
    });
    $("btn-import").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          Store.importData(JSON.parse(r.result));
          settings = Store.getSettings();
          applySettings(); openSettings();
          alert("导入成功");
        } catch (err) { alert("导入失败：" + err.message); }
      };
      r.readAsText(f);
    });
    $("btn-reset").addEventListener("click", () => {
      if (confirm("确定清空全部学习进度？此操作不可恢复。")) {
        Store.clearAll(); show("dashboard");
      }
    });

    // keyboard shortcuts（study 或 passage 屏）：按当前卡阶段 + 翻面态分发
    document.addEventListener("keydown", (e) => {
      // 真题原文阅读屏：空格/Enter 显示当前句翻译并推进到下一句
      const inReader = $("screen-reader").classList.contains("active");
      if (inReader) {
        if (e.target.tagName === "INPUT") return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (readerActiveSent) showReaderTrans(readerActiveSent);
        }
        return;
      }
      const inStudy = $("screen-study").classList.contains("active") || $("screen-passage").classList.contains("active");
      if (!inStudy) return;
      if (e.target.tagName === "INPUT") return;
      const k = e.key;
      const item = queue[qpos];
      if (!item) return;
      const c = item.card;
      const phase = uiPhase;

      // 翻面键：quiz2-front / quiz3-front / review-front（assess-front 不再翻面，直接 1/2/3 评分）
      const flipPhase = (phase === "quiz2-front" || phase === "quiz3-front" ||
                         phase === "review-front");
      if ((k === " " || k === "Enter") && flipPhase) {
        e.preventDefault();
        flipCurrent();
        return;
      }

      // 翻面后的阶段：空格/Enter 优先展开「查看例句翻译」（未展开时）+ 同步加载解析，再走原流程
      const backWithTrans = (phase === "assess-full" ||
                             phase === "review-back" || phase === "quiz2-back" || phase === "quiz3-back");
      if ((k === " " || k === "Enter") && backWithTrans) {
        if (triggerTransButton()) {
          e.preventDefault();
          triggerParseSide(); // 译文展开的同时加载解析到侧栏/抽屉
          return;
        }
        // assess-full 译文已展开或无译文 → 空格 = 下一词
        if (phase === "assess-full") { e.preventDefault(); assessFullNext(); return; }
      }

      // 数字键分发
      if (k === " " || k === "Enter") {
        // 全卡视图：空格/Enter = 下一词（兜底，正常已被上面 backWithTrans 分支处理）
        if (phase === "assess-full") { e.preventDefault(); assessFullNext(); return; }
      }

      // assess-full 的数字键：不依赖 c.state，因为 SRS.answer 后 state 已从 new 变成
      // review/learn，但 uiPhase 仍是 assess-full。必须放在 state 分发之前。
      if (phase === "assess-full") {
        // 1=下一词；2=记错了（仅认识/模糊路径有，「忘记」路径下禁用）
        if (k === "1") { e.preventDefault(); assessFullNext(); }
        else if (k === "2" && assessChoice !== "again") { e.preventDefault(); assessFullMistake(); }
        return;
      }

      if (c.state === "new") {
        if (phase === "assess-front") {
          // 1=认识 2=模糊 3=忘记
          if (k === "1") { e.preventDefault(); handleRate("good"); }
          else if (k === "2") { e.preventDefault(); handleRate("hard"); }
          else if (k === "3") { e.preventDefault(); handleRate("again"); }
        }
        return;
      }

      if (c.state === "learn") {
        const quiz = c.quiz || 0;
        if (quiz === 1 && phase === "quiz1") {
          // 4 个选项，键盘 1-4 对应
          const idx = ["1", "2", "3", "4"].indexOf(k);
          if (idx >= 0 && !quizLocked) { e.preventDefault(); quiz1Answer(idx); }
          return;
        }
        if ((quiz === 2 && phase === "quiz2-back") ||
            (quiz === 3 && phase === "quiz3-back")) {
          if (k === "1") { e.preventDefault(); learnRate("good"); }
          else if (k === "2") { e.preventDefault(); learnRate("again"); }
          return;
        }
        return;
      }

      // review
      if (c.state === "review" && phase === "review-back") {
        if (k === "1") { e.preventDefault(); rate("again"); }
        else if (k === "2") { e.preventDefault(); rate("hard"); }
        else if (k === "3") { e.preventDefault(); rate("good"); }
        else if (k === "4") { e.preventDefault(); rate("easy"); }
      }
    });

    // ---- 全局 tab 导航（顶栏 / 底栏 / dashboard 快捷操作）----
    document.querySelectorAll('.header-nav button[data-tab], .tab-bar button[data-tab], .action-btn[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab;
        if (tab === 'study') { startSession(); return; }
        if (tab === 'settings') { openSettings(); return; }
        if (tab === 'transmgr') { openTransMgr(); return; }
        if (tab === 'parsemgr') { openParseMgr(); return; }
        if (tab === 'papers') { renderPapersList(); show('papers'); return; }
        if (tab === 'papers-recite') { renderRecitePapers(); show('papers-recite'); return; }
        show(tab);
      });
    });

    // ---- 主题切换 ----
    const btnTheme = $('btn-theme');
    function applyTheme(t) {
      document.body.dataset.theme = t;
      if (btnTheme) btnTheme.textContent = t === 'dark' ? '☀️' : '🌙';
      try { localStorage.setItem('ew.theme', t); } catch (e) {}
    }
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
      });
    }
    try { const t = localStorage.getItem('ew.theme'); if (t) applyTheme(t); } catch (e) {}

    // ---- dashboard 快捷导出 ----
    const btnExportQuick = $('btn-export-quick');
    if (btnExportQuick) {
      btnExportQuick.addEventListener('click', () => {
        const exp = $('btn-export');
        if (exp) exp.click();
      });
    }
  }

  // ============ init ============
  async function init() {
    bind();
    // 启动时构建例句反向索引（word_idx -> [sentence,...]）与点词查义委托
    buildExampleIndex();
    ensureWordClickDelegation();
    show("dashboard");
    // 启动时若已登录，校验 token 仍有效，并同步进度
    if (window.Api && Api.isLoggedIn()) {
      try {
        await Api.me();
        refreshAccountUI();
        try { await Store.sync(); } catch (e) {}
        renderDashboard();
      } catch (err) {
        // token 失效
        try { Api.setToken(""); } catch (e) {}
        refreshAccountUI();
        renderDashboard();
      }
    } else {
      refreshAccountUI();
    }
    // re-render when day rolls over (e.g. leaving tab open overnight)
    setInterval(renderDashboard, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();})();
