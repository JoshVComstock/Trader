// Service worker mínimo: hace la app instalable y muestra un aviso si no hay red.
// No guarda datos en caché: una bitácora tiene que mostrar siempre lo último.
const OFFLINE_HTML = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#14151c;color:#e8e9f0;font:16px system-ui"><p>Sin conexión. Vuelve a intentar cuando tengas red.</p></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
