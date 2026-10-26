import { Link, useParams, useSearch } from "@tanstack/react-router";
import { Check, ClipboardList, Minus, Package, Plus, ScanLine, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Scanner } from "@/components/scanner";
import { Button, Chip, ErrorText, Field, PageTitle, TextArea, TextInput } from "@/components/ui";
import { api, type StationRow } from "@/lib/api";
import { parseScan, remember, uniqueLines } from "@/lib/format";

const KEY_DEPT = "fehlruf-abteilung";
const KEY_NAME = "fehlruf-name";

type Done = { line: string; partNo: string; qty: number; orderNo: string; urgent: boolean };

export function RufPage() {
  const { code } = useParams({ from: "/ruf/$code" });
  const { teil } = useSearch({ from: "/ruf/$code" });
  const [station, setStation] = useState<StationRow | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [partNo, setPartNo] = useState(teil ?? "");
  const [scanning, setScanning] = useState(!teil);
  const [dept, setDept] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [orderNo, setOrderNo] = useState("");
  const [stopped, setStopped] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  // Nach einem Fehler springt der Fokus ins fehlende Feld.
  const partRef = useRef<HTMLInputElement>(null);
  const deptRef = useRef<HTMLInputElement>(null);

  // Abteilung/Linie und Name kommen vom letzten Mal: beim zweiten Teil nur noch Scannen + Senden.
  useEffect(() => {
    setDept(remember.get(KEY_DEPT));
    setName(remember.get(KEY_NAME));
    let cancelled = false;
    api
      .form(code.toUpperCase())
      .then((form) => {
        if (cancelled) return;
        setDepartments(form.departments);
        if (form.station) {
          setStation(form.station);
          setDept(form.station.line);
        }
      })
      .catch(() => {
        // Ohne Vorschläge geht es trotzdem; Fehler zeigt erst das Senden.
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const choices = uniqueLines([...departments, remember.get(KEY_DEPT)].filter(Boolean));

  if (done) {
    return (
      <div className="mx-auto grid w-full max-w-lg gap-5 pt-4 text-center">
        <div className="pop mx-auto grid size-24 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-12" strokeWidth={3} aria-hidden="true" />
        </div>
        <div className="rise">
          <h1 className="text-[28px] font-bold tracking-tight">Gemeldet</h1>
          <p className="mt-1 text-base text-muted">Das Lager sieht es jetzt.</p>
        </div>
        <div className="card rise p-5 text-left">
          <p className="font-mono text-xl font-semibold break-all">{done.partNo}</p>
          <p className="mt-1 text-base break-words text-muted tabular-nums">
            {[`${done.qty} Stück`, done.line, done.orderNo ? `Auftrag ${done.orderNo}` : ""].filter(Boolean).join(" · ")}
          </p>
          {done.urgent ? (
            <p className="mt-3 inline-flex rounded-full bg-hot-soft px-3 py-1 text-sm font-semibold text-hot">
              Maschine steht
            </p>
          ) : null}
        </div>
        <p className="text-base text-muted">
          Kommt das Teil an, unter <span className="font-semibold text-text">Meine</span> auf „Erhalten“ tippen.
        </p>
        <div className="grid gap-3">
          <Link
            to="/meine"
            className="press inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-fill text-base font-semibold text-brand-ink"
          >
            <ClipboardList className="size-5" aria-hidden="true" />
            Meine Rufe ansehen
          </Link>
          <Link
            to="/"
            className="press inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-base font-medium"
          >
            <ScanLine className="size-5" aria-hidden="true" />
            Nächstes Teil scannen
          </Link>
        </div>
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
          partRef.current?.focus();
          return;
        }
        if (!dept.trim()) {
          setError("Abteilung / Linie fehlt.");
          deptRef.current?.focus();
          return;
        }
        setPending(true);
        setError(null);
        api
          .createCall({
            line: dept,
            partNo,
            qty,
            urgency: stopped ? "sofort" : "normal",
            note,
            requester: name,
            stationCode: station ? station.code : "",
            orderNo,
          })
          .then((call) => {
            remember.set(KEY_DEPT, call.line);
            remember.set(KEY_NAME, name.trim());
            setDone({ line: call.line, partNo: call.partNo, qty: call.qty, orderNo: call.orderNo, urgent: stopped });
          })
          .catch((err: unknown) => setError(err instanceof Error ? err.message : "Nicht angekommen. Nochmal senden."))
          .finally(() => setPending(false));
      }}
    >
      <PageTitle
        title="Teil melden"
        sub={station ? `${station.name} · ${station.line}` : "Noch kurz sagen, wohin."}
      />

      {scanning ? (
        <Scanner
          onCode={(raw) => {
            const hit = parseScan(raw);
            if (!hit) return false;
            if (hit.kind === "station") return "Das ist ein Platz-Zettel. Bitte den Barcode am Teil scannen.";
            setPartNo(hit.partNo);
            setScanning(false);
            return true;
          }}
        />
      ) : null}

      <section className="card flex items-center gap-4 p-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Package className="size-6" aria-hidden="true" />
        </div>
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-semibold tracking-wider text-subtle uppercase">Teil</span>
          <input
            ref={partRef}
            value={partNo}
            onChange={(event) => {
              setPartNo(event.target.value);
              setError(null);
            }}
            placeholder="Nummer vom Teil"
            autoComplete="off"
            autoCapitalize="characters"
            className="w-full rounded-lg bg-transparent font-mono text-xl font-semibold placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-subtle"
          />
        </label>
        {!scanning ? (
          <button
            type="button"
            aria-label="Neu scannen"
            className="press grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-text"
            onClick={() => setScanning(true)}
          >
            <ScanLine className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <div className="grid gap-2">
        <span className="text-sm font-semibold">Wie viele?</span>
        <div className="card flex items-center justify-between p-2">
          <button
            type="button"
            className="press grid size-14 place-items-center rounded-xl bg-surface-2"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            aria-label="Weniger"
          >
            <Minus className="size-6" aria-hidden="true" />
          </button>
          <input
            value={qty}
            onChange={(event) => {
              const n = Number(event.target.value.replace(/\D/g, ""));
              setQty(Math.min(9999, Math.max(1, n || 1)));
            }}
            inputMode="numeric"
            aria-label="Menge"
            className="w-24 rounded-lg bg-transparent text-center font-mono text-3xl font-semibold tabular-nums"
          />
          <button
            type="button"
            className="press grid size-14 place-items-center rounded-xl bg-surface-2"
            onClick={() => setQty((n) => Math.min(9999, n + 1))}
            aria-label="Mehr"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-semibold">Wie dringend?</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Wie dringend">
          <button
            type="button"
            role="radio"
            aria-checked={!stopped}
            className={`press grid h-20 place-items-center rounded-[20px] border-2 px-3 text-center text-base font-semibold ${
              !stopped ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted"
            }`}
            onClick={() => setStopped(false)}
          >
            Normal
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={stopped}
            className={`press flex h-20 items-center justify-center gap-2 rounded-[20px] border-2 px-3 text-center text-base leading-tight font-bold ${
              stopped ? "border-hot bg-hot-fill text-white" : "border-line bg-surface text-hot"
            }`}
            onClick={() => setStopped(true)}
          >
            <TriangleAlert className="size-6 shrink-0" aria-hidden="true" />
            Maschine steht
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        <Field label="Abteilung / Linie">
          <TextInput
            ref={deptRef}
            value={dept}
            onChange={(event) => {
              setDept(event.target.value);
              setError(null);
            }}
            placeholder="z. B. Montage oder Linie 3"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
          />
        </Field>
        {choices.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {choices.map((item) => (
              <Chip key={item} size="lg" active={dept === item} onClick={() => {
                  setDept(item);
                  setError(null);
                }}
              >
                {item}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <Field label="Auftrag" hint="freiwillig">
        <TextInput
          value={orderNo}
          onChange={(event) => setOrderNo(event.target.value)}
          placeholder="Auftragsnummer"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={32}
          enterKeyHint="next"
        />
      </Field>

      <Field label="Dein Name" hint="freiwillig">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Vorname"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={40}
        />
      </Field>

      <Field label="Was ist los?" hint="freiwillig">
        <TextArea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={140}
          placeholder="z. B. Maschine 4 steht, Lager hat Fehlmenge geliefert"
        />
      </Field>

      {/* Fehler direkt über dem Knopf, sonst verschwindet er hinter der Leiste. */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 grid gap-2 bg-bg/90 px-4 py-2 backdrop-blur-md">
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button type="submit" full disabled={pending} className={`${stopped ? "!bg-hot-fill !text-white" : ""}`}>
          {pending ? "Wird gesendet…" : stopped ? "Dringend melden" : "Teil melden"}
        </Button>
      </div>
    </form>
  );
}
