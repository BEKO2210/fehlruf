import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, LayoutList, ScanLine } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, hasDevice, token } from "@/lib/api";

const items = [
  { to: "/", label: "Melden", icon: ScanLine, match: (p: string) => p === "/" || p.startsWith("/ruf") },
  { to: "/meine", label: "Meine", icon: ClipboardList, match: (p: string) => p.startsWith("/meine") },
  {
    to: "/tafel",
    label: "Tafel",
    icon: LayoutList,
    match: (p: string) => p.startsWith("/tafel") || p.startsWith("/plaetze") || p.startsWith("/statistik"),
  },
] as const;

/** Offene eigene Rufe für den Zähler an "Meine". Nur wenn dieses Handy schon gemeldet hat. */
function useOpenCount(path: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!hasDevice()) return;
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api
        .mine()
        .then((rows) => {
          if (!cancelled) setCount(rows.filter((row) => row.status !== "done").length);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [path]);
  return count;
}

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const openCount = useOpenCount(path);
  // Arbeiter brauchen die Tafel nicht. Sie erscheint unten erst auf Geräten, die schon mit PIN drin waren.
  const lager = token.get() !== "" || items[2].match(path);
  const shown = lager ? items : items.slice(0, 2);

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3">
          <img src="./favicon.svg" alt="" className="size-7" />
          <Link to="/" className="text-lg font-bold tracking-tight">
            Fehlruf
          </Link>
          {!lager ? (
            <Link to="/tafel" className="ml-auto grid h-12 place-items-center px-3 text-sm font-medium text-muted">
              Lager
            </Link>
          ) : null}
        </div>
      </header>
      <main className="shell-pad mx-auto w-full max-w-3xl px-4 pt-5">{children}</main>
      <nav className="no-print dock fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur-md">
        <ul className={`mx-auto grid w-full max-w-md gap-2 px-4 py-2 ${lager ? "grid-cols-3" : "grid-cols-2"}`}>
          {shown.map((item) => {
            const active = item.match(path);
            const Icon = item.icon;
            const badge = item.to === "/meine" && openCount > 0 ? openCount : 0;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`press relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold ${
                    active ? "bg-brand-soft text-brand" : "text-muted"
                  }`}
                >
                  <Icon className="size-[22px]" strokeWidth={2} aria-hidden="true" />
                  {item.label}
                  {badge ? (
                    <span
                      className="absolute top-1 right-[calc(50%-26px)] grid h-5 min-w-5 place-items-center rounded-full bg-hot-fill px-1 text-[11px] font-bold text-white tabular-nums"
                      aria-label={`${badge} offen`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
