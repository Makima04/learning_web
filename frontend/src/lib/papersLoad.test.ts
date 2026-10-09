import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Paper } from "@/types/words";
import {
  arePapersLoaded,
  ensurePapersLoaded,
  resetPapersLoadState,
} from "@/lib/papersLoad";
import {
  getExampleIndex,
  getPaperOrder,
  resetPapersDerivedCaches,
} from "@/lib/words";

type FakeScript = {
  tagName: string;
  src: string;
  async: boolean;
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  attrs: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  remove: () => void;
};

function stubPaper(): Paper {
  return {
    year: 2006,
    variant: "en1",
    sections: [
      {
        type: "reading_a",
        title: "Reading",
        passages: [
          {
            label: "Text 1",
            body: "Hello world.",
            words: [
              {
                idx: 1,
                english: "hello",
                senses: [["int.", "你好"]],
                count: 1,
                sentences: ["Hello world."],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** 无 jsdom：stub window/document，与仓库其它 store 测试同风格。 */
function installDom() {
  const scripts: FakeScript[] = [];
  const win = globalThis as typeof globalThis & { PAPERS?: Paper[] };

  const head = {
    appendChild(el: FakeScript) {
      scripts.push(el);
      queueMicrotask(() => {
        win.PAPERS = [stubPaper()];
        el.onload?.(new Event("load"));
      });
      return el;
    },
  };

  const documentStub = {
    head,
    createElement(tag: string) {
      if (tag !== "script") throw new Error(`unexpected tag ${tag}`);
      const el: FakeScript = {
        tagName: "SCRIPT",
        src: "",
        async: false,
        onload: null,
        onerror: null,
        attrs: {},
        setAttribute(k, v) {
          el.attrs[k] = v;
        },
        getAttribute(k) {
          return el.attrs[k] ?? null;
        },
        remove() {
          const i = scripts.indexOf(el);
          if (i >= 0) scripts.splice(i, 1);
        },
      };
      return el;
    },
    querySelectorAll(sel: string) {
      if (sel.includes("data-ew-papers") || sel.includes("/papers.js")) {
        return scripts.filter(
          (s) => s.attrs["data-ew-papers"] || s.src.includes("/papers.js")
        );
      }
      return [];
    },
    querySelector(sel: string) {
      if (sel.includes("data-ew-papers") || sel.includes("/papers.js")) {
        return (
          scripts.find(
            (s) => s.attrs["data-ew-papers"] || s.src.includes("/papers.js")
          ) ?? null
        );
      }
      return null;
    },
  };

  // window === globalThis，便于 window.PAPERS / document 同源
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", documentStub);

  return { scripts, win };
}

describe("ensurePapersLoaded", () => {
  let scripts: FakeScript[] = [];
  let win: ReturnType<typeof installDom>["win"];

  beforeEach(() => {
    resetPapersLoadState();
    resetPapersDerivedCaches();
    ({ scripts, win } = installDom());
    delete win.PAPERS;
  });

  afterEach(() => {
    resetPapersLoadState();
    resetPapersDerivedCaches();
    delete win.PAPERS;
    vi.unstubAllGlobals();
  });

  it("resolves immediately when PAPERS already set", async () => {
    win.PAPERS = [];
    const beforeLen = scripts.length;
    await ensurePapersLoaded();
    expect(arePapersLoaded()).toBe(true);
    expect(scripts.length).toBe(beforeLen);
  });

  it("injects script once and shares one Promise", async () => {
    const a = ensurePapersLoaded();
    const b = ensurePapersLoaded();
    expect(a).toBe(b);
    await a;

    expect(win.PAPERS).toHaveLength(1);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain("/papers.js");
    expect(scripts[0].getAttribute("data-ew-papers")).toBe("1");
  });

  it("clears paperOrder / exampleIndex memo after load", async () => {
    // 空 PAPERS 时先建错误 memo（全 WORDS 顺序 / 空例句索引）
    win.PAPERS = [];
    const beforeOrder = getPaperOrder();
    const beforeEx = getExampleIndex();
    expect(beforeEx.size).toBe(0);

    delete win.PAPERS;
    resetPapersLoadState();

    await ensurePapersLoaded();
    expect(getExampleIndex().get(1)?.[0]?.sentence).toBe("Hello world.");
    expect(getPaperOrder()).not.toBe(beforeOrder);
    expect(getExampleIndex()).not.toBe(beforeEx);
    expect(getPaperOrder()[0]).toBe(1);
  });
});
