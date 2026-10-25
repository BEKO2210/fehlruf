import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button, Field, TextArea, TextInput } from "@/components/ui";
import { createCall, listStations, type Urgency } from "@/lib/fehlruf";
import { uniqueLines, urgencyLabel } from "@/lib/format";

export const Route = createFileRoute("/ruf/$code")({
  loader: async ({ params }) => {
    const stations = await listStations();
    const code = params.code.toUpperCase();
    const station = code === "NEU" ? null : (stations.find((item) => item.code === code) ?? null);
    return {
      code,
      station,
      lines: uniqueLines(stations.map((item) => item.line)),
    };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.station ? `${loaderData.station.line} · Fehlruf` : "Ruf · Fehlruf" }],
  }),
  component: CallForm,
});

const urgencies: Urgency[] = ["normal", "heute", "sofort"];

function CallForm() {
  const { code, station, lines } = Route.useLoaderData();
  const send = useServerFn(createCall);
  const [line, setLine] = useState(station?.line ?? "");
  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ line: string; partNo: string; qty: number } | null>(null);

  if (done) {
    return (
      <div className="mx-auto grid w-full max-w-lg gap-4">
        <div className="rise rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Ruf ist raus</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{done.line}</h1>
          <p className="mt-2 font-mono text-base">{done.partNo}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{done.qty} Stück</p>
          <p className="mt-3 text-sm text-muted-foreground">Steht jetzt auf der Tafel.</p>
        </div>
        <Button
          full
          onClick={() => {
            setDone(null);
            setPartNo("");
            setPartName("");
            setQty(1);
            setNote("");
            setUrgency("normal");
          }}
        >
          Noch ein Teil, gleiche Linie
        </Button>
        <Link
          to="/"
          className="press inline-flex h-12 items-center justify-center rounded-sm border border-border text-base font-medium"
        >
          Zur Tafel
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mx-auto grid w-full max-w-lg gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!line.trim()) {
          setError("Linie fehlt. Bitte eintragen, für welche Linie das Teil ist.");
          return;
        }
        if (!partNo.trim()) {
          setError("Teilenummer fehlt.");
          return;
        }
        setPending(true);
        setError(null);
        void send({
          data: {
            line,
            partNo,
            partName,
            qty,
            urgency,
            note,
            stationCode: station ? station.code : "",
          },
        })
          .then((call) => {
            setDone({ line: call.line, partNo: call.partNo, qty: call.qty });
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Ruf nicht angekommen. Nochmal senden.");
          })
          .finally(() => setPending(false));
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teil rufen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {station
            ? `${station.name} · ${station.code}. Linie prüfen oder selbst schreiben.`
            : code !== "NEU"
              ? `Code ${code} ist keinem Platz zugeordnet. Linie trotzdem eintragen.`
              : "Kein Platz-Code. Linie selbst schreiben."}
        </p>
      </div>

      <Field label="Linie" hint="Pflicht. Zum Beispiel Linie 3 oder Montage.">
        <TextInput
          value={line}
          onChange={(event) => setLine(event.target.value)}
          placeholder="Linie 3"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          required
          aria-required="true"
        />
      </Field>
      {lines.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {lines.map((item) => (
            <button
              key={item}
              type="button"
              className={`press h-10 rounded-sm px-3 text-sm font-medium ${line === item ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
              onClick={() => setLine(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <Field label="Teilenummer" hint="Pflicht. Was fehlt.">
        <TextInput
          value={partNo}
          onChange={(event) => setPartNo(event.target.value)}
          placeholder="6204-2RSR"
          autoComplete="off"
          autoCapitalize="characters"
          className="font-mono"
          required
        />
      </Field>

      <Field label="Bezeichnung" hint="Optional.">
        <TextInput
          value={partName}
          onChange={(event) => setPartName(event.target.value)}
          placeholder="Rillenkugellager"
          autoComplete="off"
        />
      </Field>

      <Field label="Menge">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="press h-12 w-12 rounded-sm bg-muted text-lg"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            aria-label="Menge minus"
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-lg tabular-nums">{qty}</span>
          <button
            type="button"
            className="press h-12 w-12 rounded-sm bg-muted text-lg"
            onClick={() => setQty((n) => Math.min(9999, n + 1))}
            aria-label="Menge plus"
          >
            +
          </button>
        </div>
      </Field>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Dringlichkeit</legend>
        <div className="grid grid-cols-3 gap-2">
          {urgencies.map((item) => (
            <button
              key={item}
              type="button"
              className={`press h-12 rounded-sm text-sm font-medium ${urgency === item ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
              onClick={() => setUrgency(item)}
            >
              {urgencyLabel(item)}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Auftrag oder Hinweis" hint="Optional. Kein Name.">
        <TextArea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={140}
          placeholder="Auftrag 18420"
        />
      </Field>

      {error ? <p className="text-sm text-hot">{error}</p> : null}
      <Button type="submit" full disabled={pending || !line.trim() || !partNo.trim()}>
        {pending ? "Wird gesendet…" : "Ruf senden"}
      </Button>
    </form>
  );
}
