import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// dev: Vite :5173, /api 代理到 FastAPI :8000。public/ 下 data.js/papers.js 由 Vite 直 serve。
export default defineConfig({
  plugins: [react()],
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
