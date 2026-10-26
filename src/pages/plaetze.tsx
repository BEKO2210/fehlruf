import { Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { QrCard } from "@/components/qr-card";
import { Button, ErrorText, Field, PageTitle, TextInput } from "@/components/ui";
import { api, ApiError, type StationRow } from "@/lib/api";
import { Offline, PinGate, useTafelState } from "@/pages/tafel";

export function PlaetzePage() {
  const { state, error, refresh, lock } = useTafelState();
  if (error && state === null) return <Offline message={error} onRetry={refresh} />;
  if (state === null) return <p className="pt-10 text-center text-muted">Lädt…</p>;
  if (state !== "ok") return <PinGate setup={state === "setup"} onDone={refresh} />;
  return <Places onLocked={lock} />;
}

function Places({ onLocked }: { onLocked: () => void }) {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onLocked();
      else setError(err instanceof Error ? err.message : "Nicht gespeichert.");
    },
    [onLocked],
  );

  const load = useCallback(() => {
    api.stations().then(setStations).catch(fail);
  }, [fail]);

  useEffect(load, [load]);

  return (
    <div className="grid gap-5">
      <div className="no-print">
        <PageTitle
          title="QR-Zettel"
          sub="Freiwillig. Ein Zettel pro Abteilung/Linie oder Maschine: Wer ihn scannt, hat die Abteilung/Linie schon drin und scannt danach nur noch das Teil."
        />
      </div>

      <form
        className="card no-print grid gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          api
            .saveStation({ code, name, line })
            .then(() => {
              setCode("");
              setName("");
              setLine("");
              load();
            })
            .catch(fail)
            .finally(() => setPending(false));
        }}
      >
        <h2 className="text-lg font-bold">Zettel anlegen</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code" hint="z. B. L4-01">
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
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Maschine 4" required />
          </Field>
          <Field label="Abteilung / Linie">
            <TextInput value={line} onChange={(event) => setLine(event.target.value)} placeholder="Linie 4" required />
          </Field>
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <div className="grid gap-3">
          <Button type="submit" full disabled={pending}>
            {pending ? "Speichert…" : "Speichern"}
          </Button>
          <Button variant="muted" full onClick={() => window.print()} disabled={stations.length === 0}>
            <Printer className="size-5" aria-hidden="true" />
            Drucken
          </Button>
        </div>
      </form>

      {stations.length === 0 ? (
        <p className="text-center text-sm text-muted">Noch kein Zettel. Geht auch ganz ohne.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {stations.map((station) => (
            <li key={station.code} className="grid gap-2">
              <QrCard station={station} />
              <button
                type="button"
                className="no-print inline-flex items-center gap-1.5 justify-self-start px-1 text-sm font-medium text-muted"
                onClick={() => {
                  if (!window.confirm(`Zettel ${station.code} löschen? Gedruckte Zettel gehen dann ohne Abteilung/Linie.`))
                    return;
                  api.deleteStation(station.code).then(load).catch(fail);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
