import { execFileSync } from "node:child_process";
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

// dev: Vite :5173, /api 代理到 FastAPI :8000。public/ 下 data.js/papers.js 由 Vite 直 serve。
export default defineConfig({
  plugins: [versionPlugin(), react()],
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
