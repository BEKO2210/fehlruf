import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { QrCard } from "@/components/qr-card";
import { Button, Field, TextInput } from "@/components/ui";
import { listStations, saveStation } from "@/lib/fehlruf";

export const Route = createFileRoute("/plaetze")({
  loader: () => listStations(),
  head: () => ({ meta: [{ title: "Plätze · Fehlruf" }] }),
  component: PlacesPage,
});

function PlacesPage() {
  const stations = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveStation);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid gap-5">
      <div className="no-print">
        <h1 className="text-2xl font-semibold tracking-tight">Plätze</h1>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Pro Arbeitsplatz einen Zettel drucken. Die Handy-Kamera öffnet das Formular. Die Linie
          steht als Vorschlag drin und muss bestätigt oder selbst geschrieben werden.
        </p>
      </div>

      <form
        className="no-print grid gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          void save({ data: { code, name, line } })
            .then(async () => {
              setCode("");
              setName("");
              setLine("");
              await router.invalidate();
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Platz nicht gespeichert.");
            })
            .finally(() => setPending(false));
        }}
      >
        <h2 className="text-lg font-semibold">Platz anlegen</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code" hint="Zum Beispiel L4-01">
            <TextInput
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="L4-01"
              autoCapitalize="characters"
              autoComplete="off"
              required
              className="font-mono"
            />
          </Field>
          <Field label="Name">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Platz 01"
              required
            />
          </Field>
          <Field label="Linie">
            <TextInput
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder="Linie 4"
              required
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Speichert…" : "Platz speichern"}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            Zettel drucken
          </Button>
        </div>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2">
        {stations.map((station) => (
          <li key={station.code}>
            <QrCard station={station} />
          </li>
        ))}
      </ul>
    </div>
  );
}
