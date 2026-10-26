import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Scanner } from "@/components/scanner";
import { Button, PageTitle } from "@/components/ui";
import { parseScan } from "@/lib/format";

export function MeldenPage() {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");

  // Liefert true, wenn der Code brauchbar war; der Scanner scannt sonst weiter.
  const open = useCallback(
    (raw: string): boolean => {
      const hit = parseScan(raw);
      if (!hit) return false;
      if (hit.kind === "station") {
        void navigate({ to: "/ruf/$code", params: { code: hit.code } });
        return true;
      }
      void navigate({ to: "/ruf/$code", params: { code: "neu" }, search: { teil: hit.partNo } });
      return true;
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
            onChange={(event) => setTyped(event.target.value)}
            placeholder="z. B. 6204-2RSR"
            aria-label="Teilenummer"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            size={1}
            className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 font-mono text-base placeholder:font-sans placeholder:text-subtle focus:border-brand"
          />
          <Button type="submit" variant="muted" disabled={!typed.trim()} className="!h-14 shrink-0 disabled:border disabled:border-line">
            Weiter
          </Button>
        </div>
      </form>
    </div>
  );
}
