import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speak, stopSpeaking } from "@/lib/tts";

class MockUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public text: string) {}
}

function voice(name: string, lang = "en-US", isDefault = false) {
  return {
    default: isDefault,
    lang,
    localService: true,
    name,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

function installSynthesis(voices: SpeechSynthesisVoice[] | (() => SpeechSynthesisVoice[])) {
  const spoken: MockUtterance[] = [];
  const synthesis = {
    paused: false,
    pending: false,
    speaking: false,
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => (typeof voices === "function" ? voices() : voices)),
    removeEventListener: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn((utterance: MockUtterance) => spoken.push(utterance)),
  };
  vi.stubGlobal("window", {
    speechSynthesis: synthesis,
    setTimeout,
    clearTimeout,
  });
  return { synthesis, spoken };
}

describe("English TTS", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  });

  afterEach(() => {
    stopSpeaking();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("selects Microsoft Ava instead of the default male voice", () => {
    const { spoken } = installSynthesis([
      voice("Microsoft Guy Online (Natural) - English (United States)", "en-US", true),
      voice("Microsoft Ava Online (Natural) - English (United States)"),
    ]);

    speak("percent");
    expect(spoken).toHaveLength(0);
    vi.advanceTimersByTime(50);

    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.name).toContain("Microsoft Ava");
    expect(spoken[0]).toMatchObject({ lang: "en-US", text: "percent" });
  });

  it("does not cancel-then-speak in the same turn", () => {
    const { synthesis, spoken } = installSynthesis([
      voice("Microsoft Ava Online (Natural) - English (United States)"),
    ]);

    speak("percent");
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(0);

    vi.advanceTimersByTime(50);
    expect(spoken).toHaveLength(1);
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest request when speak is called again before playback", () => {
    const { spoken } = installSynthesis([
      voice("Microsoft Ava Online (Natural) - English (United States)"),
    ]);

    speak("first");
    speak("second");
    vi.advanceTimersByTime(50);

    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("second");
  });

  it("ignores blank text", () => {
    const { spoken, synthesis } = installSynthesis([
      voice("Microsoft Ava Online (Natural) - English (United States)"),
    ]);

    speak("   ");
    vi.advanceTimersByTime(50);

    expect(synthesis.cancel).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
  });

  it("resumes if the engine is stuck paused", () => {
    const { synthesis } = installSynthesis([
      voice("Microsoft Ava Online (Natural) - English (United States)"),
    ]);
    synthesis.paused = true;

    speak("resume");
    vi.advanceTimersByTime(50);

    expect(synthesis.resume).toHaveBeenCalled();
  });

  it("stopSpeaking drops a queued utterance", () => {
    const { spoken } = installSynthesis([
      voice("Microsoft Ava Online (Natural) - English (United States)"),
    ]);

    speak("queued");
    stopSpeaking();
    vi.advanceTimersByTime(50);

    expect(spoken).toHaveLength(0);
  });

  it("waits for Edge to finish loading its voice list", async () => {
    let voices: SpeechSynthesisVoice[] = [];
    const listeners: EventListener[] = [];
    const { spoken, synthesis } = installSynthesis(() => voices);
    synthesis.addEventListener = vi.fn((_name: string, listener: EventListener) => {
      listeners.push(listener);
    });

    speak("vocabulary");
    expect(spoken).toHaveLength(0);

    voices = [voice("Microsoft Aria Online (Natural) - English (United States)")];
    listeners[0]?.(new Event("voiceschanged"));
    await Promise.resolve();
    expect(spoken).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(50);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.name).toContain("Microsoft Aria");
  });
});
