// TTS —— 移植自 web/app.js speak/speakEntry。lang=en-US，rate 取 settings。
export function speak(text: string, rate = 1.0, onend?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate || 1.0;
    u.pitch = 1;
    if (onend) u.onend = onend;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function speakEnglish(en: string, rate = 1.0) {
  speak(en, rate);
}
