import { useEffect, useState } from "react";
import type { StationRow } from "@/lib/fehlruf";

export function QrCard({ station }: { station: StationRow }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}/ruf/${station.code}`;
    void import("qrcode").then(async (mod) => {
      const api = typeof mod.toString === "function" ? mod : mod.default;
      const out = await api.toString(url, {
        type: "svg",
        margin: 1,
        width: 240,
        errorCorrectionLevel: "M",
        color: { dark: "#121417", light: "#ffffff" },
      });
      if (!cancelled) setSvg(out);
    });
    return () => {
      cancelled = true;
    };
  }, [station.code]);

  return (
    <article className="break-inside-avoid rounded-xl border border-border bg-card p-4 text-foreground print:border-neutral-300 print:bg-white print:text-black">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fehlruf</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{station.line}</h2>
      <p className="text-sm text-muted-foreground">
        {station.name} · {station.code}
      </p>
      <div
        className="mx-auto mt-4 w-48 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        aria-label={`QR-Code für ${station.code}`}
      />
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Handy-Kamera drauf, dann das Teil scannen.
      </p>
    </article>
  );
}
