import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button, Field, TextInput } from "@/components/ui";
import {
  listCalls,
  setCallStatus,
  setCallUrgency,
  tafelChangePin,
  tafelLogin,
  tafelLogout,
  tafelSetup,
  tafelState,
  type CallRow,
  type CallStatus,
  type Urgency,
} from "@/lib/fehlruf";
import {
  armBeep,
  beep,
  remember,
  statusLabel,
  uniqueLines,
  URGENCY_RANK,
  urgencyLabel,
  waitLabel,
  waitTone,
} from "@/lib/format";

export const Route = createFileRoute("/tafel")({
  loader: async () => {
    const state = await tafelState();
    return { state, calls: state === "ok" ? await listCalls() : [] };
  },
  head: () => ({ meta: [{ title: "Tafel · Fehlruf" }] }),
  component: TafelPage,
});

function TafelPage() {
  const { state, calls } = Route.useLoaderData();
  if (state !== "ok") return <PinGate setup={state === "setup"} />;
  return <Board initial={calls} />;
}

function PinGate({ setup }: { setup: boolean }) {
  const router = useRouter();
  const login = useServerFn(tafelLogin);
  const create = useServerFn(tafelSetup);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mx-auto grid w-full max-w-sm gap-4 pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (setup && pin !== again) {
          setError("Die beiden PINs sind nicht gleich.");
          return;
        }
        setPending(true);
        setError(null);
        void (setup ? create({ data: { pin } }) : login({ data: { pin } }))
          .then(() => router.invalidate())
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Hat nicht geklappt.");
            setPin("");
          })
          .finally(() => setPending(false));
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {setup ? "PIN für die Tafel festlegen" : "Tafel"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {setup
            ? "Nur wer die PIN kennt, sieht die Rufe und kann sie abhaken. Melden geht ohne PIN."
            : "PIN eingeben."}
        </p>
      </div>
      <Field label="PIN" hint={setup ? "6 bis 12 Ziffern. Gut merken." : undefined}>
        <TextInput
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
          type="password"
          inputMode="numeric"
          autoComplete={setup ? "new-password" : "current-password"}
          className="font-mono text-lg tracking-widest"
          autoFocus
        />
      </Field>
      {setup ? (
        <Field label="PIN wiederholen">
          <TextInput
            value={again}
            onChange={(event) => setAgain(event.target.value.replace(/\D/g, "").slice(0, 12))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="font-mono text-lg tracking-widest"
          />
        </Field>
      ) : null}
      {error ? <p className="text-sm text-hot">{error}</p> : null}
      <Button type="submit" full disabled={pending || pin.length < 6}>
        {pending ? "Prüfe…" : setup ? "PIN speichern" : "Öffnen"}
      </Button>
    </form>
  );
}

type Filter = "open" | "underway" | "done";

const TABS: ReadonlyArray<readonly [Filter, string]> = [
  ["open", "Offen"],
  ["underway", "Unterwegs"],
  ["done", "Erledigt"],
];

const urgencies: Urgency[] = ["sofort", "heute", "normal"];

function Board({ initial }: { initial: CallRow[] }) {
  const router = useRouter();
  const setStatus = useServerFn(setCallStatus);
  const setUrgency = useServerFn(setCallUrgency);
  const [calls, setCalls] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  const [dept, setDept] = useState("alle");
  const [sound, setSound] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // null until mounted, so server and client render the same markup.
  const [now, setNow] = useState<number | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setCalls(initial);
  }, [initial]);

  useEffect(() => {
    setSound(remember.get("fehlruf-ton") === "1");
  }, []);

  useEffect(() => {
    const tick = () => void router.invalidate();
    const timer = window.setInterval(tick, 4000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router]);

  useEffect(() => {
    if (!sound) return;
    const arm = () => armBeep();
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, [sound]);

  useEffect(() => {
    const ids = calls.filter((call) => call.status === "open").map((call) => call.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = calls.filter((call) => call.status === "open" && !seen.current?.has(call.id));
    for (const id of ids) seen.current.add(id);
    const newest = fresh[0];
    if (!newest) return;
    setBanner(`${newest.line} · ${newest.partNo} · ${newest.qty} Stück`);
    if (sound) beep();
    if (typeof navigator.vibrate === "function") navigator.vibrate([30, 40, 30]);
  }, [calls, sound]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const active = calls.filter((call) => call.status !== "done");
  const open = calls.filter((call) => call.status === "open");
  const stopped = active.filter((call) => call.urgency === "sofort").length;
  const oldest = open.reduce((min, call) => Math.min(min, call.createdAt), Infinity);
  const count = (status: Filter) => calls.filter((call) => call.status === status).length;

  const inFilter = calls.filter((call) => call.status === filter);
  const depts = uniqueLines(inFilter.map((call) => call.line));
  const visible = inFilter
    .filter((call) => dept === "alle" || call.line === dept)
    .slice()
    .sort((a, b) => {
      if (filter === "done") return b.updatedAt - a.updatedAt;
      if (URGENCY_RANK[a.urgency] !== URGENCY_RANK[b.urgency]) {
        return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
      }
      return a.createdAt - b.createdAt;
    });

  async function update(call: CallRow, patch: Partial<Pick<CallRow, "status" | "urgency">>) {
    setBusy(call.id);
    const prev = calls;
    setCalls(calls.map((item) => (item.id === call.id ? { ...item, ...patch } : item)));
    try {
      if (patch.status) await setStatus({ data: { id: call.id, status: patch.status } });
      if (patch.urgency) await setUrgency({ data: { id: call.id, urgency: patch.urgency } });
      void router.invalidate();
    } catch {
      setCalls(prev);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tafel</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {open.length === 0
              ? "Nichts offen"
              : `${open.length} offen${now === null ? "" : ` · längster wartet ${waitLabel(oldest, now)}`}`}
          </p>
        </div>
        <button
          type="button"
          className="press h-11 rounded-sm border border-border px-3 text-sm font-medium"
          onClick={() => {
            const next = !sound;
            setSound(next);
            remember.set("fehlruf-ton", next ? "1" : "0");
            if (next) {
              armBeep();
              beep();
            }
          }}
        >
          {sound ? "Ton an" : "Ton aus"}
        </button>
      </div>

      {stopped > 0 ? (
        <p className="rounded-lg border border-hot bg-hot-bg px-4 py-3 text-base font-medium text-hot">
          {stopped === 1 ? "1 Ruf mit Sofort" : `${stopped} Rufe mit Sofort`} · Maschine steht oder dringend
        </p>
      ) : null}

      <div aria-live="assertive">
        {banner ? (
          <p className="rise rounded-lg border border-border bg-card px-4 py-3 text-sm">Neu · {banner}</p>
        ) : null}
      </div>

      <MissingSummary calls={active} />

      <div className="flex gap-2" role="tablist" aria-label="Status">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`press h-11 rounded-sm px-3 text-sm font-medium tabular-nums ${filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
            onClick={() => {
              setFilter(key);
              setDept("alle");
            }}
          >
            {label} {count(key)}
          </button>
        ))}
      </div>

      {depts.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          <Chip active={dept === "alle"} onClick={() => setDept("alle")}>
            Alle
          </Chip>
          {depts.map((item) => (
            <Chip key={item} active={dept === item} onClick={() => setDept(item)}>
              {item}
            </Chip>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">
            {filter === "open" ? "Gerade fehlt nichts" : `Nichts unter ${statusLabel(filter)}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            In der Produktion die Startseite öffnen und das Teil scannen.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((call) => (
            <li key={call.id}>
              <CallCard call={call} now={now} busy={busy !== null} onChange={(patch) => void update(call, patch)} />
            </li>
          ))}
        </ul>
      )}

      <Settings />
    </div>
  );
}

function MissingSummary({ calls }: { calls: CallRow[] }) {
  const groups = new Map<string, { partNo: string; qty: number; depts: Set<string>; urgent: boolean }>();
  for (const call of calls) {
    const key = call.partNo.toLocaleUpperCase("de");
    const group = groups.get(key) ?? { partNo: call.partNo, qty: 0, depts: new Set(), urgent: false };
    group.qty += call.qty;
    group.depts.add(call.line);
    group.urgent ||= call.urgency === "sofort";
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort(
    (a, b) => Number(b.urgent) - Number(a.urgent) || b.depts.size - a.depts.size || b.qty - a.qty,
  );
  if (rows.length < 2) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Was fehlt gerade · {rows.length} Teile</h2>
      <ul className="mt-2 grid gap-1">
        {rows.slice(0, 8).map((row) => (
          <li key={row.partNo} className="flex items-baseline justify-between gap-3 text-sm">
            <span className={`truncate font-mono ${row.urgent ? "text-hot" : ""}`}>{row.partNo}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {row.qty} Stk · {row.depts.size === 1 ? [...row.depts][0] : `${row.depts.size} Abteilungen`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CallCard({
  call,
  now,
  busy,
  onChange,
}: {
  call: CallRow;
  now: number | null;
  busy: boolean;
  onChange: (patch: Partial<Pick<CallRow, "status" | "urgency">>) => void;
}) {
  const tone = call.status === "done" || now === null ? "fresh" : waitTone(call.createdAt, now);
  const toneClass =
    tone === "late" ? "bg-hot-bg text-hot" : tone === "slow" ? "bg-warn-bg text-warn" : "bg-muted text-muted-foreground";
  const who = [call.requester, call.stationCode ? `Platz ${call.stationCode}` : ""].filter(Boolean).join(" · ");

  return (
    <article
      className={`grid gap-3 rounded-xl border border-border bg-card p-4 ${call.urgency === "sofort" && call.status !== "done" ? "call-urgent" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{call.line}</h2>
        <span className={`shrink-0 rounded-sm px-2 py-1 text-xs font-medium tabular-nums ${toneClass}`}>
          {call.status === "done" ? "erledigt" : now === null ? "wartet" : `wartet ${waitLabel(call.createdAt, now)}`}
        </span>
      </div>
      <div>
        <p className="font-mono text-lg font-medium tracking-tight break-all">{call.partNo}</p>
        {call.partName ? <p className="text-sm text-muted-foreground">{call.partName}</p> : null}
        <p className="text-sm text-muted-foreground tabular-nums">
          {call.qty} Stück{who ? ` · ${who}` : ""}
        </p>
      </div>
      {call.note ? <p className="text-sm">{call.note}</p> : null}

      {call.status !== "done" ? (
        <div className="grid grid-cols-3 gap-1 rounded-sm bg-muted p-1" role="group" aria-label="Prio">
          {urgencies.map((item) => (
            <button
              key={item}
              type="button"
              disabled={busy}
              aria-pressed={call.urgency === item}
              className={`press h-9 rounded-sm text-sm font-medium ${
                call.urgency === item
                  ? item === "sofort"
                    ? "bg-hot-bg text-hot"
                    : item === "heute"
                      ? "bg-warn-bg text-warn"
                      : "bg-background text-foreground"
                  : "text-muted-foreground"
              }`}
              onClick={() => onChange({ urgency: item })}
            >
              {urgencyLabel(item)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {call.status === "open" ? (
          <Button variant="muted" disabled={busy} onClick={() => onChange({ status: "underway" })}>
            Unterwegs
          </Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => onChange({ status: "open" as CallStatus })}>
            Wieder offen
          </Button>
        )}
        {call.status !== "done" ? (
          <Button disabled={busy} onClick={() => onChange({ status: "done" })}>
            Erledigt
          </Button>
        ) : (
          <Button variant="muted" disabled>
            {statusLabel("done")}
          </Button>
        )}
      </div>
    </article>
  );
}

function Settings() {
  const router = useRouter();
  const logout = useServerFn(tafelLogout);
  const change = useServerFn(tafelChangePin);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <details className="mt-4 rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Einstellungen</summary>
      <div className="mt-4 grid gap-4">
        <Link to="/plaetze" className="text-sm font-medium underline underline-offset-4">
          QR-Zettel für Abteilungen
        </Link>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void change({ data: { pin } })
              .then(() => {
                setPin("");
                setMsg("PIN geändert. Andere Geräte müssen sie neu eingeben.");
              })
              .catch((err: unknown) => setMsg(err instanceof Error ? err.message : "Nicht geändert."));
          }}
        >
          <Field label="Neue PIN">
            <TextInput
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              className="font-mono tracking-widest"
            />
          </Field>
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
          <Button type="submit" variant="muted" disabled={pin.length < 6}>
            PIN ändern
          </Button>
        </form>
        <Button variant="ghost" onClick={() => void logout().then(() => router.invalidate())}>
          Abmelden
        </Button>
      </div>
    </details>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`press h-10 shrink-0 rounded-sm px-3 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
