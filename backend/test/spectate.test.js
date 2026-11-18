// A spectator must be told when a player in the game they watch disconnects.
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
    throw new Error(`never received ${t}`);
  };
  return { frames, send, waitFor, close: () => conn.closed() };
}

async function loggedInClient(username, password) {
  if (password === 'secret1') await api('POST', '/api/register', { username, password });
  const login = await api('POST', '/api/login', { username, password });
  const client = connect();
  client.send('authenticate', { userId: login.json.user.id, token: login.json.token });
  await client.waitFor('authentication-success');
  return client;
}

test('spectators hear when a player in the watched game disconnects', async () => {
  const a = await loggedInClient('Admin1', 'pw123456');
  const b = await loggedInClient('Admin2', 'pw123456');
  a.send('join-game', { name: 'Admin1', mode: 'random' });
  b.send('join-game', { name: 'Admin2', mode: 'random' });
  const ra = await a.waitFor('join-result', r => r.gameId);
  const start = await a.waitFor('game-start', d => d.gameState && d.gameState.phase === 'battle');
  assert.ok(start.gameState.activeHero, 'random battle starts with an active hero');

  const watcher = await loggedInClient('watcher1', 'secret1');
  watcher.send('spectate-game', { gameId: ra.gameId, spectatingPlayerId: ra.playerId });
  const spectate = await watcher.waitFor('spectate-result');
  assert.equal(spectate.success, true);

  a.close();
  const notice = await watcher.waitFor('spectated-player-disconnected');
  assert.equal(notice.playerId, ra.playerId);
  assert.equal(notice.playerName, 'Admin1');
});
