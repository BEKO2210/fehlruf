import { useSyncExternalStore } from "react";

// Service Worker: registrieren, auf neue Version warten, auf Tipp laden.
// Nur im Build, damit der Dev-Server nicht cacht.

let waiting: ServiceWorker | null = null;
// Erst nach Tipp auf die Leiste darf controllerchange neu laden. Bei der
// Erstinstallation übernimmt clients.claim() die Seite auch, das darf den
// Arbeiter nicht mitten im Tippen aus der Eingabe werfen.
let wanted = false;
const listeners = new Set<() => void>();

function setWaiting(sw: ServiceWorker | null) {
  waiting = sw;
  for (const fn of listeners) fn();
}

function watch(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener("statechange", () => {
      // Erst installiert, wenn schon ein alter Worker läuft: sonst ist es die Erstinstallation.
      if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
    });
  });
}

export function registerSw() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  let reloading = false;
  // Lief schon ein Worker, ist ein controllerchange ohne Tipp ein anderer Tab,
  // der die neue Version übernommen hat: dann hier die Leiste zeigen.
  // Ohne alten Worker ist es die Erstinstallation (clients.claim), nichts tun.
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    if (wanted) {
      reloading = true;
      window.location.reload();
    } else if (hadController && navigator.serviceWorker.controller) {
      setWaiting(navigator.serviceWorker.controller);
    }
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        watch(reg);
        // Beim Zurückkommen in die App nach neuer Version schauen (Handys halten die Seite tagelang offen).
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

/** Neue Version übernehmen: der wartende Worker aktiviert sich, controllerchange lädt neu.
 *  Ist der Worker schon aktiv (anderer Tab hat übernommen), direkt neu laden. */
export function applyUpdate() {
  if (!waiting) return;
  wanted = true;
  if (waiting.state === "activated") {
    window.location.reload();
    return;
  }
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export function useUpdateReady() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => waiting !== null,
    () => false,
  );
}
