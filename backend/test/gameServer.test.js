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

test('a player who surrenders at once gets no XP and no coins; the winner gets 10 XP and 3 coins', async () => {
  const quitter = await loggedInClient('quitA1');
  const stayer = await loggedInClient('stayB1');
  await quitter.waitFor('authentication-success');
  await stayer.waitFor('authentication-success');
  quitter.send('join-game', { name: 'Quinn', mode: 'random' });
  stayer.send('join-game', { name: 'Sam', mode: 'random' });
  // Random mode goes straight to battle
  await quitter.waitFor('game-start', s => s.gameState && s.gameState.phase === 'battle');

  quitter.send('surrender-game');
  const won = await stayer.waitFor('victory-points-update');
  const quit = await quitter.waitFor('victory-points-update');
  const xp = await stayer.waitFor('xp-update');
  await new Promise(r => setTimeout(r, 100));

  assert.equal(won.victoryPointsGained, 3);
  assert.equal(won.pointsAwarded, 3);
  assert.equal(won.newVictoryPoints - won.oldVictoryPoints, 3);
  assert.match(won.message, /coins/);
  assert.equal(xp.xpGained, 10);
  assert.equal(quit.victoryPointsGained, 0);
  assert.equal(quit.newVictoryPoints, quit.oldVictoryPoints);
  assert.equal(quitter.frames.some(f => f.t === 'xp-update'), false, 'no XP for quitting at once');
});

test('a winner who levels up gets the XP first, then a coin update with battle and level-up coins', async () => {
  const setXP = (id, xp) => new Promise((resolve, reject) => testDb.database.db.run(
    'UPDATE player_stats SET xp = ?, level = 1 WHERE user_id = ?', [xp, id], e => (e ? reject(e) : resolve())));
  // The level-up coins the server pays today, measured on a spare account (25 XP takes level 1 to 2)
  await api('POST', '/api/register', { username: 'probeL1', password: 'secret1' });
  const probe = (await api('POST', '/api/login', { username: 'probeL1', password: 'secret1' })).json.user.id;
  const levelUpCoins = (await testDb.database.updatePlayerXP(probe, 25)).vpGained;
  assert.ok(levelUpCoins > 0);

  const quitter = await loggedInClient('quitL1');
  const winner = await loggedInClient('winL1');
  await quitter.waitFor('authentication-success');
  const { userId: winnerId } = await winner.waitFor('authentication-success');
  await setXP(winnerId, 20); // level 1 needs 25: the 10 win XP levels up
  quitter.send('join-game', { name: 'Quinn', mode: 'random' });
  winner.send('join-game', { name: 'Wren', mode: 'random' });
  await quitter.waitFor('game-start', s => s.gameState && s.gameState.phase === 'battle');

  quitter.send('surrender-game');
  const coins = await winner.waitFor('victory-points-update');
  const xp = await winner.waitFor('xp-update');
  assert.equal(xp.leveledUp, true);
  assert.equal(xp.newLevel, 2);
  const order = winner.frames.map(f => f.t).filter(t => t === 'xp-update' || t === 'victory-points-update');
  assert.deepEqual(order, ['xp-update', 'victory-points-update'], 'the coin update comes last');

  assert.equal(coins.pointsAwarded, 3, 'battle coins: random win by surrender');
  assert.equal(coins.victoryPointsGained, 3 + levelUpCoins);
  assert.equal(coins.newVictoryPoints - coins.oldVictoryPoints, 3 + levelUpCoins);
  // A daily quest the win completes pays after this, with its own 'quests-update'; leave those coins out
  await new Promise(r => setTimeout(r, 300));
  const questCoins = winner.frames.filter(f => f.t === 'quests-update').reduce((sum, f) => sum + (f.d[0].vpGained || 0), 0);
  const balance = (await api('GET', `/api/user/${winnerId}`)).json.user.victory_points - questCoins;
  assert.equal(coins.newVictoryPoints, balance);
  assert.equal(coins.totalVictoryPoints, balance);
});

test('a new account that skips the tutorial lands at level 2 with 80 coins', async () => {
  const c = await loggedInClient('skipT1');
  const { userId } = await c.waitFor('authentication-success');
  c.send('join-tutorial', { name: 'Skipper' });
  await c.waitFor('join-result', r => r.gameId);
  c.send('tutorial-skip');
  const skipped = await c.waitFor('tutorial-skipped');
  assert.equal(skipped.newLevel, 2);
  assert.equal(skipped.newVictoryPoints, 80);
  const user = (await api('GET', `/api/user/${userId}`)).json.user;
  assert.equal(user.level, 2);
  assert.equal(user.victory_points, 80);
});

test('two tutorial skips for one new account at the same time pay the reward once', async () => {
  const a = await loggedInClient('skipT2');
  const { userId } = await a.waitFor('authentication-success');
  const b = connect(); // a second tab, seated in a tutorial for the same account
  a.send('join-tutorial', { name: 'Skipper' });
  b.send('join-tutorial', { name: 'Skipper' });
  await a.waitFor('join-result', r => r.gameId);
  const { gameId } = await b.waitFor('join-result', r => r.gameId);
  server.gameManager.games.get(gameId).tutorial.userId = userId;
  a.send('tutorial-skip');
  b.send('tutorial-skip');
  await a.waitFor('tutorial-skipped').catch(() => b.waitFor('tutorial-skipped'));
  await new Promise(r => setTimeout(r, 300));
  const user = (await api('GET', `/api/user/${userId}`)).json.user;
  assert.equal(user.level, 2);
  assert.equal(user.victory_points, 80);
  const skips = [...a.frames, ...b.frames].filter(f => f.t === 'tutorial-skipped');
  assert.equal(skips.length, 1, 'only the claim that won reports a reward');
});

test('a friend room with an empty or blank name is refused', async () => {
  const c = await loggedInClient('roomE1');
  await c.waitFor('authentication-success');
  for (const roomName of ['', '   ', undefined, 42]) {
    c.frames.length = 0;
    c.send('create-friendly-room', { roomName, playerName: 'Eve' });
    const reply = await c.waitFor('friendly-room-created');
    assert.equal(reply.success, false, `refuses ${JSON.stringify(roomName)}`);
    assert.equal(typeof reply.message, 'string');
  }
});

// Two new accounts in a friend room, put straight into battle with set teams
async function friendBattle(tag) {
  const host = await loggedInClient(`host${tag}`);
  const guest = await loggedInClient(`gst${tag}`);
  const { userId: hostId } = await host.waitFor('authentication-success');
  const { userId: guestId } = await guest.waitFor('authentication-success');
  host.send('create-friendly-room', { roomName: `room-${tag}`, playerName: 'Hana' });
  await host.waitFor('friendly-room-created', r => r.success);
  guest.send('join-friendly-room', { roomName: `room-${tag}`, playerName: 'Gus' });
  const { gameId } = await guest.waitFor('friendly-room-joined', r => r.success);
  const gm = server.gameManager;
  const game = gm.games.get(gameId);
  [['Fighter', 'Cleric', 'Monk'], ['Wizard', 'Silencer', 'Warden']].forEach((names, i) => {
    game.players[i].team = names.map(n => gm.resetHeroToOriginalState(gm.allHeroes.find(h => h.name === n)));
  });
  game.phase = 'battle';
  const guestIndex = game.players.findIndex(p => p.userId === guestId);
  return { host, guest, hostId, guestId, game, guestIndex };
}
const standingOf = async id => {
  const user = (await api('GET', `/api/user/${id}`)).json.user;
  return { xp: user.xp, coins: user.victory_points };
};

test('friend room: a surrender with no hero down pays neither player XP or coins', async () => {
  const { host, guest, hostId, guestId } = await friendBattle('Q1');
  guest.send('surrender-game');
  await host.waitFor('game-surrendered');
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(await standingOf(hostId), { xp: 0, coins: 0 });
  assert.deepEqual(await standingOf(guestId), { xp: 0, coins: 0 });
  for (const c of [host, guest]) {
    assert.equal(c.frames.some(f => f.t === 'xp-update'), false);
    assert.equal(c.frames.some(f => f.t === 'victory-points-update'), false);
  }
});

test('friend room: a surrender after losing a hero pays 10 and 5 XP, no coins', async () => {
  const { host, guest, hostId, guestId, game, guestIndex } = await friendBattle('Q2');
  game.players[guestIndex].team[0].currentHP = 0;
  guest.send('surrender-game');
  const won = await host.waitFor('xp-update');
  const lost = await guest.waitFor('xp-update');
  await new Promise(r => setTimeout(r, 300));
  assert.equal(won.xpGained, 10);
  assert.equal(lost.xpGained, 5);
  assert.deepEqual(await standingOf(hostId), { xp: 10, coins: 0 });
  assert.deepEqual(await standingOf(guestId), { xp: 5, coins: 0 });
});

test('friend room: a level-up sends its coins after the XP; no level-up, no coin message', async () => {
  const run = (sql, params) => new Promise((resolve, reject) => testDb.database.db.run(sql, params, e => (e ? reject(e) : resolve())));
  const { host, guest, hostId, guestId, game, guestIndex } = await friendBattle('Q3');
  // The host is 10 XP short of level 2 (25 XP) and holds 30 coins
  await testDb.database.getPlayerStats(hostId);
  await run('UPDATE player_stats SET level = 1, xp = 15 WHERE user_id = ?', [hostId]);
  await run('UPDATE users SET victory_points = 30 WHERE id = ?', [hostId]);
  game.players[guestIndex].team[0].currentHP = 0;
  guest.send('surrender-game');
  const coins = await host.waitFor('victory-points-update');
  await guest.waitFor('xp-update');
  await new Promise(r => setTimeout(r, 300));

  const sent = host.frames.map(f => f.t).filter(t => t === 'xp-update' || t === 'victory-points-update');
  assert.deepEqual(sent, ['xp-update', 'victory-points-update']);
  assert.equal(host.frames.find(f => f.t === 'xp-update').d[0].leveledUp, true);
  assert.equal(coins.pointsAwarded, 0);
  assert.equal(coins.victoryPointsGained, 20);
  assert.equal(coins.oldVictoryPoints, 30);
  assert.equal(coins.newVictoryPoints, 50);
  assert.equal(coins.totalVictoryPoints, 50);
  assert.deepEqual(await standingOf(hostId), { xp: 0, coins: 50 });

  // The guest gained 5 XP and no level: no coin message, as before
  assert.equal(guest.frames.some(f => f.t === 'victory-points-update'), false);
  assert.deepEqual(await standingOf(guestId), { xp: 5, coins: 0 });
});

test('a finished game whose result is handled twice pays XP once', async () => {
  const quitter = await loggedInClient('twiceA1');
  const winner = await loggedInClient('twiceB1');
  await quitter.waitFor('authentication-success');
  const { userId: winnerId } = await winner.waitFor('authentication-success');
  quitter.send('join-game', { name: 'Quinn', mode: 'random' });
  winner.send('join-game', { name: 'Wren', mode: 'random' });
  await quitter.waitFor('game-start', s => s.gameState && s.gameState.phase === 'battle');

  // The same finished result reaches the completion handler twice
  const gm = server.gameManager;
  const surrender = gm.surrenderGame;
  let first = null;
  gm.surrenderGame = id => first || (first = surrender.call(gm, id));
  try {
    quitter.send('surrender-game');
    quitter.send('surrender-game');
    await winner.waitFor('xp-update');
    await new Promise(r => setTimeout(r, 300));
  } finally {
    gm.surrenderGame = surrender;
  }
  assert.equal(winner.frames.filter(f => f.t === 'xp-update').length, 1);
  assert.equal(winner.frames.filter(f => f.t === 'victory-points-update').length, 1);
  assert.equal(winner.frames.find(f => f.t === 'xp-update').d[0].xpGained, 10);
  assert.equal((await testDb.database.getPlayerStats(winnerId)).total_wins, 1, 'the win is counted once');
});

test('an account with all 40 heroes, 500 coins and level 20 loads unchanged, buys a pack and gains XP', async () => {
  const run = (sql, params) => new Promise((resolve, reject) => testDb.database.db.run(sql, params, e => (e ? reject(e) : resolve())));
  const allHeroes = require('../heros.json').filter(h => !h.disabled).map(h => h.name);
  assert.equal(allHeroes.length, 40);
  const holo = allHeroes.slice(0, 3);
  await api('POST', '/api/register', { username: 'veteran1', password: 'secret1' });
  const id = (await testDb.database.authenticateUser('veteran1', 'secret1')).id;
  // The row as an account from before the shards column holds it: shards left at the column default
  await run('UPDATE users SET available_heroes = ?, holo_heroes = ?, victory_points = 500 WHERE id = ?',
    [JSON.stringify(allHeroes), JSON.stringify(holo), id]);
  await testDb.database.getPlayerStats(id);
  await run('UPDATE player_stats SET level = 20, xp = 475 WHERE user_id = ?', [id]);

  const login = await api('POST', '/api/login', { username: 'veteran1', password: 'secret1' });
  assert.equal(login.json.success, true);
  const user = login.json.user;
  assert.deepEqual([...user.available_heroes].sort(), [...allHeroes].sort());
  assert.deepEqual([...user.holo_heroes].sort(), [...holo].sort());
  assert.equal(user.victory_points, 500);
  assert.equal(user.level, 20);
  assert.equal(user.xp, 475);
  assert.equal(user.shards, 0);
  assert.equal(login.json.levelUpData, undefined, 'nothing pending at login');

  // A pack is random: with every hero owned it can only be a repeat (10 shards) or a holographic
  const res = await handleFetch(router, new Request('http://t/api/shop/purchase-pack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.json.token}` },
    body: JSON.stringify({ userId: id })
  }));
  const pack = await res.json();
  assert.equal(res.status, 200);
  assert.equal(pack.coinsSpent, 20);
  assert.equal(pack.newVP, 480);
  assert.equal(pack.available_heroes.length, 40, 'no hero added or lost');
  if (pack.card.kind === 'repeat') {
    assert.equal(pack.shardsGained, 10);
    assert.equal(pack.shards, 10);
    assert.equal(pack.holo_heroes.length, 3);
  } else {
    assert.equal(pack.card.kind, 'holo_upgrade');
    assert.equal(pack.shardsGained, 0);
    assert.equal(pack.shards, 0);
    assert.equal(pack.holo_heroes.length, 4);
    assert.ok(pack.holo_heroes.includes(pack.card.name));
  }

  const xp = await testDb.database.updatePlayerXP(id, 25);
  assert.equal(xp.level, 21);
  assert.equal(xp.xp, 0);
  assert.equal(xp.vpGained, 20);
  const after = (await api('GET', `/api/user/${id}`)).json.user;
  assert.equal(after.level, 21);
  assert.equal(after.victory_points, 500);
  assert.equal(after.available_heroes.length, 40);
  assert.equal(after.shards, pack.shards);
});
