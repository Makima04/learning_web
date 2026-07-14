import { beforeEach, describe, expect, it, vi } from "vitest";
import { speak } from "@/lib/tts";

class MockUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;

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

describe("English TTS voice selection", () => {
  beforeEach(() => {
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  });

  it("selects Microsoft Ava instead of the default male voice", () => {
    const spoken: MockUtterance[] = [];
    const synthesis = {
      addEventListener: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => [
        voice("Microsoft Guy Online (Natural) - English (United States)", "en-US", true),
        voice("Microsoft Ava Online (Natural) - English (United States)"),
      ]),
      removeEventListener: vi.fn(),
      speak: vi.fn((utterance: MockUtterance) => spoken.push(utterance)),
    };
    vi.stubGlobal("window", { speechSynthesis: synthesis });

    speak("percent");

    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.name).toContain("Microsoft Ava");
    expect(spoken[0]).toMatchObject({ lang: "en-US", text: "percent" });
  });

  it("waits for Edge to finish loading its voice list", async () => {
    let voices: SpeechSynthesisVoice[] = [];
    const listeners: EventListener[] = [];
    const spoken: MockUtterance[] = [];
    const synthesis = {
      addEventListener: vi.fn((_name: string, listener: EventListener) => {
        listeners.push(listener);
      }),
      cancel: vi.fn(),
      getVoices: vi.fn(() => voices),
      removeEventListener: vi.fn(),
      speak: vi.fn((utterance: MockUtterance) => spoken.push(utterance)),
    };
    vi.stubGlobal("window", {
      clearTimeout,
      setTimeout,
      speechSynthesis: synthesis,
    });

    speak("vocabulary");
    expect(spoken).toHaveLength(0);

    voices = [voice("Microsoft Aria Online (Natural) - English (United States)")];
    listeners[0]?.(new Event("voiceschanged"));
    await Promise.resolve();

    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.name).toContain("Microsoft Aria");
  });
});
