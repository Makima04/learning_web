import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

function resolveVersion(): string {
  const configured = process.env.EW_VERSION?.trim();
  if (configured) return configured;
  try {
    return execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.env.npm_package_version || "1.0.0";
  }
}

function versionPlugin(): Plugin {
  return {
    name: "english-web-version",
    transformIndexHtml: {
      order: "pre",
      handler: () => [
        {
          tag: "script",
          children: `window.EW_VERSION = ${JSON.stringify(resolveVersion())};`,
          injectTo: "head",
        },
      ],
    },
  };
}

/** 从 sw.template.js 生成 dist/sw.js：缓存名注入构建版本，发版即换缓存。 */
function swPlugin(): Plugin {
  return {
    name: "english-web-sw",
    generateBundle(_options, bundle) {
      const template = readFileSync(path.resolve(__dirname, "sw.template.js"), "utf8");
      // 预缓存清单：入口文档 + 词库数据 + js/css 产物（sw.js 自身除外）。
      // papers.js(~8MB) 不入清单，见模板注释。public/ 下的 data.js 不在 bundle 里，手动补。
      // js 入口是 chunk 而非 asset，两种都要收
      const assets = Object.values(bundle)
        .map((f) => f.fileName)
        .filter((n) => /\.(js|css)$/.test(n) && n !== "sw.js");
      const precache = JSON.stringify(["/", "/data.js", ...assets]);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        // 全局替换：模板注释里也提到占位符，单次 replace 会先命中注释
        source: template
          .replace(/__SW_CACHE_VERSION__/g, resolveVersion())
          .replace(/__SW_PRECACHE_LIST__/g, precache),
      });
    },
  };
}

// dev: Vite :5173, /api 代理到 FastAPI :8000。public/ 下 data.js/papers.js 由 Vite 直 serve。
export default defineConfig({
  plugins: [versionPlugin(), swPlugin(), react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500, // papers.js(8MB) 走 script 标签不打进 bundle；这里放宽以防误报
  },
});
