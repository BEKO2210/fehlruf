// Fehlruf-API: läuft auf dem Heimserver hinter Cloudflare Tunnel.
// Keine Abhängigkeiten: node:http, node:sqlite, node:crypto.
//
// Melden ist offen (mit Limit). Tafel, Prio, Status und QR-Zettel brauchen
// ein Token, das es nur gegen die PIN gibt.
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const pbkdf2Async = promisify(pbkdf2);

const SESSION_DAYS = 30;
const PBKDF2_ROUNDS = 210_000;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_TOTAL = 50;
const FAIL_WINDOW_MS = 15 * 60_000;
const CALLS_PER_MINUTE = 12;
const MAX_OPEN_CALLS = 1000;
const MAX_BODY = 16 * 1024;

const STATUSES = new Set(["open", "underway", "done"]);
const URGENCIES = new Set(["sofort", "heute", "normal"]);
const CODE_RE = /^[A-Z0-9-]{2,16}$/;
const ID_RE = /^[A-Z0-9]{6}$/;
const NAME_RE = /^[\p{L} .'-]*$/u;

const SCHEMA = `
create table if not exists stations (
  code       text primary key,
  name       text not null,
  line       text not null,
  created_at integer not null
);
create table if not exists calls (
  id           text primary key,
  station_code text not null default '',
  line         text not null,
  part_no      text not null,
  part_name    text not null default '',
  qty          integer not null default 1,
  urgency      text not null default 'normal',
  note         text not null default '',
  requester    text not null default '',
  status       text not null default 'open',
  created_at   integer not null,
  updated_at   integer not null
);
create index if not exists calls_status_created_idx on calls (status, created_at);
create table if not exists settings (
  key   text primary key,
  value text not null
);
`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (message) => new HttpError(400, message);

function text(value, max) {
  if (typeof value !== "string") return "";
  // Scanner liefern GS1-Trennzeichen und andere Steuerbytes mit.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().replace(/\s+/g, " ").slice(0, max);
}

function requiredText(value, max, label) {
  const out = text(value, max);
  if (!out) throw bad(`${label} fehlt`);
  if (out.includes("@")) throw bad(`${label} ohne E-Mail`);
  return out;
}

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function newId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (const b of randomBytes(6)) out += alphabet[b % alphabet.length];
  return out;
}

function mapCall(row) {
  return {
    id: row.id,
    stationCode: row.station_code,
    line: row.line,
    partNo: row.part_no,
    partName: row.part_name,
    qty: row.qty,
    urgency: row.urgency,
    note: row.note,
    requester: row.requester,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createApp({
  dbPath = process.env.FEHLRUF_DB ?? "./data/fehlruf.db",
  allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "https://beko2210.github.io").split(","),
  envPin = process.env.FEHLRUF_PIN?.trim() || undefined,
  trustCloudflare = process.env.TRUST_CLOUDFLARE !== "0",
  now = () => Date.now(),
} = {}) {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
  db.exec(SCHEMA);

  const origins = new Set(allowedOrigins.map((o) => o.trim().replace(/\/$/, "")).filter(Boolean));
  const callHits = new Map();
  const pinFails = [];

  const getSetting = (key) => db.prepare("select value from settings where key = ?").get(key)?.value ?? null;
  const putSetting = (key, value) =>
    db.prepare("insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value").run(key, value);

  function secret() {
    let s = getSetting("session_secret");
    if (!s) {
      s = randomBytes(32).toString("hex");
      db.prepare("insert or ignore into settings (key, value) values ('session_secret', ?)").run(s);
      s = getSetting("session_secret");
    }
    return s;
  }

  const hmac = (message) => createHmac("sha256", secret()).update(message).digest("hex");
  const hashPin = async (pin, salt) => (await pbkdf2Async(pin, salt, PBKDF2_ROUNDS, 32, "sha256")).toString("hex");
  const pinConfigured = () => Boolean(envPin) || getSetting("pin_hash") !== null;

  async function pinMatches(pin) {
    if (envPin) return sameText(hmac(`pin.${pin}`), hmac(`pin.${envPin}`));
    const stored = getSetting("pin_hash");
    if (!stored) return false;
    const [salt, hash] = stored.split(":");
    return Boolean(salt && hash) && sameText(await hashPin(pin, salt), hash);
  }

  function issueToken() {
    const exp = now() + SESSION_DAYS * 86_400_000;
    return { token: `${exp}.${hmac(`tafel.${exp}`)}`, expiresAt: exp };
  }

  function validToken(header) {
    const token = /^Bearer (.+)$/.exec(header ?? "")?.[1];
    if (!token) return false;
    const [expRaw, sig] = token.split(".");
    const exp = Number(expRaw);
    return Boolean(sig) && Number.isFinite(exp) && exp > now() && sameText(sig, hmac(`tafel.${exp}`));
  }

  function checkPinFormat(pin) {
    if (!/^\d{6,12}$/.test(pin)) throw bad("PIN: 6 bis 12 Ziffern");
  }

  function clientIp(req) {
    const cf = req.headers["cf-connecting-ip"];
    if (trustCloudflare && typeof cf === "string" && cf) return cf;
    return req.socket.remoteAddress ?? "unbekannt";
  }

  function tooManyFails(ip) {
    const cutoff = now() - FAIL_WINDOW_MS;
    while (pinFails.length && pinFails[0].at < cutoff) pinFails.shift();
    const mine = pinFails.filter((f) => f.ip === ip).length;
    return mine >= MAX_FAILS_PER_IP || pinFails.length >= MAX_FAILS_TOTAL;
  }

  function allowCall(ip) {
    const t = now();
    const hits = (callHits.get(ip) ?? []).filter((h) => t - h < 60_000);
    if (hits.length >= CALLS_PER_MINUTE) return false;
    hits.push(t);
    callHits.set(ip, hits);
    if (callHits.size > 5000) callHits.clear();
    return true;
  }

  function cleanup() {
    const t = now();
    db.prepare("update calls set requester = '' where requester <> '' and created_at < ?").run(t - 30 * 86_400_000);
    db.prepare("delete from calls where status = 'done' and updated_at < ?").run(t - 90 * 86_400_000);
  }

  const routes = {
    "GET /api/health": () => ({ ok: true }),

    "GET /api/form": ({ url }) => {
      const code = text(url.searchParams.get("code"), 16).toUpperCase();
      const station =
        code && code !== "NEU" && CODE_RE.test(code)
          ? (db.prepare("select code, name, line from stations where code = ?").get(code) ?? null)
          : null;
      const lines = db
        .prepare("select line from stations union select line from calls where created_at > ? limit 60")
        .all(now() - 60 * 86_400_000)
        .map((r) => r.line);
      return { station: station ? { ...station } : null, departments: lines };
    },

    "POST /api/calls": ({ body, ip }) => {
      const line = requiredText(body.line, 48, "Abteilung / Linie");
      const partNo = requiredText(body.partNo, 64, "Teil");
      const note = text(body.note, 140);
      if (note.includes("@")) throw bad("Hinweis ohne E-Mail");
      const requester = text(body.requester, 40);
      if (!NAME_RE.test(requester)) throw bad("Name nur mit Buchstaben");
      const qty = Number(body.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 9999) throw bad("Menge zwischen 1 und 9999");
      const urgency = String(body.urgency ?? "normal");
      if (!URGENCIES.has(urgency)) throw bad("Dringlichkeit ungültig");
      let stationCode = text(body.stationCode, 16).toUpperCase();
      if (stationCode === "NEU" || !CODE_RE.test(stationCode)) stationCode = "";

      if (!allowCall(ip)) throw new HttpError(429, "Zu viele Meldungen hintereinander. Kurz warten.");
      const open = db.prepare("select count(*) as n from calls where status <> 'done'").get().n;
      if (open >= MAX_OPEN_CALLS) throw new HttpError(429, "Tafel ist voll. Bitte im Lager melden.");

      const id = newId();
      const t = now();
      db.prepare(
        `insert into calls (id, station_code, line, part_no, qty, urgency, note, requester, status, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      ).run(id, stationCode, line, partNo, qty, urgency, note, requester, t, t);
      return { status: 201, data: mapCall(db.prepare("select * from calls where id = ?").get(id)) };
    },

    "GET /api/state": ({ req }) => ({
      state: validToken(req.headers.authorization) ? "ok" : pinConfigured() ? "locked" : "setup",
    }),

    "POST /api/setup": async ({ body }) => {
      const pin = String(body.pin ?? "");
      checkPinFormat(pin);
      if (pinConfigured()) throw new HttpError(409, "PIN ist schon gesetzt");
      const salt = randomBytes(16).toString("hex");
      // Nur der erste gewinnt, auch wenn zwei gleichzeitig die leere Tafel öffnen.
      const res = db
        .prepare("insert or ignore into settings (key, value) values ('pin_hash', ?)")
        .run(`${salt}:${await hashPin(pin, salt)}`);
      if (res.changes === 0) throw new HttpError(409, "PIN ist schon gesetzt");
      return issueToken();
    },

    "POST /api/login": async ({ body, ip }) => {
      if (tooManyFails(ip)) throw new HttpError(429, "Zu viele Versuche. In 15 Minuten nochmal.");
      if (!(await pinMatches(String(body.pin ?? "")))) {
        pinFails.push({ ip, at: now() });
        await new Promise((resolve) => setTimeout(resolve, 600));
        throw new HttpError(401, "PIN falsch");
      }
      return issueToken();
    },

    "POST /api/pin": async ({ body }) => {
      const pin = String(body.pin ?? "");
      checkPinFormat(pin);
      if (envPin) throw bad("PIN kommt aus FEHLRUF_PIN. Dort ändern.");
      const salt = randomBytes(16).toString("hex");
      putSetting("pin_hash", `${salt}:${await hashPin(pin, salt)}`);
      // Neues Geheimnis: alle anderen Geräte sind abgemeldet.
      putSetting("session_secret", randomBytes(32).toString("hex"));
      return issueToken();
    },

    "GET /api/calls": () => {
      const rows = db
        .prepare("select * from calls where status <> 'done' or updated_at > ? order by created_at desc limit 300")
        .all(now() - 2 * 86_400_000);
      return rows.map(mapCall);
    },

    "PATCH /api/calls/:id": ({ params, body }) => {
      const id = params.id.toUpperCase();
      if (!ID_RE.test(id)) throw bad("Ruf ungültig");
      const row = db.prepare("select * from calls where id = ?").get(id);
      if (!row) throw new HttpError(404, "Ruf nicht gefunden");
      const status = body.status === undefined ? row.status : String(body.status);
      const urgency = body.urgency === undefined ? row.urgency : String(body.urgency);
      if (!STATUSES.has(status)) throw bad("Status ungültig");
      if (!URGENCIES.has(urgency)) throw bad("Prio ungültig");
      db.prepare("update calls set status = ?, urgency = ?, updated_at = ? where id = ?").run(status, urgency, now(), id);
      return mapCall(db.prepare("select * from calls where id = ?").get(id));
    },

    "GET /api/stations": () => db.prepare("select code, name, line from stations order by line, code").all(),

    "POST /api/stations": ({ body }) => {
      const code = text(body.code, 16).toUpperCase();
      const name = requiredText(body.name, 48, "Name");
      const line = requiredText(body.line, 48, "Abteilung / Linie");
      if (!CODE_RE.test(code)) throw bad("Code: 2–16 Zeichen, nur A–Z, 0–9 und Bindestrich");
      if (code === "NEU") throw bad("NEU ist reserviert");
      db.prepare(
        `insert into stations (code, name, line, created_at) values (?, ?, ?, ?)
         on conflict(code) do update set name = excluded.name, line = excluded.line`,
      ).run(code, name, line, now());
      return { code, name, line };
    },

    "DELETE /api/stations/:code": ({ params }) => {
      const code = params.code.toUpperCase();
      if (!CODE_RE.test(code)) throw bad("Code ungültig");
      db.prepare("delete from stations where code = ?").run(code);
      return { code };
    },
  };

  const PUBLIC = new Set([
    "GET /api/health",
    "GET /api/form",
    "POST /api/calls",
    "GET /api/state",
    "POST /api/setup",
    "POST /api/login",
  ]);

  function match(method, pathname) {
    for (const key of Object.keys(routes)) {
      const [m, pattern] = key.split(" ");
      if (m !== method) continue;
      const a = pattern.split("/");
      const b = pathname.split("/");
      if (a.length !== b.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
        else if (a[i] !== b[i]) ok = false;
      }
      if (ok) return { key, params };
    }
    return null;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new HttpError(413, "Zu groß"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (!chunks.length) return resolve({});
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(parsed && typeof parsed === "object" ? parsed : {});
        } catch {
          reject(bad("Ungültige Daten"));
        }
      });
      req.on("error", reject);
    });
  }

  async function handle(req, res) {
    const origin = req.headers.origin;
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      vary: "Origin",
    };
    const send = (status, payload) => {
      res.writeHead(status, headers);
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };

    if (origin) {
      // Fremde Seiten bekommen gar nichts, auch keine Fehlermeldung.
      if (!origins.has(origin)) return send(403, { error: "Herkunft nicht erlaubt" });
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "content-type, authorization";
      headers["access-control-allow-methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
      headers["access-control-max-age"] = "600";
    }
    if (req.method === "OPTIONS") return send(204);

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const hit = match(req.method ?? "GET", url.pathname);
      if (!hit) throw new HttpError(404, "Nicht gefunden");
      if (!PUBLIC.has(hit.key) && !validToken(req.headers.authorization)) {
        throw new HttpError(401, "PIN nötig");
      }
      const hasBody = req.method === "POST" || req.method === "PATCH";
      if (hasBody && !String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        throw new HttpError(415, "Nur JSON");
      }
      const body = hasBody ? await readBody(req) : {};
      const out = await routes[hit.key]({ req, url, body, params: hit.params, ip: clientIp(req) });
      if (out && typeof out === "object" && "status" in out && "data" in out) return send(out.status, out.data);
      return send(200, out);
    } catch (err) {
      if (err instanceof HttpError) return send(err.status, { error: err.message });
      console.error("[fehlruf]", err);
      return send(500, { error: "Serverfehler" });
    }
  }

  cleanup();
  const timer = setInterval(cleanup, 60 * 60_000);
  timer.unref();

  const server = http.createServer((req, res) => void handle(req, res));
  server.on("close", () => {
    clearInterval(timer);
    db.close();
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "0.0.0.0";
  createApp().listen(port, host, () => console.log(`[fehlruf] API auf ${host}:${port}`));
}
