const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHub } = require('../realtime/hub');
const { createRouter, handleFetch } = require('../http/router');
const { createGameServer } = require('../gameServer');
const { createTestDatabase } = require('./support/db');

let testDb, io, router, server;

before(async () => {
  testDb = await createTestDatabase();
  io = createHub();
  router = createRouter();
  server = await createGameServer({ io, router, database: testDb.database, env: { ADMIN_PASSWORD: 'pw123456' } });
});
after(async () => {
  server.stop();
  await testDb.cleanup();
});

const api = async (method, path, body) => {
  const res = await handleFetch(router, new Request('http://t' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }));
  return { status: res.status, json: await res.json() };
};

// A fake client: attaches a transport to the hub and records every frame it receives.
function connect() {
  const frames = [];
  const conn = io.attach({ send: t => frames.push(JSON.parse(t)), close() {} });
  const send = (t, ...d) => conn.receive(JSON.stringify({ t, d }));
  const waitFor = async (t, pred = () => true) => {
    for (let i = 0; i < 200; i++) {
      const f = frames.find(x => x.t === t && pred(x.d[0]));
      if (f) return f.d[0];
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`never received ${t}: ` + JSON.stringify(frames).slice(0,800));
  };
  return { frames, send, waitFor };
}

async function loggedInClient(username, password = 'secret1') {
  await api('POST', '/api/register', { username, password: 'secret1' });
  const login = await api('POST', '/api/login', { username, password });
  const client = connect();
  client.send('authenticate', { userId: login.json.user.id, token: login.json.token });
  return client;
}

test('register and login over the router', async () => {
  const reg = await api('POST', '/api/register', { username: 'alice1', password: 'secret1' });
  assert.equal(reg.json.success, true);
  const login = await api('POST', '/api/login', { username: 'alice1', password: 'secret1' });
  assert.equal(login.json.success, true);
  assert.ok(login.json.token);
  assert.ok(login.json.user.id);
});

test('a socket authenticates with its login token', async () => {
  const client = await loggedInClient('bob123');
  await client.waitFor('authentication-success');
});

test('two authenticated sockets joining a draft land in the same game', async () => {
  // Draft mode unlocks at level 3, so use two level-10 admin accounts
  const a = await loggedInClient('Admin2', 'pw123456');
  const b = await loggedInClient('Admin3', 'pw123456');
  await a.waitFor('authentication-success');
  await b.waitFor('authentication-success');
  a.send('join-game', { name: 'Carol', mode: 'draft' });
  b.send('join-game', { name: 'Dave', mode: 'draft' });
  const ra = await a.waitFor('join-result', r => r.gameId);
  const rb = await b.waitFor('join-result', r => r.gameId);
  assert.ok(ra.gameId);
  assert.equal(ra.gameId, rb.gameId);
});

test('admin accounts exist with the configured password', async () => {
  const login = await api('POST', '/api/login', { username: 'Admin1', password: 'pw123456' });
  assert.equal(login.json.success, true);
});

test('unknown routes return 404', async () => {
  const res = await api('GET', '/api/nope');
  assert.equal(res.status, 404);
});

test('ADMIN_PASSWORD updates existing admin accounts on the next start', async () => {
  const fresh = await createTestDatabase();
  const boot = async (env) => {
    const h = createHub();
    const r = createRouter();
    const s = await createGameServer({ io: h, router: r, database: fresh.database, env });
    const login = async (u, p) => {
      const res = await handleFetch(r, new Request('http://t/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
      }));
      return res.json();
    };
    return { s, login };
  };
  try {
    const first = await boot({});
    assert.notEqual((await first.login('Admin1', 'newpw-123')).success, true);
    first.s.stop();
    const second = await boot({ ADMIN_PASSWORD: 'newpw-123' });
    assert.equal((await second.login('Admin1', 'newpw-123')).success, true);
    second.s.stop();
  } finally {
    await fresh.cleanup();
  }
});

test('ADMIN_PASSWORD sync does not touch a normal player named like an admin', async () => {
  const fresh = await createTestDatabase();
  try {
    await fresh.database.createUser('Admin42', 'userpw-123');
    const r = createRouter();
    const s = await createGameServer({ io: createHub(), router: r, database: fresh.database, env: { ADMIN_PASSWORD: 'adminpw-123' } });
    const login = async (p) => (await handleFetch(r, new Request('http://t/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Admin42', password: p }),
    }))).json();
    assert.equal((await login('userpw-123')).success, true);
    assert.notEqual((await login('adminpw-123')).success, true);
    s.stop();
  } finally {
    await fresh.cleanup();
  }
});
