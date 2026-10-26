import { Printer } from "lucide-react";
import { useQrSvg } from "@/lib/qr";
import { Button, PageTitle } from "@/components/ui";
import { Offline, PinGate, useTafelState } from "@/pages/tafel";

/** Feste Adresse der App: der Aushang hängt lange, die Adresse bleibt. */
const APP_URL = "https://beko2210.github.io/fehlruf/";

const STEPS = [
  ["App öffnen", "QR-Code unten mit der Handy-Kamera scannen."],
  ["Teil scannen", "Barcode vom Teil scannen, Linie eintippen, senden."],
  ["Erhalten tippen", "Wenn das Teil da ist: „Erhalten“ tippen."],
] as const;

export function PlakatPage() {
  const { state, error, refresh } = useTafelState();
  if (error && state === null) return <Offline message={error} onRetry={refresh} />;
  if (state === null) return <p className="pt-10 text-center text-muted">Lädt…</p>;
  if (state !== "ok") return <PinGate setup={state === "setup"} onDone={refresh} />;
  return <Plakat />;
}

function Plakat() {
  const svg = useQrSvg(APP_URL, 480);

  return (
    <div className="grid gap-5">
      <div className="no-print grid gap-4">
        <PageTitle title="Aushang für die Halle" sub="Ein A4-Blatt neben die Maschine oder ans Schwarze Brett." />
        <Button full onClick={() => window.print()}>
          <Printer className="size-5" aria-hidden="true" />
          Drucken
        </Button>
      </div>

      {/* Immer schwarz auf weiß: auf dem Bildschirm eine Vorschau des Blatts, im Druck das Blatt selbst. */}
      <section
        className="plakat mx-auto grid w-full max-w-[210mm] gap-8 rounded-2xl border border-line bg-white px-7 py-9 text-black print:max-w-none print:gap-10 print:rounded-none print:border-0 print:px-0 print:py-0"
        aria-label="Aushang"
      >
        <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-tight text-black sm:text-5xl print:text-[52px]">
          Teil fehlt?
          <br />
          So geht's
        </h1>

        <ol className="grid gap-6">
          {STEPS.map(([title, text], index) => (
            <li key={title} className="flex items-start gap-5">
              {/* Kontur statt Füllung: Rahmen und Schrift druckt Chrome auch ohne „Hintergrundgrafiken“. */}
              <span
                className="grid size-16 shrink-0 place-items-center rounded-full border-4 border-black text-[34px] leading-none font-extrabold text-black tabular-nums print:size-20 print:text-[44px]"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="pt-1">
                <p className="text-2xl leading-tight font-bold text-black print:text-[34px]">{title}</p>
                <p className="mt-1 text-lg leading-snug text-neutral-700 print:text-2xl">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="grid justify-items-center gap-3 border-t-2 border-black pt-7">
          <div
            className="w-full max-w-[64mm] [&_svg]:h-auto [&_svg]:w-full print:max-w-[80mm]"
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
            role="img"
            aria-label="QR-Code zur App"
          />
          <p className="text-center font-mono text-base font-semibold text-black print:text-lg">beko2210.github.io/fehlruf</p>
          <p className="text-center text-lg leading-snug text-neutral-700 print:text-xl">
            Tipp: Im Browser „Zum Startbildschirm hinzufügen“, dann ist die App wie jede andere auf dem Handy.
          </p>
        </div>
      </section>
    </div>
  );
}
