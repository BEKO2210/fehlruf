import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, QrCode, ScanLine } from "lucide-react";
import type { ReactNode } from "react";

const items = [
  { to: "/", label: "Tafel", icon: ClipboardList },
  { to: "/scan", label: "Scannen", icon: ScanLine },
  { to: "/plaetze", label: "Plätze", icon: QrCode },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-border bg-background/95">
        <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Fehlruf
          </Link>
          <p className="text-sm text-muted-foreground">Halle</p>
        </div>
      </header>
      <main className="shell-pad mx-auto w-full max-w-3xl px-4 pt-4">{children}</main>
      <nav className="no-print dock fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background">
        <ul className="mx-auto grid w-full max-w-3xl grid-cols-3">
          {items.map((item) => {
            const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
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
