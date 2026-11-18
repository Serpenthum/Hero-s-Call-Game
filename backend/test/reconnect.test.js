// A player who drops out of a battle against another person has a grace period to come back.
// If they don't, the player who stayed wins (or, if nobody is left, the game ends with no winner).
// The turn clock stops while anyone is disconnected and picks up where it stopped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHub } = require('../realtime/hub');
const { createRouter, handleFetch } = require('../http/router');
const { createGameServer } = require('../gameServer');
const { createTestDatabase } = require('./support/db');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A fresh server per test (with short clocks) so seats and sessions never leak between tests.
async function setup(t, timing) {
  const testDb = await createTestDatabase();
  const io = createHub();
  const router = createRouter();
  const server = await createGameServer({ io, router, database: testDb.database, env: { ADMIN_PASSWORD: 'pw123456' }, timing });
  t.after(async () => {
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
    const conn = io.attach({ send: s => frames.push(JSON.parse(s)), close() {} });
    const send = (ev, ...d) => conn.receive(JSON.stringify({ t: ev, d }));
    const all = (ev, pred = () => true) => frames.filter(x => x.t === ev && pred(x.d[0])).map(x => x.d[0]);
    const waitFor = async (ev, pred = () => true, ms = 3000) => {
      for (let i = 0; i < ms / 10; i++) {
        const found = all(ev, pred);
        if (found.length) return found[0];
        await sleep(10);
      }
      throw new Error(`never received ${ev}`);
    };
    const socketId = frames.find(x => x.t === '__welcome').d[0];
    return { frames, send, all, waitFor, socketId, close: () => conn.closed() };
  }

  async function login(username, password = 'pw123456') {
    if (password !== 'pw123456') await api('POST', '/api/register', { username, password });
    const res = await api('POST', '/api/login', { username, password });
    return resume({ userId: res.json.user.id, token: res.json.token });
  }

  // A new connection that logs in with a saved session (a refresh, a reopened app, a second tab)
  async function resume({ userId, token }) {
    const client = connect();
    client.userId = userId;
    client.token = token;
    client.send('authenticate', { userId, token });
    client.auth = await client.waitFor('authentication-success');
    return client;
  }

  // Two admin accounts in a random battle (random battles start straight in the battle phase)
  async function battle(mode = 'random') {
    const a = await login('Admin1');
    const b = await login('Admin2');
    a.send('join-game', { name: 'Admin1', mode });
    b.send('join-game', { name: 'Admin2', mode });
    const ra = await a.waitFor('join-result', r => r.gameId);
    const rb = await b.waitFor('join-result', r => r.gameId);
    const start = await a.waitFor('game-start');
    return { a, b, ra, rb, gameId: ra.gameId, start };
  }

  const stats = (userId) => testDb.database.getPlayerStats(userId);
  return { io, server, gm: server.gameManager, api, connect, login, resume, battle, stats };
}

async function eventually(check, ms = 3000) {
  for (let i = 0; i < ms / 10; i++) {
    if (await check()) return;
    await sleep(10);
  }
  assert.fail('condition never became true');
}

test('a player who never comes back loses, and the win counts like any other', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const { a, b, ra, rb, gameId } = await ctx.battle();
  const winsBefore = (await ctx.stats(b.userId)).total_wins;
  const lossesBefore = (await ctx.stats(a.userId)).total_losses;

  a.close();
  const countdown = await b.waitFor('disconnection-countdown-started');
  assert.equal(countdown.playerId, ra.playerId);
  assert.equal(countdown.playerName, 'Admin1');
  assert.ok(countdown.remainingMs > 0 && countdown.remainingMs <= 300);

  // The seat is held: the player is still in the game, marked as disconnected
  const game = ctx.gm.games.get(gameId);
  assert.equal(game.players.length, 2);
  assert.equal(game.players.find(p => p.id === ra.playerId).connected, false);
  // Old clients get a fresh state showing the dropped player
  const pushed = await b.waitFor('battle-start', d => d.gameState.players.some(p => p.connected === false));
  assert.ok(pushed.gameState.players.find(p => p.id === ra.playerId).disconnectionTimer.remainingMs > 0);

  const ended = await b.waitFor('game-ended-by-disconnection');
  assert.equal(ended.outcome, 'forfeit');
  assert.equal(ended.winner, rb.playerId);
  assert.equal(ended.disconnectedPlayer, ra.playerId);
  const surrendered = await b.waitFor('game-surrendered');
  assert.equal(surrendered.gameState.winner, rb.playerId);
  assert.equal(surrendered.gameState.endReason, 'disconnect');

  // Recorded as a normal win and loss (ranked stats and XP), even though the loser has no socket
  await b.waitFor('xp-update');
  await eventually(async () => (await ctx.stats(b.userId)).total_wins === winsBefore + 1);
  await eventually(async () => (await ctx.stats(a.userId)).total_losses === lossesBefore + 1);
});

test('coming back within the grace period puts the player back in their seat', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 400 });
  const { a, b, ra, gameId } = await ctx.battle();

  a.close();
  await b.waitFor('disconnection-countdown-started');

  // A refresh or reopened app: a new socket for the same account is told about the held game
  const a2 = await ctx.login('Admin1');
  assert.deepEqual(a2.auth.activeGame, { gameId, mode: 'random', phase: 'battle' });
  a2.send('reconnect-game', { gameId: a2.auth.activeGame.gameId });
  const state = await a2.waitFor('reconnect-success');
  assert.equal(state.phase, 'battle');
  const me = state.players.find(p => p.name === 'Admin1');
  assert.equal(me.id, a2.socketId);
  assert.equal(me.connected, true);
  assert.equal(me.disconnectionTimer, null);

  const back = await b.waitFor('player-reconnected');
  assert.equal(back.oldPlayerId, ra.playerId);
  assert.equal(back.playerId, a2.socketId);

  // The countdown was cancelled: nothing happens when it would have run out
  await sleep(600);
  assert.equal(b.all('game-ended-by-disconnection').length, 0);
  assert.equal(ctx.gm.games.get(gameId).phase, 'battle');

  // And the returning player can play on their new socket
  const game = ctx.gm.games.get(gameId);
  const active = ctx.gm.getCurrentTurnInfo(game).player.id;
  const first = active === a2.socketId ? a2 : b;
  const second = first === a2 ? b : a2;
  first.send('end-turn');
  await b.waitFor('turn-ended');
  second.send('end-turn');
  await eventually(() => b.all('turn-ended').length === 2);
});

test('the turn clock stops while a player is disconnected and resumes when they are back', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 5000, turnTimeMs: 1500 });
  const { a, b, gameId } = await ctx.battle();
  const game = ctx.gm.games.get(gameId);
  const byId = (id) => (id === a.socketId ? a : b);

  // End the first turn so the next one runs on the clock
  const firstId = ctx.gm.getCurrentTurnInfo(game).player.id;
  byId(firstId).send('end-turn');
  await a.waitFor('turn-ended');
  const running = await a.waitFor('turn-timer');
  assert.equal(running.paused, false);
  const activeId = running.playerId;
  const stayer = activeId === a.socketId ? b : a;

  // The active player drops: the clock stops instead of ending their turn
  byId(activeId).close();
  const paused = await stayer.waitFor('turn-timer', d => d.paused === true);
  assert.ok(paused.remainingMs > 1000 && paused.remainingMs <= 1500);
  await sleep(1800);
  assert.equal(stayer.all('turn-ended').length, 1, 'no turn ended while the player was away');

  // Back again: the clock restarts with the time it had left, then runs out as normal
  const back = await ctx.resume(byId(activeId));
  back.send('reconnect-game', {});
  await back.waitFor('reconnect-success');
  const resumed = await stayer.waitFor('turn-timer', d => d.paused === false && d.playerId === back.socketId);
  assert.ok(resumed.remainingMs <= paused.remainingMs + 5);
  await eventually(() => stayer.all('turn-ended').length === 2, 2500);
});

test('if both players are gone when the countdown ends, nobody wins and nothing is recorded', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const { a, b, ra, gameId } = await ctx.battle();
  const before = [await ctx.stats(a.userId), await ctx.stats(b.userId)];

  const watcher = await ctx.login('watcher1', 'secret1');
  watcher.send('spectate-game', { gameId, spectatingPlayerId: ra.playerId });
  assert.equal((await watcher.waitFor('spectate-result')).success, true);

  a.close();
  await sleep(50);
  b.close();

  const ended = await watcher.waitFor('game-ended-by-disconnection');
  assert.equal(ended.outcome, 'abandoned');
  assert.equal(ended.winner, null);
  // Spectators are sent back to the lobby
  const left = await watcher.waitFor('spectated-player-disconnected');
  assert.equal(left.playerId, ra.playerId);
  assert.equal(watcher.all('game-surrendered').length, 0);

  await eventually(() => !ctx.gm.games.has(gameId));
  await sleep(100);
  const after = [await ctx.stats(a.userId), await ctx.stats(b.userId)];
  for (const i of [0, 1]) {
    assert.equal(after[i].total_wins, before[i].total_wins);
    assert.equal(after[i].total_losses, before[i].total_losses);
    assert.equal(after[i].xp, before[i].xp);
  }
});

test('spectators keep watching through a disconnect and follow the player back', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 2000 });
  const { a, ra, gameId } = await ctx.battle();
  const watcher = await ctx.login('watcher2', 'secret1');
  watcher.send('spectate-game', { gameId, spectatingPlayerId: ra.playerId });
  await watcher.waitFor('spectate-result');

  a.close();
  const countdown = await watcher.waitFor('disconnection-countdown-started');
  assert.equal(countdown.playerId, ra.playerId);
  assert.equal(watcher.all('spectated-player-disconnected').length, 0, 'the player has not left yet');

  const a2 = await ctx.login('Admin1');
  a2.send('reconnect-game', {});
  const back = await watcher.waitFor('player-reconnected');
  assert.equal(back.oldPlayerId, ra.playerId);
  assert.equal(ctx.gm.games.get(gameId).spectators[0].spectatingPlayerId, a2.socketId);
});

test('logging in on a second device moves the battle to it (old clients rejoin by game id and name)', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 2000 });
  const { a, b, gameId } = await ctx.battle();

  // A fresh password login is refused while the account is connected, so the second device
  // comes in with the saved session
  const refused = await ctx.api('POST', '/api/login', { username: 'Admin1', password: 'pw123456' });
  assert.equal(refused.status, 409);
  const other = await ctx.resume(a);
  await a.waitFor('force-logout');
  assert.equal(other.auth.activeGame.gameId, gameId);
  await b.waitFor('disconnection-countdown-started');

  other.send('reconnect-game', { gameId, playerName: 'Admin1' });
  const state = await other.waitFor('reconnect-success');
  assert.equal(state.players.find(p => p.name === 'Admin1').id, other.socketId);
});

test('nobody else can take a held seat', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 2000 });
  const { a, b, gameId } = await ctx.battle();
  a.close();
  await b.waitFor('disconnection-countdown-started');

  const intruder = await ctx.login('Admin3');
  assert.equal(intruder.auth.activeGame, null);
  intruder.send('reconnect-game', { gameId, playerName: 'Admin1' });
  await intruder.waitFor('reconnect-failed');

  const anonymous = ctx.connect();
  anonymous.send('reconnect-game', { gameId, playerName: 'Admin1' });
  await anonymous.waitFor('reconnect-failed');
  assert.equal(ctx.gm.games.get(gameId).players.find(p => p.name === 'Admin1').connected, false);
});

test('a disconnect during the draft calls the game off for the player who stayed', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const { a, b, gameId, start } = await ctx.battle('draft');
  assert.equal(start.gameState.phase, 'draft');
  const winsBefore = (await ctx.stats(b.userId)).total_wins;

  a.close();
  await b.waitFor('disconnection-countdown-started');
  const off = await b.waitFor('draft-abandoned');
  assert.equal(off.isOpponent, true);
  assert.match(off.message, /Admin1 disconnected/);
  await eventually(() => !ctx.gm.games.has(gameId));
  assert.equal(ctx.gm.playerGameMap.has(b.socketId), false);
  assert.equal((await ctx.stats(b.userId)).total_wins, winsBefore);
});

test('a login replaces a connection that went silent, so the player can get back to their battle', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 2000 });
  const { a, b, gameId } = await ctx.battle();

  // The phone lost its network: the server has not noticed yet, so a fresh login is refused at first
  const busy = await ctx.api('POST', '/api/login', { username: 'Admin1', password: 'pw123456' });
  assert.equal(busy.status, 409);

  // Once the old connection has been silent for longer than the ping interval it no longer blocks a login
  ctx.io.sockets.sockets.get(a.socketId).lastSeen = Date.now() - 60000;
  const again = await ctx.login('Admin1');
  await b.waitFor('disconnection-countdown-started');
  assert.equal(again.auth.activeGame.gameId, gameId);
  again.send('reconnect-game', { gameId });
  await again.waitFor('reconnect-success');
  await b.waitFor('player-reconnected');
});

test('a Survival forfeit counts as a win for one run and a loss for the other', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const a = await ctx.login('Admin1');
  const b = await ctx.login('Admin2');
  const team = (names) => names.map(name => ({ name }));
  a.send('join-survival-game', { name: 'Admin1', team: team(['Barbarian', 'Ranger', 'Assassin']) });
  await a.waitFor('join-result', r => r.waiting);
  b.send('join-survival-game', { name: 'Admin2', team: team(['Druid', 'Paladin', 'Monk']) });
  const start = await b.waitFor('game-start');
  assert.equal(ctx.gm.games.get(start.gameState.id).mode, 'survival');

  a.close();
  await b.waitFor('disconnection-countdown-started');
  const update = await b.waitFor('survival-state-update');
  assert.equal(update.type, 'win');
  assert.equal(update.state.wins, 1);

  // The player who dropped out finds the loss on their run when they come back
  const back = await ctx.login('Admin1');
  assert.equal(back.auth.activeGame, null);
  back.send('get-survival-state');
  const run = await back.waitFor('survival-state-response');
  assert.equal(run.state.losses, 1);
});
