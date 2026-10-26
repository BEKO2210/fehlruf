import type { StationRow } from "@/lib/api";
import { useQrSvg } from "@/lib/qr";

export function QrCard({ station }: { station: StationRow }) {
  const svg = useQrSvg(`${window.location.origin}${window.location.pathname}#/ruf/${station.code}`, 240);

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
