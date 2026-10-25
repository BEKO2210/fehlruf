// Tafel-PIN: Rufen bleibt offen, alles andere (Tafel lesen, Status, Prio,
// Plätze) braucht die PIN. Kein Konto, nur ein Cookie mit HMAC-Signatur.
//
// Die PIN liegt gehasht in `settings` (beim ersten Öffnen der Tafel gesetzt)
// oder kommt aus der Umgebung `FEHLRUF_PIN`, die dann Vorrang hat.
import { getCookie, getRequestHeader, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";

const COOKIE = "fehlruf_tafel";
const SESSION_DAYS = 30;
const PBKDF2_ROUNDS = 210_000;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_TOTAL = 50;
const FAIL_WINDOW_MIN = 15;

export type AdminState = "setup" | "locked" | "ok";

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ROUNDS },
    k,
    256,
  );
  return toHex(bits);
}

async function getSetting(key: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`select value from settings where key = ${key}`;
  return rows[0]?.value ?? null;
}

async function putSetting(key: string, value: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

/** Signing key for the session cookie. Rotates when the PIN changes. */
async function sessionSecret(): Promise<string> {
  const existing = await getSetting("session_secret");
  if (existing) return existing;
  const fresh = randomHex(32);
  const sql = await getSql();
  await sql`insert into settings (key, value) values ('session_secret', ${fresh}) on conflict (key) do nothing`;
  return (await getSetting("session_secret")) ?? fresh;
}

async function pinConfigured(): Promise<boolean> {
  if (env("FEHLRUF_PIN")) return true;
  return (await getSetting("pin_hash")) !== null;
}

async function pinMatches(pin: string): Promise<boolean> {
  const fromEnv = env("FEHLRUF_PIN");
  const secret = await sessionSecret();
  if (fromEnv) {
    // Compare HMACs so the comparison length never depends on the input.
    return sameText(await hmac(secret, pin), await hmac(secret, fromEnv));
  }
  const stored = await getSetting("pin_hash");
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return sameText(await hashPin(pin, salt), hash);
}

async function signSession(exp: number): Promise<string> {
  return `${exp}.${await hmac(await sessionSecret(), `tafel.${exp}`)}`;
}

async function validSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  return sameText(sig, await hmac(await sessionSecret(), `tafel.${exp}`));
}

async function issueSession(): Promise<void> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = Date.now() + maxAge * 1000;
  setCookie(COOKIE, await signSession(exp), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
  });
}

export function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || getRequestHeader("x-real-ip") || "unbekannt";
}

async function ipHash(): Promise<string> {
  return (await hmac(await sessionSecret(), `ip.${clientIp()}`)).slice(0, 24);
}

async function tooManyFailures(): Promise<boolean> {
  const sql = await getSql();
  const ip = await ipHash();
  const rows = await sql<{ mine: number; total: number }>`
    select
      count(*) filter (where ip_hash = ${ip})::int as mine,
      count(*)::int as total
    from pin_failures
    where at > now() - make_interval(mins => ${FAIL_WINDOW_MIN})
  `;
  const row = rows[0];
  return (row?.mine ?? 0) >= MAX_FAILS_PER_IP || (row?.total ?? 0) >= MAX_FAILS_TOTAL;
}

async function recordFailure(): Promise<void> {
  const sql = await getSql();
  await sql`insert into pin_failures (ip_hash) values (${await ipHash()})`;
  await sql`delete from pin_failures where at < now() - interval '1 day'`;
}

export async function adminState(): Promise<AdminState> {
  if (await validSession(getCookie(COOKIE))) return "ok";
  return (await pinConfigured()) ? "locked" : "setup";
}

/** Throws unless the request carries a valid Tafel session. */
export async function requireAdmin(): Promise<void> {
  if (!(await validSession(getCookie(COOKIE)))) throw new Error("PIN nötig");
}

export function checkPinFormat(pin: string): void {
  if (!/^\d{6,12}$/.test(pin)) throw new Error("PIN: 6 bis 12 Ziffern");
}

export async function setupPin(pin: string): Promise<void> {
  checkPinFormat(pin);
  if (await pinConfigured()) throw new Error("PIN ist schon gesetzt");
  const salt = randomHex(16);
  const sql = await getSql();
  // Only the first setup wins, even if two people race the empty Tafel.
  const rows = await sql<{ key: string }>`
    insert into settings (key, value) values ('pin_hash', ${`${salt}:${await hashPin(pin, salt)}`})
    on conflict (key) do nothing
    returning key
  `;
  if (!rows[0]) throw new Error("PIN ist schon gesetzt");
  await issueSession();
}

export async function login(pin: string): Promise<void> {
  if (await tooManyFailures()) throw new Error("Zu viele Versuche. In 15 Minuten nochmal.");
  if (!(await pinMatches(pin))) {
    await recordFailure();
    // Slow down guessing a little more on top of the counter.
    await new Promise((resolve) => setTimeout(resolve, 600));
    throw new Error("PIN falsch");
  }
  await issueSession();
}

/** Change the PIN (session required). Rotates the secret: all devices log out. */
export async function changePin(pin: string): Promise<void> {
  await requireAdmin();
  checkPinFormat(pin);
  if (env("FEHLRUF_PIN")) throw new Error("PIN kommt aus FEHLRUF_PIN. Dort ändern.");
  const salt = randomHex(16);
  await putSetting("pin_hash", `${salt}:${await hashPin(pin, salt)}`);
  await putSetting("session_secret", randomHex(32));
  await issueSession();
}

export function logout(): void {
  deleteCookie(COOKIE, { path: "/" });
}
