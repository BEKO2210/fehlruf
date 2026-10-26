import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { remember } from "@/lib/format";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type DetectorCtor = {
  new (opts?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

// Whatever is printed on parts, boxes and labels: EAN, Code 128/39, QR, Data Matrix.
const FORMATS = [
  "qr_code",
  "data_matrix",
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "codabar",
  "pdf417",
];

const CAMERA_OK = "fehlruf-kamera";

// Klartext für den Arbeiter: was ist los und was tun.
function cameraMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    // Installierte App: keine Adresszeile, also in die Handy-Einstellungen.
    const standalone =
      typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) {
      return "Kamera nicht erlaubt. In den Handy-Einstellungen bei Fehlruf die Kamera erlauben. Oder Nummer unten eintippen.";
    }
    // Browser: Chrome auf Android zeigt kein Schloss mehr, Safari auf dem iPhone hatte nie eins.
    // iPad-Safari nennt sich "Macintosh", hat aber Touch.
    const ua = navigator.userAgent;
    const iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return iphone
      ? "Kamera nicht erlaubt. Auf dem iPhone: Einstellungen → Safari → Kamera → Erlauben. Oder Nummer unten eintippen."
      : "Kamera nicht erlaubt. Oben links neben der Adresse auf das Symbol tippen und Kamera erlauben. Oder Nummer unten eintippen.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Keine Kamera gefunden. Nummer unten eintippen.";
  }
  if (name === "NotReadableError") {
    return "Kamera ist von einer anderen App belegt. Andere App schließen und nochmal starten. Oder Nummer unten eintippen.";
  }
  return "Kamera geht nicht. Nummer unten eintippen.";
}

// Nach so vielen Sekunden ohne Treffer bekommt der Arbeiter einen Tipp.
const IDLE_MS = 8000;
const IDLE_HINT = "Nichts erkannt. Näher ran, oder Nummer unten eintippen.";

// onCode gibt false zurück, wenn der Code nichts taugt; dann wird weitergescannt.
// Ein String statt false wird dem Arbeiter als Hinweis gezeigt (z. B. falscher Zettel).
export function Scanner({ onCode }: { onCode: (raw: string) => boolean | string | void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kein Fehler des Arbeiters, darum getrennt vom roten Kamera-Fehler.
  const [hint, setHint] = useState<string | null>(null);

  // Once the camera worked on this phone, open it straight away next time.
  useEffect(() => {
    if (remember.get(CAMERA_OK) === "1") setArmed(true);
  }, []);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!armed) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let taken = false;
    let timer = 0;
    let hintTimer = 0;
    let idleTimer = 0;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;

    // Hinweis zu einem falschen Code nur kurz zeigen, damit er nicht neben einem Formular-Fehler stehen bleibt.
    const showHint = (text: string, sticky = false) => {
      setHint(text);
      window.clearTimeout(hintTimer);
      if (!sticky) hintTimer = window.setTimeout(() => setHint(null), 4000);
    };

    // Läuft die Kamera eine Weile ohne Treffer (verschmierter Code), sagen wir, was hilft.
    // Der Tipp bleibt stehen, bis etwas erkannt wird.
    const watchIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (!stopped && !taken) showHint(IDLE_HINT, true);
      }, IDLE_MS);
    };

    const deliver = (raw: string): boolean => {
      if (stopped || taken) return false;
      const verdict = onCodeRef.current(raw);
      if (verdict === false || typeof verdict === "string") {
        showHint(typeof verdict === "string" ? verdict : IDLE_HINT);
        watchIdle();
        return false;
      }
      taken = true;
      window.clearTimeout(hintTimer);
      window.clearTimeout(idleTimer);
      setHint(null);
      if (typeof navigator.vibrate === "function") navigator.vibrate(60);
      return true;
    };

    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    async function run() {
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

        if (Ctor) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" } },
          });
          if (stopped) {
            stopStream();
            return;
          }
          video!.srcObject = stream;
          await video!.play();
          remember.set(CAMERA_OK, "1");
          watchIdle();
          const supported = (await Ctor.getSupportedFormats?.()) ?? FORMATS;
          const formats = FORMATS.filter((f) => supported.includes(f));
          const detector = new Ctor({ formats: formats.length ? formats : ["qr_code"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const hits = await detector.detect(video!);
              const raw = hits.find((hit) => hit.rawValue)?.rawValue;
              if (raw && deliver(raw)) return;
            } catch {
              // frame not ready yet
            }
            timer = window.setTimeout(() => void tick(), 200);
          };
          void tick();
          return;
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video!,
          (result) => {
            if (result) deliver(result.getText());
          },
        );
        remember.set(CAMERA_OK, "1");
        watchIdle();
      } catch (err) {
        remember.set(CAMERA_OK, "0");
        if (!stopped) {
          setArmed(false);
          setError(cameraMessage(err));
        }
      }
    }

    void run();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(hintTimer);
      window.clearTimeout(idleTimer);
      setHint(null);
      controls?.stop();
      stopStream();
      if (video) video.srcObject = null;
    };
  }, [armed]);

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-black ring-1 ring-white/10">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {/* Sucher: vier Ecken und eine laufende Linie */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2">
          <span className="absolute top-0 left-0 size-7 rounded-tl-xl border-t-4 border-l-4 border-white/90" />
          <span className="absolute top-0 right-0 size-7 rounded-tr-xl border-t-4 border-r-4 border-white/90" />
          <span className="absolute bottom-0 left-0 size-7 rounded-bl-xl border-b-4 border-l-4 border-white/90" />
          <span className="absolute right-0 bottom-0 size-7 rounded-br-xl border-r-4 border-b-4 border-white/90" />
          {armed ? (
            <span className="scanline absolute inset-x-3 top-1/2 h-0.5 rounded-full bg-brand-fill shadow-[0_0_12px_2px_var(--brand)]" />
          ) : null}
        </div>
        {!armed ? (
          <div className="absolute inset-0 grid place-items-center bg-black/55 p-5">
            <button
              type="button"
              className="press inline-flex h-14 items-center gap-2 rounded-2xl bg-brand-fill px-7 text-base font-semibold text-brand-ink shadow-[0_8px_24px_rgb(0_0_0/0.4)]"
              onClick={() => {
                setError(null);
                setArmed(true);
              }}
            >
              <Camera className="size-5" aria-hidden="true" />
              Kamera starten
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-2xl bg-hot-soft px-4 py-3 text-sm font-medium text-hot">
          {error}
        </p>
      ) : hint ? (
        <p role="status" className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
