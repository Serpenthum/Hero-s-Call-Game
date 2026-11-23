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

// The tutorial bot acts through the same rules as a player, so it must focus an enemy before acting
test('the tutorial bot focuses, acts and ends its turn', { timeout: 20000 }, async () => {
  const c = connect();
  const waitLong = async (t, pred = () => true) => {
    for (let i = 0; i < 1000; i++) {
      const f = c.frames.find(x => x.t === t && pred(x.d[0]));
      if (f) return f.d[0];
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`never received ${t}`);
  };
  c.send('join-tutorial', { name: 'Learner' });
  await waitLong('game-start');
  c.send('roll-initiative');
  await waitLong('initiative-rolled');
  c.send('choose-turn-order', { goFirst: false }); // the bot goes first
  await waitLong('battle-start');
  c.send('tutorial-continue', { hold: 'intro' });

  const focused = await waitLong('target-selected');
  assert.equal(focused.success, true);
  const acted = await waitLong('attack-result', r => r.success);
  assert.equal(acted.target, focused.selectedTarget, 'the bot acts on its focus');
  // The battle event names the acting hero, and the ability for an ability
  assert.equal(typeof acted.battleEvent.actor.name, 'string');
  assert.equal('abilityName' in acted.battleEvent, false, 'an attack has no abilityName');
  const cast = c.frames.find(x => x.t === 'ability-result' && x.d[0].success);
  if (cast) {
    assert.equal(cast.d[0].battleEvent.actor.name, acted.battleEvent.actor.name);
    assert.equal(typeof cast.d[0].battleEvent.abilityName, 'string');
  }
  c.send('tutorial-continue', { hold: 'log' });
  const ended = await waitLong('turn-ended');
  assert.equal(ended.success, true);
  c.send('tutorial-skip');
});

test('toggling a favourite acts on the logged-in user, not the body\'s userId', async () => {
  const loginAs = async (username) => {
    await api('POST', '/api/register', { username, password: 'secret1' });
    return (await api('POST', '/api/login', { username, password: 'secret1' })).json;
  };
  const a = await loginAs('favA1');
  const b = await loginAs('favB1');
  const toggle = async (token, body) => {
    const res = await handleFetch(router, new Request('http://t/api/toggle-favorite-hero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    }));
    return { status: res.status, json: await res.json() };
  };

  await toggle(a.token, { userId: b.user.id, heroName: 'Fighter' });
  assert.deepEqual(await testDb.database.getFavoriteHeroes(b.user.id), [], "B's favourites are untouched");

  const own = await toggle(a.token, { heroName: 'Fighter' });
  assert.equal(own.status, 200);
  assert.deepEqual(await testDb.database.getFavoriteHeroes(a.user.id), ['Fighter']);

  const missing = await toggle(a.token, {});
  assert.equal(missing.status, 400);
  assert.equal(missing.json.message, 'Hero name is required');
});
