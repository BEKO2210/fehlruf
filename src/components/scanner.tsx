import { useEffect, useRef, useState } from "react";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

export function Scanner({ onCode }: { onCode: (raw: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onCodeRef.current(raw);
    };

    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    async function run() {
      try {
        const DetectorCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector;
          }
        ).BarcodeDetector;

        if (DetectorCtor) {
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
          const detector = new DetectorCtor({ formats: ["qr_code"] });
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
      } catch {
        if (!stopped) setError("Kamera blockiert oder nicht da. Code unten eintippen.");
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
              className="press h-12 rounded-sm bg-primary px-5 text-base font-medium text-primary-foreground"
              onClick={() => {
                setError(null);
                setArmed(true);
              }}
            >
              Kamera öffnen
            </button>
          </div>
        ) : null}
        <span className="pointer-events-none absolute inset-6 rounded-lg border border-foreground/30" />
      </div>
      {error ? <p className="text-sm text-hot">{error}</p> : null}
    </div>
  );
}
