// Holographic heroes storage: the holo_heroes column, savePack, and holo on user objects.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('../database');
const { createCompatDb } = require('../sql/compat');
const { createNodeDriver } = require('../sql/nodeDriver');
const { createHub } = require('../realtime/hub');
const { createRouter, handleFetch } = require('../http/router');
const { createGameServer } = require('../gameServer');
const { createTestDatabase, createUser } = require('./support/db');

// createTables issues its statements synchronously; let their callbacks (microtasks) run.
const settle = () => new Promise(r => setTimeout(r, 10));

// The users table as it was before holo_heroes existed.
const OLD_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    victory_points INTEGER DEFAULT 0,
    survival_wins INTEGER DEFAULT 0,
    survival_losses INTEGER DEFAULT 0,
    survival_used_heroes TEXT DEFAULT '[]',
    available_heroes TEXT DEFAULT '[]',
    best_gauntlet_trial INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    favorite_heroes TEXT DEFAULT '[]',
    player_id TEXT,
    tutorial_completed INTEGER DEFAULT 1
  )
`;

function captureErrors() {
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  return { errors, restore: () => { console.error = original; } };
}

describe('holo_heroes column', () => {
  let env, database;
  before(async () => { env = await createTestDatabase(); database = env.database; });
  after(async () => { await env.cleanup(); });

  test('new users start with no holographics', async () => {
    const id = await createUser(database, 'holo1');
    assert.deepEqual((await database.getUserById(id)).holo_heroes, []);
  });

  test('the column is added to a database made before it existed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heros-call-holo-'));
    const driver = createNodeDriver(path.join(dir, 'old.sqlite'));
    try {
      driver.execScript(OLD_USERS_TABLE);
      driver.query(
        'INSERT INTO users (username, password_hash, available_heroes, victory_points) VALUES (?, ?, ?, ?)',
        ['oldtimer', 'hash', JSON.stringify(['Fighter', 'Cleric']), 7]);
      const cap = captureErrors();
      let db;
      try {
        db = new Database(createCompatDb(driver));
        await settle();
      } finally { cap.restore(); }
      assert.deepEqual(cap.errors, []);
      const user = await db.getUserById(1);
      assert.deepEqual(user.holo_heroes, []);
      // existing data is untouched
      assert.deepEqual(user.available_heroes, ['Fighter', 'Cleric']);
      assert.equal(user.victory_points, 7);
    } finally {
      driver.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('constructing the database twice does not fail', async () => {
    const id = await createUser(database, 'holo2');
    const cap = captureErrors();
    let again;
    try {
      again = new Database(database.db);
      await settle();
    } finally { cap.restore(); }
    assert.deepEqual(cap.errors, []);
    assert.deepEqual((await again.getUserById(id)).holo_heroes, []);
  });
});

describe('savePack', () => {
  let env, database;
  before(async () => { env = await createTestDatabase(); database = env.database; });
  after(async () => { await env.cleanup(); });

  test('savePack spends and adds heroes and holographics together', async () => {
    const id = await createUser(database, 'pack1', { heroes: ['Fighter'], victoryPoints: 30 });
    const result = await database.savePack(id, { cost: 20, addHeroes: ['Bard'], addHolo: ['Monk'] });
    assert.equal(result.success, true);
    assert.equal(result.newVP, 10);
    for (const h of ['Fighter', 'Bard', 'Monk']) assert.ok(result.available_heroes.includes(h), h);
    assert.deepEqual(result.holo_heroes, ['Monk']);
    const user = await database.getUserById(id);
    assert.equal(user.victory_points, 10);
    for (const h of ['Fighter', 'Bard', 'Monk']) assert.ok(user.available_heroes.includes(h), h);
    assert.deepEqual(user.holo_heroes, ['Monk']);
  });

  test('savePack refuses when the player cannot afford it', async () => {
    const id = await createUser(database, 'pack2', { heroes: ['Fighter'], victoryPoints: 19 });
    const result = await database.savePack(id, { cost: 20, addHeroes: ['Bard'], addHolo: ['Monk'] });
    assert.equal(result.success, false);
    assert.equal(result.error, 'Not enough to buy this.');
    const user = await database.getUserById(id);
    assert.equal(user.victory_points, 19);
    assert.deepEqual(user.holo_heroes, []);
    assert.deepEqual(user.available_heroes, ['Fighter']);
  });
});

describe('holo_heroes on API user objects', () => {
  let env, server, router;
  before(async () => {
    env = await createTestDatabase();
    router = createRouter();
    server = await createGameServer({ io: createHub(), router, database: env.database, env: { ADMIN_PASSWORD: 'pw123456' } });
  });
  after(async () => { server.stop(); await env.cleanup(); });

  const api = async (method, p, body) => {
    const res = await handleFetch(router, new Request('http://t' + p, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }));
    return res.json();
  };

  test('register, login, admin login and /api/user/:id include holo_heroes', async () => {
    const reg = await api('POST', '/api/register', { username: 'holoapi', password: 'secret1' });
    assert.deepEqual(reg.user.holo_heroes, []);
    const login = await api('POST', '/api/login', { username: 'holoapi', password: 'secret1' });
    assert.deepEqual(login.user.holo_heroes, []);
    const fetched = await api('GET', `/api/user/${login.user.id}`);
    assert.deepEqual(fetched.user.holo_heroes, []);
    const admin = await api('POST', '/api/admin-login', { password: 'pw123456' });
    assert.equal(admin.success, true);
    assert.deepEqual(admin.user.holo_heroes, []);
  });
});

describe('holo in game state', () => {
  const { makeManager } = require('./support/battle');
  const heroList = require('../heros.json');
  const enabled = heroList.filter(h => !h.disabled).map(h => h.name);
  const starters = ['Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard'];
  const others = enabled.filter(n => !starters.includes(n));
  // A owns Monk and five more; B owns six heroes A doesn't
  const collectionA = ['Monk', 'Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter'];
  const collectionB = others.slice(0, 6);

  let env, database, gm, count = 0, sock = 0;
  before(async () => { env = await createTestDatabase(); database = env.database; gm = makeManager(database); });
  after(async () => { await env.cleanup(); });

  const setHolo = (userId, names) => new Promise((resolve, reject) =>
    database.db.run('UPDATE users SET holo_heroes = ? WHERE id = ?', [JSON.stringify(names), userId], e => (e ? reject(e) : resolve())));
  const setLevel = (userId, level) => new Promise((resolve, reject) =>
    database.db.run('UPDATE player_stats SET level = ? WHERE user_id = ?', [level, userId], e => (e ? reject(e) : resolve())));
  async function account(heroes, holo = []) {
    const userId = await createUser(database, `holoplayer${++count}`, { heroes });
    await setLevel(userId, 3);
    await setHolo(userId, holo);
    return userId;
  }
  const holoNames = heroes => heroes.filter(h => h.holo === true).map(h => h.name);
  const assertPlain = (heroes, label) => {
    for (const h of heroes) assert.equal('holo' in h, false, `${label}: ${h.name} has no holo key`);
  };

  // Matches two accounts in Draft; returns the game and the two socket ids
  async function draft(userA, userB) {
    const s1 = `hs${++sock}`, s2 = `hs${++sock}`;
    await gm.addPlayer(s1, s1, 'draft', 'Sorcerer', userA);
    const result = await gm.addPlayer(s2, s2, 'draft', 'Sorcerer', userB);
    assert.equal(result.gameReady, true, 'the two players were matched');
    return { game: gm.games.get(result.gameId), s1, s2 };
  }
  // A draft where A's Monk was dealt into the hand built from A's collection (player 2's ban hand)
  async function draftWithMonk(userA, userB) {
    for (let i = 0; i < 40; i++) {
      const d = await draft(userA, userB);
      if (d.game.players[1].draftCards.some(h => h.name === 'Monk')) return d;
    }
    assert.fail('Monk was never dealt');
  }

  test("draft hands mark cards from the owner's holographics", async () => {
    const a = await account(collectionA, ['Monk']);
    const b = await account(collectionB);
    const { game } = await draftWithMonk(a, b);
    const [p1, p2] = game.players;
    // P2 bans from A's collection, P1 from B's
    assert.deepEqual(holoNames(p2.draftCards), ['Monk']);
    assertPlain(p2.draftCards.filter(h => h.name !== 'Monk'), "A's other cards");
    assertPlain(p1.draftCards, "B's cards");
    assert.deepEqual(holoNames(gm.getFullGameState(game).players[1].draftCards), ['Monk']);
  });

  test('a mirror hero is holo only on the side whose owner has it holo', async () => {
    const a = await account(starters, ['Monk']);
    const b = await account(starters);
    const seen = { fromA: 0, fromB: 0 };
    for (let i = 0; i < 30; i++) {
      const { game } = await draft(a, b);
      const [p1, p2] = game.players;
      const monkA = p2.draftCards.find(h => h.name === 'Monk'); // the hand built from A's collection
      const monkB = p1.draftCards.find(h => h.name === 'Monk'); // the hand built from B's collection
      if (monkA) { seen.fromA++; assert.equal(monkA.holo, true); }
      if (monkB) { seen.fromB++; assert.equal('holo' in monkB, false); }
    }
    assert.ok(seen.fromA > 0 && seen.fromB > 0, 'Monk was dealt from both collections');
  });

  test('picked draft heroes keep their holo into battle', async () => {
    const a = await account(collectionA, ['Monk']);
    const b = await account(collectionB);
    const { game, s1, s2 } = await draftWithMonk(a, b);
    const [p1, p2] = game.players;
    gm.banCard(s1, p1.draftCards[0].name);
    gm.banCard(s2, p2.draftCards.find(h => h.name !== 'Monk').name);
    for (let round = 1; round <= 3; round++) {
      for (const p of game.players) {
        const card = p.draftCards.find(h => h.name === 'Monk') || p.draftCards[0];
        assert.equal(gm.pickCard(p.id, card.name).success, true);
      }
    }
    const teams = gm.getFullGameState(game).players.map(p => p.team);
    const monk = teams.flat().find(h => h.name === 'Monk');
    assert.ok(monk, 'Monk was picked');
    assert.equal(monk.holo, true);
    assert.deepEqual(holoNames(teams.flat()), ['Monk']);
  });

  test("random mode teams are marked from each player's own collection", async () => {
    const a = await account(collectionA, collectionA);
    const b = await account(collectionA);
    const s1 = `hs${++sock}`, s2 = `hs${++sock}`;
    await gm.addPlayer(s1, s1, 'random', 'Sorcerer', a);
    const result = await gm.addPlayer(s2, s2, 'random', 'Sorcerer', b);
    assert.equal(result.gameReady, true);
    assert.equal((await gm.startRandomMode(result.gameId)).success, true);
    const game = gm.games.get(result.gameId);
    const [teamA, teamB] = gm.getFullGameState(game).players.map(p => p.team);
    assert.equal(teamA.length, 3);
    assert.ok(teamA.every(h => h.holo === true), "every hero of A's team is holo");
    assertPlain(teamB, "B's team");
  });

  test('survival teams are marked from the account, ignoring client flags', async () => {
    const owned = enabled.slice(0, 21);
    const picks = ['Monk', 'Fighter', 'Cleric'];
    assert.ok(picks.every(n => owned.includes(n)));
    const plain = await account(owned);
    const holo = await account(owned, ['Monk']);
    const raw = [{ name: 'Monk', holo: true }, { name: 'Fighter', holo: true }, { name: 'Cleric' }];

    gm.userSessions.set('surv-plain', plain);
    const r1 = await gm.prepareSurvivalTeam('surv-plain', raw);
    assert.equal(r1.success, true);
    assertPlain(r1.team, 'no holographics');

    gm.userSessions.set('surv-holo', holo);
    const r2 = await gm.prepareSurvivalTeam('surv-holo', raw);
    assert.equal(r2.success, true);
    assert.deepEqual(holoNames(r2.team), ['Monk']);
    assertPlain(r2.team.filter(h => h.name !== 'Monk'), 'the others');
  });

  test('gauntlet teams are marked from the holo list given when queueing', async () => {
    for (const id of ['gaunt-a', 'gaunt-b']) {
      assert.equal((await gm.initializeGauntletRun(id, id)).success, true);
      gm.gauntletRuns.get(id).battle_team_indices = [0, 1, 2];
    }
    const runA = gm.gauntletRuns.get('gaunt-a');
    const holoA = [runA.roster[0].hero_id, runA.roster[2].hero_id];
    assert.equal(gm.queueForGauntletTrial('gaunt-a', holoA).waiting, true);
    const matched = gm.queueForGauntletTrial('gaunt-b');
    assert.equal(matched.matched, true);
    const game = gm.games.get(matched.gameId);
    const teamA = game.players.find(p => p.id === 'gaunt-a').team;
    const teamB = game.players.find(p => p.id === 'gaunt-b').team;
    assert.deepEqual(holoNames(teamA), holoA);
    assertPlain(teamA.filter(h => !holoA.includes(h.name)), "A's other heroes");
    assertPlain(teamB, "B's team");
    // The saved run keeps plain hero data
    for (const id of ['gaunt-a', 'gaunt-b']) {
      assertPlain(gm.gauntletRuns.get(id).roster.map(r => r.heroData), `${id} roster`);
    }
  });

  test('the tutorial bot is never holo', async () => {
    const userId = await account(enabled, enabled);
    const { game } = gm.createTutorialGame('tut-sock', 'Tutee', 'Sorcerer', userId);
    assert.equal(game.players.length, 2);
    for (const p of game.players) assertPlain(p.team, p.id);
  });

  test('templates are never stamped', () => {
    assertPlain(gm.heroes, 'gm.heroes');
    assertPlain(gm.allHeroes, 'gm.allHeroes');
  });
});

describe('holo across the wire', () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // A fresh server per test so seats and sessions never leak between tests
  async function setup(t) {
    const testDb = await createTestDatabase();
    const io = createHub();
    const router = createRouter();
    const server = await createGameServer({ io, router, database: testDb.database, env: { ADMIN_PASSWORD: 'pw123456' }, timing: { reconnectGraceMs: 2000 } });
    t.after(async () => { server.stop(); await testDb.cleanup(); });

    const api = async (method, p, body) => {
      const res = await handleFetch(router, new Request('http://t' + p, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
      }));
      return res.json();
    };
    function connect() {
      const frames = [];
      const conn = io.attach({ send: s => frames.push(JSON.parse(s)), close() {} });
      const send = (ev, ...d) => conn.receive(JSON.stringify({ t: ev, d }));
      const waitFor = async (ev, pred = () => true) => {
        for (let i = 0; i < 300; i++) {
          const f = frames.find(x => x.t === ev && pred(x.d[0]));
          if (f) return f.d[0];
          await sleep(10);
        }
        throw new Error(`never received ${ev}`);
      };
      const socketId = frames.find(x => x.t === '__welcome').d[0];
      return { frames, send, waitFor, socketId, close: () => conn.closed() };
    }
    async function login(username, password = 'pw123456') {
      if (password !== 'pw123456') await api('POST', '/api/register', { username, password });
      const res = await api('POST', '/api/login', { username, password });
      const client = connect();
      client.userId = res.user.id;
      client.send('authenticate', { userId: res.user.id, token: res.token });
      await client.waitFor('authentication-success');
      return client;
    }
    // Admin1 has every hero holo, Admin2 none; both own every hero
    async function admins() {
      const a = await login('Admin1');
      const b = await login('Admin2');
      const owned = (await testDb.database.getUserById(a.userId)).available_heroes;
      await new Promise((resolve, reject) => testDb.database.db.run(
        'UPDATE users SET holo_heroes = ? WHERE id = ?', [JSON.stringify(owned), a.userId], e => (e ? reject(e) : resolve())));
      return { a, b };
    }
    async function battle() {
      const { a, b } = await admins();
      a.send('join-game', { name: 'Admin1', mode: 'random' });
      b.send('join-game', { name: 'Admin2', mode: 'random' });
      const ra = await a.waitFor('join-result', r => r.gameId);
      await a.waitFor('game-start', d => d.gameState && d.gameState.phase === 'battle');
      return { a, b, ra };
    }
    return { gm: server.gameManager, login, admins, battle };
  }
  const teamOf = (state, name) => state.players.find(p => p.name === name).team;

  test('holo survives a reconnect', async (t) => {
    const ctx = await setup(t);
    const { a, b } = await ctx.battle();
    a.close();
    await b.waitFor('disconnection-countdown-started');
    const a2 = await ctx.login('Admin1');
    const state = await a2.waitFor('reconnect-success');
    assert.ok(teamOf(state, 'Admin1').every(h => h.holo === true), "Admin1's heroes are still holo");
    assert.ok(teamOf(state, 'Admin2').every(h => !('holo' in h)), "Admin2's heroes are plain");
    b.send('surrender-game');
    await b.waitFor('game-surrendered');
    await b.waitFor('xp-update');
  });

  test("a gauntlet battle shows the queueing player's holographics", async (t) => {
    const ctx = await setup(t);
    const { a, b } = await ctx.admins();
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
    const state = ctx.gm.getFullGameState(game);
    assert.ok(teamOf(state, 'Admin1').every(h => h.holo === true));
    assert.ok(teamOf(state, 'Admin2').every(h => !('holo' in h)));
  });

  test('spectators see the same holo flags', async (t) => {
    const ctx = await setup(t);
    const { b, ra } = await ctx.battle();
    const watcher = await ctx.login('holowatcher', 'secret1');
    watcher.send('spectate-game', { gameId: ra.gameId, spectatingPlayerId: ra.playerId });
    const spectate = await watcher.waitFor('spectate-result');
    assert.equal(spectate.success, true);
    assert.ok(teamOf(spectate.gameState, 'Admin1').every(h => h.holo === true));
    assert.ok(teamOf(spectate.gameState, 'Admin2').every(h => !('holo' in h)));
    b.send('surrender-game');
    await b.waitFor('game-surrendered');
    await b.waitFor('xp-update');
  });
});
