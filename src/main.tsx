import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Shell } from "@/components/shell";
import { registerSw } from "@/lib/sw";
import { MeinePage } from "@/pages/meine";
import { MeldenPage } from "@/pages/melden";
import { PlaetzePage } from "@/pages/plaetze";
import { RufPage } from "@/pages/ruf";
import { StatistikPage } from "@/pages/statistik";
import { TafelPage } from "@/pages/tafel";
import "./styles.css";

const root = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});

export const meldenRoute = createRoute({ getParentRoute: () => root, path: "/", component: MeldenPage });

export const rufRoute = createRoute({
  getParentRoute: () => root,
  path: "/ruf/$code",
  validateSearch: (search: Record<string, unknown>): { teil?: string } =>
    typeof search.teil === "string" && search.teil.trim() ? { teil: search.teil.slice(0, 64) } : {},
  component: RufPage,
});

const tafelRoute = createRoute({ getParentRoute: () => root, path: "/tafel", component: TafelPage });
const meineRoute = createRoute({ getParentRoute: () => root, path: "/meine", component: MeinePage });
const statistikRoute = createRoute({ getParentRoute: () => root, path: "/statistik", component: StatistikPage });
const plaetzeRoute = createRoute({ getParentRoute: () => root, path: "/plaetze", component: PlaetzePage });

// Hash-Routing (#/tafel): GitHub Pages kennt keine Umleitung auf index.html.
const router = createRouter({
  routeTree: root.addChildren([meldenRoute, rufRoute, meineRoute, tafelRoute, statistikRoute, plaetzeRoute]),
  history: createHashHistory(),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Installierbar als App (PWA), mit Leiste "Neue Version" in der Shell.
registerSw();
