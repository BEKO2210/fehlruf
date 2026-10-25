import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";

const ORIGIN = "https://beko2210.github.io";

async function start(opts = {}) {
  const server = createApp({ dbPath: ":memory:", allowedOrigins: [ORIGIN], ...opts });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, token, origin = ORIGIN, ip } = {}) => {
    const headers = { origin };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (ip) headers["cf-connecting-ip"] = ip;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
  };
  return { call, close: () => new Promise((resolve) => server.close(resolve)) };
}

const ruf = { line: "Montage", partNo: "6204-2RSR", qty: 2, urgency: "sofort", requester: "Ali" };

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
  for (let i = 0; i < 13; i += 1) last = (await call("POST", "/api/calls", { body: ruf, ip: "9.9.9.9" })).status;
  assert.equal(last, 429);
  await close();
});

test("Steuerzeichen vom Scanner werden entfernt", async () => {
  const { call, close } = await start();
  const res = await call("POST", "/api/calls", { body: { ...ruf, partNo: "\u001d0104012345\u001d" } });
  assert.equal(res.data.partNo, "0104012345");
  await close();
});
