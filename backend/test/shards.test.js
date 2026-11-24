// Shard balance storage: the shards column, savePack adding shards, craftHero spending them, and shards on user objects.
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
const { PACK_PRICE, REPEAT_SHARDS, CRAFT_PRICE } = require('../packs');
const { createTestDatabase, createUser } = require('./support/db');

// createTables issues its statements synchronously; let their callbacks (microtasks) run.
const settle = () => new Promise(r => setTimeout(r, 10));

// The users table as it was before shards existed.
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
    tutorial_completed INTEGER DEFAULT 1,
    holo_heroes TEXT DEFAULT '[]'
  )
`;

function captureErrors() {
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  return { errors, restore: () => { console.error = original; } };
}

const setShards = (database, userId, shards) => new Promise((resolve, reject) =>
  database.db.run('UPDATE users SET shards = ? WHERE id = ?', [shards, userId], e => (e ? reject(e) : resolve())));

describe('shards column', () => {
  let env, database;
  before(async () => { env = await createTestDatabase(); database = env.database; });
  after(async () => { await env.cleanup(); });

  test('new users start with 0 shards', async () => {
    const id = await createUser(database, 'shard1');
    assert.equal((await database.getUserById(id)).shards, 0);
  });

  test('the column is added to a database made before it existed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heros-call-shards-'));
    const driver = createNodeDriver(path.join(dir, 'old.sqlite'));
    try {
      driver.execScript(OLD_USERS_TABLE);
      driver.query(
        'INSERT INTO users (username, password_hash, available_heroes, holo_heroes, victory_points) VALUES (?, ?, ?, ?, ?)',
        ['oldtimer', 'hash', JSON.stringify(['Fighter', 'Cleric']), JSON.stringify(['Cleric']), 7]);
      const cap = captureErrors();
      let db;
      try {
        db = new Database(createCompatDb(driver));
        await settle();
      } finally { cap.restore(); }
      assert.deepEqual(cap.errors, []);
      const user = await db.getUserById(1);
      assert.equal(user.shards, 0);
      // existing data is untouched
      assert.deepEqual(user.available_heroes, ['Fighter', 'Cleric']);
      assert.deepEqual(user.holo_heroes, ['Cleric']);
      assert.equal(user.victory_points, 7);
    } finally {
      driver.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('constructing the database twice does not fail', async () => {
    const id = await createUser(database, 'shard2');
    const cap = captureErrors();
    let again;
    try {
      again = new Database(database.db);
      await settle();
    } finally { cap.restore(); }
    assert.deepEqual(cap.errors, []);
    assert.equal((await again.getUserById(id)).shards, 0);
  });
});

describe('savePack shards', () => {
  let env, database;
  before(async () => { env = await createTestDatabase(); database = env.database; });
  after(async () => { await env.cleanup(); });

  test('savePack spends 20 coins and adds 10 shards together', async () => {
    const id = await createUser(database, 'spack1', { heroes: ['Fighter'], victoryPoints: 25 });
    await setShards(database, id, 5);
    const result = await database.savePack(id, { cost: PACK_PRICE, shards: REPEAT_SHARDS });
    assert.equal(result.success, true);
    assert.equal(result.newVP, 5);
    assert.equal(result.shards, 15);
    assert.deepEqual(result.available_heroes, ['Fighter']);
    const user = await database.getUserById(id);
    assert.equal(user.victory_points, 5);
    assert.equal(user.shards, 15);
  });

  test('savePack refuses when the player cannot afford it', async () => {
    const id = await createUser(database, 'spack2', { heroes: ['Fighter'], victoryPoints: PACK_PRICE - 1 });
    await setShards(database, id, 5);
    const result = await database.savePack(id, { cost: PACK_PRICE, shards: REPEAT_SHARDS });
    assert.equal(result.success, false);
    assert.equal(result.error, 'Not enough to buy this.');
    const user = await database.getUserById(id);
    assert.equal(user.victory_points, PACK_PRICE - 1);
    assert.equal(user.shards, 5);
  });
});

describe('craftHero', () => {
  let env, database;
  before(async () => { env = await createTestDatabase(); database = env.database; });
  after(async () => { await env.cleanup(); });

  test('craftHero spends 100 shards and adds the hero, not a holographic', async () => {
    const id = await createUser(database, 'craft1', { heroes: ['Fighter'], victoryPoints: 30 });
    await setShards(database, id, CRAFT_PRICE + 7);
    const result = await database.craftHero(id, 'Bard', CRAFT_PRICE);
    assert.equal(result.success, true);
    assert.equal(result.shards, 7);
    assert.deepEqual(result.available_heroes, ['Fighter', 'Bard']);
    const user = await database.getUserById(id);
    assert.equal(user.shards, 7);
    assert.deepEqual(user.available_heroes, ['Fighter', 'Bard']);
    assert.deepEqual(user.holo_heroes, []);
    assert.equal(user.victory_points, 30, 'coins are untouched');
  });

  test('craftHero refuses with 99 shards', async () => {
    const id = await createUser(database, 'craft2', { heroes: ['Fighter'] });
    await setShards(database, id, CRAFT_PRICE - 1);
    const result = await database.craftHero(id, 'Bard', CRAFT_PRICE);
    assert.deepEqual(result, { success: false, error: 'Not enough shards.' });
    const user = await database.getUserById(id);
    assert.equal(user.shards, CRAFT_PRICE - 1);
    assert.deepEqual(user.available_heroes, ['Fighter']);
  });
});

describe('shards on API user objects', () => {
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

  test('register, login and /api/user/:id include shards', async () => {
    const reg = await api('POST', '/api/register', { username: 'shardapi', password: 'secret1' });
    assert.equal(reg.user.shards, 0);
    await setShards(env.database, reg.user.id, 42);
    const login = await api('POST', '/api/login', { username: 'shardapi', password: 'secret1' });
    assert.equal(login.user.shards, 42);
    const fetched = await api('GET', `/api/user/${login.user.id}`);
    assert.equal(fetched.user.shards, 42);
  });
});
