import { createFileRoute, redirect } from "@tanstack/react-router";

// Alte Links und Lesezeichen: Scannen ist jetzt die Startseite.
export const Route = createFileRoute("/scan")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
