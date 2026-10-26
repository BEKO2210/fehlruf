// Fehlruf Service Worker: macht die Seite installierbar und startet sie auch
// bei kurzem Netzausfall. Netz zuerst, damit nach jedem Deploy die neue
// Version kommt. Nur eigene Dateien; die API (andere Domain) läuft nie
// über den Cache.
// Eine neue Version wartet, bis die Seite "SKIP_WAITING" schickt (Leiste
// "Neue Version"), damit kein Ruf mitten in der Eingabe neu lädt.
const CACHE = "fehlruf-v2";

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit ?? (req.mode === "navigate" ? caches.match("./") : undefined))
          .then((hit) => hit ?? Response.error()),
      ),
  );
});
