import type { CallStatus, Urgency } from "@/lib/api";

const URGENCY_LABEL: Record<Urgency, string> = {
  sofort: "Dringend",
  heute: "Heute",
  normal: "Normal",
};

export const URGENCY_RANK: Record<Urgency, number> = { sofort: 0, heute: 1, normal: 2 };

const STATUS_LABEL: Record<CallStatus, string> = {
  open: "Offen",
  underway: "Gesendet",
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

export type ScanResult = { kind: "station"; code: string } | { kind: "part"; partNo: string };

/** A scan is either an old Platz-QR (`…/ruf/CODE`) or the part's own barcode. */
export function parseScan(raw: string): ScanResult | null {
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    // Neue Zettel: …/#/ruf/CODE, alte Zettel: …/ruf/CODE
    const match = `${url.pathname}${url.hash}`.match(/\/ruf\/([^/?#]+)/i);
    if (match?.[1]) {
      const code = decodeURIComponent(match[1]).toUpperCase().replace(/\s+/g, "");
      if (/^[A-Z0-9-]{2,16}$/.test(code) && code !== "NEU") return { kind: "station", code };
    }
  } catch {
    // not a URL, so it is a part number
  }
  return { kind: "part", partNo: text.replace(/\s+/g, " ").slice(0, 64) };
}

/** Wie ernst ist die Antwort vom Lager? "Nicht auf Lager" muss beim Anforderer rot sein. */
export function replyTone(reply: string): "bad" | "warn" | "info" {
  const r = reply.toLocaleLowerCase("de");
  if (r.includes("nicht auf lager") || r.includes("nicht da") || r.includes("nicht lieferbar")) return "bad";
  if (r.includes("anrufen") || r.includes("dauert")) return "warn";
  return "info";
}

/** Minutes a call has been waiting, and how loud the board should be about it. */
export function waitTone(ms: number, now: number, urgency: Urgency = "normal"): "fresh" | "slow" | "late" {
  const min = (now - ms) / 60000;
  // Steht die Maschine, zählt jede Minute: gelb ab 5, rot ab 15.
  const [slow, late] = urgency === "sofort" ? [5, 15] : [30, 120];
  if (min >= late) return "late";
  if (min >= slow) return "slow";
  return "fresh";
}

export function waitLabel(ms: number, now: number): string {
  const min = Math.floor(Math.max(0, now - ms) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `${min} Min`;
  const hr = Math.floor(min / 60);
  const rest = min % 60;
  if (hr < 24) return rest ? `${hr} Std ${rest} Min` : `${hr} Std`;
  return `${Math.floor(hr / 24)} Tg`;
}

/** Kurzform für schmale Kacheln: "0 Min", "47 Min", "2 Std", "2 Tg". Ab einer Stunde nur volle
 * Stunden, die Minuten stehen auf der Karte. */
export function waitShort(ms: number, now: number): string {
  const min = Math.floor(Math.max(0, now - ms) / 60000);
  if (min < 60) return `${min} Min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} Std`;
  return `${Math.floor(hr / 24)} Tg`;
}

/** localStorage that never throws (private mode, blocked storage). */
export const remember = {
  get(key: string): string {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

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
