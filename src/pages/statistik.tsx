import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Chip, ErrorText } from "@/components/ui";
import { api, ApiError, type Stats } from "@/lib/api";
import { Offline, PinGate, useTafelState } from "@/pages/tafel";

const RANGES: ReadonlyArray<readonly [1 | 7 | 30, string]> = [
  [1, "Heute"],
  [7, "7 Tage"],
  [30, "30 Tage"],
];

export function StatistikPage() {
  const { state, error, refresh, lock } = useTafelState();
  if (error && state === null) return <Offline message={error} onRetry={refresh} />;
  if (state === null) return <p className="pt-10 text-center text-muted">Lädt…</p>;
  if (state !== "ok") return <PinGate setup={state === "setup"} onDone={refresh} />;
  return <Board onLocked={lock} />;
}

/** "9 Min", "1 Std 20 Min" – für Dauern, nicht für Uhrzeiten. */
function duration(ms: number | null): string {
  if (ms === null) return "–";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} Min`;
  const hr = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hr} Std ${rest} Min` : `${hr} Std`;
}

function Board({ onLocked }: { onLocked: () => void }) {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .stats(days)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) onLocked();
        else if (!cancelled) setError(err instanceof Error ? err.message : "Nicht geladen.");
      });
    return () => {
      cancelled = true;
    };
  }, [days, onLocked]);

  const closed = stats ? stats.confirmedByRequester + stats.closedByLager : 0;
  const received = closed;
  const maxLine = Math.max(1, ...(stats?.lines.map((l) => l.count) ?? [1]));

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <Link
          to="/tafel"
          aria-label="Zurück zur Tafel"
          className="press grid size-12 place-items-center rounded-2xl border border-line bg-surface"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Statistik</h1>
      </div>

      <div className="flex gap-2">
        {RANGES.map(([value, label]) => (
          <Chip key={value} active={days === value} onClick={() => setDays(value)}>
            {label}
          </Chip>
        ))}
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}

      {!stats ? (
        <p className="py-8 text-center text-muted">Lädt…</p>
      ) : stats.total === 0 ? (
        <p className="card p-8 text-center text-muted">Keine Rufe in diesem Zeitraum.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile value={String(stats.total)} label={stats.total === 1 ? "Ruf" : "Rufe"} />
            <Tile value={String(stats.urgent)} label="davon dringend" hot={stats.urgent > 0} />
            <Tile value={duration(stats.toSentMedianMs)} label="bis gesendet (meist)" />
            <Tile value={duration(stats.toReceivedMedianMs)} label="bis erhalten (meist)" />
          </div>
          <p className="-mt-2 text-sm text-muted">
            „Meist“ = die Hälfte der Rufe war schneller.
            {received >= 10 ? ` 9 von 10 waren nach ${duration(stats.toReceivedP90Ms)} da.` : ""}
            {closed > 0
              ? ` Erhalt bestätigt: ${stats.confirmedByRequester} vom Anforderer, ${stats.closedByLager} vom Lager geschlossen.`
              : ""}
            {stats.open > 0 ? ` ${stats.open} noch nicht erhalten.` : ""}
          </p>

          <section className="card min-w-0 p-4">
            <h2 className="text-xs font-semibold tracking-wider text-subtle uppercase">Abteilung / Linie</h2>
            <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3">
              {stats.lines.map((line) => (
                <li key={line.line} className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">{line.line}</span>
                    <span className="min-w-0 max-w-[55%] truncate text-muted tabular-nums">
                      {line.count} {line.count === 1 ? "Ruf" : "Rufe"}{line.urgent ? ` · ${line.urgent} dringend` : ""}
                      {line.toReceivedMedianMs !== null ? ` · meist ${duration(line.toReceivedMedianMs)}` : ""}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand-fill" style={{ width: `${(line.count / maxLine) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card min-w-0 p-4">
            <h2 className="text-xs font-semibold tracking-wider text-subtle uppercase">Am häufigsten gefehlt</h2>
            <ol className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
              {stats.parts.map((part, i) => (
                <li key={part.partNo} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 text-subtle tabular-nums">{i + 1}.</span>
                    <span className="truncate font-mono font-semibold">{part.partNo}</span>
                  </span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {part.count}× · {part.qty} Stk
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ value, label, hot }: { value: string; label: string; hot?: boolean }) {
  return (
    <div className="card px-3 py-3">
      <p className={`truncate text-xl font-bold tracking-tight tabular-nums ${hot ? "text-hot" : "text-text"}`}>
        {value}
      </p>
      <p className="text-xs leading-tight font-medium text-muted">{label}</p>
    </div>
  );
}
