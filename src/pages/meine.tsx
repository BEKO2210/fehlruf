import { Link } from "@tanstack/react-router";
import { Check, MessageSquare, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorText, PageTitle } from "@/components/ui";
import { api, type CallRow } from "@/lib/api";
import { relativeWhen, replyTone, waitLabel, waitTone } from "@/lib/format";

/** Rufe dieses Handys. Holt alle 10 Sekunden neu, solange die Seite offen ist. */
function useMine() {
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  // Zählt hoch bei jeder eigenen Änderung: Antworten von Abfragen, die davor losliefen, sind veraltet.
  const generation = useRef(0);

  const load = useCallback(() => {
    const gen = generation.current;
    api
      .mine()
      .then((rows) => {
        if (gen !== generation.current) return;
        setCalls(rows);
        setOffline(false);
      })
      .catch(() => {
        if (gen === generation.current) setOffline(true);
      });
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      generation.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const replace = useCallback((row: CallRow) => {
    generation.current += 1;
    setCalls((list) => (list ?? []).map((item) => (item.id === row.id ? row : item)));
  }, []);

  return { calls, replace, offline };
}

export function MeinePage() {
  const { calls, replace, offline } = useMine();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function confirm(call: CallRow) {
    setBusy(call.id);
    setError(null);
    try {
      const row = await api.received(call.id);
      replace(row);
      if (typeof navigator.vibrate === "function") navigator.vibrate(40);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hat nicht geklappt. Nochmal tippen.");
    } finally {
      setBusy(null);
    }
  }

  // Oben, was etwas vom Anforderer will: gesendet (Erhalten tippen), dann "Nicht auf Lager", dann der Rest, älteste zuerst.
  const weight = (call: CallRow) =>
    call.status === "underway" ? 0 : call.reply && replyTone(call.reply) === "bad" ? 1 : 2;
  const active = (calls ?? [])
    .filter((call) => call.status !== "done")
    .sort((a, b) => weight(a) - weight(b) || a.createdAt - b.createdAt);
  const done = (calls ?? []).filter((call) => call.status === "done");

  return (
    <div className="mx-auto grid w-full max-w-lg gap-5">
      <div>
        <PageTitle title="Meine Rufe" sub="Was du gemeldet hast. Kommt das Teil an: „Erhalten“ tippen." />
        <p className="mt-1 text-xs text-muted">Nur auf diesem Handy sichtbar.</p>
      </div>

      {offline ? <ErrorText>Keine Verbindung zum Server. Versuche es weiter…</ErrorText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {calls === null ? (
        <p className="py-8 text-center text-muted">Lädt…</p>
      ) : active.length === 0 ? (
        <div className="card grid justify-items-center gap-3 p-8 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
            <Check className="size-7" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold">Nichts offen</h2>
          <p className="text-sm text-muted">Du wartest gerade auf kein Teil.</p>
          <Link
            to="/"
            className="press mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-fill px-6 text-base font-semibold text-brand-ink"
          >
            <ScanLine className="size-5" aria-hidden="true" />
            Teil melden
          </Link>
        </div>
      ) : (
        <ul className="grid gap-5">
          {active.map((call) => (
            <li key={call.id} className="min-w-0">
              <MyCard call={call} now={now} busy={busy === call.id} onReceived={() => void confirm(call)} />
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-subtle uppercase">Erhalten · letzte 24 Std</h2>
          <ul className="grid gap-2">
            {done.map((call) => (
              <li key={call.id} className="card flex items-center gap-3 p-3 opacity-70">
                <Check className="size-5 shrink-0 text-ok" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono font-semibold">{call.partNo}</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">
                  {call.qty} Stk · {call.receivedAt ? `nach ${waitLabel(call.createdAt, call.receivedAt)} da` : "da"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MyCard({
  call,
  now,
  busy,
  onReceived,
}: {
  call: CallRow;
  now: number;
  busy: boolean;
  onReceived: () => void;
}) {
  const sent = call.status === "underway";
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  const tone = waitTone(call.createdAt, now, call.urgency);
  const waitColor = tone === "late" ? "text-hot" : tone === "slow" ? "text-warn" : "text-text";
  const rt = call.reply ? replyTone(call.reply) : "info";
  const missing = !sent && rt === "bad";
  // Ein Satz statt Schritte: Was ist gerade los?
  const status = missing
    ? { text: "Nicht auf Lager", sub: "Das Lager hat das Teil gerade nicht.", color: "bg-hot-fill text-white" }
    : sent
    ? { text: "Kommt zu dir", sub: "Das Lager hat es losgeschickt.", color: "bg-ok-soft text-ok" }
    : call.seenAt !== null
      ? { text: "Lager hat es gesehen", sub: "Wird bearbeitet.", color: "bg-brand-soft text-brand" }
      : { text: "Gemeldet", sub: "Lager hat es noch nicht geöffnet.", color: "bg-surface-2 text-text" };

  return (
    <article className={`card grid min-w-0 gap-3 p-4 ${missing ? "ring-2 ring-hot" : sent ? "ring-2 ring-ok" : ""}`}>
      {/* Kopf: Linie links, Wartezeit groß rechts */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {call.urgency === "sofort" ? (
            <p className="mb-1 inline-flex rounded-full bg-hot-fill px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
              Dringend
            </p>
          ) : null}
          <h2 className="text-lg font-bold tracking-tight break-words">{call.line}</h2>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl leading-tight font-bold tabular-nums ${waitColor}`}>{waitLabel(call.createdAt, now)}</p>
          <p className="text-xs text-muted">wartest du</p>
        </div>
      </div>

      {/* Teil × Menge, Auftrag, Grund */}
      <div>
        <p className="font-mono text-xl font-semibold tracking-tight break-all">
          {call.partNo} <span className="font-sans text-base font-bold text-muted">× {call.qty}</span>
        </p>
        {call.orderNo ? <p className="mt-0.5 text-base font-semibold break-all">Auftrag {call.orderNo}</p> : null}
      </div>

      {call.note ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="font-semibold text-muted">Was ist los: </span>
          {call.note}
        </p>
      ) : null}

      <div className={`rounded-2xl px-4 py-3 ${status.color}`}>
        <p className="text-lg font-bold">{status.text}</p>
        <p className="text-sm opacity-80">{status.sub}</p>
      </div>

      {call.reply && !missing && !(sent && rt === "info") ? (
        <div
          className={`flex gap-3 rounded-2xl p-3 ${rt === "bad" ? "bg-hot-soft text-hot" : "bg-brand-soft"}`}
        >
          <MessageSquare
            className={`mt-0.5 size-5 shrink-0 ${rt === "bad" ? "" : "text-brand"}`}
            aria-hidden="true"
          />
          <div>
            <p className="text-base font-semibold">Lager: {call.reply}</p>
            {call.replyAt ? <p className="text-xs text-muted">{relativeWhen(call.replyAt)}</p> : null}
          </div>
        </div>
      ) : null}

      {sent ? (
        <Button full disabled={busy} className="!bg-ok-fill !text-white" onClick={onReceived}>
          <Check className="size-5" strokeWidth={3} aria-hidden="true" />
          {busy ? "Wird bestätigt…" : "Erhalten"}
        </Button>
      ) : missing ? null : armed ? (
        <Button full disabled={busy} className="!bg-ok-fill !text-white" onClick={onReceived}>
          <Check className="size-5" aria-hidden="true" />
          {busy ? "Wird bestätigt…" : "Ja, ich habe das Teil"}
        </Button>
      ) : (
        // Vor "Gesendet" mit Rückfrage: ein versehentlicher Tipp stoppt sonst die Zeit.
        <Button variant="ghost" full disabled={busy} onClick={() => setArmed(true)}>
          <Check className="size-5" aria-hidden="true" />
          Schon da? Erhalten
        </Button>
      )}
    </article>
  );
}
