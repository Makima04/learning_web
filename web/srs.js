// srs.js — 间隔重复状态机（Anki 风格简化 SM-2）。
// 纯函数无依赖。状态住在每个 card 对象上。
// 新词走「assess + 3 次练习」流程，learn 阶段用 quiz 计数（1/2/3），
// 不再用基于时间的 LEARN_STEPS。
(function (global) {
  "use strict";
  const DAY = 86400000;
  const EASE_MIN = 1.3, EASE_MAX = 3.0;
  const EASE_INIT = 2.5;

  function clampEase(e) { return Math.max(EASE_MIN, Math.min(EASE_MAX, e)); }
  function round(x) { return Math.round(x); }

  // 新建空卡。quiz 字段：0/undefined=无待办练习，1/2/3=待做第 N 次练习。
  function newCard() {
    return { state: "new", due: 0, ivl: 0, ease: EASE_INIT, reps: 0, lapses: 0, quiz: 0 };
  }

  // 答题。q ∈ {again, hard, good, easy}。**就地改 card**。
  // 返回 { card, interval } —— interval 是人类可读的间隔预览字符串。
  function answer(card, q, now) {
    now = now || Date.now();
    card = card || newCard();

    if (card.state === "new") {
      if (q === "again" || q === "hard") {
        // 模糊 / 不认识 / 记错了：进 learn，待做第 1 次练习
        card.state = "learn"; card.quiz = 1; card.due = 0;
      } else if (q === "good") {
        // 认识：直接毕业进 review
        card.state = "review"; card.reps = 1; card.ivl = 1; card.quiz = 0;
        card.due = now + 1 * DAY;
      } else { // easy
        card.state = "review"; card.reps = 1; card.ivl = 4; card.quiz = 0;
        card.ease = clampEase(card.ease + 0.15);
        card.due = now + 4 * DAY;
      }
    } else if (card.state === "learn") {
      // 用 quiz 计数（1/2/3），不用时间。quiz=1→2→3，quiz=3 答 good 毕业。
      if (q === "again") {
        // 记错了：重来第 1 次练习
        card.quiz = 1; card.due = 0;
      } else if (q === "hard") {
        // 保守起见，与 again 一致（练习流程里 hard 基本不会出现，保留语义）
        card.quiz = 1; card.due = 0;
      } else if (q === "good") {
        if ((card.quiz || 0) >= 3) {
          card.state = "review"; card.reps = Math.max(1, card.reps);
          card.ivl = 1; card.quiz = 0;
          card.due = now + 1 * DAY;
        } else {
          card.quiz = (card.quiz || 0) + 1; card.due = 0;
        }
      } else { // easy -> 提前毕业
        card.state = "review"; card.reps = Math.max(1, card.reps);
        card.ivl = 4; card.quiz = 0;
        card.ease = clampEase(card.ease + 0.15);
        card.due = now + 4 * DAY;
      }
    } else { // review
      if (q === "again") {
        // 回落 learn，重走 3 次练习
        card.lapses++; card.reps = 0;
        card.ease = clampEase(card.ease - 0.2);
        card.state = "learn"; card.quiz = 1; card.due = 0;
      } else {
        let factor;
        if (q === "hard") { factor = 1.2; card.ease = clampEase(card.ease - 0.15); }
        else if (q === "good") { factor = card.ease; }
        else { factor = card.ease * 1.3; card.ease = clampEase(card.ease + 0.15); }
        card.ivl = Math.max(1, round(card.ivl * factor));
        card.reps++; card.quiz = 0;
        card.due = now + card.ivl * DAY;
      }
    }
    return { card, interval: describe(card, now) };
  }

  // 人类可读的「刚排定的间隔」预览。
  function describe(card, now) {
    now = now || Date.now();
    // learn 阶段（练习中）：due=0 表示本次会话内继续
    if (card.state === "learn") return "练习中";
    const ms = card.due - now;
    if (ms < 0) return "现在";
    if (ms < DAY) {
      const m = Math.max(1, round(ms / 60000));
      return m + "分";
    }
    const d = round(ms / DAY);
    if (d === 1) return "1天";
    return d + "天";
  }

  // 预览「若答 q 会得到的间隔」，不改原 card。
  function preview(card, q, now) {
    now = now || Date.now();
    const clone = JSON.parse(JSON.stringify(card || newCard()));
    const { card: _ } = answer(clone, q, now);
    return describe(clone, now);
  }

  global.SRS = { newCard, answer, preview, describe, DAY, EASE_INIT, EASE_MIN, EASE_MAX };
})(window);
