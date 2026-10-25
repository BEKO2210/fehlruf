import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Scanner } from "@/components/scanner";
import { Button, TextInput } from "@/components/ui";
import { parseScan } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Teil melden · Fehlruf" }] }),
  component: ScanPage,
});

function ScanPage() {
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
    <div className="mx-auto grid w-full max-w-lg gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Was fehlt?</h1>
        <p className="mt-1 text-base text-muted-foreground">Barcode vom Teil scannen.</p>
      </div>
      <Scanner onCode={open} />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          open(typed);
        }}
      >
        <label className="grid gap-2">
          <span className="text-sm font-medium">Kein Barcode? Nummer eintippen</span>
          <TextInput
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            placeholder="6204-2RSR"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            className="font-mono"
          />
        </label>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <Button type="submit" full variant="muted" disabled={!typed.trim()}>
          Weiter
        </Button>
      </form>
    </div>
  );
}
