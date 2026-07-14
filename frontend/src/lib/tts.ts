// TTS —— 移植自 web/app.js speak/speakEntry。lang=en-US，rate 取 settings。
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

let speechRequest = 0;
let voicesLoading: Promise<SpeechSynthesisVoice[]> | null = null;

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
  utterance.lang = "en-US";
  utterance.rate = rate || 1.0;
  utterance.pitch = 1;
  const voice = selectFemaleVoice(voices);
  if (voice) utterance.voice = voice;
  if (onend) utterance.onend = onend;
  synthesis.cancel();
  synthesis.speak(utterance);
}

export function speak(text: string, rate = 1.0, onend?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synthesis = window.speechSynthesis;
    const request = ++speechRequest;
    synthesis.cancel();
    const voices = synthesis.getVoices();
    if (voices.length) {
      play(synthesis, text, rate, onend, request, voices);
      return;
    }
    void loadVoices(synthesis).then((loaded) => {
      play(synthesis, text, rate, onend, request, loaded);
    });
  } catch {
    /* ignore */
  }
}

export function speakEnglish(en: string, rate = 1.0) {
  speak(en, rate);
}
