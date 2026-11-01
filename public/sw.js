// Service worker de Racha: hace la app instalable y rápida.
//
// - Archivos de la app (/_next/static, íconos, fuentes): caché primero. Tienen hash en el nombre,
//   así que nunca cambian; una versión nueva trae nombres nuevos.
// - Páginas: red primero (los datos tienen que ser los últimos) con una copia de respaldo. Si la
//   red tarda o no hay conexión, se muestra la última copia guardada de esa página.
// - Al salir (o si la sesión caducó) se borran las copias de páginas.
const VERSION = "racha-v2";
const ASSETS = `${VERSION}-assets`;
const PAGES = `${VERSION}-pages`;
const NETWORK_TIMEOUT_MS = 4000;

const OFFLINE_HTML = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#14151c;color:#e8e9f0;font:16px system-ui;text-align:center;padding:24px"><div><p style="font-size:20px;font-weight:600;margin:0 0 8px">Sin conexión</p><p style="opacity:.7;margin:0 0 20px">Vuelve a intentar cuando tengas red.</p><button onclick="location.reload()" style="font:inherit;padding:10px 18px;border-radius:10px;border:0;background:#7c6cf6;color:#fff">Reintentar</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((c) => c.addAll(["/manifest.webmanifest", "/pwa-icon/192", "/pwa-icon/512"]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa-icon/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:woff2?|ttf)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstPage(event) {
  const { request } = event;
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(async (res) => {
    const finalPath = new URL(res.url || request.url).pathname;
    if (finalPath === "/login") {
      // Sin sesión: nada de copias de páginas privadas.
      await caches.delete(PAGES);
    } else if (res.ok && res.type === "basic") {
      await cache.put(request, res.clone());
    }
    return res;
  });
  event.waitUntil(network.catch(() => undefined));

  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // La red está lenta: la copia guardada, si hay; si no, se espera a la red.
    return (await cache.match(request)) ?? (await network);
  } catch {
    return (
      (await cache.match(request)) ??
      new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate" && !url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstPage(event));
  }
});

// La app avisa al salir para borrar las copias de páginas.
self.addEventListener("message", (event) => {
  if (event.data === "logout") event.waitUntil(caches.delete(PAGES));
});

// Al tocar un recordatorio, abre (o enfoca) la vista de operar.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith("/operar"));
      if (open) return open.focus();
      return self.clients.openWindow("/operar");
    }),
  );
});
