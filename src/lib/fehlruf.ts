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
  status: CallStatus;
  createdAt: number;
};

export type StationRow = {
  code: string;
  name: string;
  line: string;
};

const STATUSES = new Set<CallStatus>(["open", "underway", "done"]);
const URGENCIES = new Set<Urgency>(["sofort", "heute", "normal"]);
const CODE_RE = /^[A-Z0-9-]{2,16}$/;

async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
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
  return value.trim().replace(/\s+/g, " ").slice(0, max);
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
    status: STATUSES.has(status as CallStatus) ? (status as CallStatus) : "open",
    createdAt: asNumber(row.createdAt),
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
    status,
    (round(extract(epoch from created_at) * 1000))::bigint as "createdAt"
  from calls
`;

export const listCalls = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `${CALL_SELECT} order by created_at desc limit 200`,
  );
  return rows.map(mapCall);
});

export const listStations = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql<Record<string, unknown>>`
    select code, name, line
    from stations
    order by line, code
  `;
  return rows.map(
    (row): StationRow => ({
      code: String(row.code),
      name: String(row.name),
      line: String(row.line),
    }),
  );
});

export const createCall = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const line = requiredText(body.line, 48, "Linie");
    const partNo = requiredText(body.partNo, 64, "Teilenummer");
    const partName = text(body.partName, 80);
    const note = text(body.note, 140);
    if (partName.includes("@") || note.includes("@")) {
      throw new Error("Hinweis ohne E-Mail oder Namen");
    }
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
      qty,
      urgency: urgency as Urgency,
      stationCode,
    };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    const id = newId();
    await sql`
      insert into calls (id, station_code, line, part_no, part_name, qty, urgency, note)
      values (
        ${id},
        ${data.stationCode},
        ${data.line},
        ${data.partNo},
        ${data.partName},
        ${data.qty},
        ${data.urgency},
        ${data.note}
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

export const saveStation = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const code = text(body.code, 16).toUpperCase();
    const name = requiredText(body.name, 48, "Platzname");
    const line = requiredText(body.line, 48, "Linie");
    if (!CODE_RE.test(code)) {
      throw new Error("Code: 2–16 Zeichen, nur A–Z, 0–9 und Bindestrich");
    }
    if (code === "NEU") throw new Error("NEU ist reserviert");
    return { code, name, line };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    await sql`
      insert into stations (code, name, line)
      values (${data.code}, ${data.name}, ${data.line})
      on conflict (code) do update set name = excluded.name, line = excluded.line
    `;
    return data;
  });

