import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { listCalls, setCallStatus, type CallRow, type CallStatus } from "@/lib/fehlruf";
import { absoluteWhen, armBeep, beep, relativeWhen, statusLabel, uniqueLines, urgencyLabel } from "@/lib/format";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/")({
  loader: () => listCalls(),
  component: Board,
});

type Filter = "open" | "underway" | "done";

function Board() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const setStatus = useServerFn(setCallStatus);
  const [calls, setCalls] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  const [line, setLine] = useState("alle");
  const [sound, setSound] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setCalls(initial);
  }, [initial]);

  useEffect(() => {
    setSound(localStorage.getItem("fehlruf-ton") === "1");
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
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    setNow(Date.now());
    return () => window.clearInterval(timer);
  }, []);

  const openCount = calls.filter((call) => call.status === "open").length;
  const inFilter = calls.filter((call) => call.status === filter);
  const lines = uniqueLines(inFilter.map((call) => call.line));
  const visible = inFilter
    .filter((call) => line === "alle" || call.line === line)
    .slice()
    .sort((a, b) => {
      const rank = { sofort: 0, heute: 1, normal: 2 };
      if (filter === "open" && rank[a.urgency] !== rank[b.urgency]) {
        return rank[a.urgency] - rank[b.urgency];
      }
      return b.createdAt - a.createdAt;
    });

  async function change(call: CallRow, status: CallStatus) {
    setBusy(call.id + status);
    const prev = calls;
    setCalls(calls.map((item) => (item.id === call.id ? { ...item, status } : item)));
    try {
      await setStatus({ data: { id: call.id, status } });
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
            {openCount === 0 ? "Nichts offen" : `${openCount} offen`}
          </p>
        </div>
        <button
          type="button"
          className="press h-11 rounded-sm border border-border px-3 text-sm font-medium"
          onClick={() => {
            const next = !sound;
            setSound(next);
            localStorage.setItem("fehlruf-ton", next ? "1" : "0");
            if (next) {
              armBeep();
              beep();
            }
          }}
        >
          {sound ? "Ton an" : "Ton aus"}
        </button>
      </div>

      <div aria-live="assertive">
        {banner ? (
          <p className="rise rounded-lg border border-border bg-card px-4 py-3 text-sm">
            Neuer Ruf · {banner}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Status">
        {(
          [
            ["open", "Offen"],
            ["underway", "Unterwegs"],
            ["done", "Erledigt"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`press h-11 rounded-sm px-3 text-sm font-medium ${filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
            onClick={() => {
              setFilter(key);
              setLine("alle");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {lines.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          <LineChip active={line === "alle"} onClick={() => setLine("alle")}>
            Alle Linien
          </LineChip>
          {lines.map((item) => (
            <LineChip key={item} active={line === item} onClick={() => setLine(item)}>
              {item}
            </LineChip>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">
            {filter === "open" ? "Gerade kein Fehlteil" : `Nichts unter ${statusLabel(filter)}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            In der Produktion den Platz-Code scannen. Die Linie muss dazu geschrieben werden, sonst
            geht der Ruf nicht raus.
          </p>
          <Link
            to="/scan"
            className="press mt-4 inline-flex h-12 items-center justify-center rounded-sm bg-primary px-4 text-base font-medium text-primary-foreground"
          >
            Zum Scannen
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((call) => (
            <li key={call.id}>
              <article
                className={`grid gap-3 rounded-xl border border-border bg-card p-4 ${call.urgency === "sofort" && call.status === "open" ? "call-urgent" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{call.line}</h2>
                  <span
                    className={`rounded-sm px-2 py-1 text-xs font-medium ${
                      call.urgency === "sofort"
                        ? "bg-hot-bg text-hot"
                        : call.urgency === "heute"
                          ? "bg-warn-bg text-warn"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {urgencyLabel(call.urgency)}
                  </span>
                </div>
                <div>
                  <p className="font-mono text-base font-medium tracking-tight">{call.partNo}</p>
                  {call.partName ? <p className="text-sm text-muted-foreground">{call.partName}</p> : null}
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {call.qty} Stück
                  {call.stationCode ? ` · Platz ${call.stationCode}` : ""}
                  {" · "}
                  <time dateTime={new Date(call.createdAt).toISOString()}>
                    {now === null ? absoluteWhen(call.createdAt) : relativeWhen(call.createdAt, now)}
                  </time>
                </p>
                {call.note ? <p className="text-sm">{call.note}</p> : null}
                <div className="grid grid-cols-2 gap-2">
                  {call.status === "open" ? (
                    <Button
                      variant="muted"
                      disabled={busy !== null}
                      onClick={() => void change(call, "underway")}
                    >
                      Unterwegs
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void change(call, "open")}
                    >
                      Wieder offen
                    </Button>
                  )}
                  {call.status !== "done" ? (
                    <Button disabled={busy !== null} onClick={() => void change(call, "done")}>
                      Erledigt
                    </Button>
                  ) : (
                    <Button variant="muted" disabled>
                      {statusLabel("done")}
                    </Button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LineChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
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
