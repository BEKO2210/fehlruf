import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback, useState } from "react";
import { Scanner } from "@/components/scanner";
import { ErrorText, PageTitle } from "@/components/ui";
import { parseScan } from "@/lib/format";

export function MeldenPage() {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    (raw: string) => {
      const hit = parseScan(raw);
      if (!hit) {
        setError("Nichts erkannt. Nummer vom Teil eintippen.");
        return;
      }
      if (hit.kind === "station") {
        void navigate({ to: "/ruf/$code", params: { code: hit.code } });
        return;
      }
      void navigate({ to: "/ruf/$code", params: { code: "neu" }, search: { teil: hit.partNo } });
    },
    [navigate],
  );

  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <PageTitle title="Was fehlt?" sub="Halte die Kamera auf den Barcode am Teil." />
      <Scanner onCode={open} />

      <div className="flex items-center gap-3 text-xs font-semibold tracking-wider text-subtle uppercase">
        <span className="h-px flex-1 bg-line" />
        oder Nummer eintippen
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          open(typed);
        }}
      >
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            placeholder="z. B. 6204-2RSR"
            aria-label="Teilenummer"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 font-mono text-base outline-none placeholder:font-sans placeholder:text-subtle focus:border-brand"
          />
          <button
            type="submit"
            disabled={!typed.trim()}
            aria-label="Weiter"
            className="press grid size-14 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink disabled:opacity-40"
          >
            <ArrowRight className="size-6" aria-hidden="true" />
          </button>
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </form>
    </div>
  );
}
