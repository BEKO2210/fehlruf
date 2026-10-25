import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { QrCard } from "@/components/qr-card";
import { Button, Field, TextInput } from "@/components/ui";
import { deleteStation, listStations, saveStation, tafelState } from "@/lib/fehlruf";

export const Route = createFileRoute("/plaetze")({
  loader: async () => {
    const state = await tafelState();
    return { state, stations: state === "ok" ? await listStations() : [] };
  },
  head: () => ({ meta: [{ title: "QR-Zettel · Fehlruf" }] }),
  component: PlacesPage,
});

function PlacesPage() {
  const { state, stations } = Route.useLoaderData();
  if (state !== "ok") {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">QR-Zettel</h1>
        <p className="text-sm text-muted-foreground">Erst an der Tafel mit der PIN anmelden.</p>
        <Link to="/tafel" className="text-sm font-medium underline underline-offset-4">
          Zur Tafel
        </Link>
      </div>
    );
  }
  return <Places stations={stations} />;
}

function Places({ stations }: { stations: Awaited<ReturnType<typeof listStations>> }) {
  const router = useRouter();
  const save = useServerFn(saveStation);
  const remove = useServerFn(deleteStation);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid gap-5">
      <div className="no-print">
        <h1 className="text-2xl font-semibold tracking-tight">QR-Zettel</h1>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Freiwillig. Ein Zettel pro Abteilung oder Maschine: Wer ihn scannt, hat die Abteilung schon
          eingetragen und scannt danach nur noch das Teil.
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
        <h2 className="text-lg font-semibold">Zettel anlegen</h2>
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
              placeholder="Maschine 4"
              required
            />
          </Field>
          <Field label="Abteilung">
            <TextInput
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder="Montage"
              required
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Speichert…" : "Speichern"}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            Zettel drucken
          </Button>
        </div>
      </form>

      {stations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Zettel. Geht auch ganz ohne.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {stations.map((station) => (
            <li key={station.code} className="grid gap-2">
              <QrCard station={station} />
              <button
                type="button"
                className="no-print justify-self-start text-sm text-muted-foreground underline underline-offset-4"
                onClick={() => {
                  if (!window.confirm(`Zettel ${station.code} löschen? Gedruckte Zettel gehen dann ohne Abteilung.`)) return;
                  void remove({ data: { code: station.code } }).then(() => router.invalidate());
                }}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
