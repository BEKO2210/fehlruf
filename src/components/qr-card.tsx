import { useEffect, useState } from "react";
import type { StationRow } from "@/lib/api";

export function QrCard({ station }: { station: StationRow }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}${window.location.pathname}#/ruf/${station.code}`;
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
    <article className="card break-inside-avoid p-5 print:rounded-none print:border-neutral-300 print:bg-white print:text-black print:shadow-none">
      <p className="text-xs font-semibold tracking-wider text-brand uppercase">Fehlruf</p>
      <h2 className="mt-1 text-xl font-bold tracking-tight">{station.line}</h2>
      <p className="text-sm text-muted">
        {station.name} · <span className="font-mono">{station.code}</span>
      </p>
      <div
        className="mx-auto mt-4 w-48 rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        aria-label={`QR-Code für ${station.code}`}
      />
      <p className="mt-3 text-center text-sm text-muted">Handy-Kamera drauf, dann das Teil scannen.</p>
    </article>
  );
}
