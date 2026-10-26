import { Link } from "@tanstack/react-router";
import { Check, MessageSquare, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorText, PageTitle } from "@/components/ui";
import { api, type CallRow } from "@/lib/api";
import { relativeWhen, waitLabel, waitTone } from "@/lib/format";

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

  const active = (calls ?? []).filter((call) => call.status !== "done");
  const done = (calls ?? []).filter((call) => call.status === "done");

  return (
    <div className="mx-auto grid w-full max-w-lg gap-5">
      <PageTitle title="Meine Rufe" sub="Was du bestellt hast. Kommt es an: „Erhalten“ tippen." />

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
            className="press mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-base font-semibold text-brand-ink"
          >
            <ScanLine className="size-5" aria-hidden="true" />
            Teil melden
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {active.map((call) => (
            <li key={call.id}>
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
                  {call.qty} Stk · {call.receivedAt ? waitLabel(call.createdAt, call.receivedAt) : "–"}
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
  const tone = waitTone(call.createdAt, now, call.urgency);
  const waitColor = tone === "late" ? "text-hot" : tone === "slow" ? "text-warn" : "text-text";
  // Ein Satz statt Schritte: Was ist gerade los?
  const status = sent
    ? { text: "Kommt zu dir", sub: "Das Lager hat es losgeschickt.", color: "bg-ok-soft text-ok" }
    : call.seenAt !== null
      ? { text: "Lager hat es gesehen", sub: "Wird bearbeitet.", color: "bg-brand-soft text-brand" }
      : { text: "Gemeldet", sub: "Lager hat es noch nicht geöffnet.", color: "bg-surface-2 text-text" };

  return (
    <article className={`card grid gap-4 p-4 ${sent ? "ring-2 ring-ok" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xl font-semibold tracking-tight break-all">{call.partNo}</p>
          <p className="mt-0.5 text-sm text-muted">
            {[`${call.qty} Stück`, call.line, call.orderNo ? `Auftrag ${call.orderNo}` : ""].filter(Boolean).join(" · ")}
          </p>
          {call.urgency === "sofort" ? (
            <p className="mt-2 inline-flex rounded-full bg-hot-soft px-3 py-1 text-sm font-semibold text-hot">
              Dringend
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl font-bold tabular-nums ${waitColor}`}>{waitLabel(call.createdAt, now)}</p>
          <p className="text-xs text-muted">wartest du</p>
        </div>
      </div>

      <div className={`rounded-2xl px-4 py-3 ${status.color}`}>
        <p className="text-lg font-bold">{status.text}</p>
        <p className="text-sm opacity-80">{status.sub}</p>
      </div>

      {call.reply ? (
        <div className="flex gap-3 rounded-2xl bg-brand-soft p-3">
          <MessageSquare className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold">Lager: {call.reply}</p>
            {call.replyAt ? <p className="text-xs text-muted">{relativeWhen(call.replyAt)}</p> : null}
          </div>
        </div>
      ) : null}

      {sent ? (
        <Button full disabled={busy} className="h-16 !bg-ok text-lg !text-white" onClick={onReceived}>
          <Check className="size-6" strokeWidth={3} aria-hidden="true" />
          {busy ? "Wird bestätigt…" : "Erhalten"}
        </Button>
      ) : (
        <Button variant="ghost" full disabled={busy} onClick={onReceived}>
          <Check className="size-5" aria-hidden="true" />
          {busy ? "Wird bestätigt…" : "Schon da? Erhalten"}
        </Button>
      )}
    </article>
  );
}
