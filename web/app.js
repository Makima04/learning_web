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
      low.replace(/s$/, ""), low.replace(/es$/, ""),
      low.replace(/ing$/, ""), low.replace(/ed$/, ""),
      low.replace(/ing$/, "e"), low.replace(/ed$/, "e"),
      low.replace(/ies$/, "y"), low.replace(/ied$/, "y"),
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
  // studyMode: "daily" | "passage" | "learn" | "review" —— 决定 nextCard 走哪条队列
  // daily: 复习+新词混排（标准 SRS）；passage: 真题篇章词；
  // learn: 仅新词（btn-start「学习新词」）；review: 仅复习+learn 在练卡（btn-review「复习」）
  let studyMode = "daily";

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
    const papers = window.PAPERS || [];
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
          <div class="pc-title">${p.year ? p.year + " 年考研英语真题" : p.source}</div>
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
    $("paper-title").textContent = (p.year ? p.year + " 年" : "真题") + " 篇章";
    const wrap = $("passages-list");
    wrap.innerHTML = "";
    const TYPE_LABEL = {
      use_of_english: "完形", reading_a: "阅读A", reading_b: "新题型", translation: "翻译", writing: "写作",
    };
    p.sections.forEach((sec, si) => {
      sec.passages.forEach((psg, pi) => {
        // 实时算「待背词数」：去掉已进入复习队列(已背熟)的
        const pending = psg.words.filter((w) => {
          const c = Store.getCard(w.idx);
          return !(c && c.state === "review");
        }).length;
        const learned = psg.words.length - pending;
        const card = document.createElement("div");
        card.className = "psg-card";
        const subHTML = learned > 0
          ? `命中 <b>${psg.words.length}</b> 词 · 待背 <b>${pending}</b>（已背 ${learned}）`
          : `命中 <b>${psg.words.length}</b> 词 · ${psg.itemCount || 0} 题 · ${psg.body.length} 字`;
        card.innerHTML = `<span class="ps-type">${TYPE_LABEL[sec.type] || sec.type}</span>
          <div class="ps-body">
            <div class="ps-title">${psg.label}</div>
            <div class="ps-sub">${subHTML}</div>
          </div><div class="pc-arrow">›</div>`;
        card.addEventListener("click", () => startPassageStudy(idx, si, pi));
        wrap.appendChild(card);
      });
    });
    show("paper");
  }

  let currentPaperIdx = -1;

  function startPassageStudy(paperIdx, secIdx, psgIdx) {
    const p = (window.PAPERS || [])[paperIdx];
    const psg = p.sections[secIdx].passages[psgIdx];
    // 该篇命中的全部红宝书词
    const allWords = psg.words.slice();
    passageReader = {
      title: (p.year ? p.year + " 年 " : "") + (psg.label || ""),
      body: psg.body,
      words: psg.words.map((w) => w.english),
    };
    if (allWords.length === 0) {
      alert("该篇未匹配到红宝书词汇。");
      return;
    }
    // 共用记忆曲线：按词 idx 取已有卡片。已毕业进复习队列(review)的词 = 已背下，跳过；
    // 只保留 new(没见过) 和 learn(今天还在学、没背熟) 的词。
    let skipped = 0;
    const fresh = [];
    for (const w of allWords) {
      const c = Store.getCard(w.idx);
      if (c && c.state === "review") { skipped++; continue; }
      fresh.push(w);
    }
    passageWords = fresh;
    passageSkipped = skipped;
    if (fresh.length === 0) {
      // 本篇词全背过了 —— 直接读原文加深
      studyMode = "passage";
      openReader();
      return;
    }
    studyMode = "passage";
    sessionStats = { again: 0, studied: 0, newDone: 0, reviewDone: 0 };
    // 队列：每词一张卡，复用已有 card 或新建
    queue = fresh.map((w) => {
      const c = Store.getCard(w.idx) || SRS.newCard();
      // 统一成与 window.WORDS 一致的数组形态，并附带真题例句，供 renderCard 用 entry[1]/[2]/.sentences
      const entry = [w.idx, w.english, w.senses];
      entry.sentences = w.sentences || [];
      return { idx: w.idx, card: c, isNew: c.state === "new", entry };
    });
    qpos = 0;
    show("passage");
    nextCard();
  }

  function nextCard() {
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
  // uiPhase: assess-front | assess-revealed | assess-full | quiz1 | quiz2-front | quiz2-back | quiz3-front | quiz3-back | review-front | review-back
  let uiPhase = "front";
  let assessChoice = null;      // assess 阶段最后选的 q（good/hard/again）
  let quizChoices = [];         // quiz=1 的 4 个选项 [{cn, correct}]
  let quizLocked = false;       // quiz=1 答题后短暂锁，防止重复点

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
      const isTarget = (ml === low) ||
        ml.replace(/s$/, "") === low || ml.replace(/es$/, "") === low ||
        ml.replace(/ing$/, "") === low || ml.replace(/ed$/, "") === low;
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
    const trans = withTrans
      ? `<div class="c-trans"><button class="c-trans-btn" data-en="${esc(example)}">查看例句翻译</button></div>`
      : "";
    return `<div class="c-example"><div class="c-example-label">真题例句</div>
      <div class="c-example-text">${highlightTarget(example, entry[1])}</div>${trans}</div>`;
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
    if (studyMode === "passage") $("btn-read").hidden = true;
  }

  // ---- 阶段0 assess（新词 state=new）----
  function renderAssess(item) {
    const entry = currentEntry;
    const example = getExampleFor(item);
    assessChoice = null;
    uiPhase = "assess-front";
    const frontHTML = `<div class="c-en">${esc(entry[1])}</div>`;
    const area = cardArea();
    area.innerHTML = `<div class="flip-card"><div class="flip-inner"><div class="flip-face flip-front assess-front">
      <div class="c-type">新词 · 评估</div>
      <button class="c-speak" title="发音">🔊</button>
      ${frontHTML}
      <div class="c-tap">点击卡片或按空格显示释义</div>
    </div></div></div>`;
    setRatingButtons([]);
    flipBtn().hidden = false;
    wireFlip(area);
    area.querySelectorAll(".c-speak").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry); })
    );
    if (settings.autoSpeak) speakEntry(entry);
    rafFit();
  }

  function flipAssess(item) {
    const sensesHTML = sensesHTMLOf(entry);
    const exampleHTML = exampleBlockHTML(entry, example, true);
    const area = cardArea();
    area.innerHTML = `<div class="flip-card"><div class="flip-inner flipped"><div class="flip-face flip-back">
      <div class="c-type">新词 · 评估</div>
      <button class="c-speak" title="发音">🔊</button>
      <div class="c-en">${esc(entry[1])}</div>
      <div class="c-senses">${sensesHTML}</div>
      ${exampleHTML}
    </div></div></div>`;
    uiPhase = "assess-revealed";
    setRatingButtons([
      { k: "1", l: "认识", q: "good" },
      { k: "2", l: "模糊", q: "hard" },
      { k: "3", l: "不记得", q: "again" },
    ], "rating-3");
    flipBtn().hidden = true;
    wireTransButtons();
    area.querySelectorAll(".c-speak").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); speakEntry(entry, { example }); })
    );
    if (settings.autoSpeak) speakEntry(entry, { example });
    rafFit();
  }

  // assess 按钮提交：answer→saveCard→bumpMeta→切全卡视图（不 nextCard）
  function assessSubmit(q) {
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
      again: "已标记「不记得」→ 进入 3 次练习",
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
    // good/hard → 下一词 + 记错了（2 按钮）；again（不记得）→ 仅下一词（1 按钮）
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
    rafFit();
  }

  // ---- 统一 rate 分发 ----
  function handleRate(q) {
    const item = queue[qpos];
    if (!item) return;
    const c = item.card;
    if (c.state === "new") {
      // assess-revealed 的 3 按钮
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
    if (!inner || inner.classList.contains("flipped")) return;
    flipCurrent();
  }
  function flipCurrent() {
    const item = queue[qpos];
    if (!item) return;
    const c = item.card;
    if (c.state === "new") {
      if (uiPhase === "assess-front") flipAssess(item);
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
    if (uiPhase === "review-front") renderReview(item, true);
  }

  function updateRatingPreviews(card) {
    ["again", "hard", "good", "easy"].forEach((q) => {
      const el = $("i-" + q);
      if (el) el.textContent = SRS.preview(card, q);
    });
  }

  // review 的 4 按钮评分（保持原逻辑：again 落回 learn 会重走练习）
  function rate(q) {
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
    // 发音
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
    // Esc 收起
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideWordPopover();
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
    // passage 模式完成后给出「读真题原文」入口；并提示有多少词是已背过自动跳过的
    const existing = document.getElementById("btn-read-done");
    if (existing) existing.remove();
    const existingSkip = document.getElementById("done-skip-note");
    if (existingSkip) existingSkip.remove();
    if (studyMode === "passage" && passageReader) {
      if (passageSkipped > 0) {
        const note = document.createElement("div");
        note.id = "done-skip-note";
        note.className = "hint";
        note.style.textAlign = "center";
        note.textContent = `本篇有 ${passageSkipped} 个词已背熟，自动跳过 · 共用记忆曲线`;
        document.querySelector("#screen-done .done-wrap").appendChild(note);
      }
      const btn = document.createElement("button");
      btn.id = "btn-read-done";
      btn.className = "primary big";
      btn.innerHTML = "读真题原文 → 在语境中加深";
      btn.addEventListener("click", openReader);
      document.querySelector("#screen-done .done-wrap").appendChild(btn);
    }
  }

  // ---- 真题原文阅读器 ----
  function openReader() {
    if (!passageReader) { show("dashboard"); return; }
    $("reader-title").textContent = passageReader.title || "真题原文";
    const body = $("reader-body");
    // 把正文按段落（已有换行）渲染；命中词高亮
    const wordSet = new Set((passageReader.words || []).map((w) => w.toLowerCase()));
    // 也加入屈折变形的高亮较难，这里只高亮词表原形出现的 token
    const paras = passageReader.body.split(/\n+/).filter((p) => p.trim());
    body.innerHTML = paras.map((p) => `<p>${highlightWords(p, wordSet)}</p>`).join("");
    show("reader");
    wireWordClicks(body);
  }

  function highlightWords(text, wordSet) {
    // 按词边界切，命中 wordSet 的加 .r-hl；词库收录的词都可点查
    return text.replace(/[A-Za-z][A-Za-z\-']*/g, (m) => {
      const low = m.toLowerCase();
      const e = esc(m);
      const inSet = wordSet.has(low) ||
        wordSet.has(low.replace(/s$/, "")) || wordSet.has(low.replace(/es$/, "")) ||
        wordSet.has(low.replace(/ing$/, "")) || wordSet.has(low.replace(/ed$/, ""));
      const lookup = lookupWord(low);
      if (inSet) return `<span class="r-hl c-word" data-w="${m}">${e}</span>`;
      if (lookup) return `<span class="c-word" data-w="${m}">${e}</span>`;
      return e;
    });
  }

  // ============ screens ============
  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("screen-" + name).classList.add("active");
    // 同步顶栏/底栏 tab 高亮
    document.querySelectorAll(".header-nav button[data-tab], .tab-bar button[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    // 子屏（非主 tab）隐藏全局 header/tab-bar
    const isMain = ["dashboard", "papers", "transmgr", "settings"].includes(name);
    document.body.classList.toggle("sub-screen", !isMain);
    if (name === "dashboard") renderDashboard();
  }

  // ============ settings UI ============
  function openSettings() {
    $("set-daily").value = settings.dailyNew;
    $("val-daily").textContent = settings.dailyNew;
    $("set-rate").value = settings.rate;
    $("val-rate").textContent = settings.rate.toFixed(1);
    $("set-autospeak").checked = !!settings.autoSpeak;
    document.querySelectorAll("#set-direction button").forEach((b) =>
      b.classList.toggle("active", b.dataset.v === settings.direction)
    );
    // LLM: 服务端代理，从 Api 拉配置/模型列表
    refreshAccountUI();
    refreshLlmUI();
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
      const c = Math.max(1, Math.min(16, parseInt(conc, 10) || 4));
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

  // ============ events ============
  function bind() {
    $("btn-start").addEventListener("click", startSession);
    $("btn-review").addEventListener("click", startReviewSession);
    // btn-settings / btn-papers-back / btn-set-back / btn-transmgr-back 已移除（顶栏 tab 替代）
    $("btn-back").addEventListener("click", () => show("dashboard"));
    $("btn-home").addEventListener("click", () => show("dashboard"));
    // study 与 passage 各有一个 flip 按钮，都绑 flipCurrent
    ["btn-flip-study", "btn-flip-passage"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("click", flipCurrent);
    });

    // 真题模式导航
    $("btn-papers").addEventListener("click", () => { renderPapersList(); show("papers"); });
    $("btn-paper-back").addEventListener("click", () => show("papers"));
    $("btn-passage-back").addEventListener("click", () => {
      // 返回篇章列表
      if (currentPaperIdx >= 0) openPaper(currentPaperIdx);
      else show("papers");
    });
    $("btn-read").addEventListener("click", openReader);
    $("btn-reader-back").addEventListener("click", () => show("passage"));
    $("btn-reader-done").addEventListener("click", () => show("passage"));

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
      const inStudy = $("screen-study").classList.contains("active") || $("screen-passage").classList.contains("active");
      if (!inStudy) return;
      if (e.target.tagName === "INPUT") return;
      const k = e.key;
      const item = queue[qpos];
      if (!item) return;
      const c = item.card;
      const phase = uiPhase;

      // 翻面键：assess-front / quiz2-front / quiz3-front / review-front
      const flipPhase = (phase === "assess-front" || phase === "quiz2-front" ||
                         phase === "quiz3-front" || phase === "review-front");
      if ((k === " " || k === "Enter") && flipPhase) {
        e.preventDefault();
        flipCurrent();
        return;
      }

      // 翻面后的阶段：空格/Enter 优先展开「查看例句翻译」（未展开时），再走原流程
      const backWithTrans = (phase === "assess-full" || phase === "assess-revealed" ||
                             phase === "review-back" || phase === "quiz2-back" || phase === "quiz3-back");
      if ((k === " " || k === "Enter") && backWithTrans) {
        if (triggerTransButton()) { e.preventDefault(); return; }
        // assess-full 译文已展开或无译文 → 空格 = 下一词
        if (phase === "assess-full") { e.preventDefault(); assessFullNext(); return; }
      }

      // 数字键分发
      if (k === " " || k === "Enter") {
        // 全卡视图：空格/Enter = 下一词（兜底，正常已被上面 backWithTrans 分支处理）
        if (phase === "assess-full") { e.preventDefault(); assessFullNext(); return; }
      }

      if (c.state === "new") {
        if (phase === "assess-revealed") {
          // 1=认识 2=模糊 3=不记得
          if (k === "1") { e.preventDefault(); handleRate("good"); }
          else if (k === "2") { e.preventDefault(); handleRate("hard"); }
          else if (k === "3") { e.preventDefault(); handleRate("again"); }
        } else if (phase === "assess-full") {
          // 1=下一词；2=记错了（仅认识/模糊路径有，「不记得」路径下禁用）
          if (k === "1") { e.preventDefault(); assessFullNext(); }
          else if (k === "2" && assessChoice !== "again") { e.preventDefault(); assessFullMistake(); }
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
        if (tab === 'papers') { renderPapersList(); show('papers'); return; }
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
