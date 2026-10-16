// The server must not believe what the client says about who it is, what it owns, or what it earned.
const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const heroList = require('../heros.json');
const { makeManager } = require('./support/battle');
const { createTestDatabase, createUser } = require('./support/db');

let env, database, userCount = 0;
before(async () => { env = await createTestDatabase(); database = env.database; });
after(async () => { await env.cleanup(); });

describe('auth tokens', () => {
  const { createAuth } = require('../auth');
  let auth;
  beforeEach(() => { auth = createAuth(); });

  test('a token identifies the user it was issued to', () => {
    const token = auth.issueToken(5);
    assert.equal(auth.verify(token), 5);
    assert.equal(auth.verify('nope'), null);
    assert.equal(auth.verify(undefined), null);
  });

  test('verifyUser refuses a token that belongs to someone else', () => {
    const token = auth.issueToken(5);
    assert.equal(auth.verifyUser(token, 5), true);
    assert.equal(auth.verifyUser(token, '5'), true, 'ids arrive as strings in URLs');
    assert.equal(auth.verifyUser(token, 6), false);
  });

  test('logging in again replaces the previous token', () => {
    const first = auth.issueToken(5);
    const second = auth.issueToken(5);
    assert.equal(auth.verify(first), null);
    assert.equal(auth.verify(second), 5);
  });

  test('revoking a user invalidates their token', () => {
    const token = auth.issueToken(5);
    auth.revokeUser(5);
    assert.equal(auth.verify(token), null);
  });

  test('tokens are unguessable', () => {
    const tokens = new Set(Array.from({ length: 50 }, (_, i) => auth.issueToken(i)));
    assert.equal(tokens.size, 50);
    assert.ok([...tokens].every(t => t.length >= 32));
  });

  describe('requireUser middleware', () => {
    const run = (headers, extra = {}) => {
      const req = { headers, body: {}, query: {}, params: {}, ...extra };
      const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      let nexted = false;
      auth.requireUser(req, res, () => { nexted = true; });
      return { req, res, nexted };
    };

    test('rejects a request without a token', () => {
      const { res, nexted } = run({});
      assert.equal(res.statusCode, 401);
      assert.equal(nexted, false);
    });

    test('rejects an unknown token', () => {
      assert.equal(run({ authorization: 'Bearer wrong' }).res.statusCode, 401);
    });

    test('accepts a valid token and exposes the user id', () => {
      const token = auth.issueToken(7);
      const { req, nexted } = run({ authorization: `Bearer ${token}` });
      assert.equal(nexted, true);
      assert.equal(req.userId, 7);
    });

    test('rejects a body userId that is not the token owner', () => {
      const token = auth.issueToken(7);
      const { res, nexted } = run({ authorization: `Bearer ${token}` }, { body: { userId: 8 } });
      assert.equal(res.statusCode, 403);
      assert.equal(nexted, false);
    });

    test('rejects a query or URL userId that is not the token owner', () => {
      const token = auth.issueToken(7);
      assert.equal(run({ authorization: `Bearer ${token}` }, { query: { userId: '8' } }).res.statusCode, 403);
      assert.equal(run({ authorization: `Bearer ${token}` }, { params: { userId: '8' } }).res.statusCode, 403);
    });
  });
});

describe('shop', () => {
  const { createAuth } = require('../auth');
  const { createShopRouter } = require('../shop');
  const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
  const enabled = heroList.filter(h => !h.disabled).map(h => h.name);
  const starters = ['Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard'];

  let auth, server, base;
  before(async () => {
    auth = createAuth();
    const app = express();
    app.use(express.json());
    app.use('/api/shop', createShopRouter({ database, getHeroes: () => heroList, auth, now: () => NOW }));
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(r => server.close(r)));

  const call = async (path, { token, body, method = 'POST' } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined
    });
    return { status: res.status, json: await res.json() };
  };
  const newUser = async vp => {
    const id = await createUser(database, `shopper${++userCount}`, { victoryPoints: vp });
    return { id, token: auth.issueToken(id) };
  };
  const rotationFor = async user => (await call(`/api/shop/rotation?userId=${user.id}`, { token: user.token, method: 'GET' })).json.heroes.map(h => h.name);

  test('every endpoint requires a login token', async () => {
    const user = await newUser(50);
    assert.equal((await call(`/api/shop/rotation?userId=${user.id}`, { method: 'GET' })).status, 401);
    assert.equal((await call('/api/shop/purchase-pack', { body: { userId: user.id } })).status, 401);
    assert.equal((await call('/api/shop/purchase-hero', { body: { userId: user.id, heroName: 'Bomber' } })).status, 401);
    assert.equal((await database.getUserById(user.id)).victory_points, 50);
  });

  test("a user cannot spend another user's Victory Points", async () => {
    const victim = await newUser(50);
    const thief = await newUser(0);
    const res = await call('/api/shop/purchase-pack', { token: thief.token, body: { userId: victim.id } });
    assert.equal(res.status, 403);
    assert.equal((await database.getUserById(victim.id)).victory_points, 50);
  });

  test('buying a pack spends 12 VP and grants 3 new heroes', async () => {
    const user = await newUser(20);
    const res = await call('/api/shop/purchase-pack', { token: user.token, body: { userId: user.id } });
    assert.equal(res.status, 200);
    assert.equal(res.json.heroesReceived.length, 3);
    const after = await database.getUserById(user.id);
    assert.equal(after.victory_points, 8);
    assert.equal(after.available_heroes.length, 13);
    assert.equal(new Set(after.available_heroes).size, 13, 'no duplicates');
  });

  test('a pack needs 12 VP', async () => {
    const user = await newUser(11);
    assert.equal((await call('/api/shop/purchase-pack', { token: user.token, body: { userId: user.id } })).status, 400);
  });

  test('a hero can only be bought if it is in the current rotation', async () => {
    const user = await newUser(50);
    const rotation = await rotationFor(user);
    assert.equal(rotation.length, 6);
    const outside = enabled.find(n => !starters.includes(n) && !rotation.includes(n));
    const refused = await call('/api/shop/purchase-hero', { token: user.token, body: { userId: user.id, heroName: outside } });
    assert.equal(refused.status, 400);
    assert.equal((await database.getUserById(user.id)).victory_points, 50);

    const ok = await call('/api/shop/purchase-hero', { token: user.token, body: { userId: user.id, heroName: rotation[0] } });
    assert.equal(ok.status, 200);
    const after = await database.getUserById(user.id);
    assert.equal(after.victory_points, 45);
    assert.ok(after.available_heroes.includes(rotation[0]));
  });

  test('a hero already owned cannot be bought', async () => {
    const user = await newUser(50);
    const res = await call('/api/shop/purchase-hero', { token: user.token, body: { userId: user.id, heroName: 'Fighter' } });
    assert.equal(res.status, 400);
  });

  test('simultaneous purchases cannot overspend', async () => {
    const user = await newUser(5);
    const rotation = await rotationFor(user);
    const results = await Promise.all([
      call('/api/shop/purchase-hero', { token: user.token, body: { userId: user.id, heroName: rotation[0] } }),
      call('/api/shop/purchase-hero', { token: user.token, body: { userId: user.id, heroName: rotation[1] } }),
      call('/api/shop/purchase-hero', { token: user.token, body: { userId: user.id, heroName: rotation[2] } })
    ]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    const after = await database.getUserById(user.id);
    assert.equal(after.victory_points, 0);
    assert.equal(after.available_heroes.length, 11);
  });
});

describe('Survival team selection', () => {
  const owned = [
    'Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard',
    'Warden', 'Ninja', 'Bomber', 'Reaper', 'Mech', 'Angel', 'Ace', 'Swordsman', 'Silencer', 'Piercer', 'Elementalist'
  ];
  let gm, userId;
  beforeEach(async () => {
    gm = makeManager(database);
    userId = await createUser(database, `survivor${++userCount}`, { heroes: owned });
    gm.setUserSession('sock', userId);
  });
  const names = list => list.map(name => ({ name }));

  test('accepts three owned heroes and rebuilds them from the hero list', async () => {
    const tampered = [{ name: 'Fighter', HP: 999, Defense: 99, BasicAttack: '9D20', currentHP: 999 }, { name: 'Cleric' }, { name: 'Monk' }];
    const result = await gm.prepareSurvivalTeam('sock', tampered);
    assert.equal(result.success, true, result.error);
    const fighter = result.team.find(h => h.name === 'Fighter');
    const real = heroList.find(h => h.name === 'Fighter');
    assert.equal(fighter.HP, real.HP);
    assert.equal(fighter.Defense, real.Defense);
    assert.equal(fighter.BasicAttack, real.BasicAttack);
    assert.equal(fighter.currentHP, real.HP);
  });

  test('rejects a team that is not exactly three heroes', async () => {
    assert.equal((await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Cleric']))).success, false);
    assert.equal((await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Cleric', 'Monk', 'Wizard']))).success, false);
    assert.equal((await gm.prepareSurvivalTeam('sock', 'Fighter')).success, false);
    assert.equal((await gm.prepareSurvivalTeam('sock', undefined)).success, false);
  });

  test('rejects duplicates, unknown heroes and malformed entries', async () => {
    assert.equal((await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Fighter', 'Monk']))).success, false);
    assert.equal((await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Cleric', 'Nobody']))).success, false);
    assert.equal((await gm.prepareSurvivalTeam('sock', [{ name: 'Fighter' }, null, { name: 'Monk' }])).success, false);
  });

  test('rejects heroes the player does not own', async () => {
    const result = await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Cleric', 'Hoarder']));
    assert.equal(result.success, false);
    assert.match(result.error, /own/i);
  });

  test('rejects disabled heroes even if owned', async () => {
    await new Promise((resolve, reject) => database.db.run(
      'UPDATE users SET available_heroes = ? WHERE id = ?', [JSON.stringify([...owned, 'Bard']), userId], e => (e ? reject(e) : resolve())));
    assert.equal((await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Cleric', 'Bard']))).success, false);
  });

  test('rejects heroes already used by winning this run', async () => {
    gm.survivalStates.set('sock', { wins: 1, losses: 0, usedHeroes: ['Fighter', 'Cleric', 'Monk'], isActive: true });
    const result = await gm.prepareSurvivalTeam('sock', names(['Fighter', 'Ranger', 'Wizard']));
    assert.equal(result.success, false);
    assert.match(result.error, /used/i);
  });

  test('requires a logged in player', async () => {
    assert.equal((await gm.prepareSurvivalTeam('stranger', names(['Fighter', 'Cleric', 'Monk']))).success, false);
  });

  test('requires the 21 heroes that unlock Survival', async () => {
    const small = await createUser(database, `small${++userCount}`);
    gm.setUserSession('small', small);
    const result = await gm.prepareSurvivalTeam('small', names(['Fighter', 'Cleric', 'Monk']));
    assert.equal(result.success, false);
    assert.match(result.error, /21/);
  });
});

describe('Gauntlet saves', () => {
  let gm, userId;
  beforeEach(async () => {
    gm = makeManager(database);
    userId = await createUser(database, `climber${++userCount}`);
    gm.setUserSession('sock', userId);
  });

  test('the save comes from the server state, never from the client', async () => {
    await gm.initializeGauntletRun('sock', 'Alice');
    const run = gm.gauntletRuns.get('sock');
    run.current_trial = 4;
    run.trials_won = 3;
    const save = gm.getGauntletSaveState('sock');
    assert.equal(save.current_trial, 4);
    assert.equal(save.trials_won, 3);
    assert.deepEqual(save.roster.map(r => r.hero_id), run.roster.map(r => r.hero_id));
  });

  test('there is nothing to save without an active run', () => {
    assert.equal(gm.getGauntletSaveState('sock'), null);
  });

  test('a saved run round-trips through the database and is restored on the server', async () => {
    await gm.initializeGauntletRun('sock', 'Alice');
    const run = gm.gauntletRuns.get('sock');
    run.current_trial = 5;
    run.trials_won = 4;
    run.rerolls_remaining = 1;
    await database.saveGauntletState(userId, gm.getGauntletSaveState('sock'));
    gm.gauntletRuns.delete('sock');

    const loaded = await database.loadGauntletState(userId);
    const restored = await gm.restoreGauntletRun('sock', 'Alice', loaded.runState);
    assert.equal(restored.success, true);
    const back = gm.gauntletRuns.get('sock');
    assert.equal(back.current_trial, 5);
    assert.equal(back.trials_won, 4);
    assert.equal(back.rerolls_remaining, 1);
    assert.equal(back.roster.length, run.roster.length);
  });

  test('restoring clamps tampered values and drops unknown heroes', async () => {
    const fighter = heroList.find(h => h.name === 'Fighter');
    const restored = await gm.restoreGauntletRun('sock', 'Alice', {
      current_trial: 99,
      trials_won: 99,
      rerolls_remaining: 99,
      shop_actions_remaining: 99,
      roster: [
        { hero_id: 'Fighter', current_hp: 9999, max_hp: 9999, alive: true },
        { hero_id: 'Cleric', alive: true },
        { hero_id: 'Monk', alive: true },
        { hero_id: 'Nonexistent', alive: true }
      ]
    });
    assert.equal(restored.success, true);
    const run = gm.gauntletRuns.get('sock');
    assert.ok(run.current_trial <= 13);
    assert.ok(run.trials_won <= 13);
    assert.ok(run.rerolls_remaining <= 3);
    assert.ok(run.shop_actions_remaining <= 1);
    assert.deepEqual(run.roster.map(r => r.hero_id), ['Fighter', 'Cleric', 'Monk']);
    assert.equal(run.roster[0].max_hp, fighter.HP);
    assert.ok(run.roster[0].current_hp <= fighter.HP);
  });
});
