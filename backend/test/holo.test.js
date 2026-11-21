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

  test('savePack spends, refunds and adds heroes and holographics together', async () => {
    const id = await createUser(database, 'pack1', { heroes: ['Fighter'], victoryPoints: 20 });
    const result = await database.savePack(id, { cost: 12, refund: 2, addHeroes: ['Bard'], addHolo: ['Monk'] });
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
    const id = await createUser(database, 'pack2', { heroes: ['Fighter'], victoryPoints: 11 });
    const result = await database.savePack(id, { cost: 12, refund: 2, addHeroes: ['Bard'], addHolo: ['Monk'] });
    assert.equal(result.success, false);
    assert.equal(result.error, 'Not enough to buy this.');
    const user = await database.getUserById(id);
    assert.equal(user.victory_points, 11);
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
