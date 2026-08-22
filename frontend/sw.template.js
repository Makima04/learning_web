// 红宝书背单词 service worker —— 构建时由 vite 插件从本模板生成 dist/sw.js。
// __SW_CACHE_VERSION__ 会被替换为构建版本（git sha）：版本即缓存名，发版后 activate
// 自动清理旧缓存与旧 hash 资产，不会再有固定名字导致的堆积。
// __SW_PRECACHE_LIST__ 会被替换为预缓存 URL 清单（JSON 数组字面量）。
//
// 策略：
//   /api/*            不缓存（离线写操作由前端 syncQueue 入队重试，绝不吞 API 响应）
//   页面导航 / data.js / papers.js / version.js   网络优先，离线回退缓存（词库更新及时可见）
//   /assets/*（带 hash）                          缓存优先（内容变名字变，天然可长存）
//   其余同源 GET                                   网络优先回退缓存（图标等小文件顺带离线）
const CACHE = "ew-static-__SW_CACHE_VERSION__";
const NETWORK_FIRST = ["/data.js", "/papers.js", "/version.js"];
const ASSETS_PREFIX = "/assets/";

self.addEventListener("install", (event) => {
  // 按构建注入的清单预缓存：入口文档 + 全部 js/css 产物 + data.js。
  // 首访页面加载发生在 SW 激活前、不经过 fetch 拦截，只缓存 "/" 会让首日离线白屏。
  // papers.js(~8MB) 不入清单：仍走运行时网络优先缓存，避免 install 拖太久。
  // 逐项失败不阻塞安装（安装时可能恰好离线/产物缺失），后续运行时缓存会补上。
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(__SW_PRECACHE_LIST__.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(request);
    // 缓存键一律用 URL 字符串：navigate 模式的 Request 对象传给 Cache API 会抛
    // TypeError（Chromium 限制），会把整条离线兜底链炸掉
    if (resp && resp.ok) cache.put(request.url, resp.clone());
    return resp;
  } catch (err) {
    const hit = await cache.match(request.url);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  const resp = await fetch(request);
  if (resp && resp.ok) cache.put(request.url, resp.clone());
  return resp;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 只管同源
  if (url.pathname.startsWith("/api/")) return; // API 永不拦截

  // SPA 导航：网络优先；离线回退缓存的入口文档（install 时已预缓存 "/"）
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request.url)) ||
            (await cache.match("/")) ||
            new Response("离线且无缓存", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
          );
        }
      })()
    );
    return;
  }

  // 带内容 hash 的构建产物：缓存优先
  if (url.pathname.startsWith(ASSETS_PREFIX)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 数据文件与其余静态资源：网络优先（更新及时），离线回缓存
  if (NETWORK_FIRST.includes(url.pathname) || /\.(js|css|png|svg|webmanifest|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});
