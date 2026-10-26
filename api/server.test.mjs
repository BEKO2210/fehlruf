import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createApp } from "./server.mjs";

const ORIGIN = "https://beko2210.github.io";

async function start(opts = {}) {
  const server = createApp({ dbPath: ":memory:", allowedOrigins: [ORIGIN], ...opts });
  const call = async (method, path, { body, token, origin = ORIGIN, ip } = {}) => {
    const headers = { origin };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (ip) headers["cf-connecting-ip"] = ip;
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method, url: path, headers, socket: { remoteAddress: "127.0.0.1" } });
    return new Promise((resolve) => {
      const res = {
        writeHead(status, responseHeaders) {
          this.status = status;
          this.headers = new Headers(responseHeaders);
        },
        end(payload) {
          resolve({ status: this.status, data: payload ? JSON.parse(payload) : null, headers: this.headers });
        },
      };
      server.emit("request", req, res);
    });
  };
  return { call, close: async () => server.emit("close") };
}

const ruf = { line: "Montage", partNo: "6204-2RSR", qty: 2, urgency: "sofort", requester: "Ali" };
const device = "abcdefghij0123456789_ABCD";
const otherDevice = "ZYXWVUTSRQ9876543210_abcd";

test("melden geht ohne PIN, lesen nicht", async () => {
  const { call, close } = await start();
  const created = await call("POST", "/api/calls", { body: ruf });
  assert.equal(created.status, 201);
  assert.equal(created.data.partNo, "6204-2RSR");
  assert.equal((await call("GET", "/api/calls")).status, 401);
  assert.equal((await call("GET", "/api/calls", { token: "9999999999999.deadbeef" })).status, 401);
  await close();
});

test("PIN festlegen, dann nur noch anmelden", async () => {
  const { call, close } = await start();
  assert.equal((await call("GET", "/api/state")).data.state, "setup");
  assert.equal((await call("POST", "/api/setup", { body: { pin: "123" } })).status, 400);
  const setup = await call("POST", "/api/setup", { body: { pin: "482913" } });
  assert.equal(setup.status, 200);
  assert.equal((await call("POST", "/api/setup", { body: { pin: "000000" } })).status, 409);
  assert.equal((await call("GET", "/api/state")).data.state, "locked");
  assert.equal((await call("GET", "/api/state", { token: setup.data.token })).data.state, "ok");

  await call("POST", "/api/calls", { body: ruf });
  const list = await call("GET", "/api/calls", { token: setup.data.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);

  const id = list.data[0].id;
  const patched = await call("PATCH", `/api/calls/${id}`, {
    token: setup.data.token,
    body: { urgency: "heute", status: "underway" },
  });
  assert.equal(patched.data.urgency, "heute");
  assert.equal(patched.data.status, "underway");

  assert.equal((await call("POST", "/api/login", { body: { pin: "111111" } })).status, 401);
  assert.equal((await call("POST", "/api/login", { body: { pin: "482913" } })).status, 200);
  await close();
});

test("PIN ändern meldet alte Tokens ab", async () => {
  const { call, close } = await start();
  const first = (await call("POST", "/api/setup", { body: { pin: "482913" } })).data.token;
  const fresh = (await call("POST", "/api/pin", { token: first, body: { pin: "777777" } })).data.token;
  assert.equal((await call("GET", "/api/calls", { token: first })).status, 401);
  assert.equal((await call("GET", "/api/calls", { token: fresh })).status, 200);
  await close();
});

test("fremde Herkunft wird abgewiesen", async () => {
  const { call, close } = await start();
  const res = await call("POST", "/api/calls", { body: ruf, origin: "https://boese.example" });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  await close();
});

test("Raten wird gesperrt", async () => {
  const { call, close } = await start();
  await call("POST", "/api/setup", { body: { pin: "482913" } });
  for (let i = 0; i < 8; i += 1) await call("POST", "/api/login", { body: { pin: "000000" }, ip: "1.2.3.4" });
  assert.equal((await call("POST", "/api/login", { body: { pin: "482913" }, ip: "1.2.3.4" })).status, 429);
  assert.equal((await call("POST", "/api/login", { body: { pin: "482913" }, ip: "5.6.7.8" })).status, 200);
  await close();
});

test("Flut an Meldungen wird gebremst", async () => {
  const { call, close } = await start();
  let last = 0;
  for (let i = 0; i < 30; i += 1) last = (await call("POST", "/api/calls", { body: ruf, ip: "9.9.9.9" })).status;
  assert.equal(last, 201);
  last = (await call("POST", "/api/calls", { body: ruf, ip: "9.9.9.9" })).status;
  assert.equal(last, 429);
  await close();
});

test("Steuerzeichen vom Scanner werden entfernt", async () => {
  const { call, close } = await start();
  const res = await call("POST", "/api/calls", { body: { ...ruf, partNo: "\u001d0104012345\u001d" } });
  assert.equal(res.data.partNo, "0104012345");
  await close();
});

test("alte Datenbank bekommt neue Spalten und Index", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fehlruf-test-"));
  const dbPath = join(dir, "old.db");
  try {
    const old = new DatabaseSync(dbPath);
    old.exec(`create table calls (
      id text primary key, station_code text not null default '', line text not null,
      part_no text not null, part_name text not null default '', qty integer not null default 1,
      urgency text not null default 'normal', note text not null default '', requester text not null default '',
      status text not null default 'open', created_at integer not null, updated_at integer not null
    );
    insert into calls (id, line, part_no, created_at, updated_at) values ('ABCDEF', 'Montage', 'Altteil', 1, 1);`);
    old.close();
    const { call, close } = await start({ dbPath });
    const token = (await call("POST", "/api/setup", { body: { pin: "482913" } })).data.token;
    const rows = (await call("GET", "/api/calls", { token })).data;
    assert.equal(rows[0].partNo, "Altteil");
    assert.equal(rows[0].orderNo, "");
    await close();
    const migrated = new DatabaseSync(dbPath);
    const columns = migrated.prepare("pragma table_info(calls)").all().map((row) => row.name);
    for (const name of ["order_no", "reply", "reply_at", "seen_at", "sent_at", "received_at", "received_by", "owner_hash"]) {
      assert.ok(columns.includes(name), name);
    }
    assert.ok(migrated.prepare("pragma index_list(calls)").all().some((row) => row.name === "calls_owner_hash_idx"));
    migrated.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Geräteschlüssel findet eigene Rufe und übersteht PIN-Wechsel", async () => {
  const { call, close } = await start();
  const created = await call("POST", "/api/calls", { body: { ...ruf, orderNo: "AUF-42", device } });
  assert.equal(created.status, 201);
  assert.equal(created.data.orderNo, "AUF-42");
  assert.equal("ownerHash" in created.data || "owner_hash" in created.data, false);
  assert.equal((await call("POST", "/api/mine", { body: { device: otherDevice } })).data.length, 0);
  assert.deepEqual((await call("POST", "/api/mine", { body: { device } })).data.map((row) => row.id), [created.data.id]);
  assert.equal((await call("POST", "/api/mine", { body: { device: "kurz" } })).status, 400);
  assert.equal((await call("POST", "/api/calls", { body: { ...ruf, orderNo: "a@b" } })).status, 400);
  const first = (await call("POST", "/api/setup", { body: { pin: "482913" } })).data.token;
  const fresh = (await call("POST", "/api/pin", { token: first, body: { pin: "777777" } })).data.token;
  assert.equal((await call("GET", "/api/calls", { token: first })).status, 401);
  const mine = await call("POST", "/api/mine", { body: { device } });
  assert.equal(mine.data[0].id, created.data.id);
  assert.equal("owner_hash" in (await call("GET", "/api/calls", { token: fresh })).data[0], false);
  await close();
});

test("Erhalten verlangt passendes Gerät und ist idempotent", async () => {
  let time = 1_000_000;
  const { call, close } = await start({ now: () => time });
  const id = (await call("POST", "/api/calls", { body: { ...ruf, device } })).data.id;
  assert.equal((await call("POST", `/api/calls/${id}/received`, { body: { device: otherDevice } })).status, 404);
  time += 5_000;
  const received = await call("POST", `/api/calls/${id}/received`, { body: { device } });
  assert.equal(received.data.status, "done");
  assert.equal(received.data.receivedBy, "requester");
  assert.equal(received.data.sentAt, time);
  assert.equal(received.data.receivedAt, time);
  time += 5_000;
  assert.deepEqual((await call("POST", `/api/calls/${id}/received`, { body: { device } })).data, received.data);
  time += 86_400_001;
  assert.equal((await call("POST", "/api/mine", { body: { device } })).data.length, 0);
  await close();
});

test("Tafel markiert gesehen, PATCH setzt und löscht Zeitstempel", async () => {
  let time = 1_000_000;
  const { call, close } = await start({ now: () => time });
  const token = (await call("POST", "/api/setup", { body: { pin: "482913" } })).data.token;
  const id = (await call("POST", "/api/calls", { body: ruf })).data.id;
  time += 1_000;
  // Tafel im Hintergrund: nicht gesehen.
  assert.equal((await call("GET", "/api/calls", { token })).data[0].seenAt, null);
  assert.equal((await call("GET", "/api/calls?seen=1", { token })).data[0].seenAt, time);
  time += 1_000;
  const sent = await call("PATCH", `/api/calls/${id}`, { token, body: { status: "underway", reply: "Kommt gleich" } });
  assert.equal(sent.data.sentAt, time);
  assert.equal(sent.data.reply, "Kommt gleich");
  assert.equal(sent.data.replyAt, time);
  time += 1_000;
  const done = await call("PATCH", `/api/calls/${id}`, { token, body: { status: "done" } });
  assert.equal(done.data.sentAt, sent.data.sentAt);
  assert.equal(done.data.receivedAt, time);
  assert.equal(done.data.receivedBy, "lager");
  time += 1_000;
  const reopened = await call("PATCH", `/api/calls/${id}`, { token, body: { status: "open", reply: "" } });
  assert.equal(reopened.data.sentAt, null);
  assert.equal(reopened.data.receivedAt, null);
  assert.equal(reopened.data.receivedBy, "");
  assert.equal(reopened.data.replyAt, null);
  assert.equal((await call("PATCH", `/api/calls/${id}`, { token, body: { reply: "a@b" } })).status, 400);
  await close();
});

test("Statistik berechnet Berliner Tagesgrenze und Kennzahlen", async () => {
  let time = Date.parse("2026-03-29T08:00:00Z");
  const { call, close } = await start({ now: () => time });
  const token = (await call("POST", "/api/setup", { body: { pin: "482913" } })).data.token;
  time = Date.parse("2026-03-28T22:00:00Z");
  await call("POST", "/api/calls", { body: { ...ruf, partNo: "gestern" } });
  time = Date.parse("2026-03-29T08:00:00Z");
  const first = (await call("POST", "/api/calls", { body: { ...ruf, device } })).data.id;
  time += 600_000;
  await call("PATCH", `/api/calls/${first}`, { token, body: { status: "underway" } });
  time += 900_000;
  await call("POST", `/api/calls/${first}/received`, { body: { device } });
  const second = (await call("POST", "/api/calls", { body: { ...ruf, qty: 3, urgency: "normal" } })).data.id;
  time += 300_000;
  await call("PATCH", `/api/calls/${second}`, { token, body: { status: "done" } });
  await call("POST", "/api/calls", { body: { ...ruf, partNo: "anderes", urgency: "normal" } });
  assert.equal((await call("GET", "/api/stats?days=5", { token })).status, 400);
  assert.equal((await call("GET", "/api/stats?days=1")).status, 401);
  const stats = (await call("GET", "/api/stats?days=1", { token })).data;
  assert.equal(stats.from, Date.parse("2026-03-28T23:00:00Z"));
  assert.equal(stats.total, 3);
  assert.equal(stats.urgent, 1);
  assert.equal(stats.open, 1);
  assert.equal(stats.toSentMedianMs, 450_000);
  assert.equal(stats.toReceivedMedianMs, 900_000);
  assert.equal(stats.toReceivedP90Ms, 1_500_000);
  assert.equal(stats.confirmedByRequester, 1);
  assert.equal(stats.closedByLager, 1);
  assert.deepEqual(stats.parts[0], { partNo: "6204-2RSR", count: 2, qty: 5 });
  assert.deepEqual(stats.lines[0], { line: "Montage", count: 3, urgent: 1, toReceivedMedianMs: 900_000 });
  const week = (await call("GET", "/api/stats?days=7", { token })).data;
  assert.equal(week.from, Date.parse("2026-03-22T23:00:00Z"));
  assert.equal(week.total, 4);
  assert.equal((await call("GET", "/api/stats?days=30", { token })).data.from, Date.parse("2026-02-27T23:00:00Z"));
  await close();
});
