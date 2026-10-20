// 本文件缓存应用外壳，使已打开过的书架在弱网环境下仍可访问本地数据。
const CACHE_NAME = "isbn-bookshelf-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./assets/styles.css",
  "./assets/app.js?v=11",
  "./assets/i18n.js?v=11",
  "./assets/ui.js?v=11",
  "./assets/utils.js?v=11",
  "./assets/scanner.js?v=11",
  "./assets/book-lookup.js?v=11",
  "./assets/verified-books.js?v=11",
  "./assets/local-store.js?v=11",
  "./assets/supabase-store.js?v=11",
  "./assets/csv-export.js?v=11",
  "./assets/demo-store.js?v=11",
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

// 所有同源资源优先联网并更新缓存，断网时再使用已有缓存。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
