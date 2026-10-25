import { useEffect, useRef, useState } from "react";
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

export function Scanner({ onCode }: { onCode: (raw: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;

    const deliver = (raw: string) => {
      if (stopped || taken) return;
      taken = true;
      if (typeof navigator.vibrate === "function") navigator.vibrate(60);
      onCodeRef.current(raw);
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
          const supported = (await Ctor.getSupportedFormats?.()) ?? FORMATS;
          const formats = FORMATS.filter((f) => supported.includes(f));
          const detector = new Ctor({ formats: formats.length ? formats : ["qr_code"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const hits = await detector.detect(video!);
              const raw = hits.find((hit) => hit.rawValue)?.rawValue;
              if (raw) {
                deliver(raw);
                return;
              }
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
      } catch {
        remember.set(CAMERA_OK, "0");
        if (!stopped) {
          setArmed(false);
          setError("Kamera geht nicht. Nummer unten eintippen.");
        }
      }
    }

    void run();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controls?.stop();
      stopStream();
      if (video) video.srcObject = null;
    };
  }, [armed]);

  return (
    <div className="grid gap-3">
      <div className="finder relative overflow-hidden rounded-xl border border-border bg-card">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {!armed ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <button
              type="button"
              className="press h-14 rounded-sm bg-primary px-6 text-lg font-medium text-primary-foreground"
              onClick={() => {
                setError(null);
                setArmed(true);
              }}
            >
              Kamera an
            </button>
          </div>
        ) : null}
        <span className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-foreground/40" />
      </div>
      {error ? <p className="text-sm text-hot">{error}</p> : null}
    </div>
  );
}
