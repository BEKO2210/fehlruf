// Spricht mit der Fehlruf-API auf dem Heimserver (api/server.mjs).
import { remember } from "@/lib/format";

export type CallStatus = "open" | "underway" | "done";
export type Urgency = "sofort" | "heute" | "normal";
export type TafelState = "setup" | "locked" | "ok";

export type CallRow = {
  id: string;
  stationCode: string;
  line: string;
  partNo: string;
  partName: string;
  qty: number;
  urgency: Urgency;
  note: string;
  requester: string;
  status: CallStatus;
  orderNo: string;
  reply: string;
  replyAt: number | null;
  seenAt: number | null;
  sentAt: number | null;
  receivedAt: number | null;
  receivedBy: "" | "requester" | "lager";
  createdAt: number;
  updatedAt: number;
};

export type CallPatch = Partial<Pick<CallRow, "status" | "urgency" | "reply">>;

export type Stats = {
  days: number;
  from: number;
  total: number;
  urgent: number;
  open: number;
  toSentMedianMs: number | null;
  toReceivedMedianMs: number | null;
  toReceivedP90Ms: number | null;
  confirmedByRequester: number;
  closedByLager: number;
  parts: { partNo: string; count: number; qty: number }[];
  lines: { line: string; count: number; urgent: number; toReceivedMedianMs: number | null }[];
};

export type StationRow = { code: string; name: string; line: string };

export type NewCall = {
  line: string;
  partNo: string;
  qty: number;
  urgency: Urgency;
  note: string;
  requester: string;
  stationCode: string;
  orderNo: string;
};

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const TOKEN = "fehlruf-token";
const DEVICE = "fehlruf-geraet";

export const hasDevice = () => remember.get(DEVICE) !== "";

/** Zufälliger Schlüssel dieses Handys: Damit findet "Meine" die eigenen Rufe, ganz ohne Konto. */
export function deviceKey(): string {
  let key = remember.get(DEVICE);
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(key)) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    remember.set(DEVICE, key);
  }
  return key;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const token = {
  get: () => remember.get(TOKEN),
  set: (value: string) => remember.set(TOKEN, value),
  clear: () => remember.set(TOKEN, ""),
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const t = token.get();
  if (t) headers.authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError(0, "Keine Verbindung zum Server. Netz prüfen und nochmal.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") token.clear();
    throw new ApiError(res.status, data?.error ?? "Hat nicht geklappt. Nochmal versuchen.");
  }
  return data as T;
}

type Session = { token: string; expiresAt: number };

const keep = (s: Session) => {
  token.set(s.token);
  return s;
};

export const api = {
  form: (code: string) =>
    request<{ station: StationRow | null; departments: string[] }>(
      "GET",
      `/api/form?code=${encodeURIComponent(code)}`,
    ),
  createCall: (data: NewCall) => request<CallRow>("POST", "/api/calls", { ...data, device: deviceKey() }),
  mine: () => request<CallRow[]>("POST", "/api/mine", { device: deviceKey() }),
  received: (id: string) =>
    request<CallRow>("POST", `/api/calls/${encodeURIComponent(id)}/received`, { device: deviceKey() }),
  state: () => request<{ state: TafelState }>("GET", "/api/state").then((r) => r.state),
  setup: (pin: string) => request<Session>("POST", "/api/setup", { pin }).then(keep),
  login: (pin: string) => request<Session>("POST", "/api/login", { pin }).then(keep),
  changePin: (pin: string) => request<Session>("POST", "/api/pin", { pin }).then(keep),
  logout: () => token.clear(),
  /** seen: Tafel ist wirklich im Vordergrund, dann gelten offene Rufe als gesehen. */
  calls: (seen: boolean) => request<CallRow[]>("GET", `/api/calls${seen ? "?seen=1" : ""}`),
  updateCall: (id: string, patch: CallPatch) => request<CallRow>("PATCH", `/api/calls/${encodeURIComponent(id)}`, patch),
  stats: (days: 1 | 7 | 30) => request<Stats>("GET", `/api/stats?days=${days}`),
  stations: () => request<StationRow[]>("GET", "/api/stations"),
  saveStation: (s: StationRow) => request<StationRow>("POST", "/api/stations", s),
  deleteStation: (code: string) => request<{ code: string }>("DELETE", `/api/stations/${encodeURIComponent(code)}`),
};
