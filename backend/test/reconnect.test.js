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

  async function login(username, password = 'pw123456', extra = {}) {
    if (password !== 'pw123456') await api('POST', '/api/register', { username, password });
    const res = await api('POST', '/api/login', { username, password });
    return resume({ userId: res.json.user.id, token: res.json.token }, extra);
  }

  // A new connection that logs in with a saved session (a refresh, a reopened app, a second tab)
  async function resume({ userId, token }, extra = {}) {
    const client = connect();
    client.userId = userId;
    client.token = token;
    client.send('authenticate', { userId, token, ...extra });
    client.auth = await client.waitFor('authentication-success');
    return client;
  }

  // Two admin accounts in a random battle (random battles start straight in the battle phase)
  async function battle(mode = 'random', extra = {}) {
    const a = await login('Admin1', 'pw123456', extra);
    const b = await login('Admin2', 'pw123456', extra);
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
  // The server puts the new connection back in its seat while logging it in (before the reply)
  assert.equal(a2.auth.rejoined, true);
  const state = await a2.waitFor('reconnect-success');
  assert.ok(a2.frames.findIndex(f => f.t === 'reconnect-success') < a2.frames.findIndex(f => f.t === 'authentication-success'));
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
  assert.ok(resumed.remainingMs >= paused.remainingMs - 200, 'resumes with the time it had left, not a fresh or minimum clock');
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

test('a player who never comes back during the draft loses, and the player who stayed wins', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const { a, b, rb, gameId, start } = await ctx.battle('draft');
  assert.equal(start.gameState.phase, 'draft');
  const winsBefore = (await ctx.stats(b.userId)).total_wins;
  const lossesBefore = (await ctx.stats(a.userId)).total_losses;

  a.close();
  await b.waitFor('disconnection-countdown-started');
  const ended = await b.waitFor('game-ended-by-disconnection');
  assert.equal(ended.outcome, 'forfeit');
  assert.equal(ended.winner, rb.playerId);
  const surrendered = await b.waitFor('game-surrendered');
  assert.equal(surrendered.gameState.phase, 'ended');
  assert.equal(b.all('draft-abandoned').length, 0);
  await b.waitFor('xp-update');
  await eventually(async () => (await ctx.stats(b.userId)).total_wins === winsBefore + 1);
  await eventually(async () => (await ctx.stats(a.userId)).total_losses === lossesBefore + 1);
  assert.equal(ctx.gm.games.get(gameId).winner, rb.playerId);
});

test('a login replaces a connection that went silent, so the player can get back to their battle', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 2000 });
  const { a, b, gameId } = await ctx.battle();

  // The phone lost its network: the server has not noticed yet, so a fresh login is refused at first
  const busy = await ctx.api('POST', '/api/login', { username: 'Admin1', password: 'pw123456' });
  assert.equal(busy.status, 409);

  // Once the old connection has been silent for longer than the ping interval it no longer blocks a login
  ctx.io.sockets.sockets.get(a.socketId).lastSeen = Date.now() - 70000;
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
  // Survival battles start at the initiative roll, so this is a forfeit before the battle proper
  assert.equal(ctx.gm.games.get(start.gameState.id).phase, 'initiative');

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

// Drops a client the way a network failure does: the server side closes it without a close frame
function dropSocket(ctx, socketId) {
  const s = ctx.io.sockets.sockets.get(socketId);
  if (s) s.disconnect();
}

test('a seated player whose network drops is noticed fast, and the countdown counts from their last message', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 3000, seatedIdleMs: 300, reconnectMinMs: 100 });
  const { a, b, ra } = await ctx.battle('random', { heartbeatMs: 100 });
  // B keeps pinging like a live client; A goes silent (no close frame) as if its network dropped
  const keepAlive = setInterval(() => b.send('__ping'), 100);
  t.after(() => clearInterval(keepAlive));
  ctx.io.sockets.sockets.get(a.socketId).lastSeen = Date.now() - 1500;

  const countdown = await b.waitFor('disconnection-countdown-started', () => true, 2500);
  assert.equal(countdown.playerId, ra.playerId);
  // 3 s of grace minus the ~1.5 s A was already silent
  assert.ok(countdown.remainingMs <= 1700, 'countdown ' + countdown.remainingMs + ' should start from the last message');
  assert.ok(countdown.remainingMs >= 500);
});

test('each player has a grace budget per game, so repeated disconnects cannot stall it', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 600, reconnectBudgetMs: 900, reconnectMinMs: 100 });
  const { a, b, rb } = await ctx.battle();
  const countdowns = () => b.all('disconnection-countdown-started');

  // First drop: the full 600 ms. Back after about 350 ms.
  dropSocket(ctx, a.socketId);
  await eventually(() => countdowns().length === 1);
  assert.equal(countdowns()[0].remainingMs, 600);
  await sleep(350);
  let back = await ctx.login('Admin1');
  await back.waitFor('reconnect-success');

  // Second drop: only what is left of the 900 ms budget (about 550 ms)
  dropSocket(ctx, back.socketId);
  await eventually(() => countdowns().length === 2);
  assert.ok(countdowns()[1].remainingMs < countdowns()[0].remainingMs, 'the second countdown is shorter');
  assert.ok(countdowns()[1].remainingMs <= 560, 'second countdown ' + countdowns()[1].remainingMs);
  await sleep(350);
  back = await ctx.login('Admin1');
  await back.waitFor('reconnect-success');

  // Third drop: the budget is all but gone, so the opponent wins almost at once
  dropSocket(ctx, back.socketId);
  await eventually(() => countdowns().length === 3);
  assert.ok(countdowns()[2].remainingMs <= 250, 'third countdown ' + countdowns()[2].remainingMs);
  const ended = await b.waitFor('game-ended-by-disconnection', () => true, 1000);
  assert.equal(ended.winner, rb.playerId);
});

test('if one player runs out of time while the other is still inside theirs, the other wins on return', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 400, reconnectMinMs: 100 });
  const { a, b, rb, gameId } = await ctx.battle();
  const watcher = await ctx.login('watcher3', 'secret1');
  watcher.send('spectate-game', { gameId, spectatingPlayerId: rb.playerId });
  await watcher.waitFor('spectate-result');
  const winsBefore = (await ctx.stats(b.userId)).total_wins;

  a.close();
  await sleep(200);
  b.close();
  // A's time runs out at 400 ms while B (gone at 200 ms) still has until 600 ms: nothing is decided yet
  await sleep(300);
  assert.equal(watcher.all('game-ended-by-disconnection').length, 0);
  assert.equal(ctx.gm.games.get(gameId).phase, 'battle');

  const b2 = await ctx.login('Admin2');
  await b2.waitFor('reconnect-success');
  const ended = await b2.waitFor('game-ended-by-disconnection');
  assert.equal(ended.outcome, 'forfeit');
  assert.equal(ended.winner, b2.socketId);
  await eventually(async () => (await ctx.stats(b.userId)).total_wins === winsBefore + 1);

  // A is too late: there is no seat to come back to
  const a2 = await ctx.login('Admin1');
  assert.equal(a2.auth.activeGame, null);
  assert.equal(a2.all('reconnect-success').length, 0);
});

test('a rejoin that arrives just after the forfeit is refused cleanly', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 5000 });
  const { a, b, ra, gameId } = await ctx.battle();
  a.close();
  await b.waitFor('disconnection-countdown-started');
  // The countdown fires in the same tick the player's rejoin would arrive
  const forfeit = ctx.gm.handleDisconnectionTimeout(gameId, ra.playerId);
  const a2 = await ctx.login('Admin1');
  a2.send('reconnect-game', { gameId });
  await a2.waitFor('reconnect-failed');
  await forfeit;
  assert.equal(a2.auth.activeGame, null);
  assert.equal(a2.all('reconnect-success').length, 0);
  assert.equal(ctx.gm.playerGameMap.has(a2.socketId), false);
  assert.equal((await b.waitFor('game-ended-by-disconnection')).outcome, 'forfeit');
});

test('a Gauntlet forfeit records the battle and saves the run of the player who left', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const a = await ctx.login('Admin1');
  const b = await ctx.login('Admin2');
  for (const [c, name] of [[a, 'Admin1'], [b, 'Admin2']]) {
    c.send('start-gauntlet-run', { name });
    await c.waitFor('gauntlet-run-started', r => r.success);
    c.send('set-gauntlet-battle-team', { teamIndices: [0, 1, 2] });
    await c.waitFor('gauntlet-battle-team-set', r => r.success);
  }
  a.send('queue-for-gauntlet-trial');
  await a.waitFor('gauntlet-queue-waiting');
  b.send('queue-for-gauntlet-trial');
  await b.waitFor('game-start');
  const game = ctx.gm.games.get(ctx.gm.playerGameMap.get(b.socketId));
  assert.equal(game.mode, 'gauntlet');

  a.close();
  await b.waitFor('disconnection-countdown-started');
  const done = await b.waitFor('gauntlet-battle-complete');
  assert.equal(done.won, true);
  await eventually(async () => {
    const saved = await ctx.server.gameManager.database.loadGauntletState(a.userId);
    return !!(saved && saved.success && saved.runState);
  });
  assert.equal(ctx.gm.gauntletRuns.has(a.socketId), false, 'the dead socket no longer holds the run');
});

test('a seat nobody returns to leaves nothing behind', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 200 });
  const { a, b, ra } = await ctx.battle();
  ctx.gm.survivalStates.set(ra.playerId, { wins: 0, losses: 0, usedHeroes: [] });
  a.close();
  await b.waitFor('game-ended-by-disconnection');
  await eventually(() => !ctx.gm.userSessions.has(ra.playerId));
  assert.equal(ctx.gm.survivalStates.has(ra.playerId), false);
  assert.equal(ctx.gm.playerGameMap.has(ra.playerId), false);
});

test('a connection already in another live game cannot take a held seat', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 5000 });
  const { a, b, ra, gameId } = await ctx.battle();
  a.close();
  await b.waitFor('disconnection-countdown-started');
  // This new connection is already seated in some other live game
  const other = ctx.gm.createNewGame('other-game', 'random');
  other.phase = 'battle';
  other.players = [{ id: 'x', connected: true, team: [] }, { id: 'y', connected: true, team: [] }];
  ctx.gm.games.set('other-game', other);
  const a2 = ctx.connect();
  ctx.gm.playerGameMap.set(a2.socketId, 'other-game');
  a2.send('authenticate', { userId: a.userId, token: a.token });
  await a2.waitFor('reconnect-failed');
  assert.equal(ctx.gm.games.get(gameId).players.find(p => p.name === 'Admin1').id, ra.playerId);
});

test('a saved login stops working a while after the account last had a connection', async (t) => {
  const ctx = await setup(t, { resumeWindowMs: 300 });
  const a = await ctx.login('resume1', 'secret1');
  a.close();
  // A refresh soon after: the saved token still works
  await sleep(100);
  const back = await ctx.resume(a);
  assert.equal(back.auth.userId, a.userId);
  back.close();
  // A tab reopened much later (here, after the window): refused, so it lands on the login screen
  await sleep(450);
  const late = ctx.connect();
  late.send('authenticate', { userId: a.userId, token: a.token });
  const refused = await late.waitFor('authentication-failed');
  assert.equal(refused.message, 'Please log in again');
});

test('coming back inside the window cancels the expiry', async (t) => {
  const ctx = await setup(t, { resumeWindowMs: 300 });
  const a = await ctx.login('resume2', 'secret1');
  a.close();
  await sleep(100);
  const back = await ctx.resume(a); // still connected when the first expiry would have fired
  await sleep(450);
  const other = await ctx.resume(a); // a second tab with the same saved login still works
  assert.equal(other.auth.userId, a.userId);
  await back.waitFor('force-logout');
});

test('a dropped player whose turn it was gets back the turn time that ran before the drop was noticed', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 10000, turnTimeMs: 3000 });
  const { a, b, gameId } = await ctx.battle();
  const game = ctx.gm.games.get(gameId);
  const byId = (id) => (id === a.socketId ? a : b);
  byId(ctx.gm.getCurrentTurnInfo(game).player.id).send('end-turn');
  const running = await a.waitFor('turn-timer', d => d.paused === false);
  const active = byId(running.playerId);
  const stayer = active === a ? b : a;
  await sleep(1000);
  // The active player went silent ~1 s ago (at the end turn) and is only now noticed as gone
  ctx.io.sockets.sockets.get(active.socketId).lastSeen = Date.now() - 1000;
  ctx.io.sweepIdle(Date.now(), (s) => (s.id === active.socketId ? 500 : 1e9));
  const paused = await stayer.waitFor('turn-timer', d => d.paused === true);
  // About 2 s were left; the unnoticed second is given back, so close to the full 3 s
  assert.ok(paused.remainingMs >= 2700, 'paused with ' + paused.remainingMs);
  assert.ok(paused.remainingMs <= 3000);
});

test('a Gauntlet run is saved when the game ended another way while its player was away', async (t) => {
  const ctx = await setup(t, { reconnectGraceMs: 300 });
  const a = await ctx.login('Admin1');
  const b = await ctx.login('Admin2');
  for (const [c, name] of [[a, 'Admin1'], [b, 'Admin2']]) {
    c.send('start-gauntlet-run', { name });
    await c.waitFor('gauntlet-run-started', r => r.success);
    c.send('set-gauntlet-battle-team', { teamIndices: [0, 1, 2] });
    await c.waitFor('gauntlet-battle-team-set', r => r.success);
  }
  a.send('queue-for-gauntlet-trial');
  await a.waitFor('gauntlet-queue-waiting');
  b.send('queue-for-gauntlet-trial');
  await b.waitFor('game-start');
  const game = ctx.gm.games.get(ctx.gm.playerGameMap.get(b.socketId));

  a.close();
  await b.waitFor('disconnection-countdown-started');
  // While A is away the game ends some other way, and A's run changes in memory (say, a win)
  ctx.gm.gauntletRuns.get(a.socketId).trials_won = 4;
  game.phase = 'ended';
  await eventually(async () => {
    const saved = await ctx.gm.database.loadGauntletState(a.userId);
    return !!(saved && saved.runState && saved.runState.trials_won === 4);
  });
  assert.equal(ctx.gm.gauntletRuns.has(a.socketId), false);
});

test('a login whose tab never connects does not leave a token that works forever', async (t) => {
  const ctx = await setup(t, { resumeWindowMs: 300 });
  await ctx.api('POST', '/api/register', { username: 'resume3', password: 'secret1' });
  const res = await ctx.api('POST', '/api/login', { username: 'resume3', password: 'secret1' });
  // The tab closed before its socket logged in; much later the saved token is tried
  await sleep(450);
  const late = ctx.connect();
  late.send('authenticate', { userId: res.json.user.id, token: res.json.token });
  assert.equal((await late.waitFor('authentication-failed')).message, 'Please log in again');

  // A socket that logs in within the window keeps the token alive
  const again = await ctx.api('POST', '/api/login', { username: 'resume3', password: 'secret1' });
  const live = await ctx.resume({ userId: again.json.user.id, token: again.json.token });
  await sleep(450);
  const second = await ctx.resume({ userId: again.json.user.id, token: again.json.token });
  assert.equal(second.auth.userId, again.json.user.id);
  await live.waitFor('force-logout');
});
