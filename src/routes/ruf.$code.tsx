import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Scanner } from "@/components/scanner";
import { Button, Field, TextArea, TextInput } from "@/components/ui";
import { createCall, getCallForm } from "@/lib/fehlruf";
import { parseScan, remember, uniqueLines } from "@/lib/format";

export const Route = createFileRoute("/ruf/$code")({
  validateSearch: (search: Record<string, unknown>): { teil?: string } =>
    typeof search.teil === "string" && search.teil.trim() ? { teil: search.teil.slice(0, 64) } : {},
  loader: async ({ params }) => {
    const code = params.code.toUpperCase();
    const form = await getCallForm({ data: { code } });
    return { code, station: form.station, departments: uniqueLines(form.departments) };
  },
  head: () => ({ meta: [{ title: "Teil melden · Fehlruf" }] }),
  component: CallForm,
});

const KEY_DEPT = "fehlruf-abteilung";
const KEY_NAME = "fehlruf-name";

function CallForm() {
  const { station, departments } = Route.useLoaderData();
  const { teil } = Route.useSearch();
  const send = useServerFn(createCall);
  const [partNo, setPartNo] = useState(teil ?? "");
  const [scanning, setScanning] = useState(!teil);
  const [dept, setDept] = useState(station?.line ?? "");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [stopped, setStopped] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ line: string; partNo: string; qty: number } | null>(null);

  // Abteilung und Name kommen vom letzten Mal, damit nur noch Scannen + Senden bleibt.
  useEffect(() => {
    if (!station) setDept((cur) => cur || remember.get(KEY_DEPT));
    setName(remember.get(KEY_NAME));
  }, [station]);

  const choices = uniqueLines([...departments, remember.get(KEY_DEPT)].filter(Boolean));

  if (done) {
    return (
      <div className="mx-auto grid w-full max-w-lg gap-4">
        <div className="rise rounded-xl border border-border bg-card p-5">
          <p className="text-base font-medium text-ok">✓ Gemeldet</p>
          <p className="mt-3 font-mono text-xl font-medium">{done.partNo}</p>
          <p className="text-base text-muted-foreground tabular-nums">
            {done.qty} Stück · {done.line}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Das Lager sieht es jetzt.</p>
        </div>
        <Link
          to="/"
          className="press inline-flex h-14 items-center justify-center rounded-sm bg-primary text-lg font-medium text-primary-foreground"
        >
          Nächstes Teil scannen
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mx-auto grid w-full max-w-lg gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!partNo.trim()) {
          setError("Welches Teil? Scannen oder Nummer eintippen.");
          return;
        }
        if (!dept.trim()) {
          setError("Abteilung fehlt.");
          return;
        }
        setPending(true);
        setError(null);
        void send({
          data: {
            line: dept,
            partNo,
            partName: "",
            qty,
            urgency: stopped ? "sofort" : "normal",
            note,
            requester: name,
            stationCode: station ? station.code : "",
          },
        })
          .then((call) => {
            remember.set(KEY_DEPT, call.line);
            remember.set(KEY_NAME, name.trim());
            setDone({ line: call.line, partNo: call.partNo, qty: call.qty });
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Nicht angekommen. Nochmal senden.");
          })
          .finally(() => setPending(false));
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Teil melden</h1>

      {scanning ? (
        <div className="grid gap-2">
          <Scanner
            onCode={(raw) => {
              const hit = parseScan(raw);
              if (hit?.kind === "part") {
                setPartNo(hit.partNo);
                setScanning(false);
              }
            }}
          />
        </div>
      ) : null}

      <Field label="Teil">
        <div className="flex gap-2">
          <TextInput
            value={partNo}
            onChange={(event) => setPartNo(event.target.value)}
            placeholder="Nummer vom Teil"
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono text-lg"
          />
          {!scanning ? (
            <Button variant="muted" className="shrink-0" onClick={() => setScanning(true)}>
              Scannen
            </Button>
          ) : null}
        </div>
      </Field>

      <Field label="Abteilung">
        <TextInput
          value={dept}
          onChange={(event) => setDept(event.target.value)}
          placeholder="z. B. Montage"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
        />
      </Field>
      {choices.length > 0 ? (
        <div className="-mt-2 flex flex-wrap gap-2">
          {choices.map((item) => (
            <button
              key={item}
              type="button"
              className={`press h-11 rounded-sm px-4 text-base font-medium ${dept === item ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
              onClick={() => setDept(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <Field label="Dein Name" hint="Freiwillig.">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Vorname"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={40}
        />
      </Field>

      <Field label="Menge">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="press h-12 w-14 rounded-sm bg-muted text-xl"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            aria-label="Weniger"
          >
            −
          </button>
          <input
            value={qty}
            onChange={(event) => {
              const n = Number(event.target.value.replace(/\D/g, ""));
              setQty(Math.min(9999, Math.max(1, n || 1)));
            }}
            inputMode="numeric"
            aria-label="Menge"
            className="h-12 w-20 rounded-sm border border-border bg-background text-center font-mono text-lg tabular-nums outline-none"
          />
          <button
            type="button"
            className="press h-12 w-14 rounded-sm bg-muted text-xl"
            onClick={() => setQty((n) => Math.min(9999, n + 1))}
            aria-label="Mehr"
          >
            +
          </button>
        </div>
      </Field>

      <button
        type="button"
        aria-pressed={stopped}
        className={`press flex h-14 items-center justify-between rounded-sm border px-4 text-base font-medium ${stopped ? "border-hot bg-hot-bg text-hot" : "border-border bg-transparent text-foreground"}`}
        onClick={() => setStopped((v) => !v)}
      >
        <span>Maschine steht still</span>
        <span aria-hidden="true">{stopped ? "Ja" : "Nein"}</span>
      </button>

      {showNote ? (
        <Field label="Hinweis" hint="Freiwillig. Zum Beispiel Auftrag oder Maschine.">
          <TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={140}
            placeholder="Maschine 4, Auftrag 18420"
          />
        </Field>
      ) : (
        <button
          type="button"
          className="justify-self-start text-sm font-medium text-muted-foreground underline underline-offset-4"
          onClick={() => setShowNote(true)}
        >
          Hinweis dazuschreiben
        </button>
      )}

      {error ? <p className="text-base text-hot">{error}</p> : null}
      <Button type="submit" full className="h-14 text-lg" disabled={pending}>
        {pending ? "Wird gesendet…" : "Senden"}
      </Button>
    </form>
  );
}
