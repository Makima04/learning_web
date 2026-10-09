// papersLoad.ts —— 按需注入 /papers.js，避免首屏拉 ~15MB。
// 并发调用共享同一 Promise；加载成功后清掉 words 里依赖 PAPERS 的 memo。
import { useEffect, useState } from "react";
import { resetPapersDerivedCaches } from "@/lib/words";

const SCRIPT_SRC = "/papers.js";
const SCRIPT_ATTR = "data-ew-papers";

let loadPromise: Promise<void> | null = null;

/** 已有 window.PAPERS（含测试里预置的空数组）则视为就绪。 */
export function arePapersLoaded(): boolean {
  return typeof window !== "undefined" && Array.isArray(window.PAPERS);
}

/**
 * 注入 `<script src="/papers.js">` 一次；`window.PAPERS` 就绪后 resolve。
 * 并发调用方共享同一 Promise；失败可重试（清空 promise）。
 */
export function ensurePapersLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (arePapersLoaded()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const finishOk = () => {
      resetPapersDerivedCaches();
      resolve();
    };

    // 页面上可能已有脚本标签（热更新 / 重复挂载），只等 PAPERS
    const existing = document.querySelector<HTMLScriptElement>(
      `script[${SCRIPT_ATTR}], script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      if (arePapersLoaded()) {
        finishOk();
        return;
      }
      existing.addEventListener(
        "load",
        () => {
          if (arePapersLoaded()) finishOk();
          else {
            loadPromise = null;
            reject(new Error("papers.js 已加载但 window.PAPERS 未设置"));
          }
        },
        { once: true }
      );
      existing.addEventListener(
        "error",
        () => {
          loadPromise = null;
          reject(new Error("加载 papers.js 失败"));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute(SCRIPT_ATTR, "1");
    script.onload = () => {
      if (arePapersLoaded()) finishOk();
      else {
        loadPromise = null;
        reject(new Error("papers.js 已加载但 window.PAPERS 未设置"));
      }
    };
    script.onerror = () => {
      script.remove();
      loadPromise = null;
      reject(new Error("加载 papers.js 失败"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** 页面进入时等真题数据；ready 前勿读 getPapers / 派生索引。 */
export function usePapersReady(): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(() => arePapersLoaded());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (arePapersLoaded()) {
      setReady(true);
      setError(null);
      return;
    }
    let cancelled = false;
    ensurePapersLoaded()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReady(false);
          setError(err instanceof Error ? err.message : "加载真题失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}

/** 测试用：清空加载 Promise（不删 window.PAPERS）。 */
export function resetPapersLoadState() {
  loadPromise = null;
}
