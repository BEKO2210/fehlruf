import type { CallStatus, Urgency } from "@/lib/fehlruf";

const URGENCY_LABEL: Record<Urgency, string> = {
  sofort: "Sofort",
  heute: "Heute",
  normal: "Normal",
};

const STATUS_LABEL: Record<CallStatus, string> = {
  open: "Offen",
  underway: "Unterwegs",
  done: "Erledigt",
};

export function urgencyLabel(value: Urgency): string {
  return URGENCY_LABEL[value];
}

export function statusLabel(value: CallStatus): string {
  return STATUS_LABEL[value];
}

export function absoluteWhen(ms: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(ms);
}

export function relativeWhen(ms: number, now = Date.now()): string {
  const min = Math.floor(Math.max(0, now - ms) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const hr = Math.floor(min / 60);
  if (hr < 18) return `vor ${hr} Std`;
  return absoluteWhen(ms);
}

export function parseScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let code = text;
  try {
    const url = new URL(text);
    const match = url.pathname.match(/\/ruf\/([^/]+)/i);
    if (match?.[1]) code = decodeURIComponent(match[1]);
  } catch {
    // plain code, not a URL
  }
  code = code.toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{2,16}$/.test(code) || code === "NEU") return null;
  return code;
}

export function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLocaleLowerCase("de");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line.trim());
  }
  out.sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  return out;
}

let audio: AudioContext | null = null;

export function armBeep(): void {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audio = audio ?? new Ctx();
  if (audio.state === "suspended") void audio.resume();
}

export function beep(): void {
  if (!audio || audio.state !== "running") return;
  const t = audio.currentTime;
  const tone = (freq: number, start: number) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain);
    gain.connect(audio!.destination);
    osc.start(start);
    osc.stop(start + 0.17);
  };
  tone(740, t);
  tone(988, t + 0.14);
}
