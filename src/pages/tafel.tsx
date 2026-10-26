import { Link } from "@tanstack/react-router";
import { BarChart3, Bell, BellOff, ChevronDown, Lock, MessageSquare, QrCode, Truck, Check, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Chip, ErrorText, Field, TextInput } from "@/components/ui";
import { api, ApiError, type CallPatch, type CallRow, type TafelState, type Urgency } from "@/lib/api";
import {
  armBeep,
  beep,
  remember,
  uniqueLines,
  URGENCY_RANK,
  relativeWhen,
  urgencyLabel,
  waitLabel,
  waitShort,
  waitTone,
} from "@/lib/format";

/** Shared by Tafel and QR-Zettel: checks the token, shows the PIN screen if needed. */
export function useTafelState() {
  const [state, setState] = useState<TafelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    api
      .state()
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Server nicht erreichbar."));
  }, []);
  useEffect(refresh, [refresh]);
  return { state, error, refresh, lock: () => setState("locked") };
}

export function TafelPage() {
  const { state, error, refresh, lock } = useTafelState();
  if (error && state === null) return <Offline message={error} onRetry={refresh} />;
  if (state === null) return <p className="pt-10 text-center text-muted">Lädt…</p>;
  if (state !== "ok") return <PinGate setup={state === "setup"} onDone={refresh} />;
  return <Board onLocked={lock} />;
}

export function Offline({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto grid max-w-sm gap-4 pt-8">
      <ErrorText>{message}</ErrorText>
      <Button variant="muted" onClick={onRetry}>
        Nochmal versuchen
      </Button>
    </div>
  );
}

export function PinGate({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 12);

  return (
    <form
      className="card mx-auto mt-4 grid w-full max-w-sm gap-5 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (setup && pin !== again) {
          setError("Die beiden PINs sind nicht gleich.");
          return;
        }
        setPending(true);
        setError(null);
        void (setup ? api.setup(pin) : api.login(pin))
          .then(onDone)
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Hat nicht geklappt.");
            setPin("");
          })
          .finally(() => setPending(false));
      }}
    >
      <div className="grid justify-items-center gap-3 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Lock className="size-7" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{setup ? "PIN festlegen" : "Tafel öffnen"}</h1>
        <p className="text-sm text-muted">
          {setup
            ? "Nur wer die PIN kennt, sieht die Meldungen. Melden geht ohne PIN."
            : "Bitte PIN eingeben."}
        </p>
      </div>
      <Field label="PIN" hint={setup ? "6 bis 12 Ziffern" : undefined}>
        <TextInput
          value={pin}
          onChange={(event) => setPin(digits(event.target.value))}
          type="password"
          inputMode="numeric"
          autoComplete={setup ? "new-password" : "current-password"}
          className="text-center font-mono text-2xl tracking-[0.4em]"
          autoFocus
        />
      </Field>
      {setup ? (
        <Field label="PIN wiederholen">
          <TextInput
            value={again}
            onChange={(event) => setAgain(digits(event.target.value))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="text-center font-mono text-2xl tracking-[0.4em]"
          />
        </Field>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button type="submit" full disabled={pending || pin.length < 6}>
        {pending ? "Prüfe…" : setup ? "PIN speichern" : "Öffnen"}
      </Button>
    </form>
  );
}

type Filter = "open" | "underway" | "done";

const TABS: ReadonlyArray<readonly [Filter, string]> = [
  ["open", "Offen"],
  ["underway", "Gesendet"],
  ["done", "Erledigt"],
];

function Board({ onLocked }: { onLocked: () => void }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [dept, setDept] = useState("alle");
  const [sound, setSound] = useState(() => remember.get("fehlruf-ton") === "1");
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(() => {
    api
      .calls(document.visibilityState === "visible" && document.hasFocus())
      .then((rows) => {
        setCalls(rows);
        setLoaded(true);
        setOffline(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) onLocked();
        else setOffline(true);
      });
  }, [onLocked]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!sound) return;
    const arm = () => armBeep();
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, [sound]);

  useEffect(() => {
    if (!loaded) return;
    const ids = calls.filter((call) => call.status === "open").map((call) => call.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = calls.filter((call) => call.status === "open" && !seen.current?.has(call.id));
    for (const id of ids) seen.current.add(id);
    const newest = fresh[0];
    if (!newest) return;
    setBanner(`${newest.urgency === "sofort" ? "DRINGEND · " : ""}${newest.partNo} · ${newest.qty} Stück · ${newest.line}`);
    if (sound) beep();
    if (typeof navigator.vibrate === "function") navigator.vibrate([30, 40, 30]);
  }, [calls, loaded, sound]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 20000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const active = calls.filter((call) => call.status !== "done");
  const open = calls.filter((call) => call.status === "open");
  const urgent = active.filter((call) => call.urgency === "sofort").length;
  // Die Zeit läuft, bis "Erhalten" bestätigt ist, also auch bei "Gesendet".
  const oldest = active.reduce((min, call) => Math.min(min, call.createdAt), Infinity);
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

  async function update(call: CallRow, patch: CallPatch) {
    setBusy(call.id);
    const prev = calls;
    setCalls(calls.map((item) => (item.id === call.id ? { ...item, ...patch, updatedAt: Date.now() } : item)));
    try {
      const row = await api.updateCall(call.id, patch);
      setCalls((list) => list.map((item) => (item.id === row.id ? row : item)));
    } catch (err) {
      setCalls(prev);
      if (err instanceof ApiError && err.status === 401) onLocked();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Tafel</h1>
        <div className="flex gap-2">
        <Link
          to="/statistik"
          aria-label="Statistik"
          className="press grid size-12 place-items-center rounded-2xl border border-line bg-surface text-muted"
        >
          <BarChart3 className="size-5" aria-hidden="true" />
        </Link>
        <button
          type="button"
          aria-pressed={sound}
          aria-label={sound ? "Ton aus" : "Ton an"}
          className={`press grid size-12 place-items-center rounded-2xl ${sound ? "bg-brand-soft text-brand" : "border border-line bg-surface text-muted"}`}
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
          {sound ? <Bell className="size-5" aria-hidden="true" /> : <BellOff className="size-5" aria-hidden="true" />}
        </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Noch nicht gesendet" value={String(open.length)} />
        <Stat label="Dringend" value={String(urgent)} tone={urgent > 0 ? "hot" : undefined} />
        <Stat
          label="Längste Wartezeit"
          value={active.length ? waitShort(oldest, now) : "–"}
          tone={active.length ? toneOf(waitTone(oldest, now)) : undefined}
        />
      </div>

      {offline ? <ErrorText>Keine Verbindung zum Server. Versuche es weiter…</ErrorText> : null}

      <div aria-live="assertive">
        {banner ? (
          <div className="rise flex items-center gap-3 rounded-2xl bg-brand px-4 py-3 text-brand-ink" onClick={() => setBanner(null)}>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold uppercase">Neu</span>
            <span className="min-w-0 truncate text-sm font-medium">{banner}</span>
          </div>
        ) : null}
      </div>

      <MissingSummary calls={active} />

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Status">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`press h-11 rounded-xl text-sm font-semibold tabular-nums ${
              filter === key ? "bg-surface text-text shadow-sm" : "text-muted"
            }`}
            onClick={() => {
              setFilter(key);
              setDept("alle");
            }}
          >
            {label} <span className={filter === key ? "text-brand" : ""}>{count(key)}</span>
          </button>
        ))}
      </div>

      {depts.length > 1 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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

      {!loaded ? (
        <p className="py-8 text-center text-muted">Lädt…</p>
      ) : visible.length === 0 ? (
        <div className="card grid justify-items-center gap-2 p-8 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
            <Check className="size-7" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold">{filter === "open" ? "Alles da" : "Hier ist nichts"}</h2>
          <p className="text-sm text-muted">
            {filter === "open" ? "Gerade fehlt kein Teil." : "Keine Meldungen in diesem Bereich."}
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

      <Settings onLocked={onLocked} />
    </div>
  );
}

function toneOf(t: "fresh" | "slow" | "late"): "hot" | "warn" | undefined {
  return t === "late" ? "hot" : t === "slow" ? "warn" : undefined;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "hot" | "warn" }) {
  const color = tone === "hot" ? "text-hot" : tone === "warn" ? "text-warn" : "text-text";
  return (
    <div className="card px-3 py-3">
      <p className={`truncate text-xl font-bold tracking-tight tabular-nums ${color}`}>{value}</p>
      <p className="text-xs leading-tight font-medium text-muted">{label}</p>
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
    <section className="card p-4">
      <h2 className="text-xs font-semibold tracking-wider text-subtle uppercase">
        Was fehlt gerade · {rows.length} Teile
      </h2>
      <ul className="mt-3 grid gap-2">
        {rows.slice(0, 8).map((row) => (
          <li key={row.partNo} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${row.urgent ? "bg-hot" : "bg-line"}`} />
              <span className="truncate font-mono font-semibold">{row.partNo}</span>
            </span>
            <span className="shrink-0 text-muted tabular-nums">
              {row.qty} Stk · {row.depts.size === 1 ? [...row.depts][0] : `${row.depts.size} Abteilungen/Linien`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PRIO_STYLE: Record<Urgency, { bar: string; active: string }> = {
  sofort: { bar: "bg-hot", active: "bg-hot text-white" },
  heute: { bar: "bg-warn", active: "bg-warn text-white" },
  normal: { bar: "bg-line", active: "bg-surface text-text shadow-sm" },
};

const urgencies: Urgency[] = ["sofort", "heute", "normal"];

const REPLIES = ["Kommt gleich", "Dauert länger", "Nicht auf Lager", "Bitte anrufen"];

function CallCard({
  call,
  now,
  busy,
  onChange,
}: {
  call: CallRow;
  now: number;
  busy: boolean;
  onChange: (patch: CallPatch) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const isDone = call.status === "done";
  const urgent = !isDone && call.urgency === "sofort";
  // Gestoppt wird erst bei "Erhalten".
  const end = isDone ? (call.receivedAt ?? call.updatedAt) : now;
  const tone = isDone ? "fresh" : waitTone(call.createdAt, now, call.urgency);
  const waitColor = tone === "late" ? "text-hot" : tone === "slow" ? "text-warn" : "text-text";
  const meta = [call.requester, call.stationCode ? `Platz ${call.stationCode}` : ""].filter(Boolean);

  return (
    <article
      className={`card relative grid gap-3 overflow-hidden p-4 pl-5 ${isDone ? "opacity-70" : ""} ${urgent ? "!border-hot bg-hot-soft" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${isDone ? "bg-ok" : PRIO_STYLE[call.urgency].bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {urgent ? (
            <p className="mb-1 inline-flex rounded-full bg-hot px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
              Dringend
            </p>
          ) : null}
          <h2 className="truncate text-lg font-bold tracking-tight">{call.line}</h2>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xl font-bold tabular-nums ${isDone ? "text-ok" : waitColor}`}>
            {waitLabel(call.createdAt, end)}
          </p>
          <p className="text-xs text-muted">{isDone ? "bis erhalten" : "wartet"}</p>
        </div>
      </div>

      <div>
        <p className="font-mono text-xl font-semibold tracking-tight break-all">
          {call.partNo} <span className="font-sans text-base font-bold text-muted">× {call.qty}</span>
        </p>
        {call.orderNo ? <p className="mt-0.5 text-base font-semibold">Auftrag {call.orderNo}</p> : null}
        {meta.length ? <p className="mt-0.5 text-sm text-muted">{meta.join(" · ")}</p> : null}
      </div>

      {call.note ? <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{call.note}</p> : null}

      {call.reply ? (
        <p className="flex items-center gap-2 text-sm text-brand">
          <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold">Deine Antwort: {call.reply}</span>
        </p>
      ) : null}

      {call.status === "underway" ? (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
          Gesendet {call.sentAt ? relativeWhen(call.sentAt, now) : ""} · wartet auf „Erhalten“ vom Anforderer
        </p>
      ) : null}

      {isDone ? (
        <p className="text-sm font-semibold text-ok">
          {call.receivedBy === "lager" ? "Vom Lager geschlossen" : "Anforderer hat Erhalt bestätigt"}
        </p>
      ) : null}

      {!isDone ? (
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Prio">
          {urgencies.map((item) => (
            <button
              key={item}
              type="button"
              disabled={busy}
              aria-pressed={call.urgency === item}
              className={`press h-10 rounded-lg text-sm font-semibold ${
                call.urgency === item ? PRIO_STYLE[item].active : "text-muted"
              }`}
              onClick={() => onChange({ urgency: item })}
            >
              {urgencyLabel(item)}
            </button>
          ))}
        </div>
      ) : null}

      {!isDone && replyOpen ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            {REPLIES.map((text) => (
              <Chip
                key={text}
                active={call.reply === text}
                onClick={() => {
                  onChange({ reply: call.reply === text ? "" : text });
                  setReplyOpen(false);
                }}
              >
                {text}
              </Chip>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onChange({ reply: draft.trim() });
              setDraft("");
              setReplyOpen(false);
            }}
          >
            <TextInput
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Eigene Antwort"
              maxLength={80}
              className="h-11"
            />
            <Button type="submit" variant="muted" className="h-11" disabled={!draft.trim()}>
              OK
            </Button>
          </form>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {call.status === "open" ? (
          <Button className="h-12" disabled={busy} onClick={() => onChange({ status: "underway" })}>
            <Truck className="size-5" aria-hidden="true" />
            Gesendet
          </Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => onChange({ status: "open" })}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Wieder offen
          </Button>
        )}
        {!isDone ? (
          <Button variant="muted" disabled={busy} onClick={() => setReplyOpen((v) => !v)}>
            <MessageSquare className="size-5" aria-hidden="true" />
            Antwort
          </Button>
        ) : null}
        {!isDone ? (
          <Button
            variant={call.status === "underway" ? "primary" : "ghost"}
            className={`col-span-2 ${call.status === "underway" ? "!bg-ok !text-white" : ""}`}
            disabled={busy}
            onClick={() => onChange({ status: "done" })}
          >
            <Check className="size-5" aria-hidden="true" />
            {call.status === "underway" ? "Erhalten (selbst bestätigen)" : "Schon erledigt"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function Settings({ onLocked }: { onLocked: () => void }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <details className="card group mt-2 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-muted">
        Einstellungen
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-4 grid gap-4">
        <Link
          to="/plaetze"
          className="press flex h-12 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-sm font-semibold"
        >
          <QrCode className="size-5 text-brand" aria-hidden="true" />
          QR-Zettel für Abteilungen/Linien
        </Link>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void api
              .changePin(pin)
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
          {msg ? <p className="text-sm text-muted">{msg}</p> : null}
          <Button type="submit" variant="muted" disabled={pin.length < 6}>
            PIN ändern
          </Button>
        </form>
        <Button
          variant="ghost"
          onClick={() => {
            api.logout();
            onLocked();
          }}
        >
          Abmelden
        </Button>
      </div>
    </details>
  );
}
