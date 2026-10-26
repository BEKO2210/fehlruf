import { useSyncExternalStore } from "react";

// Service Worker: registrieren, auf neue Version warten, auf Tipp laden.
// Nur im Build, damit der Dev-Server nicht cacht.

let waiting: ServiceWorker | null = null;
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
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
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

/** Neue Version übernehmen: der wartende Worker aktiviert sich, controllerchange lädt neu. */
export function applyUpdate() {
  waiting?.postMessage({ type: "SKIP_WAITING" });
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
