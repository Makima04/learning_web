// TTS —— 浏览器 speechSynthesis。lang=en-US，rate 取 settings。
// Chrome：cancel 后立刻 speak 会哑火；Utterance 无引用会被 GC 导致播一半就停。
const FEMALE_VOICE_PATTERNS = [
  /\bava(?:multilingual)?\b/i,
  /\baria\b/i,
  /\bjenny\b/i,
  /\bemma\b/i,
  /google us english/i,
  /\bsamantha\b/i,
  /\bzira\b/i,
  /\ballison\b/i,
  /\bsusan\b/i,
  /\bhazel\b/i,
  /\blibby\b/i,
  /\bsonia\b/i,
  /\bkaren\b/i,
  /\bmoira\b/i,
  /\btessa\b/i,
  /\bfiona\b/i,
  /\bvictoria\b/i,
  /\bjoanna\b/i,
  /\bsalli\b/i,
  /\bkimberly\b/i,
  /\bkendra\b/i,
  /\bruth\b/i,
  /\bmichelle\b/i,
  /\bfemale\b/i,
] as const;

/** Chromium：cancel() 后需隔一拍再 speak，否则常年排队失败 */
const CANCEL_SPEAK_DELAY_MS = 50;

let speechRequest = 0;
let voicesLoading: Promise<SpeechSynthesisVoice[]> | null = null;
let speakTimer = 0;
/** 必须抓住当前 utterance，否则 Chrome 会把它 GC 掉 */
let currentUtterance: SpeechSynthesisUtterance | null = null;

function selectFemaleVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang));
  for (const pattern of FEMALE_VOICE_PATTERNS) {
    const matches = english.filter((voice) => pattern.test(voice.name));
    const preferred = matches.find((voice) => /^en[-_]US$/i.test(voice.lang));
    if (preferred) return preferred;
    if (matches[0]) return matches[0];
  }
  return english[0] || null;
}

function loadVoices(synthesis: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const available = synthesis.getVoices();
  if (available.length) return Promise.resolve(available);
  if (voicesLoading) return voicesLoading;

  voicesLoading = new Promise((resolve) => {
    let timeoutId = 0;
    const finish = () => {
      synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      window.clearTimeout(timeoutId);
      const voices = synthesis.getVoices();
      voicesLoading = null;
      resolve(voices);
    };
    const handleVoicesChanged = () => {
      if (synthesis.getVoices().length) finish();
    };
    synthesis.addEventListener("voiceschanged", handleVoicesChanged);
    timeoutId = window.setTimeout(finish, 1_500);
  });

  return voicesLoading;
}

function clearSpeakTimer() {
  if (!speakTimer) return;
  window.clearTimeout(speakTimer);
  speakTimer = 0;
}

function play(
  synthesis: SpeechSynthesis,
  text: string,
  rate: number,
  onend: (() => void) | undefined,
  request: number,
  voices: SpeechSynthesisVoice[]
) {
  if (request !== speechRequest) return;
  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  utterance.lang = "en-US";
  utterance.rate = rate || 1.0;
  utterance.pitch = 1;
  const voice = selectFemaleVoice(voices);
  if (voice) utterance.voice = voice;
  utterance.onend = () => {
    if (currentUtterance === utterance) currentUtterance = null;
    if (request === speechRequest) onend?.();
  };
  utterance.onerror = () => {
    if (currentUtterance === utterance) currentUtterance = null;
  };
  if (synthesis.paused) synthesis.resume();
  synthesis.speak(utterance);
  if (synthesis.paused) synthesis.resume();
}

function queuePlay(
  synthesis: SpeechSynthesis,
  text: string,
  rate: number,
  onend: (() => void) | undefined,
  request: number,
  voices: SpeechSynthesisVoice[]
) {
  clearSpeakTimer();
  speakTimer = window.setTimeout(() => {
    speakTimer = 0;
    play(synthesis, text, rate, onend, request, voices);
  }, CANCEL_SPEAK_DELAY_MS);
}

export function stopSpeaking() {
  speechRequest += 1;
  clearSpeakTimer();
  currentUtterance = null;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function speak(text: string, rate = 1.0, onend?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  try {
    const synthesis = window.speechSynthesis;
    const request = ++speechRequest;
    clearSpeakTimer();
    synthesis.cancel();
    const start = (voices: SpeechSynthesisVoice[]) => {
      queuePlay(synthesis, trimmed, rate, onend, request, voices);
    };
    const voices = synthesis.getVoices();
    if (voices.length) {
      start(voices);
      return;
    }
    void loadVoices(synthesis).then((loaded) => {
      if (request !== speechRequest) return;
      start(loaded);
    });
  } catch {
    /* ignore */
  }
}

export function speakEnglish(en: string, rate = 1.0) {
  speak(en, rate);
}
