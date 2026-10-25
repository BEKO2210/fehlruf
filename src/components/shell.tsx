import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutList, ScanLine } from "lucide-react";
import type { ReactNode } from "react";

const items = [
  { to: "/", label: "Melden", icon: ScanLine },
  { to: "/tafel", label: "Tafel", icon: LayoutList },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3">
          <img src="./favicon.svg" alt="" className="size-7" />
          <Link to="/" className="text-lg font-bold tracking-tight">
            Fehlruf
          </Link>
        </div>
      </header>
      <main className="shell-pad mx-auto w-full max-w-3xl px-4 pt-5">{children}</main>
      <nav className="no-print dock fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur-md">
        <ul className="mx-auto grid w-full max-w-md grid-cols-2 gap-2 px-4 py-2">
          {items.map((item) => {
            const active =
              item.to === "/"
                ? path === "/" || path.startsWith("/ruf")
                : path.startsWith("/tafel") || path.startsWith("/plaetze");
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`press flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold ${
                    active ? "bg-brand-soft text-brand" : "text-muted"
                  }`}
                >
                  <Icon className="size-[22px]" strokeWidth={2} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
