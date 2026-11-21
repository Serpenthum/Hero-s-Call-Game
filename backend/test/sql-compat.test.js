const test = require('node:test');
const assert = require('node:assert');
const { createCompatDb } = require('../sql/compat');
const { createNodeDriver } = require('../sql/nodeDriver');

function fresh() {
  const db = createCompatDb(createNodeDriver());
  db.serialize(() => {
    db.run('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v INTEGER)');
  });
  return db;
}
const p = (fn) => new Promise((resolve) => fn((err, res) => resolve({ err, res })));

test('run INSERT sets this.lastID and this.changes', async () => {
  const db = fresh();
  const ctx = await new Promise((resolve) =>
    db.run('INSERT INTO t (v) VALUES (?)', [5], function (err) { resolve({ err, id: this.lastID, ch: this.changes }); }));
  assert.strictEqual(ctx.err, null);
  assert.strictEqual(ctx.id, 1);
  assert.strictEqual(ctx.ch, 1);
});

test('run UPDATE of two rows reports changes 2', async () => {
  const db = fresh();
  db.run('INSERT INTO t (v) VALUES (1)');
  db.run('INSERT INTO t (v) VALUES (1)');
  const ch = await new Promise((resolve) => db.run('UPDATE t SET v = 2', [], function () { resolve(this.changes); }));
  assert.strictEqual(ch, 2);
});

test('get with no match gives (null, undefined); get/run accept callback in params position', async () => {
  const db = fresh();
  const r = await p((cb) => db.get('SELECT * FROM t WHERE id = ?', [99], cb));
  assert.strictEqual(r.err, null);
  assert.strictEqual(r.res, undefined);
  const r2 = await p((cb) => db.get('SELECT 1 AS x', cb));
  assert.deepStrictEqual({ ...r2.res }, { x: 1 });
  const r3 = await p((cb) => db.run('INSERT INTO t (v) VALUES (3)', cb));
  assert.strictEqual(r3.err, null);
});

test('all returns plain objects', async () => {
  const db = fresh();
  db.run('INSERT INTO t (v) VALUES (1)');
  db.run('INSERT INTO t (v) VALUES (2)');
  const r = await p((cb) => db.all('SELECT id, v FROM t ORDER BY id', [], cb));
  assert.deepStrictEqual(r.res, [{ id: 1, v: 1 }, { id: 2, v: 2 }]);
  assert.strictEqual(Object.getPrototypeOf(r.res[0]), Object.prototype);
});

test('SQL errors go to cb(err) and do not throw', async () => {
  const db = fresh();
  const r = await p((cb) => db.run('INSERT INTO nope VALUES (1)', [], cb));
  assert.ok(r.err instanceof Error);
  const r2 = await p((cb) => db.get('SELECT * FROM nope', [], cb));
  assert.ok(r2.err instanceof Error);
  const r3 = await p((cb) => db.all('SELECT * FROM nope', cb));
  assert.ok(r3.err instanceof Error);
});

test('callbacks are deferred past the calling code', async () => {
  const db = fresh();
  const order = [];
  db.run('INSERT INTO t (v) VALUES (1)', [], () => order.push('cb'));
  order.push('after');
  await new Promise((r) => setTimeout(r));
  assert.deepStrictEqual(order, ['after', 'cb']);
});

test('back-to-back runs call back in issue order', async () => {
  const db = fresh();
  const order = [];
  db.run('INSERT INTO t (v) VALUES (1)', [], () => order.push(1));
  db.run('INSERT INTO t (v) VALUES (2)', [], () => order.push(2));
  await new Promise((r) => setTimeout(r));
  assert.deepStrictEqual(order, [1, 2]);
});

test('undefined params bind as NULL and booleans as 1/0', async () => {
  const db = fresh();
  const ins = await p((cb) => db.run('INSERT INTO t (v) VALUES (?)', [undefined], cb));
  assert.strictEqual(ins.err, null);
  const ins2 = await p((cb) => db.run('INSERT INTO t (v) VALUES (?)', [true], cb));
  assert.strictEqual(ins2.err, null);
  const r = await p((cb) => db.all('SELECT v FROM t ORDER BY id', [], cb));
  assert.deepStrictEqual(r.res, [{ v: null }, { v: 1 }]);
});

test('a throwing callback does not break later callbacks', async () => {
  const db = fresh();
  const orig = console.error;
  console.error = () => {};
  try {
    const order = [];
    db.run('INSERT INTO t (v) VALUES (1)', [], () => { throw new Error('boom'); });
    db.run('INSERT INTO t (v) VALUES (2)', [], () => order.push(2));
    await new Promise((r) => setTimeout(r));
    assert.deepStrictEqual(order, [2]);
  } finally { console.error = orig; }
});

test('a failing statement without a callback is logged, not lost', () => {
  const db = fresh();
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a);
  try { db.run('INSERT INTO nope VALUES (1)'); } finally { console.error = orig; }
  assert.equal(logged.length, 1);
});
