// wordInfo.ts —— 按需注入 /wordinfo.js（词根词缀 + 同义 / 反义 / 形近 / 同族词），不占首屏。
// 并发调用共享同一 Promise；失败可重试。
import { useEffect, useState } from "react";
import type { RelatedWord, WordInfoRow, WordPart } from "@/types/words";

const SCRIPT_SRC = "/wordinfo.js";
const SCRIPT_ATTR = "data-ew-wordinfo";

let loadPromise: Promise<void> | null = null;

export interface WordInfo {
  parts: WordPart[];
  note: string;
  syn: RelatedWord[];
  ant: RelatedWord[];
  sim: RelatedWord[];
  rel: RelatedWord[];
}

export function isWordInfoLoaded(): boolean {
  return typeof window !== "undefined" && !!window.WORD_INFO;
}

export function ensureWordInfoLoaded(): Promise<void> {
  if (typeof window === "undefined" || isWordInfoLoaded()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const fail = (msg: string) => {
      loadPromise = null;
      reject(new Error(msg));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute(SCRIPT_ATTR, "1");
    script.onload = () => {
      if (isWordInfoLoaded()) resolve();
      else fail("wordinfo.js 已加载但 window.WORD_INFO 未设置");
    };
    script.onerror = () => {
      script.remove();
      fail("加载 wordinfo.js 失败");
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function parseWordInfo(row: WordInfoRow | undefined | null): WordInfo | null {
  if (!row) return null;
  const [parts, note, syn, ant, sim, rel] = row;
  return {
    parts: parts || [],
    note: note || "",
    syn: syn || [],
    ant: ant || [],
    sim: sim || [],
    rel: rel || [],
  };
}

export function getWordInfo(english: string): WordInfo | null {
  if (!isWordInfoLoaded()) return null;
  return parseWordInfo(window.WORD_INFO![english]);
}

/** 卡片用：数据未就绪时返回 null，加载完成后自动重渲染。enabled=false 时不触发下载。 */
export function useWordInfo(english: string | null | undefined, enabled = true): WordInfo | null {
  const [ready, setReady] = useState(isWordInfoLoaded);

  useEffect(() => {
    if (!enabled || ready) return;
    let cancelled = false;
    ensureWordInfoLoaded()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => console.warn(err instanceof Error ? err.message : err));
    return () => {
      cancelled = true;
    };
  }, [enabled, ready]);

  if (!enabled || !ready || !english) return null;
  return getWordInfo(english);
}

/** 测试用：清空加载 Promise。 */
export function resetWordInfoLoadState() {
  loadPromise = null;
}
