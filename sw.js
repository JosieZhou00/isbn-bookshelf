// 本文件缓存应用外壳，使已打开过的书架在弱网环境下仍可访问本地数据。
const CACHE_NAME = "isbn-bookshelf-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./assets/ui.js",
  "./assets/utils.js",
  "./assets/scanner.js",
  "./assets/book-lookup.js",
  "./assets/local-store.js",
  "./assets/supabase-store.js",
  "./assets/csv-export.js",
  "./assets/icon.svg",
  "./manifest.webmanifest"
];

// 安装时缓存稳定的静态资源。
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

// 激活时清除旧版本缓存。
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// 导航请求优先联网，静态资源优先使用缓存。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
