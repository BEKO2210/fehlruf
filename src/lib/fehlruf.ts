import { createServerFn } from "@tanstack/react-start";

export type CallStatus = "open" | "underway" | "done";
export type Urgency = "sofort" | "heute" | "normal";

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
  createdAt: number;
  updatedAt: number;
};

export type StationRow = {
  code: string;
  name: string;
  line: string;
};

const STATUSES = new Set<CallStatus>(["open", "underway", "done"]);
const URGENCIES = new Set<Urgency>(["sofort", "heute", "normal"]);
const CODE_RE = /^[A-Z0-9-]{2,16}$/;
const NAME_RE = /^[\p{L} .'-]*$/u;

// Per-instance flood guard for the open call endpoint. Serverless instances do
// not share it, so the global open-call cap below is the hard limit.
const CALLS_PER_MINUTE = 12;
const MAX_OPEN_CALLS = 1000;
const recentCalls = new Map<string, number[]>();

function allowCall(ip: string): boolean {
  const now = Date.now();
  const hits = (recentCalls.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= CALLS_PER_MINUTE) return false;
  hits.push(now);
  recentCalls.set(ip, hits);
  if (recentCalls.size > 5000) recentCalls.clear();
  return true;
}

async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function admin() {
  return import("@/lib/admin.server");
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Scanners send GS1 group separators and other control bytes; drop them.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().replace(/\s+/g, " ").slice(0, max);
}

function requiredText(value: unknown, max: number, label: string): string {
  const out = text(value, max);
  if (!out) throw new Error(`${label} fehlt`);
  if (out.includes("@")) throw new Error(`${label} ohne E-Mail`);
  return out;
}

function newId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function mapCall(row: Record<string, unknown>): CallRow {
  const urgency = String(row.urgency);
  const status = String(row.status);
  return {
    id: String(row.id),
    stationCode: String(row.stationCode ?? ""),
    line: String(row.line ?? ""),
    partNo: String(row.partNo ?? ""),
    partName: String(row.partName ?? ""),
    qty: asNumber(row.qty) || 1,
    urgency: URGENCIES.has(urgency as Urgency) ? (urgency as Urgency) : "normal",
    note: String(row.note ?? ""),
    requester: String(row.requester ?? ""),
    status: STATUSES.has(status as CallStatus) ? (status as CallStatus) : "open",
    createdAt: asNumber(row.createdAt),
    updatedAt: asNumber(row.updatedAt),
  };
}

const CALL_SELECT = `
  select
    id,
    station_code as "stationCode",
    line,
    part_no as "partNo",
    part_name as "partName",
    qty,
    urgency,
    note,
    requester,
    status,
    (round(extract(epoch from created_at) * 1000))::bigint as "createdAt",
    (round(extract(epoch from updated_at) * 1000))::bigint as "updatedAt"
  from calls
`;

function pinInput(input: unknown): { pin: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  return { pin: typeof body.pin === "string" ? body.pin.trim() : "" };
}

export const tafelState = createServerFn({ method: "GET" }).handler(async () => {
  return (await admin()).adminState();
});

export const tafelSetup = createServerFn({ method: "POST" })
  .validator(pinInput)
  .handler(async ({ data }) => {
    await (await admin()).setupPin(data.pin);
    return { ok: true };
  });

export const tafelLogin = createServerFn({ method: "POST" })
  .validator(pinInput)
  .handler(async ({ data }) => {
    await (await admin()).login(data.pin);
    return { ok: true };
  });

export const tafelChangePin = createServerFn({ method: "POST" })
  .validator(pinInput)
  .handler(async ({ data }) => {
    await (await admin()).changePin(data.pin);
    return { ok: true };
  });

export const tafelLogout = createServerFn({ method: "POST" }).handler(async () => {
  (await admin()).logout();
  return { ok: true };
});

export const listCalls = createServerFn({ method: "GET" }).handler(async () => {
  await (await admin()).requireAdmin();
  const sql = await db();
  // Aufbewahrung: Namen nach 30 Tagen leeren, Erledigtes nach 90 Tagen löschen.
  await sql`update calls set requester = '' where requester <> '' and created_at < now() - interval '30 days'`;
  await sql`delete from calls where status = 'done' and updated_at < now() - interval '90 days'`;
  const rows = await sql.query<Record<string, unknown>>(
    `${CALL_SELECT} where status <> 'done' or updated_at > now() - interval '2 days'
     order by created_at desc limit 300`,
  );
  return rows.map(mapCall);
});

function mapStation(row: Record<string, unknown>): StationRow {
  return {
    code: String(row.code),
    name: String(row.name),
    line: String(row.line),
  };
}

export const listStations = createServerFn({ method: "GET" }).handler(async () => {
  await (await admin()).requireAdmin();
  const sql = await db();
  const rows = await sql<Record<string, unknown>>`
    select code, name, line
    from stations
    order by line, code
  `;
  return rows.map(mapStation);
});

/** Public: what the call form needs. Departments only, no calls, no names. */
export const getCallForm = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    return { code: text(body.code, 16).toUpperCase() };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    const station =
      data.code && data.code !== "NEU" && CODE_RE.test(data.code)
        ? ((await sql<Record<string, unknown>>`select code, name, line from stations where code = ${data.code}`)[0] ??
          null)
        : null;
    const rows = await sql<{ line: string }>`
      select line from stations
      union
      select line from calls where created_at > now() - interval '60 days'
      limit 60
    `;
    return {
      station: station ? mapStation(station) : null,
      departments: rows.map((row) => String(row.line)),
    };
  });

export const createCall = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const line = requiredText(body.line, 48, "Abteilung");
    const partNo = requiredText(body.partNo, 64, "Teilenummer");
    const partName = text(body.partName, 80);
    const note = text(body.note, 140);
    if (partName.includes("@") || note.includes("@")) {
      throw new Error("Hinweis ohne E-Mail");
    }
    const requester = text(body.requester, 40);
    if (!NAME_RE.test(requester)) throw new Error("Name nur mit Buchstaben");
    const qty = asNumber(body.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
      throw new Error("Menge zwischen 1 und 9999");
    }
    const urgency = String(body.urgency ?? "normal");
    if (!URGENCIES.has(urgency as Urgency)) throw new Error("Dringlichkeit ungültig");
    let stationCode = text(body.stationCode, 16).toUpperCase();
    if (stationCode === "NEU") stationCode = "";
    if (stationCode && !CODE_RE.test(stationCode)) stationCode = "";
    return {
      line,
      partNo,
      partName,
      note,
      requester,
      qty,
      urgency: urgency as Urgency,
      stationCode,
    };
  })
  .handler(async ({ data }) => {
    if (!allowCall((await admin()).clientIp())) {
      throw new Error("Zu viele Rufe hintereinander. Kurz warten.");
    }
    const sql = await db();
    const open = await sql<{ n: number }>`select count(*)::int as n from calls where status <> 'done'`;
    if ((open[0]?.n ?? 0) >= MAX_OPEN_CALLS) throw new Error("Tafel ist voll. Bitte im Lager melden.");
    const id = newId();
    await sql`
      insert into calls (id, station_code, line, part_no, part_name, qty, urgency, note, requester)
      values (
        ${id},
        ${data.stationCode},
        ${data.line},
        ${data.partNo},
        ${data.partName},
        ${data.qty},
        ${data.urgency},
        ${data.note},
        ${data.requester}
      )
    `;
    const created = await sql.query<Record<string, unknown>>(`${CALL_SELECT} where id = $1`, [id]);
    const row = created[0];
    if (!row) throw new Error("Ruf konnte nicht gespeichert werden");
    return mapCall(row);
  });

export const setCallStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const id = text(body.id, 12).toUpperCase();
    const status = String(body.status ?? "");
    if (!/^[A-Z0-9]{6}$/.test(id)) throw new Error("Ruf ungültig");
    if (!STATUSES.has(status as CallStatus)) throw new Error("Status ungültig");
    return { id, status: status as CallStatus };
  })
  .handler(async ({ data }) => {
    await (await admin()).requireAdmin();
    const sql = await db();
    const rows = await sql<{ id: string }>`
      update calls
      set status = ${data.status}, updated_at = now()
      where id = ${data.id}
      returning id
    `;
    if (!rows[0]) throw new Error("Ruf nicht gefunden");
    return { id: data.id, status: data.status };
  });

export const setCallUrgency = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const id = text(body.id, 12).toUpperCase();
    const urgency = String(body.urgency ?? "");
    if (!/^[A-Z0-9]{6}$/.test(id)) throw new Error("Ruf ungültig");
    if (!URGENCIES.has(urgency as Urgency)) throw new Error("Prio ungültig");
    return { id, urgency: urgency as Urgency };
  })
  .handler(async ({ data }) => {
    await (await admin()).requireAdmin();
    const sql = await db();
    const rows = await sql<{ id: string }>`
      update calls set urgency = ${data.urgency} where id = ${data.id} returning id
    `;
    if (!rows[0]) throw new Error("Ruf nicht gefunden");
    return data;
  });

export const saveStation = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const code = text(body.code, 16).toUpperCase();
    const name = requiredText(body.name, 48, "Platzname");
    const line = requiredText(body.line, 48, "Abteilung");
    if (!CODE_RE.test(code)) {
      throw new Error("Code: 2–16 Zeichen, nur A–Z, 0–9 und Bindestrich");
    }
    if (code === "NEU") throw new Error("NEU ist reserviert");
    return { code, name, line };
  })
  .handler(async ({ data }) => {
    await (await admin()).requireAdmin();
    const sql = await db();
    await sql`
      insert into stations (code, name, line)
      values (${data.code}, ${data.name}, ${data.line})
      on conflict (code) do update set name = excluded.name, line = excluded.line
    `;
    return data;
  });


export const deleteStation = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const code = text(body.code, 16).toUpperCase();
    if (!CODE_RE.test(code)) throw new Error("Code ungültig");
    return { code };
  })
  .handler(async ({ data }) => {
    await (await admin()).requireAdmin();
    const sql = await db();
    await sql`delete from stations where code = ${data.code}`;
    return data;
  });
