import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Scanner } from "@/components/scanner";
import { Button, TextInput } from "@/components/ui";
import { parseScan } from "@/lib/format";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Scannen · Fehlruf" }] }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openCode = useCallback(
    (raw: string) => {
      const next = parseScan(raw);
      if (!next) {
        setError("Das ist kein Platz-Code. Steht auf dem Zettel sowas wie L2-02?");
        return;
      }
      void navigate({ to: "/ruf/$code", params: { code: next } });
    },
    [navigate],
  );

  return (
    <div className="mx-auto grid w-full max-w-lg gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platz scannen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          QR mit der Kamera lesen. Danach die Linie eintragen — ohne Linie geht der Ruf nicht raus.
        </p>
      </div>
      <Scanner onCode={openCode} />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          openCode(code);
        }}
      >
        <label className="grid gap-2">
          <span className="text-sm font-medium">Oder Code eintippen</span>
          <TextInput
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="L2-02"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
          />
        </label>
        {error ? <p className="text-sm text-hot">{error}</p> : null}
        <Button type="submit" full>
          Platz öffnen
        </Button>
      </form>
      <Button variant="ghost" full onClick={() => void navigate({ to: "/ruf/$code", params: { code: "neu" } })}>
        Ohne Code — Linie selbst schreiben
      </Button>
    </div>
  );
}
