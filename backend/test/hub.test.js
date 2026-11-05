const test = require('node:test');
const assert = require('node:assert');
const { createHub } = require('../realtime/hub');

function fakeTransport() {
  const t = { sent: [], calls: [], closeCode: null };
  t.send = (s) => { t.sent.push(JSON.parse(s)); t.calls.push('send'); };
  t.close = (code) => { t.closeCode = code; t.calls.push('close'); };
  return t;
}
function setup(n = 1) {
  const io = createHub();
  const out = [];
  let last;
  io.on('connection', (s) => { last = s; });
  for (let i = 0; i < n; i++) {
    const transport = fakeTransport();
    const conn = io.attach(transport);
    out.push({ transport, conn, socket: last });
  }
  return { io, out };
}
const events = (t) => t.sent.filter((f) => f.t !== '__welcome');

test('attach sends __welcome with socket id first', () => {
  const { out: [a] } = setup();
  assert.deepStrictEqual(a.transport.sent[0], { t: '__welcome', d: [a.socket.id] });
  assert.strictEqual(a.socket.connected, true);
  assert.ok(a.socket.rooms.has(a.socket.id));
});

test('io.to(socket.id).emit reaches that socket only', () => {
  const { io, out: [a, b] } = setup(2);
  io.to(a.socket.id).emit('x', 1);
  assert.deepStrictEqual(events(a.transport), [{ t: 'x', d: [1] }]);
  assert.deepStrictEqual(events(b.transport), []);
});

test('rooms: io.to reaches members; socket.to skips sender; chainable union', () => {
  const { io, out: [a, b, c] } = setup(3);
  a.socket.join('g1'); b.socket.join('g1'); c.socket.join('g2');
  io.to('g1').emit('hi', 'x');
  assert.strictEqual(events(a.transport).length, 1);
  assert.strictEqual(events(b.transport).length, 1);
  assert.strictEqual(events(c.transport).length, 0);
  a.socket.to('g1').emit('yo');
  assert.strictEqual(events(a.transport).length, 1);
  assert.strictEqual(events(b.transport).length, 2);
  io.to('g1').to('g2').emit('u');
  assert.strictEqual(events(a.transport).length, 2);
  assert.strictEqual(events(c.transport).length, 1);
  b.socket.leave('g1');
  io.to('g1').emit('z');
  assert.strictEqual(events(b.transport).filter((f) => f.t === 'z').length, 0);
});

test('broadcast.emit and io.emit', () => {
  const { io, out: [a, b] } = setup(2);
  a.socket.broadcast.emit('bc', 1, 2);
  assert.deepStrictEqual(events(a.transport), []);
  assert.deepStrictEqual(events(b.transport), [{ t: 'bc', d: [1, 2] }]);
  io.emit('all');
  assert.strictEqual(events(a.transport).length, 1);
});

test('ack callback replies with __ack', () => {
  const { out: [a] } = setup();
  a.socket.on('latency-ping', (cb) => cb());
  a.conn.receive('{"t":"latency-ping","d":[],"a":7}');
  assert.deepStrictEqual(a.transport.sent.at(-1), { t: '__ack', a: 7, d: [] });
});

test('bad input never disconnects and later frames still work', () => {
  const { out: [a] } = setup();
  const origErr = console.error; console.error = () => {};
  try {
    let got = 0;
    a.socket.on('boom', () => { throw new Error('x'); });
    a.socket.on('async-boom', async () => { throw new Error('y'); });
    a.socket.on('ok', () => { got++; });
    a.conn.receive('not json');
    a.conn.receive('{"t":"nope","d":[]}');
    a.conn.receive(JSON.stringify({ t: 'ok', d: ['x'.repeat(70000)] }));
    a.conn.receive('{"t":"boom","d":[]}');
    a.conn.receive('{"t":"async-boom","d":[]}');
    a.conn.receive('{"d":[]}');
    a.conn.receive('null');
    assert.strictEqual(a.socket.connected, true);
    assert.strictEqual(got, 0);
    a.conn.receive('{"t":"ok","d":[]}');
    assert.strictEqual(got, 1);
  } finally { console.error = origErr; }
});

test('dead transport does not break broadcast', () => {
  const { io, out: [a, b] } = setup(2);
  a.transport.send = () => { throw new Error('closed'); };
  assert.doesNotThrow(() => io.emit('x'));
  assert.strictEqual(events(b.transport).length, 1);
});

test('disconnect(): kick, close, one disconnect event, removed', () => {
  const { io, out: [a] } = setup();
  const reasons = [];
  a.socket.on('disconnect', (r) => reasons.push(r));
  const id = a.socket.id;
  a.socket.disconnect();
  assert.deepStrictEqual(a.transport.calls, ['send', 'send', 'close']);
  assert.deepStrictEqual(a.transport.sent[1], { t: '__kick', d: [] });
  assert.strictEqual(a.transport.closeCode, 1000);
  assert.deepStrictEqual(reasons, ['server namespace disconnect']);
  assert.strictEqual(io.sockets.sockets.has(id), false);
  assert.strictEqual(a.socket.connected, false);
  a.conn.closed();
  assert.strictEqual(reasons.length, 1);
});

test('closed() fires disconnect once and cleans rooms', () => {
  const { io, out: [a, b] } = setup(2);
  const reasons = [];
  a.socket.on('disconnect', (r) => reasons.push(r));
  a.socket.join('g1'); b.socket.join('g1');
  a.conn.closed();
  a.conn.closed();
  assert.deepStrictEqual(reasons, ['transport close']);
  assert.strictEqual(io.sockets.sockets.has(a.socket.id), false);
  io.to('g1').emit('x');
  assert.strictEqual(events(a.transport).length, 0);
  assert.strictEqual(events(b.transport).length, 1);
  assert.strictEqual(a.socket.connected, false);
});
