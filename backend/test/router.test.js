const test = require('node:test');
const assert = require('node:assert/strict');
const { createRouter, handleFetch } = require('../http/router');

function post(router, body, headers = {}) {
  return handleFetch(router, new Request('http://t/api/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }));
}

test('oversized body with content-length gets 413', async () => {
  const router = createRouter();
  router.post('/api/echo', (req, res) => res.json({ ok: true }));
  const res = await post(router, JSON.stringify({ x: 'a'.repeat(200000) }));
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { success: false, message: 'Payload too large' });
});

test('oversized chunked body without content-length gets 413', async () => {
  const router = createRouter();
  router.post('/api/echo', (req, res) => res.json({ ok: true }));
  const chunk = new TextEncoder().encode('a'.repeat(50000));
  const stream = new ReadableStream({
    start(c) { c.enqueue(chunk); c.enqueue(chunk); c.enqueue(chunk); c.close(); },
  });
  const res = await handleFetch(router, new Request('http://t/api/echo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half',
  }));
  assert.equal(res.status, 413);
});

test('normal body still parses', async () => {
  const router = createRouter();
  router.post('/api/echo', (req, res) => res.json(req.body));
  const res = await post(router, JSON.stringify({ a: 1 }));
  assert.deepEqual(await res.json(), { a: 1 });
});

test('handler that never responds becomes a 500 after the safety timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const router = createRouter();
  router.get('/api/hang', () => {});
  const p = handleFetch(router, new Request('http://t/api/hang'));
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(25000);
  const res = await p;
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { success: false, message: 'Server error' });
});
