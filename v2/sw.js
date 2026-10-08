// Оболочка медкнижки для установленного приложения (ТЗ-023 блок 3). Шаблон: собрать_v2.js подставляет штамп сборки
// и кладёт готовый файл в Публикация/v2/sw.js. Данные медкнижки сюда не попадают: запросы к Supabase идут мимо.
const V = "mk-08.10 23:25";
const PAGE = "/v2/";
const FILES = ["/v2/manifest.webmanifest", "/v2/icons/icon-192.png", "/v2/icons/icon-512.png", "/v2/icons/apple-touch-icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll([PAGE, ...FILES].map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;            // Supabase, шрифты — мимо
  if (u.pathname === PAGE) {                                                       // страница: сначала сеть, без сети — копия оболочки
    e.respondWith(fetch(r.url.split("?")[0], { cache: "no-cache" }).then(resp => {   // адрес без ?k=…: код в кэш не попадает
      if (resp && resp.ok) { const copy = resp.clone(); caches.open(V).then(c => c.put(PAGE, copy)).catch(() => {}); }
      return resp;
    }).catch(() => caches.match(PAGE)));
    return;
  }
  if (FILES.includes(u.pathname)) e.respondWith(caches.match(r).then(m => m || fetch(r)));   // иконки и манифест: сначала кэш
});
